import { json } from '@sveltejs/kit';
import { listCurrentRecipes } from '$lib/server/recipes';
import type { RequestHandler } from './$types';

/** Everything the offline copy needs: all non-archived recipes with their current version. */
export const GET: RequestHandler = () => json(listCurrentRecipes());
