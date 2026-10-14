import { error, json } from '@sveltejs/kit';
import { PatchPlanEntryRequest } from '$lib/schema';
import { readBody } from '$lib/server/http';
import { patchPlanEntry, removePlanEntry } from '$lib/server/plan';
import type { RequestHandler } from './$types';

/** Moves the entry to another day, changes its servings, or says whether it has been shopped for. */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = await readBody(request, PatchPlanEntryRequest);
	if (!patchPlanEntry(params.id, body)) error(404, 'Plan entry not found');
	return json({ ok: true });
};

export const DELETE: RequestHandler = ({ params }) => {
	if (!removePlanEntry(params.id)) error(404, 'Plan entry not found');
	return json({ ok: true });
};
