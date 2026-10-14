import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import type { AddPlanEntryRequest, PatchPlanEntryRequest } from '$lib/schema';
import type { PlanEntry } from '$lib/types';
import { uuid } from '$lib/uuid';
import { db } from './db';
import { planEntries, recipes, recipeVersions } from './db/schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The next free place at the end of a day. */
function endOfDay(tx: Tx, date: string): number {
	const row = tx
		.select({ max: sql<number | null>`max(${planEntries.position})` })
		.from(planEntries)
		.where(eq(planEntries.date, date))
		.get();
	return (row?.max ?? -1) + 1;
}

/** The plan from `from` to `to` (both included), in day order and, within a day, the order the entries were put there. */
export function listPlan(from: string, to: string): PlanEntry[] {
	return db
		.select({
			id: planEntries.id,
			date: planEntries.date,
			recipe_id: planEntries.recipeId,
			servings: planEntries.servings,
			position: planEntries.position,
			shopped: planEntries.shopped,
			title: recipeVersions.title,
			recipe_servings: recipeVersions.servings,
			photo_path: recipes.photoPath
		})
		.from(planEntries)
		.innerJoin(recipes, eq(recipes.id, planEntries.recipeId))
		.innerJoin(recipeVersions, eq(recipeVersions.id, recipes.currentVersionId))
		.where(and(gte(planEntries.date, from), lte(planEntries.date, to)))
		.orderBy(asc(planEntries.date), asc(planEntries.position), asc(planEntries.createdAt))
		.all();
}

/** Puts a recipe at the end of a day. Returns the new entry's id, or null when the recipe does not exist. */
export function addPlanEntry({ date, recipe_id, servings }: AddPlanEntryRequest): string | null {
	return db.transaction((tx) => {
		if (!tx.select({ id: recipes.id }).from(recipes).where(eq(recipes.id, recipe_id)).get()) return null;
		const id = uuid();
		tx.insert(planEntries)
			.values({ id, date, recipeId: recipe_id, servings: servings ?? null, position: endOfDay(tx, date), createdAt: new Date().toISOString() })
			.run();
		return id;
	});
}

/** Changes the servings, moves the entry to the end of another day, or puts it back on (or takes it off) the grocery list. */
export function patchPlanEntry(id: string, patch: PatchPlanEntryRequest): boolean {
	return db.transaction((tx) => {
		const entry = tx.select().from(planEntries).where(eq(planEntries.id, id)).get();
		if (!entry) return false;
		const set: Partial<typeof planEntries.$inferInsert> = {};
		if (patch.servings !== undefined) set.servings = patch.servings;
		if (patch.shopped !== undefined) set.shopped = patch.shopped;
		if (patch.date !== undefined && patch.date !== entry.date) {
			set.date = patch.date;
			set.position = endOfDay(tx, patch.date);
		}
		if (Object.keys(set).length > 0) tx.update(planEntries).set(set).where(eq(planEntries.id, id)).run();
		return true;
	});
}

export function removePlanEntry(id: string): boolean {
	return db.delete(planEntries).where(eq(planEntries.id, id)).run().changes > 0;
}
