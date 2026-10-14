import { error, json } from '@sveltejs/kit';
import { Day } from '$lib/schema';
import { groceryData } from '$lib/server/grocery';
import type { RequestHandler } from './$types';

/** What the grocery list is built from, for plan entries from `?from=YYYY-MM-DD` on. */
export const GET: RequestHandler = ({ url }) => {
	const from = Day.safeParse(url.searchParams.get('from'));
	if (!from.success) error(400, 'from must be a date as YYYY-MM-DD');
	return json(groceryData(from.data));
};
