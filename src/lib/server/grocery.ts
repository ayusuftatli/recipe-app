import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { addDays, localDay } from '$lib/dates';
import { normalizeName } from '$lib/food-sources';
import { AISLES, buildGroceryList, contributions, finishShopping, manualKey, namesWithoutTerm, type GroceryData, type GroceryTerm } from '$lib/grocery';
import {
	Ingredient,
	type FinishShoppingRequest,
	type GroceryChecksRequest,
	type SetGroceryTermRequest,
	type SetStapleRequest
} from '$lib/schema';
import { uuid } from '$lib/uuid';
import { db } from './db';
import { groceryChecks, groceryManual, groceryTerms as termsTable, pantryStaples, planEntries, recipes, recipeVersions } from './db/schema';
import { groceryTerms } from './llm';
import { llmLimiter } from './rate-limit';

/** The database itself or a transaction on it. */
type Reader = Pick<typeof db, 'select'>;

/**
 * Everything the grocery list is built from: the ingredients of every plan
 * entry from `from` on that has not been shopped for, at the planned size,
 * plus manual items, ticks, staples and shopping names.
 */
export function groceryData(from: string, q: Reader = db): GroceryData {
	const planned = q
		.select({
			id: planEntries.id,
			date: planEntries.date,
			servings: planEntries.servings,
			recipe_id: recipes.id,
			title: recipeVersions.title,
			recipe_servings: recipeVersions.servings,
			ingredients: recipeVersions.ingredients
		})
		.from(planEntries)
		.innerJoin(recipes, eq(recipes.id, planEntries.recipeId))
		.innerJoin(recipeVersions, eq(recipeVersions.id, recipes.currentVersionId))
		.where(and(eq(planEntries.shopped, false), gte(planEntries.date, from)))
		.orderBy(asc(planEntries.date), asc(planEntries.position), asc(planEntries.createdAt))
		.all();

	return {
		contributions: planned.flatMap((p) =>
			contributions(p, {
				id: p.recipe_id,
				title: p.title,
				servings: p.recipe_servings,
				ingredients: Ingredient.array().parse(JSON.parse(p.ingredients))
			})
		),
		manual: q.select({ id: groceryManual.id, name: groceryManual.name }).from(groceryManual).orderBy(asc(groceryManual.createdAt)).all(),
		checks: q
			.select({ key: groceryChecks.key, sig: groceryChecks.sig, checked: groceryChecks.checked, at: groceryChecks.checkedAt })
			.from(groceryChecks)
			.all(),
		staples: q.select({ key: pantryStaples.key, name: pantryStaples.name, needed: pantryStaples.needed }).from(pantryStaples).all(),
		terms: q
			.select({ name_key: termsTable.nameKey, canonical: termsTable.canonical, aisle: termsTable.aisle })
			.from(termsTable)
			.all()
			// A section this version does not know (an older backup, a renamed section) falls under Other.
			.map((t): GroceryTerm => ({ ...t, aisle: AISLES.find((a) => a === t.aisle) ?? 'other' }))
	};
}

/** The earliest day that can still be someone's today: the server runs in UTC, the user may be a day behind it. */
export function earliestToday(): string {
	return addDays(localDay(new Date()), -1);
}

/** Records ticks made or taken back. For each item the latest change wins, whatever order they arrive in. */
export function setChecks({ changes }: GroceryChecksRequest): void {
	db.transaction((tx) => {
		for (const c of changes) {
			const existing = tx.select({ at: groceryChecks.checkedAt }).from(groceryChecks).where(eq(groceryChecks.key, c.key)).get();
			if (existing && existing.at > c.at) continue;
			const values = { sig: c.sig, checked: c.checked, checkedAt: c.at };
			tx.insert(groceryChecks)
				.values({ key: c.key, ...values })
				.onConflictDoUpdate({ target: groceryChecks.key, set: values })
				.run();
		}
	});
}

export function addManualItem(name: string): string {
	const id = uuid();
	db.insert(groceryManual).values({ id, name, createdAt: new Date().toISOString() }).run();
	return id;
}

export function removeManualItem(id: string): boolean {
	return db.transaction((tx) => {
		tx.delete(groceryChecks).where(eq(groceryChecks.key, manualKey(id))).run();
		return tx.delete(groceryManual).where(eq(groceryManual.id, id)).run().changes > 0;
	});
}

export function setStaple({ key, name, state }: SetStapleRequest): void {
	if (state === 'none') {
		db.delete(pantryStaples).where(eq(pantryStaples.key, key)).run();
		return;
	}
	const needed = state === 'needed';
	db.insert(pantryStaples)
		.values({ key, name, needed, createdAt: new Date().toISOString() })
		.onConflictDoUpdate({ target: pantryStaples.key, set: { needed } })
		.run();
}

export interface FinishResult {
	/** Plan entries that now count as shopped for. */
	entries: number;
	/** Unticked items kept on the list as manual items. */
	carried_over: number;
}

/**
 * Ends a shop for the days the list covered: their plan entries count as
 * shopped for, what was bought goes, what was not stays as manual items, and
 * the ticks and "need it this time" marks start afresh.
 */
export function finishShoppingFor({ from, through }: FinishShoppingRequest): FinishResult {
	return db.transaction((tx) => {
		const todo = finishShopping(buildGroceryList(groceryData(from, tx), { from, through }));

		const covered = and(eq(planEntries.shopped, false), gte(planEntries.date, from), through ? lte(planEntries.date, through) : undefined);
		const entries = tx.update(planEntries).set({ shopped: true }).where(covered).run().changes;

		if (todo.delete_manual.length > 0) tx.delete(groceryManual).where(inArray(groceryManual.id, todo.delete_manual)).run();
		const now = new Date().toISOString();
		for (const name of todo.carry_over) tx.insert(groceryManual).values({ id: uuid(), name, createdAt: now }).run();

		tx.delete(groceryChecks).run();
		tx.update(pantryStaples).set({ needed: false }).run();
		return { entries, carried_over: todo.carry_over.length };
	});
}

/** The user's own name and section for an item: applies to every ingredient name behind it and is never overwritten. */
export function setTerm({ names, canonical, aisle }: SetGroceryTermRequest): void {
	const createdAt = new Date().toISOString();
	db.transaction((tx) => {
		for (const name of names) {
			const values = { canonical, aisle, source: 'manual' as const };
			tx.insert(termsTable)
				.values({ nameKey: normalizeName(name), ...values, createdAt })
				.onConflictDoUpdate({ target: termsTable.nameKey, set: values })
				.run();
		}
	});
}

// ---- Tidy: shopping names and sections from the LLM, in the background (spec 4.11) ----

// Names per request, and requests per run: a week's plan fits in one.
const TIDY_BATCH = 60;
const TIDY_MAX_BATCHES = 3;
const RETRY_AFTER_MS = 10 * 60 * 1000;
let tidying = false;
let retryAt = 0;
// Names the model gave no usable answer for, so they are not asked about again on every page view.
const UNANSWERED_TTL_MS = 24 * 60 * 60 * 1000;
const unanswered = new Map<string, number>();

/** Names on the list that still need a shopping name and are worth asking about now. */
function namesToTidy(data: GroceryData): string[] {
	const now = Date.now();
	return namesWithoutTerm(data).filter((name) => (unanswered.get(normalizeName(name)) ?? 0) <= now);
}

export function isTidying(): boolean {
	return tidying;
}

/**
 * Starts naming and sorting in the background when the list has names
 * without a shopping name; the request that calls this does not wait for it.
 * Returns whether a run is in progress. Until it is done, and whenever it
 * fails, the list simply shows those names as written.
 */
export function queueTidy(): boolean {
	if (tidying) return true;
	if (retryAt > Date.now()) return false;
	if (namesToTidy(groceryData(earliestToday())).length === 0) return false;

	tidying = true;
	void tidy()
		.catch((e: unknown) => {
			console.warn(`[grocery] tidying failed: ${e instanceof Error ? e.message : String(e)}`);
			retryAt = Date.now() + RETRY_AFTER_MS;
		})
		.finally(() => (tidying = false));
	return true;
}

async function tidy(): Promise<void> {
	for (let batch = 0; batch < TIDY_MAX_BATCHES; batch++) {
		const data = groceryData(earliestToday());
		const names = namesToTidy(data).slice(0, TIDY_BATCH);
		if (names.length === 0) return;
		if (!llmLimiter.hit('grocery-tidy')) throw new Error('too many assistant requests this hour');

		const existing = [...new Set(data.terms.map((t) => t.canonical))];
		const terms = await groceryTerms(names, existing);
		console.log(`[grocery] ${names.length} names -> ${terms.length} shopping names`);
		// Names the model left out stay as written; asking again right away would only repeat the answer.
		const answered = new Set(terms.map((t) => t.name_key));
		for (const name of names) {
			if (!answered.has(normalizeName(name))) unanswered.set(normalizeName(name), Date.now() + UNANSWERED_TTL_MS);
		}

		const createdAt = new Date().toISOString();
		db.transaction((tx) => {
			for (const t of terms) {
				// Never over a name that got one meanwhile, least of all the user's own.
				tx.insert(termsTable)
					.values({ nameKey: t.name_key, canonical: t.canonical, aisle: t.aisle, source: 'llm', createdAt })
					.onConflictDoNothing()
					.run();
			}
		});
	}
}
