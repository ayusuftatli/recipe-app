import type { Ingredient, Nutrients } from './schema';
import { totalGrams } from './scaling';

/**
 * Nutrition is computed, never estimated (spec 4.5): each matched ingredient
 * contributes grams / 100 × its food's values per 100 g. Everything here is pure.
 */

export const NUTRIENT_KEYS = ['kcal', 'protein_g', 'fat_g', 'sat_fat_g', 'carbs_g', 'sugar_g', 'fiber_g', 'salt_g'] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export const NUTRIENT_LABELS: Record<NutrientKey, string> = {
	kcal: 'Energy (kcal)',
	protein_g: 'Protein (g)',
	fat_g: 'Fat (g)',
	sat_fat_g: 'of which saturated (g)',
	carbs_g: 'Carbohydrate (g)',
	sugar_g: 'of which sugars (g)',
	fiber_g: 'Fibre (g)',
	salt_g: 'Salt (g)'
};

export interface NutritionResult {
	/** Sum over the matched ingredients; all zero when nothing is matched. */
	totals: Nutrients;
	/** null without a servings count or without any match. */
	perServing: Nutrients | null;
	/** null when there is no weight to divide by or nothing is matched. */
	per100g: Nutrients | null;
	/** Grams the per-100 g column divides by: the measured final weight if set, else `total_g`. */
	basisG: number | null;
	/** Non-optional ingredients (optional ones are left out, as in `total_g`). */
	counted: number;
	/** Counted ingredients that contribute to the totals. */
	matched: number;
	/** Counted ingredients that contribute nothing, and why. */
	missing: { id: string; reason: 'no-match' | 'no-weight' }[];
}

function scale(n: Nutrients, factor: number): Nutrients {
	const out: Nutrients = { kcal: n.kcal * factor, protein_g: n.protein_g * factor, fat_g: n.fat_g * factor, carbs_g: n.carbs_g * factor };
	for (const key of ['sat_fat_g', 'sugar_g', 'fiber_g', 'salt_g'] as const) {
		const v = n[key];
		if (v !== undefined) out[key] = v * factor;
	}
	return out;
}

function add(into: Nutrients, n: Nutrients): void {
	for (const key of NUTRIENT_KEYS) {
		const v = n[key];
		if (v !== undefined) into[key] = (into[key] ?? 0) + v;
	}
}

export function computeNutrition(
	recipe: { servings: number | null; yield_g: number | null; ingredients: Ingredient[] },
	/** Values per 100 g, by food id. */
	foods: Record<string, Nutrients | undefined>
): NutritionResult {
	const totals: Nutrients = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
	const missing: NutritionResult['missing'] = [];
	let counted = 0;
	let matched = 0;

	for (const ing of recipe.ingredients) {
		if (ing.optional) continue;
		counted++;
		const food = ing.food_id ? foods[ing.food_id] : undefined;
		if (!food) missing.push({ id: ing.id, reason: 'no-match' });
		else if (ing.grams === null) missing.push({ id: ing.id, reason: 'no-weight' });
		else {
			matched++;
			add(totals, scale(food, ing.grams / 100));
		}
	}

	const yieldG = recipe.yield_g !== null && recipe.yield_g > 0 ? recipe.yield_g : null;
	const basis = yieldG ?? totalGrams(recipe.ingredients);
	const basisG = basis > 0 ? basis : null;
	const servings = recipe.servings !== null && recipe.servings > 0 ? recipe.servings : null;

	return {
		totals,
		perServing: matched > 0 && servings !== null ? scale(totals, 1 / servings) : null,
		per100g: matched > 0 && basisG !== null ? scale(totals, 100 / basisG) : null,
		basisG,
		counted,
		matched,
		missing
	};
}

/** kcal as whole numbers; grams with one decimal below 100. */
export function formatNutrient(key: NutrientKey, value: number | undefined): string {
	if (value === undefined) return '–';
	if (key === 'kcal' || value >= 100) return String(Math.round(value));
	return String(Math.round(value * 10) / 10);
}
