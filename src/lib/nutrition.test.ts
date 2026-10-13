import { describe, expect, it } from 'vitest';
import { computeNutrition, formatNutrient } from './nutrition';
import type { Ingredient, Nutrients } from './schema';

function ing(id: string, grams: number | null, over: Partial<Ingredient> = {}): Ingredient {
	return { id, qty: 1, unit: 'g', name: id, grams, grams_estimated: false, ...over };
}

const foods: Record<string, Nutrients> = {
	flour: { kcal: 364, protein_g: 10, fat_g: 1, carbs_g: 76, fiber_g: 2.7 },
	butter: { kcal: 717, protein_g: 0.9, fat_g: 81, carbs_g: 0.1, sat_fat_g: 51, salt_g: 0.03 },
	sugar: { kcal: 387, protein_g: 0, fat_g: 0, carbs_g: 100, sugar_g: 100 }
};

describe('computeNutrition', () => {
	const recipe = {
		servings: 4,
		yield_g: null,
		ingredients: [ing('a', 200, { food_id: 'flour' }), ing('b', 100, { food_id: 'butter' }), ing('c', 50, { food_id: 'sugar' })]
	};

	it('sums grams / 100 × values per 100 g', () => {
		const r = computeNutrition(recipe, foods);
		expect(r.totals.kcal).toBeCloseTo(728 + 717 + 193.5);
		expect(r.totals.protein_g).toBeCloseTo(20.9);
		expect(r.totals.fat_g).toBeCloseTo(83);
		expect(r.totals.carbs_g).toBeCloseTo(152 + 0.1 + 50);
		expect(r.matched).toBe(3);
		expect(r.counted).toBe(3);
		expect(r.missing).toEqual([]);
	});

	it('sums optional nutrients over the foods that have them', () => {
		const r = computeNutrition(recipe, foods);
		expect(r.totals.fiber_g).toBeCloseTo(5.4);
		expect(r.totals.sat_fat_g).toBeCloseTo(51);
		expect(r.totals.sugar_g).toBeCloseTo(50);
		expect(r.totals.salt_g).toBeCloseTo(0.03);
		const plain = computeNutrition({ ...recipe, ingredients: [ing('c', 50, { food_id: 'sugar' })] }, foods);
		expect(plain.totals.fiber_g).toBeUndefined();
		expect(plain.perServing?.fiber_g).toBeUndefined();
	});

	it('per serving divides by servings; null without servings', () => {
		const r = computeNutrition(recipe, foods);
		expect(r.perServing?.kcal).toBeCloseTo(1638.5 / 4);
		expect(computeNutrition({ ...recipe, servings: null }, foods).perServing).toBeNull();
	});

	it('per 100 g divides by total_g, or by the final weight when set', () => {
		const r = computeNutrition(recipe, foods);
		expect(r.basisG).toBe(350);
		expect(r.per100g?.kcal).toBeCloseTo((1638.5 / 350) * 100);
		const baked = computeNutrition({ ...recipe, yield_g: 300 }, foods);
		expect(baked.basisG).toBe(300);
		expect(baked.per100g?.kcal).toBeCloseTo((1638.5 / 300) * 100);
	});

	it('reports unmatched and weightless ingredients and leaves them out of the sum', () => {
		const r = computeNutrition(
			{
				servings: 2,
				yield_g: null,
				ingredients: [ing('a', 100, { food_id: 'flour' }), ing('b', 100), ing('c', null, { food_id: 'sugar' }), ing('d', 30, { food_id: 'gone' })]
			},
			foods
		);
		expect(r.totals.kcal).toBeCloseTo(364);
		expect(r.matched).toBe(1);
		expect(r.counted).toBe(4);
		expect(r.missing).toEqual([
			{ id: 'b', reason: 'no-match' },
			{ id: 'c', reason: 'no-weight' },
			{ id: 'd', reason: 'no-match' }
		]);
		// per 100 g still divides by the weight of everything, matched or not
		expect(r.basisG).toBe(230);
	});

	it('leaves optional ingredients out entirely', () => {
		const r = computeNutrition(
			{ servings: 1, yield_g: null, ingredients: [ing('a', 100, { food_id: 'flour' }), ing('b', 100, { food_id: 'butter', optional: true })] },
			foods
		);
		expect(r.totals.kcal).toBeCloseTo(364);
		expect(r.counted).toBe(1);
		expect(r.basisG).toBe(100);
	});

	it('gives zero totals and no per-serving or per-100 g values when nothing is matched', () => {
		const r = computeNutrition({ servings: 2, yield_g: null, ingredients: [ing('a', 100)] }, foods);
		expect(r.totals).toEqual({ kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 });
		expect(r.perServing).toBeNull();
		expect(r.per100g).toBeNull();
		const empty = computeNutrition({ servings: 2, yield_g: null, ingredients: [] }, foods);
		expect(empty.counted).toBe(0);
		expect(empty.basisG).toBeNull();
	});

	it('has no per-100 g values when there is no weight to divide by', () => {
		const r = computeNutrition({ servings: null, yield_g: null, ingredients: [ing('a', 0, { food_id: 'flour' })] }, foods);
		expect(r.matched).toBe(1);
		expect(r.per100g).toBeNull();
	});
});

describe('formatNutrient', () => {
	it('rounds kcal to whole numbers and grams to one decimal below 100', () => {
		expect(formatNutrient('kcal', 409.6)).toBe('410');
		expect(formatNutrient('protein_g', 20.94)).toBe('20.9');
		expect(formatNutrient('carbs_g', 202.14)).toBe('202');
		expect(formatNutrient('salt_g', 0.03)).toBe('0');
		expect(formatNutrient('fiber_g', undefined)).toBe('–');
	});
});
