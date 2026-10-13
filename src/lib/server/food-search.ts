import { env } from '$env/dynamic/private';
import { parseFdcSearch, parseOffSearch, type FoodCandidate } from '$lib/food-sources';

// Database search ranking is rough ("milk, whole" lists cheeses first), so offer a generous list.
const MAX_CANDIDATES = 10;
const TIMEOUT_MS = 15_000;

async function getJson(url: URL, headers: Record<string, string>): Promise<unknown> {
	try {
		const res = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
		if (!res.ok) {
			console.warn(`[foods] ${url.hostname} returned ${res.status}`);
			return null;
		}
		return await res.json();
	} catch (e) {
		console.warn(`[foods] ${url.hostname} failed: ${e instanceof Error ? e.message : String(e)}`);
		return null;
	}
}

/** USDA FoodData Central: generic foods only (Foundation and SR Legacy), values per 100 g. */
async function searchFdc(query: string): Promise<FoodCandidate[]> {
	const key = env.FDC_API_KEY;
	if (!key) return [];
	const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
	url.searchParams.set('query', query);
	url.searchParams.set('dataType', 'Foundation,SR Legacy');
	url.searchParams.set('pageSize', String(MAX_CANDIDATES * 2 + 5));
	// The key travels in a header, not in the URL.
	return parseFdcSearch(await getJson(url, { 'x-api-key': key }));
}

/** Open Food Facts: packaged products, any language. */
async function searchOff(query: string): Promise<FoodCandidate[]> {
	const url = new URL('https://search.openfoodfacts.org/search');
	url.searchParams.set('q', query);
	url.searchParams.set('page_size', String(MAX_CANDIDATES * 2));
	url.searchParams.set('fields', 'code,product_name,brands,nutriments');
	return parseOffSearch(await getJson(url, { 'user-agent': 'RecipeBox/1.0 (personal recipe app)' }));
}

/** Top candidates for a query: USDA first, Open Food Facts when USDA has nothing usable. */
export async function searchFoods(query: string): Promise<FoodCandidate[]> {
	const q = query.trim();
	if (!q) return [];
	const fdc = await searchFdc(q);
	const found = fdc.length > 0 ? fdc : await searchOff(q);
	return found.slice(0, MAX_CANDIDATES);
}

/** Candidates for several phrasings of the same food, best of each first, without duplicates. */
export async function searchFoodsAny(queries: string[]): Promise<FoodCandidate[]> {
	const lists = await Promise.all(queries.map(searchFoods));
	const seen = new Set<string>();
	const out: FoodCandidate[] = [];
	for (let rank = 0; rank < MAX_CANDIDATES; rank++) {
		for (const list of lists) {
			const c = list[rank];
			const key = c ? `${c.source}:${c.source_id}` : '';
			if (!c || seen.has(key)) continue;
			seen.add(key);
			out.push(c);
		}
	}
	return out.slice(0, MAX_CANDIDATES + 4);
}
