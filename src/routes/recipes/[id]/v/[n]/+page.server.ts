import { error, redirect } from '@sveltejs/kit';
import { getRecipe, getVersion, restoreVersion } from '$lib/server/recipes';
import type { Actions, PageServerLoad } from './$types';

function versionNumber(raw: string): number {
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1) error(404, 'Version not found');
	return n;
}

export const load: PageServerLoad = ({ params }) => {
	const recipe = getRecipe(params.id);
	const version = getVersion(params.id, versionNumber(params.n));
	if (!recipe || !version) error(404, 'Version not found');
	return { recipe, version };
};

export const actions: Actions = {
	restore: ({ params }) => {
		if (!restoreVersion(params.id, versionNumber(params.n))) error(404, 'Version not found');
		redirect(303, `/recipes/${params.id}`);
	}
};
