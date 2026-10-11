import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { deletePhoto, MAX_UPLOAD_BYTES, savePhoto } from '$lib/server/photos';
import { getRecipe, setPhoto } from '$lib/server/recipes';
import type { RequestHandler } from './$types';

const Upload = z.object({
	photo: z
		.instanceof(File)
		.refine((f) => f.size > 0, 'File is empty')
		.refine((f) => f.size <= MAX_UPLOAD_BYTES, 'File is larger than 15 MB')
		.refine((f) => f.type === '' || f.type.startsWith('image/'), 'File must be an image')
});

export const POST: RequestHandler = async ({ params, request }) => {
	if (!getRecipe(params.id)) error(404, 'Recipe not found');
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		error(400, 'Expected multipart/form-data');
	}
	const parsed = Upload.safeParse({ photo: form.get('photo') });
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Invalid upload');

	let name: string;
	try {
		name = await savePhoto(Buffer.from(await parsed.data.photo.arrayBuffer()));
	} catch {
		error(400, 'Could not read that image');
	}
	const result = setPhoto(params.id, name);
	if (!result) {
		await deletePhoto(name);
		error(404, 'Recipe not found');
	}
	await deletePhoto(result.previous);
	return json({ photo_path: name });
};

export const DELETE: RequestHandler = async ({ params }) => {
	const result = setPhoto(params.id, null);
	if (!result) error(404, 'Recipe not found');
	await deletePhoto(result.previous);
	return json({ ok: true });
};
