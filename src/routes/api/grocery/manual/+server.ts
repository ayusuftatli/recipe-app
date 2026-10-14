import { json } from '@sveltejs/kit';
import { AddManualItemRequest } from '$lib/schema';
import { addManualItem } from '$lib/server/grocery';
import { readBody } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { name } = await readBody(request, AddManualItemRequest);
	return json({ id: addManualItem(name) }, { status: 201 });
};
