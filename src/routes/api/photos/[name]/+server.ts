import { error } from '@sveltejs/kit';
import { readPhoto } from '$lib/server/photos';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const data = await readPhoto(params.name, url.searchParams.get('size') === 'thumb' ? 'thumb' : 'full');
	if (!data) error(404, 'Photo not found');
	return new Response(new Uint8Array(data), {
		headers: {
			'content-type': 'image/webp',
			// Names are random and never reused, so the bytes behind a URL never change.
			'cache-control': 'private, max-age=31536000, immutable'
		}
	});
};
