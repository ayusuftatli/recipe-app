import { json } from '@sveltejs/kit';
import { SetGroceryTermRequest } from '$lib/schema';
import { isTidying, setTerm } from '$lib/server/grocery';
import { readBody } from '$lib/server/http';
import type { RequestHandler } from './$types';

/** Is background naming and sorting still running? The grocery page polls this. */
export const GET: RequestHandler = () => json({ running: isTidying() });

/** The user's own name and shop section for an item. */
export const PUT: RequestHandler = async ({ request }) => {
	setTerm(await readBody(request, SetGroceryTermRequest));
	return json({ ok: true });
};
