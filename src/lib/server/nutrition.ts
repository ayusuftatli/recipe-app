import { normalizeName, pickCandidate, type FoodCandidate } from '$lib/food-sources';
import { formatQty } from '$lib/format';
import type { Ingredient, SetFoodRequest } from '$lib/schema';
import { versionToDraft, type RecipeDetail } from '$lib/types';
import { searchFoodsAny } from './food-search';
import { matchesByName, saveFood } from './foods';
import { chooseFoods, foodSearchTerms } from './llm';
import { getRecipe, saveRecipe } from './recipes';

// Names nothing was found for, so the same lookups aren't repeated on every page view.
const NOT_FOUND_TTL_MS = 24 * 60 * 60 * 1000;
const notFound = new Map<string, number>();
// Recipes being matched right now, and recipes whose last run failed (e.g. the LLM was unreachable).
const running = new Set<string>();
const RETRY_AFTER_MS = 10 * 60 * 1000;
const retryAt = new Map<string, number>();

function describe(ing: Ingredient): string {
	const amount = [formatQty(ing.qty), ing.unit].filter(Boolean).join(' ');
	return [amount, ing.name, ing.note ? `(${ing.note})` : ''].filter(Boolean).join(' ');
}

/**
 * Ingredients matching should look at: they can contribute (have a weight,
 * are not optional) and nobody has decided about them yet. `food_id: null`
 * is the user's "no match" and is left alone.
 */
function unmatched(recipe: RecipeDetail): Ingredient[] {
	return recipe.current.ingredients.filter((i) => i.food_id === undefined && i.grams !== null && !i.optional);
}

export function isMatching(recipeId: string): boolean {
	return running.has(recipeId);
}

/**
 * Starts matching in the background when there is something new to look up;
 * the request that calls this does not wait for it. Returns whether a run is
 * in progress for the recipe. `force` also retries names that found nothing.
 */
export function queueMatch(recipeId: string, force = false): boolean {
	if (running.has(recipeId)) return true;
	const recipe = getRecipe(recipeId);
	if (!recipe || recipe.archived) return false;
	const todo = unmatched(recipe);
	const now = Date.now();
	if (force) {
		retryAt.delete(recipeId);
		for (const ing of todo) notFound.delete(normalizeName(ing.name));
	}
	if ((retryAt.get(recipeId) ?? 0) > now) return false;
	if (!todo.some((ing) => (notFound.get(normalizeName(ing.name)) ?? 0) <= now)) return false;

	running.add(recipeId);
	void matchRecipe(recipeId)
		.catch((e: unknown) => {
			console.warn(`[nutrition] matching failed for ${recipeId}: ${e instanceof Error ? e.message : String(e)}`);
			retryAt.set(recipeId, Date.now() + RETRY_AFTER_MS);
		})
		.finally(() => running.delete(recipeId));
	return true;
}

/**
 * Gives every unmatched ingredient a food where possible. Known names are
 * reused; the rest are searched in the food databases and the LLM picks a
 * candidate. All new matches go into one new version.
 */
async function matchRecipe(recipeId: string): Promise<void> {
	const recipe = getRecipe(recipeId);
	if (!recipe) return;
	const todo = unmatched(recipe);
	/** Chosen food id by normalised ingredient name. */
	const chosen = new Map<string, string>();

	const known = matchesByName();
	const lookups: Ingredient[] = [];
	const now = Date.now();
	for (const ing of todo) {
		const name = normalizeName(ing.name);
		const foodId = known.get(name);
		if (foodId) chosen.set(name, foodId);
		else if ((notFound.get(name) ?? 0) <= now) lookups.push(ing);
	}

	if (lookups.length > 0) {
		const items = lookups.map((i) => ({ id: i.id, ingredient: describe(i) }));
		const terms = await foodSearchTerms(items);
		const candidates = new Map<string, FoodCandidate[]>();
		await Promise.all(
			lookups.map(async (ing) => {
				candidates.set(ing.id, await searchFoodsAny(terms.get(ing.id) ?? [ing.name]));
			})
		);

		const offered = items.flatMap((item) => {
			const list = candidates.get(item.id) ?? [];
			return list.length > 0 ? [{ ...item, candidates: list.map((c) => c.name) }] : [];
		});
		const picks = offered.length > 0 ? await chooseFoods(offered) : new Map<string, string>();

		for (const ing of lookups) {
			const list = candidates.get(ing.id) ?? [];
			const food = pickCandidate(list, picks.get(ing.id));
			console.log(`[nutrition] "${ing.name}" searched as ${JSON.stringify(terms.get(ing.id) ?? [ing.name])}: ${list.length} candidates -> ${food ? food.name : 'none'}`);
			if (food) chosen.set(normalizeName(ing.name), saveFood(food));
			else notFound.set(normalizeName(ing.name), now + NOT_FOUND_TTL_MS);
		}
	}
	if (chosen.size === 0) return;

	// The lookups took a while and the recipe may have been edited meanwhile:
	// apply the matches to whatever is current now, by ingredient name.
	const latest = getRecipe(recipeId);
	if (!latest) return;
	const draft = versionToDraft(latest.current);
	draft.ingredients = draft.ingredients.map((i) => {
		const foodId = i.food_id === undefined ? chosen.get(normalizeName(i.name)) : undefined;
		return foodId ? { ...i, food_id: foodId } : i;
	});
	saveRecipe(recipeId, draft, latest.tags, 'Nutrition matching');
}

/** The user's own choice for one ingredient. Like any change to an ingredient, it creates a version. */
export function setIngredientFood(recipeId: string, { ingredient_id, food }: SetFoodRequest): { version_number: number } | null {
	const recipe = getRecipe(recipeId);
	const ingredient = recipe?.current.ingredients.find((i) => i.id === ingredient_id);
	if (!recipe || !ingredient) return null;

	// null is kept on the ingredient as "no match", so it is not matched again automatically.
	const foodId = food ? saveFood({ ...food, source_id: food.source === 'manual' ? null : food.source_id }) : null;

	const draft = versionToDraft(recipe.current);
	draft.ingredients = draft.ingredients.map((i) => (i.id === ingredient_id ? { ...i, food_id: foodId } : i));
	const note = food ? `Nutrition: ${ingredient.name} = ${food.name}` : `Nutrition: ${ingredient.name} set to no match`;
	const saved = saveRecipe(recipeId, draft, recipe.tags, note.slice(0, 500));
	return saved ? { version_number: saved.version_number } : null;
}
