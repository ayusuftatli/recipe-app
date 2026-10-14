import { describe, expect, it } from 'vitest';
import type { Ingredient, RecipeDraft } from './schema';
import { percentages, roundGrams, roundQty, scaleDraft, scaleFactor, scaleIngredients, stepServings, totalGrams } from './scaling';

function ing(id: string, over: Partial<Ingredient> = {}): Ingredient {
	return { id, qty: 1, unit: 'g', name: id, grams: 1, grams_estimated: false, ...over };
}

const dough = [
	ing('flour', { qty: 500, grams: 500 }),
	ing('water', { qty: 350, unit: 'ml', grams: 350, grams_estimated: true }),
	ing('egg', { qty: 2, unit: 'piece', grams: 100, grams_estimated: true }),
	ing('salt', { qty: 1, unit: 'pinch', grams: null }),
	ing('seeds', { qty: 50, grams: 50, optional: true })
];
const recipe = { servings: 4, ingredients: dough };

describe('totalGrams', () => {
	it('sums non-optional ingredients with known grams', () => {
		expect(totalGrams(dough)).toBe(950);
	});

	it('is 0 for an empty list or when no ingredient has a weight', () => {
		expect(totalGrams([])).toBe(0);
		expect(totalGrams([ing('salt', { grams: null })])).toBe(0);
	});
});

describe('scaleFactor', () => {
	it('servings: target / servings', () => {
		expect(scaleFactor(recipe, { mode: 'servings', target: 6 })).toBe(1.5);
		expect(scaleFactor(recipe, { mode: 'servings', target: 1 })).toBe(0.25);
	});

	it('servings: null when the recipe has no servings', () => {
		expect(scaleFactor({ ...recipe, servings: null }, { mode: 'servings', target: 6 })).toBeNull();
	});

	it('total weight: target / total_g', () => {
		expect(scaleFactor(recipe, { mode: 'weight', target: 1900 })).toBe(2);
	});

	it('total weight: null when the total is zero or missing', () => {
		const noWeights = { servings: 2, ingredients: [ing('salt', { grams: null }), ing('zero', { grams: 0 })] };
		expect(scaleFactor(noWeights, { mode: 'weight', target: 500 })).toBeNull();
		expect(scaleFactor({ servings: 2, ingredients: [] }, { mode: 'weight', target: 500 })).toBeNull();
	});

	it('snaps to exactly 1 when the target is the recipe amount up to display rounding', () => {
		const odd = { servings: 3, ingredients: [ing('a', { grams: 613.4996 })] };
		expect(scaleFactor(odd, { mode: 'weight', target: 613.5 })).toBe(1);
		expect(scaleFactor(odd, { mode: 'anchor', ingredientId: 'a', available: 613.5 })).toBe(1);
		expect(scaleFactor(odd, { mode: 'weight', target: 614 })).not.toBe(1);
	});

	it('anchor: available / ingredient.grams', () => {
		expect(scaleFactor(recipe, { mode: 'anchor', ingredientId: 'flour', available: 300 })).toBe(0.6);
	});

	it('anchor: null for an unknown ingredient or one without a weight', () => {
		expect(scaleFactor(recipe, { mode: 'anchor', ingredientId: 'nope', available: 300 })).toBeNull();
		expect(scaleFactor(recipe, { mode: 'anchor', ingredientId: 'salt', available: 300 })).toBeNull();
		const zero = { servings: 1, ingredients: [ing('zero', { grams: 0 })] };
		expect(scaleFactor(zero, { mode: 'anchor', ingredientId: 'zero', available: 300 })).toBeNull();
	});

	it('null for zero, negative or non-finite input in every mode', () => {
		for (const bad of [0, -2, NaN, Infinity]) {
			expect(scaleFactor(recipe, { mode: 'servings', target: bad })).toBeNull();
			expect(scaleFactor(recipe, { mode: 'weight', target: bad })).toBeNull();
			expect(scaleFactor(recipe, { mode: 'anchor', ingredientId: 'flour', available: bad })).toBeNull();
		}
	});
});

describe('stepServings', () => {
	it('moves by one from a whole number', () => {
		expect(stepServings(4, 1)).toBe(5);
		expect(stepServings(4, -1)).toBe(3);
	});
	it('goes to the nearest whole number from a fraction', () => {
		expect(stepServings(2.5, 1)).toBe(3);
		expect(stepServings(2.5, -1)).toBe(2);
		// 3 servings that came out of a division as 2.9999999999
		expect(stepServings(2.9999999999, 1)).toBe(4);
		expect(stepServings(3.0000000001, -1)).toBe(2);
	});
	it('does not go below one serving', () => {
		expect(stepServings(1, -1)).toBeNull();
		expect(stepServings(0.5, -1)).toBeNull();
		expect(stepServings(0.5, 1)).toBe(1);
	});
});

describe('roundGrams', () => {
	it('rounds to whole numbers from 100 g', () => {
		expect(roundGrams(100)).toBe(100);
		expect(roundGrams(123.4)).toBe(123);
		expect(roundGrams(999.5)).toBe(1000);
	});

	it('rounds to 0.5 between 10 and 100 g', () => {
		expect(roundGrams(10)).toBe(10);
		expect(roundGrams(12.3)).toBe(12.5);
		expect(roundGrams(12.2)).toBe(12);
		expect(roundGrams(99.6)).toBe(99.5);
	});

	it('rounds to 0.1 below 10 g', () => {
		expect(roundGrams(9.96)).toBe(10);
		expect(roundGrams(3.14159)).toBe(3.1);
		expect(roundGrams(0.3)).toBe(0.3);
	});

	it('never rounds a positive weight to 0', () => {
		expect(roundGrams(0.04)).toBe(0.04);
		expect(roundGrams(0)).toBe(0);
	});
});

describe('roundQty', () => {
	it('rounds piece-like units to the nearest 0.25', () => {
		expect(roundQty(1.6, 'piece')).toBe(1.5);
		expect(roundQty(2.9, 'clove')).toBe(3);
		expect(roundQty(0.7, 'tsp')).toBe(0.75);
		expect(roundQty(1.3, null)).toBe(1.25);
		expect(roundQty(0.3, 'Cup')).toBe(0.25);
	});

	it('does not round a small positive quantity down to 0', () => {
		expect(roundQty(0.1, 'tsp')).toBe(0.1);
	});

	it('uses the grams rule for mass units, so qty and grams agree', () => {
		expect(roundQty(123.4, 'g')).toBe(123);
		expect(roundQty(12.3, 'g')).toBe(12.5);
		expect(roundQty(1.2344, 'kg')).toBe(1.234);
		expect(roundQty(0.0123, 'kg')).toBe(0.0125);
	});

	it('keeps decimals for measured volume units', () => {
		expect(roundQty(123.4, 'ml')).toBe(123);
		expect(roundQty(0.3333, 'l')).toBe(0.333);
	});
});

describe('scaleIngredients', () => {
	it('scales grams and qty by the factor', () => {
		const scaled = scaleIngredients(dough, 1.5);
		expect(scaled.map((i) => [i.id, i.qty, i.grams])).toEqual([
			['flour', 750, 750],
			['water', 525, 525],
			['egg', 3, 150],
			['salt', 1.5, null],
			['seeds', 75, 75]
		]);
	});

	it('applies the rounding rules to the scaled amounts', () => {
		const scaled = scaleIngredients(dough, 1 / 3);
		expect(scaled.map((i) => [i.id, i.qty, i.grams])).toEqual([
			['flour', 167, 167],
			['water', 117, 117],
			['egg', 0.75, 33.5],
			['salt', 0.25, null],
			['seeds', 16.5, 16.5]
		]);
	});

	it('flags ingredients without grams and scales them by qty only', () => {
		const scaled = scaleIngredients(dough, 2);
		const salt = scaled.find((i) => i.id === 'salt')!;
		expect(salt).toMatchObject({ qty: 2, grams: null, qty_only: true });
		expect(scaled.filter((i) => i.qty_only).map((i) => i.id)).toEqual(['salt']);
	});

	it('leaves a null qty null ("salt to taste")', () => {
		const [salt] = scaleIngredients([ing('salt', { qty: null, unit: null, grams: null })], 3);
		expect(salt).toMatchObject({ qty: null, grams: null, qty_only: true });
	});

	it('returns the amounts as written for a factor of 1', () => {
		const odd = [ing('stock', { qty: 1.3, unit: 'cup', grams: 312.4, grams_estimated: true })];
		expect(scaleIngredients(odd, 1)[0]).toMatchObject({ qty: 1.3, grams: 312.4 });
	});

	it('does not modify the input', () => {
		const before = JSON.stringify(dough);
		scaleIngredients(dough, 2);
		expect(JSON.stringify(dough)).toBe(before);
	});
});

describe('scaleDraft', () => {
	const draft: RecipeDraft = {
		title: 'Bread',
		servings: 4,
		yield_g: 880,
		ingredients: dough,
		steps: [{ id: 's1', text: 'Mix.' }],
		notes: 'n'
	};

	it('scales servings, yield and ingredients and keeps everything else', () => {
		const scaled = scaleDraft(draft, 1.5);
		expect(scaled.servings).toBe(6);
		expect(scaled.yield_g).toBe(1320);
		expect(scaled.ingredients[0]).toEqual({ ...dough[0], qty: 750, grams: 750 });
		expect(scaled.ingredients[0]).not.toHaveProperty('qty_only');
		expect(scaled.steps).toEqual(draft.steps);
		expect(scaled.title).toBe('Bread');
		expect(scaled.notes).toBe('n');
	});

	it('keeps null servings and yield null', () => {
		const scaled = scaleDraft({ ...draft, servings: null, yield_g: null }, 2);
		expect(scaled.servings).toBeNull();
		expect(scaled.yield_g).toBeNull();
	});
});

describe('percentages', () => {
	it('gives each ingredient as a share of total_g', () => {
		const p = percentages(dough);
		expect(p.get('flour')).toBe(52.6);
		expect(p.get('water')).toBe(36.8);
		expect(p.get('egg')).toBe(10.5);
	});

	it('is null for ingredients without grams', () => {
		expect(percentages(dough).get('salt')).toBeNull();
	});

	it('shows optional ingredients relative to the same total', () => {
		expect(percentages(dough).get('seeds')).toBe(5.3);
	});

	it('is null for everything when the total is zero', () => {
		const p = percentages([ing('salt', { grams: null }), ing('zero', { grams: 0 })]);
		expect([...p.values()]).toEqual([null, null]);
	});
});
