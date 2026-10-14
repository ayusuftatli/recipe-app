import { json } from '@sveltejs/kit';
import { GroceryChecksRequest } from '$lib/schema';
import { setChecks } from '$lib/server/grocery';
import { readBody } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	setChecks(await readBody(request, GroceryChecksRequest));
	return json({ ok: true });
};
