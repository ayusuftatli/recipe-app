import { error, json } from '@sveltejs/kit';
import { removeManualItem } from '$lib/server/grocery';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = ({ params }) => {
	if (!removeManualItem(params.id)) error(404, 'Item not found');
	return json({ ok: true });
};
