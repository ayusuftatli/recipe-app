import { error, json } from '@sveltejs/kit';
import { SetFoodRequest } from '$lib/schema';
import { readBody } from '$lib/server/http';
import { isMatching, queueMatch, setIngredientFood } from '$lib/server/nutrition';
import { llmLimiter } from '$lib/server/rate-limit';
import { getRecipe } from '$lib/server/recipes';
import type { MatchStatus } from '$lib/types';
import type { RequestHandler } from './$types';

/** Is background matching still running? The recipe page polls this. */
export const GET: RequestHandler = ({ params }) => json({ running: isMatching(params.id) } satisfies MatchStatus);

/** "Try again": restarts background matching, including for ingredients that found nothing before. */
export const POST: RequestHandler = ({ params, getClientAddress }) => {
	if (!llmLimiter.hit(getClientAddress())) error(429, 'Too many assistant requests. Try again later.');
	if (!getRecipe(params.id)) error(404, 'Recipe not found');
	return json({ running: queueMatch(params.id, true) } satisfies MatchStatus);
};

/** Manual override: set, replace or clear the food of one ingredient. */
export const PUT: RequestHandler = async ({ params, request }) => {
	const body = await readBody(request, SetFoodRequest);
	const result = setIngredientFood(params.id, body);
	if (!result) error(404, 'Recipe or ingredient not found');
	return json(result);
};
