import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { deletePhoto } from '$lib/server/photos';
import { getRecipe, hardDeleteRecipe, listRecipes, patchRecipe } from '$lib/server/recipes';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ archived: listRecipes({ archived: true }) });

const IdForm = z.object({ id: z.string().min(1) });
const DeleteForm = IdForm.extend({ confirm: z.string() });

export const actions: Actions = {
	unarchive: async ({ request }) => {
		const parsed = IdForm.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success || !patchRecipe(parsed.data.id, { archived: false })) return fail(404);
	},
	delete: async ({ request }) => {
		const parsed = DeleteForm.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { id: null, error: 'Invalid request' });
		const { id, confirm } = parsed.data;
		const recipe = getRecipe(id);
		// Only archived recipes can be hard-deleted, and only after typing the title.
		if (!recipe || !recipe.archived) return fail(404, { id, error: 'Recipe not found or not archived' });
		if (confirm.trim() !== recipe.current.title) {
			return fail(400, { id, error: 'Type the exact title to confirm.' });
		}
		const result = hardDeleteRecipe(id);
		await deletePhoto(result?.photo_path ?? null);
	}
};
