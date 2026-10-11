import { error, json } from '@sveltejs/kit';
import { PatchRecipeRequest, SaveRecipeRequest } from '$lib/schema';
import { readBody } from '$lib/server/http';
import { getRecipe, patchRecipe, saveRecipe } from '$lib/server/recipes';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
	const recipe = getRecipe(params.id);
	if (!recipe) error(404, 'Recipe not found');
	return json(recipe);
};

/** Saves an edit: inserts a new version if the content changed. */
export const PUT: RequestHandler = async ({ params, request }) => {
	const body = await readBody(request, SaveRecipeRequest);
	const result = saveRecipe(params.id, body.draft, body.tags, body.change_note);
	if (!result) error(404, 'Recipe not found');
	return json(result);
};

/** Non-versioned metadata: tags, archived. */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const body = await readBody(request, PatchRecipeRequest);
	if (!patchRecipe(params.id, body)) error(404, 'Recipe not found');
	return json({ ok: true });
};
