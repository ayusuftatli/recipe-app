import { error, json } from '@sveltejs/kit';
import { SetFoodRequest } from '$lib/schema';
import { readBody } from '$lib/server/http';
import { LlmError } from '$lib/server/llm';
import { matchRecipe, setIngredientFood } from '$lib/server/nutrition';
import { llmLimiter } from '$lib/server/rate-limit';
import type { MatchResponse } from '$lib/types';
import type { RequestHandler } from './$types';

/** "Calculate nutrition": match the unmatched ingredients and save them as one new version. */
export const POST: RequestHandler = async ({ params, getClientAddress }) => {
	if (!llmLimiter.hit(getClientAddress())) error(429, 'Too many assistant requests. Try again later.');
	try {
		const summary = await matchRecipe(params.id);
		if (!summary) error(404, 'Recipe not found');
		return json({ ok: true, ...summary } satisfies MatchResponse);
	} catch (e) {
		if (e instanceof LlmError) return json({ ok: false, error: e.message } satisfies MatchResponse);
		throw e;
	}
};

/** Manual override: set, replace or clear the food of one ingredient. */
export const PUT: RequestHandler = async ({ params, request }) => {
	const body = await readBody(request, SetFoodRequest);
	const result = setIngredientFood(params.id, body);
	if (!result) error(404, 'Recipe or ingredient not found');
	return json(result);
};
