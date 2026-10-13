import { error, fail } from '@sveltejs/kit';
import { getFoods } from '$lib/server/foods';
import { queueMatch } from '$lib/server/nutrition';
import { getRecipe, patchRecipe } from '$lib/server/recipes';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const recipe = getRecipe(params.id);
	if (!recipe) error(404, 'Recipe not found');
	const foods = getFoods(recipe.current.ingredients.flatMap((i) => (i.food_id ? [i.food_id] : [])));
	// Nutrition matching runs in the background; the page shows what is there and refreshes when it is done.
	return { recipe, foods, matching: queueMatch(recipe.id) };
};

export const actions: Actions = {
	archive: ({ params }) => {
		if (!patchRecipe(params.id, { archived: true })) return fail(404);
	},
	unarchive: ({ params }) => {
		if (!patchRecipe(params.id, { archived: false })) return fail(404);
	}
};
