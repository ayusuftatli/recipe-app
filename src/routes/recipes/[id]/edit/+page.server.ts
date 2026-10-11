import { error } from '@sveltejs/kit';
import { allTags, getRecipe } from '$lib/server/recipes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const recipe = getRecipe(params.id);
	if (!recipe) error(404, 'Recipe not found');
	return { recipe, allTags: allTags() };
};
