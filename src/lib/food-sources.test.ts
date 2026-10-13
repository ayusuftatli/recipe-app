import { describe, expect, it } from 'vitest';
import { dropStaleFoodIds, normalizeName, parseFdcSearch, parseOffSearch, pickCandidate } from './food-sources';
import type { Ingredient } from './schema';

describe('normalizeName', () => {
	it('ignores case and spacing', () => {
		expect(normalizeName('  Red   Onion ')).toBe('red onion');
		expect(normalizeName('ÖL')).toBe('öl');
	});
});

describe('parseFdcSearch', () => {
	const n = (nutrientId: number, value: number) => ({ nutrientId, nutrientName: 'x', unitName: 'G', value });

	it('maps USDA nutrient ids to values per 100 g, with salt from sodium', () => {
		const out = parseFdcSearch({
			foods: [
				{
					fdcId: 171287,
					description: 'Egg, whole, raw, fresh',
					dataType: 'SR Legacy',
					foodNutrients: [n(1008, 143), n(1003, 12.56), n(1004, 9.51), n(1005, 0.72), n(1258, 3.126), n(2000, 0.37), n(1079, 0), n(1093, 142)]
				}
			]
		});
		expect(out).toEqual([
			{
				source: 'usda',
				source_id: '171287',
				name: 'Egg, whole, raw, fresh',
				nutrients: { kcal: 143, protein_g: 12.56, fat_g: 9.51, carbs_g: 0.72, sat_fat_g: 3.126, sugar_g: 0.37, fiber_g: 0, salt_g: 0.355 }
			}
		]);
	});

	it('falls back to Atwater energy and carbohydrate by summation (Foundation foods)', () => {
		const [food] = parseFdcSearch({ foods: [{ fdcId: 1, description: 'Flour', foodNutrients: [n(2047, 366), n(1003, 10), n(1004, 1), n(1050, 74)] }] });
		expect(food?.nutrients).toEqual({ kcal: 366, protein_g: 10, fat_g: 1, carbs_g: 74 });
	});

	it('skips foods without energy or a macro, and tolerates junk', () => {
		expect(parseFdcSearch({ foods: [{ fdcId: 1, description: 'No energy', foodNutrients: [n(1003, 1), n(1004, 1), n(1005, 1)] }] })).toEqual([]);
		expect(parseFdcSearch({ foods: [{ fdcId: 2, description: 'No carbs', foodNutrients: [n(1008, 10), n(1003, 1), n(1004, 1)] }] })).toEqual([]);
		expect(parseFdcSearch({})).toEqual([]);
		expect(parseFdcSearch('nope')).toEqual([]);
		expect(parseFdcSearch({ foods: 'x' })).toEqual([]);
	});
});

describe('parseOffSearch', () => {
	it('reads per-100 g nutriments, numbers or strings, and adds the brand', () => {
		const out = parseOffSearch({
			hits: [
				{
					code: '4000417025005',
					product_name: 'Tellerlinsen',
					brands: 'Müller, Other',
					nutriments: { 'energy-kcal_100g': 309, proteins_100g: '23.5', fat_100g: 1.5, carbohydrates_100g: 41, sugars_100g: 1.1, fiber_100g: 17, salt_100g: 0.02, 'saturated-fat_100g': 0.2 }
				}
			]
		});
		expect(out).toEqual([
			{
				source: 'off',
				source_id: '4000417025005',
				name: 'Tellerlinsen (Müller)',
				nutrients: { kcal: 309, protein_g: 23.5, fat_g: 1.5, carbs_g: 41, sat_fat_g: 0.2, sugar_g: 1.1, fiber_g: 17, salt_g: 0.02 }
			}
		]);
	});

	it('skips products missing a name, code, energy or macros', () => {
		const full = { 'energy-kcal_100g': 100, proteins_100g: 1, fat_100g: 1, carbohydrates_100g: 1 };
		expect(
			parseOffSearch({
				hits: [
					{ code: '1', nutriments: full },
					{ product_name: 'No code', nutriments: full },
					{ code: '2', product_name: 'No energy', nutriments: { ...full, 'energy-kcal_100g': undefined } },
					{ code: '3', product_name: 'Bad number', nutriments: { ...full, fat_100g: 'abc' } },
					{ code: '4', product_name: 'No nutriments' }
				]
			})
		).toEqual([]);
		expect(parseOffSearch(null)).toEqual([]);
	});

	it('accepts brands as a list', () => {
		const [food] = parseOffSearch({
			hits: [{ code: '9', product_name: 'Linsen', brands: ['Alnatura', 'x'], nutriments: { 'energy-kcal_100g': 312, proteins_100g: 25, fat_100g: 1.5, carbohydrates_100g: 41 } }]
		});
		expect(food?.name).toBe('Linsen (Alnatura)');
	});
});

describe('pickCandidate', () => {
	const c = ['a', 'b', 'c'];
	it('takes the numbered candidate', () => {
		expect(pickCandidate(c, '1')).toBe('a');
		expect(pickCandidate(c, ' 3 ')).toBe('c');
	});
	it('treats none, unknown numbers and anything else as no match', () => {
		for (const answer of ['none', '0', '4', '-1', '1.5', 'a', '', undefined]) expect(pickCandidate(c, answer)).toBeNull();
	});
});

describe('dropStaleFoodIds', () => {
	const ing = (id: string, name: string, food_id?: string): Ingredient => ({ id, qty: 1, unit: null, name, grams: 10, grams_estimated: true, ...(food_id ? { food_id } : {}) });

	it('drops a match carried over to a renamed ingredient', () => {
		const out = dropStaleFoodIds([ing('1', 'onion', 'f-onion')], [ing('1', 'garlic', 'f-onion')]);
		expect(out).toEqual([ing('1', 'garlic')]);
	});
	it('keeps matches when the name is the same, the match is new, or the ingredient is new', () => {
		const prev = [ing('1', 'onion', 'f-onion')];
		expect(dropStaleFoodIds(prev, [ing('1', ' Onion ', 'f-onion')])).toEqual([ing('1', ' Onion ', 'f-onion')]);
		expect(dropStaleFoodIds(prev, [ing('1', 'garlic', 'f-garlic')])).toEqual([ing('1', 'garlic', 'f-garlic')]);
		expect(dropStaleFoodIds(prev, [ing('2', 'garlic', 'f-onion')])).toEqual([ing('2', 'garlic', 'f-onion')]);
	});
});
