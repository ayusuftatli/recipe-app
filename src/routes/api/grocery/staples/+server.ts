import { json } from '@sveltejs/kit';
import { SetStapleRequest } from '$lib/schema';
import { setStaple } from '$lib/server/grocery';
import { readBody } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	setStaple(await readBody(request, SetStapleRequest));
	return json({ ok: true });
};
