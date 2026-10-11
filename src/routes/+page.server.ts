import { allTags, listRecipes } from '$lib/server/recipes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const tag = url.searchParams.get('tag') ?? '';
	return { q, tag, recipes: listRecipes({ q, tag: tag || undefined }), tags: allTags() };
};
