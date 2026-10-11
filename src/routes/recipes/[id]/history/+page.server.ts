import { error } from '@sveltejs/kit';
import { diffVersions } from '$lib/diff';
import { getRecipe, getVersion, listVersions } from '$lib/server/recipes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url }) => {
	const recipe = getRecipe(params.id);
	if (!recipe) error(404, 'Recipe not found');
	const versions = listVersions(params.id);
	const latest = recipe.current.version_number;

	// Default: compare the previous version with the current one.
	const a = Number(url.searchParams.get('a')) || Math.max(1, latest - 1);
	const b = Number(url.searchParams.get('b')) || latest;
	const va = getVersion(params.id, a);
	const vb = getVersion(params.id, b);
	const diff = va && vb && a !== b ? diffVersions(va, vb) : null;

	return { recipe, versions, a, b, diff };
};
