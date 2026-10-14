import { json } from '@sveltejs/kit';
import { FinishShoppingRequest } from '$lib/schema';
import { finishShoppingFor } from '$lib/server/grocery';
import { readBody } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	return json(finishShoppingFor(await readBody(request, FinishShoppingRequest)));
};
