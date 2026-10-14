import { json } from '@sveltejs/kit';
import { addDays } from '$lib/dates';
import { earliestToday, groceryData } from '$lib/server/grocery';
import { listPlan } from '$lib/server/plan';
import { listCurrentRecipes } from '$lib/server/recipes';
import type { OfflineSync } from '$lib/types';
import type { RequestHandler } from './$types';

// How far ahead the plan is kept on the device.
const PLAN_DAYS_AHEAD = 28;

/**
 * Everything the offline copy needs: all non-archived recipes with their
 * current version, the plan from today on and what the grocery list is built from.
 */
export const GET: RequestHandler = () => {
	const from = earliestToday();
	return json({
		recipes: listCurrentRecipes(),
		plan: listPlan(from, addDays(from, PLAN_DAYS_AHEAD)),
		grocery: groceryData(from)
	} satisfies OfflineSync);
};
