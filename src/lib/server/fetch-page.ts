import { extractJsonLdRecipe, htmlToText } from '$lib/import';

const MAX_HTML_BYTES = 3 * 1024 * 1024;

export class FetchPageError extends Error {}

/** Fetches a recipe page: schema.org Recipe JSON-LD when present, else readable text. */
export async function fetchRecipeSource(url: URL): Promise<{ kind: 'json-ld' | 'text'; content: string }> {
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchPageError('Only http(s) links are supported.');
	let res: Response;
	try {
		res = await fetch(url, {
			headers: {
				'user-agent': 'Mozilla/5.0 (compatible; RecipeBox/1.0)',
				accept: 'text/html,application/xhtml+xml'
			},
			redirect: 'follow',
			signal: AbortSignal.timeout(20_000)
		});
	} catch (e) {
		throw new FetchPageError(`Could not open the link: ${e instanceof Error ? e.message : String(e)}`);
	}
	if (!res.ok) throw new FetchPageError(`The page returned ${res.status}.`);

	const html = new TextDecoder().decode((await res.arrayBuffer()).slice(0, MAX_HTML_BYTES));
	const jsonLd = extractJsonLdRecipe(html);
	if (jsonLd) return { kind: 'json-ld', content: jsonLd };
	const text = htmlToText(html);
	if (text.length < 50) throw new FetchPageError('That page has no readable text (it may need JavaScript or a login).');
	return { kind: 'text', content: text };
}
