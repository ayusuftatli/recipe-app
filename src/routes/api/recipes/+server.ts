import { json } from '@sveltejs/kit';
import { SaveRecipeRequest } from '$lib/schema';
import { readBody } from '$lib/server/http';
import { createRecipe, listRecipes } from '$lib/server/recipes';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	return json(
		listRecipes({
			q: url.searchParams.get('q') ?? undefined,
			tag: url.searchParams.get('tag') ?? undefined,
			archived: url.searchParams.get('archived') === '1'
		})
	);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await readBody(request, SaveRecipeRequest);
	const id = createRecipe(body.draft, body.tags, body.change_note);
	return json({ id, version_number: 1 }, { status: 201 });
};
