import { describe, expect, it } from 'vitest';
import { diffIngredients, diffLines, diffVersions, stepsToLines, type VersionContent } from './diff';
import type { Ingredient } from './schema';

function ing(id: string, over: Partial<Ingredient> = {}): Ingredient {
	return { id, qty: 1, unit: 'g', name: id, grams: 1, grams_estimated: false, ...over };
}

describe('diffIngredients', () => {
	it('matches by id and reports added, removed and changed fields', () => {
		const a = [ing('onion', { qty: 1, unit: 'piece', grams: 150 }), ing('garlic', { grams: 10 }), ing('salt')];
		const b = [
			ing('onion', { qty: 2, unit: 'piece', grams: 300 }),
			ing('garlic', { grams: 20, name: 'garlic cloves' }),
			ing('chili')
		];
		const d = diffIngredients(a, b);
		expect(d.added.map((i) => i.id)).toEqual(['chili']);
		expect(d.removed.map((i) => i.id)).toEqual(['salt']);
		expect(d.changed).toHaveLength(2);
		expect(d.changed[0]!.fields).toEqual(['qty', 'grams']);
		expect(d.changed[1]!.fields).toEqual(['name', 'grams']);
		expect(d.unchanged).toBe(0);
	});

	it('treats undefined, empty and false optional fields as equal', () => {
		const a = [ing('x', { note: undefined, optional: undefined })];
		const b = [ing('x', { note: '', optional: false })];
		expect(diffIngredients(a, b)).toEqual({ added: [], removed: [], changed: [], unchanged: 1 });
	});

	it('detects a rename even when the position changes', () => {
		const d = diffIngredients([ing('a'), ing('b')], [ing('b'), ing('a', { name: 'A' })]);
		expect(d.changed.map((c) => c.after.id)).toEqual(['a']);
		expect(d.unchanged).toBe(1);
	});
});

describe('diffLines', () => {
	it('returns only "same" ops for identical input', () => {
		expect(diffLines(['a', 'b'], ['a', 'b'])).toEqual([
			{ op: 'same', text: 'a' },
			{ op: 'same', text: 'b' }
		]);
	});

	it('finds insertions, deletions and replacements', () => {
		const ops = diffLines(['mix', 'bake 20 min', 'serve'], ['mix', 'rest 5 min', 'bake 25 min', 'serve']);
		expect(ops).toEqual([
			{ op: 'same', text: 'mix' },
			{ op: 'del', text: 'bake 20 min' },
			{ op: 'add', text: 'rest 5 min' },
			{ op: 'add', text: 'bake 25 min' },
			{ op: 'same', text: 'serve' }
		]);
	});

	it('handles empty sides', () => {
		expect(diffLines([], ['x'])).toEqual([{ op: 'add', text: 'x' }]);
		expect(diffLines(['x'], [])).toEqual([{ op: 'del', text: 'x' }]);
		expect(diffLines([], [])).toEqual([]);
	});
});

describe('stepsToLines', () => {
	it('emits group headings when the group changes', () => {
		expect(
			stepsToLines([
				{ id: '1', text: 'Whisk', group: 'Sauce' },
				{ id: '2', text: 'Season', group: 'Sauce' },
				{ id: '3', text: 'Serve' }
			])
		).toEqual(['## Sauce', 'Whisk', 'Season', 'Serve']);
	});
});

describe('diffVersions', () => {
	it('reports scalar field changes and notes diff', () => {
		const base: VersionContent = {
			title: 'Soup',
			servings: 2,
			yield_g: null,
			source_url: null,
			ingredients: [],
			steps: [],
			notes: 'Good\nFreeze'
		};
		const d = diffVersions(base, { ...base, title: 'Tomato soup', servings: 4, notes: 'Good' });
		expect(d.fields).toEqual([
			{ field: 'title', before: 'Soup', after: 'Tomato soup' },
			{ field: 'servings', before: 2, after: 4 }
		]);
		expect(d.notes).toEqual([
			{ op: 'same', text: 'Good' },
			{ op: 'del', text: 'Freeze' }
		]);
	});
});
