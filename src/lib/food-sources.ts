import { z } from 'zod';
import type { Ingredient, Nutrients } from './schema';

/**
 * Pure helpers around the external food databases (spec 4.5): turning their
 * search responses into candidates with values per 100 g. Numbers only ever
 * come from here, never from the LLM.
 */

export interface FoodCandidate {
	source: 'usda' | 'off';
	source_id: string;
	name: string;
	nutrients: Nutrients;
}

/** Key for "the same ingredient name": case and spacing don't matter. */
export function normalizeName(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function round(n: number): number {
	return Math.round(n * 1000) / 1000;
}

const FdcSearch = z.object({
	foods: z
		.array(
			z.object({
				fdcId: z.number(),
				description: z.string(),
				foodNutrients: z.array(z.object({ nutrientId: z.number().optional(), value: z.number().optional() }).passthrough()).default([])
			})
		)
		.default([])
});

// USDA nutrient ids; values are per 100 g for Foundation and SR Legacy foods.
const FDC = { kcal: [1008, 2047, 2048], protein: [1003], fat: [1004], carbs: [1005, 1050], satFat: [1258], sugar: [2000, 1063], fiber: [1079], sodiumMg: [1093] };

/** USDA FoodData Central `/v1/foods/search`. Foods without energy and all three macros are skipped. */
export function parseFdcSearch(json: unknown): FoodCandidate[] {
	const parsed = FdcSearch.safeParse(json);
	if (!parsed.success) return [];
	const out: FoodCandidate[] = [];
	for (const food of parsed.data.foods) {
		const byId = new Map<number, number>();
		for (const n of food.foodNutrients) {
			if (n.nutrientId !== undefined && n.value !== undefined && n.value >= 0) byId.set(n.nutrientId, n.value);
		}
		const first = (ids: number[]) => ids.map((id) => byId.get(id)).find((v) => v !== undefined);
		const kcal = first(FDC.kcal);
		const protein = first(FDC.protein);
		const fat = first(FDC.fat);
		const carbs = first(FDC.carbs);
		if (kcal === undefined || protein === undefined || fat === undefined || carbs === undefined) continue;

		const nutrients: Nutrients = { kcal: round(kcal), protein_g: round(protein), fat_g: round(fat), carbs_g: round(carbs) };
		const satFat = first(FDC.satFat);
		const sugar = first(FDC.sugar);
		const fiber = first(FDC.fiber);
		const sodiumMg = first(FDC.sodiumMg);
		if (satFat !== undefined) nutrients.sat_fat_g = round(satFat);
		if (sugar !== undefined) nutrients.sugar_g = round(sugar);
		if (fiber !== undefined) nutrients.fiber_g = round(fiber);
		// Salt = sodium × 2.5.
		if (sodiumMg !== undefined) nutrients.salt_g = round((sodiumMg * 2.5) / 1000);
		out.push({ source: 'usda', source_id: String(food.fdcId), name: food.description, nutrients });
	}
	return out;
}

// Open Food Facts stores numbers as numbers or strings depending on the product.
const OffNumber = z.preprocess((v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v), z.number().finite().nonnegative()).optional().catch(undefined);

const OffSearch = z.object({
	hits: z
		.array(
			z
				.object({
					code: z.union([z.string(), z.number()]).optional(),
					product_name: z.string().optional(),
					brands: z.union([z.string(), z.array(z.string())]).optional(),
					nutriments: z
						.object({
							'energy-kcal_100g': OffNumber,
							proteins_100g: OffNumber,
							fat_100g: OffNumber,
							'saturated-fat_100g': OffNumber,
							carbohydrates_100g: OffNumber,
							sugars_100g: OffNumber,
							fiber_100g: OffNumber,
							salt_100g: OffNumber
						})
						.optional()
				})
				.passthrough()
		)
		.default([])
});

/** Open Food Facts search (search.openfoodfacts.org). Products without a name, code, energy or all three macros are skipped. */
export function parseOffSearch(json: unknown): FoodCandidate[] {
	const parsed = OffSearch.safeParse(json);
	if (!parsed.success) return [];
	const out: FoodCandidate[] = [];
	for (const p of parsed.data.hits) {
		const n = p.nutriments;
		const name = p.product_name?.trim();
		const code = p.code === undefined ? '' : String(p.code);
		if (!n || !name || !code) continue;
		const kcal = n['energy-kcal_100g'];
		if (kcal === undefined || n.proteins_100g === undefined || n.fat_100g === undefined || n.carbohydrates_100g === undefined) continue;

		const nutrients: Nutrients = { kcal: round(kcal), protein_g: round(n.proteins_100g), fat_g: round(n.fat_100g), carbs_g: round(n.carbohydrates_100g) };
		if (n['saturated-fat_100g'] !== undefined) nutrients.sat_fat_g = round(n['saturated-fat_100g']);
		if (n.sugars_100g !== undefined) nutrients.sugar_g = round(n.sugars_100g);
		if (n.fiber_100g !== undefined) nutrients.fiber_g = round(n.fiber_100g);
		if (n.salt_100g !== undefined) nutrients.salt_g = round(n.salt_100g);
		const brand = (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0])?.trim();
		out.push({ source: 'off', source_id: code, name: brand ? `${name} (${brand})` : name, nutrients });
	}
	return out;
}

/**
 * The LLM answers with the number of a candidate ("1" = first) or "none".
 * Anything else, including a number that was not offered, counts as no match.
 */
export function pickCandidate<T>(candidates: T[], answer: string | undefined): T | null {
	const s = answer?.trim() ?? '';
	if (!/^\d+$/.test(s)) return null;
	return candidates[Number(s) - 1] ?? null;
}

/**
 * A food match (or the user's "no match") belongs to an ingredient name: when
 * an edit renames an ingredient but carries the old choice along, it is dropped.
 */
export function dropStaleFoodIds(previous: Ingredient[], next: Ingredient[]): Ingredient[] {
	const prev = new Map(previous.map((i) => [i.id, i]));
	return next.map((ing) => {
		const before = prev.get(ing.id);
		const renamed = before && normalizeName(before.name) !== normalizeName(ing.name);
		if (!renamed || ing.food_id === undefined || ing.food_id !== before.food_id) return ing;
		const { food_id: _, ...rest } = ing;
		return rest;
	});
}
