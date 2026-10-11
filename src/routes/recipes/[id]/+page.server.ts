import { error, fail } from '@sveltejs/kit';
import { getRecipe, patchRecipe } from '$lib/server/recipes';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const recipe = getRecipe(params.id);
	if (!recipe) error(404, 'Recipe not found');
	return { recipe };
};

export const actions: Actions = {
	archive: ({ params }) => {
		if (!patchRecipe(params.id, { archived: true })) return fail(404);
	},
	unarchive: ({ params }) => {
		if (!patchRecipe(params.id, { archived: false })) return fail(404);
	}
};
