import { error, json } from '@sveltejs/kit';
import { AddPlanEntryRequest, Day } from '$lib/schema';
import { readBody } from '$lib/server/http';
import { addPlanEntry, listPlan } from '$lib/server/plan';
import type { RequestHandler } from './$types';

/** The plan between two days, both included: `?from=YYYY-MM-DD&to=YYYY-MM-DD`. */
export const GET: RequestHandler = ({ url }) => {
	const from = Day.safeParse(url.searchParams.get('from'));
	const to = Day.safeParse(url.searchParams.get('to'));
	if (!from.success || !to.success) error(400, 'from and to must be dates as YYYY-MM-DD');
	return json(listPlan(from.data, to.data));
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await readBody(request, AddPlanEntryRequest);
	const id = addPlanEntry(body);
	if (!id) error(404, 'Recipe not found');
	return json({ id }, { status: 201 });
};
