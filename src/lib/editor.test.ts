import { describe, expect, it } from 'vitest';
import {
	exactGrams,
	ingredientsToRows,
	parseNumber,
	parseTags,
	rowsToIngredients,
	rowsToSteps,
	stepsToRows,
	newIngredientRow,
	type IngredientRow
} from './editor';
import type { Ingredient } from './schema';

describe('parseNumber', () => {
	it.each([
		['', null],
		['  ', null],
		['2', 2],
		['1.5', 1.5],
		['1,5', 1.5],
		['1/2', 0.5],
		['1 1/2', 1.5],
		['½', 0.5],
		['1½', 1.5]
	])('%j → %j', (input, expected) => {
		expect(parseNumber(input)).toBe(expected);
	});

	it.each(['abc', '1/0', '2 eggs', '-'])('%j is invalid', (input) => {
		expect(parseNumber(input)).toBeUndefined();
	});
});

describe('exactGrams', () => {
	it('converts mass units only', () => {
		expect(exactGrams(2, 'kg')).toBe(2000);
		expect(exactGrams(250, 'G')).toBe(250);
		expect(exactGrams(500, 'mg')).toBe(0.5);
		expect(exactGrams(1, 'tbsp')).toBeNull();
		expect(exactGrams(null, 'g')).toBeNull();
	});
});

describe('ingredient rows round-trip', () => {
	const ingredients: Ingredient[] = [
		{ id: 'a', qty: 1, unit: 'piece', name: 'onion', note: 'chopped', grams: 150, grams_estimated: true },
		{ id: 'b', group: 'Sauce', qty: 2, unit: 'tbsp', name: 'soy sauce', grams: 30, grams_estimated: true },
		{ id: 'c', group: 'Sauce', qty: null, unit: null, name: 'salt', grams: null, grams_estimated: false, optional: true }
	];

	it('inserts headings and restores groups', () => {
		const rows = ingredientsToRows(ingredients);
		expect(rows.map((r) => r.kind)).toEqual(['item', 'heading', 'item', 'item']);
		const { ingredients: back, errors } = rowsToIngredients(rows);
		expect(errors).toEqual([]);
		expect(back).toEqual(ingredients);
	});

	it('drops blank rows, reports invalid numbers and rows without a name', () => {
		const blank = newIngredientRow();
		const bad: IngredientRow = { ...newIngredientRow(), name: 'flour', qty: 'lots' };
		const noName: IngredientRow = { ...newIngredientRow(), qty: '2' };
		const { ingredients: out, errors } = rowsToIngredients([blank, bad, noName]);
		expect(out).toEqual([]);
		expect(errors.map((e) => e.key)).toEqual([bad.key, noName.key]);
	});

	it('clears grams_estimated when grams is empty', () => {
		const row: IngredientRow = { ...newIngredientRow(), name: 'pepper', grams: '', grams_estimated: true };
		expect(rowsToIngredients([row]).ingredients[0]!.grams_estimated).toBe(false);
	});
});

describe('step rows round-trip', () => {
	it('keeps groups and drops empty steps', () => {
		const steps = [
			{ id: '1', text: 'Chop', group: 'Prep' },
			{ id: '2', text: 'Fry' }
		];
		const rows = stepsToRows(steps);
		expect(rows.map((r) => r.kind)).toEqual(['heading', 'item', 'heading', 'item']);
		expect(rowsToSteps([...rows, { kind: 'item', key: 'k', id: '3', text: '  ' }])).toEqual(steps);
	});
});

describe('parseTags', () => {
	it('splits, trims, lowercases and dedupes', () => {
		expect(parseTags(' Dinner, vegan;quick , dinner,')).toEqual(['dinner', 'vegan', 'quick']);
	});
});
