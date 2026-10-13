import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { extractImageUrl, extractJsonLdRecipe, htmlToText } from '$lib/import';

const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export class FetchPageError extends Error {}

// Loopback, private, link-local and similar ranges the server must not fetch on a user's behalf.
const PRIVATE = new BlockList();
PRIVATE.addSubnet('0.0.0.0', 8, 'ipv4');
PRIVATE.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE.addSubnet('100.64.0.0', 10, 'ipv4');
PRIVATE.addSubnet('127.0.0.0', 8, 'ipv4');
PRIVATE.addSubnet('169.254.0.0', 16, 'ipv4');
PRIVATE.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE.addSubnet('192.168.0.0', 16, 'ipv4');
PRIVATE.addSubnet('::', 127, 'ipv6');
PRIVATE.addSubnet('fc00::', 7, 'ipv6');
PRIVATE.addSubnet('fe80::', 10, 'ipv6');

/** True for anything that is not a public IP address (including strings that are not IPs at all). */
export function isPrivateAddress(ip: string): boolean {
	const family = isIP(ip);
	if (family === 0) return true;
	return PRIVATE.check(ip, family === 6 ? 'ipv6' : 'ipv4');
}

async function assertPublic(url: URL): Promise<void> {
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchPageError('Only http(s) links are supported.');
	const host = url.hostname.replace(/^\[|\]$/g, '');
	const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
	if (addresses.length === 0) throw new FetchPageError('Could not open the link: unknown host.');
	if (addresses.some(isPrivateAddress)) throw new FetchPageError('Links to private or local addresses are not supported.');
}

/** GET with every redirect hop checked by hand, not just the first URL. */
async function fetchPublic(url: URL, accept: string): Promise<Response> {
	for (let hop = 0; ; hop++) {
		await assertPublic(url);
		let res: Response;
		try {
			res = await fetch(url, {
				headers: { 'user-agent': 'Mozilla/5.0 (compatible; RecipeBox/1.0)', accept },
				redirect: 'manual',
				signal: AbortSignal.timeout(20_000)
			});
		} catch (e) {
			throw new FetchPageError(`Could not open the link: ${e instanceof Error ? e.message : String(e)}`);
		}
		const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
		if (!location) return res;
		if (hop >= MAX_REDIRECTS) throw new FetchPageError('The link redirects too many times.');
		try {
			url = new URL(location, url);
		} catch {
			throw new FetchPageError('The link redirects to an invalid address.');
		}
	}
}

export interface RecipeSource {
	kind: 'json-ld' | 'text';
	content: string;
	/** The page's recipe picture, if it names one. */
	imageUrl: string | null;
}

/** Fetches a recipe page: schema.org Recipe JSON-LD when present, else readable text. */
export async function fetchRecipeSource(url: URL): Promise<RecipeSource> {
	const res = await fetchPublic(url, 'text/html,application/xhtml+xml');
	if (!res.ok) throw new FetchPageError(`The page returned ${res.status}.`);

	const html = new TextDecoder().decode((await res.arrayBuffer()).slice(0, MAX_HTML_BYTES));
	const imageUrl = extractImageUrl(html, res.url || url.href);
	const jsonLd = extractJsonLdRecipe(html);
	if (jsonLd) return { kind: 'json-ld', content: jsonLd, imageUrl };
	const text = htmlToText(html);
	if (text.length < 50) throw new FetchPageError('That page has no readable text (it may need JavaScript or a login).');
	return { kind: 'text', content: text, imageUrl };
}

/** Downloads a page's picture. The picture is a bonus, so any failure just means no picture. */
export async function fetchImage(imageUrl: string): Promise<Buffer | null> {
	try {
		const res = await fetchPublic(new URL(imageUrl), 'image/*');
		if (!res.ok || Number(res.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) return null;
		const data = Buffer.from(await res.arrayBuffer());
		return data.length > 0 && data.length <= MAX_IMAGE_BYTES ? data : null;
	} catch {
		return null;
	}
}
