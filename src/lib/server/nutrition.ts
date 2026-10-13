import { normalizeName, pickCandidate, type FoodCandidate } from '$lib/food-sources';
import { formatQty } from '$lib/format';
import type { Ingredient, SetFoodRequest } from '$lib/schema';
import { versionToDraft } from '$lib/types';
import { searchFoodsAny } from './food-search';
import { matchesByName, saveFood } from './foods';
import { chooseFoods, foodSearchTerms } from './llm';
import { getRecipe, saveRecipe } from './recipes';

// Names nothing was found for, so pressing the button again doesn't repeat the same lookups.
const NOT_FOUND_TTL_MS = 24 * 60 * 60 * 1000;
const notFound = new Map<string, number>();

function describe(ing: Ingredient): string {
	const amount = [formatQty(ing.qty), ing.unit].filter(Boolean).join(' ');
	return [amount, ing.name, ing.note ? `(${ing.note})` : ''].filter(Boolean).join(' ');
}

export interface MatchSummary {
	matched: number;
	reused: number;
	unmatched: number;
	version_number: number | null;
}

/**
 * "Calculate nutrition": gives every ingredient that can contribute (it has a
 * weight, is not optional, and has no food yet) a food. Known names are reused;
 * the rest are searched in the food databases and the LLM picks a candidate.
 * All new matches go into one new version.
 */
export async function matchRecipe(recipeId: string): Promise<MatchSummary | null> {
	const recipe = getRecipe(recipeId);
	if (!recipe) return null;
	const todo = recipe.current.ingredients.filter((i) => !i.food_id && i.grams !== null && !i.optional);
	const chosen = new Map<string, string>();

	const known = matchesByName();
	const lookups: Ingredient[] = [];
	const now = Date.now();
	for (const ing of todo) {
		const name = normalizeName(ing.name);
		const foodId = known.get(name);
		if (foodId) chosen.set(ing.id, foodId);
		else if ((notFound.get(name) ?? 0) <= now) lookups.push(ing);
	}
	const reused = chosen.size;

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
			if (food) chosen.set(ing.id, saveFood(food));
			else notFound.set(normalizeName(ing.name), now + NOT_FOUND_TTL_MS);
		}
	}

	const summary: MatchSummary = { matched: chosen.size, reused, unmatched: todo.length - chosen.size, version_number: null };
	if (chosen.size === 0) return summary;

	const draft = versionToDraft(recipe.current);
	draft.ingredients = draft.ingredients.map((i) => {
		const foodId = chosen.get(i.id);
		return foodId ? { ...i, food_id: foodId } : i;
	});
	const saved = saveRecipe(recipeId, draft, recipe.tags, 'Nutrition matching');
	summary.version_number = saved?.created ? saved.version_number : null;
	return summary;
}

/** The user's own choice for one ingredient (or none). Like any change to an ingredient, it creates a version. */
export function setIngredientFood(recipeId: string, { ingredient_id, food }: SetFoodRequest): { version_number: number } | null {
	const recipe = getRecipe(recipeId);
	const ingredient = recipe?.current.ingredients.find((i) => i.id === ingredient_id);
	if (!recipe || !ingredient) return null;

	const foodId = food ? saveFood({ ...food, source_id: food.source === 'manual' ? null : food.source_id }) : null;
	notFound.delete(normalizeName(ingredient.name));

	const draft = versionToDraft(recipe.current);
	draft.ingredients = draft.ingredients.map((i) => {
		if (i.id !== ingredient_id) return i;
		const { food_id: _, ...rest } = i;
		return foodId ? { ...rest, food_id: foodId } : rest;
	});
	const note = food ? `Nutrition: ${ingredient.name} = ${food.name}` : `Nutrition: ${ingredient.name} unmatched`;
	const saved = saveRecipe(recipeId, draft, recipe.tags, note.slice(0, 500));
	return saved ? { version_number: saved.version_number } : null;
}
