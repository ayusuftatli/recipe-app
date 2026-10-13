import { error, json } from '@sveltejs/kit';
import { searchFoods } from '$lib/server/food-search';
import type { RequestHandler } from './$types';

/** Food database candidates for a query, for choosing a match by hand. */
export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (!q || q.length > 100) error(400, 'q must be 1 to 100 characters');
	return json(await searchFoods(q));
};
