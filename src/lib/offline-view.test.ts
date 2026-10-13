import { describe, expect, it } from 'vitest';
import { filterRecipes, offlineHref, tagsOf } from './offline-view';
import type { RecipeDetail } from './types';

function recipe(id: string, title: string, ingredients: string[], tags: string[] = []): RecipeDetail {
	return {
		id,
		tags,
		photo_path: null,
		archived: false,
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-01T00:00:00.000Z',
		current: {
			id: `${id}-v1`,
			recipe_id: id,
			version_number: 1,
			title,
			servings: null,
			yield_g: null,
			ingredients: ingredients.map((name, n) => ({ id: `${id}-${n}`, qty: 1, unit: null, name, grams: null, grams_estimated: false })),
			steps: [],
			notes: null,
			source_url: null,
			change_note: null,
			created_at: '2026-01-01T00:00:00.000Z'
		}
	};
}

const all = [
	recipe('a', 'Hummus', ['chickpeas', 'Tahini'], ['dip', 'vegan']),
	recipe('b', 'Lemon Rice', ['basmati rice', 'lemon'], ['side']),
	recipe('c', 'Pancakes', ['flour', 'egg'])
];
const ids = (list: RecipeDetail[]) => list.map((r) => r.id);

describe('filterRecipes', () => {
	it('returns everything for an empty query and no tag', () => {
		expect(ids(filterRecipes(all, '  ', ''))).toEqual(['a', 'b', 'c']);
	});
	it('matches title and ingredient names, ignoring case', () => {
		expect(ids(filterRecipes(all, 'hUM', ''))).toEqual(['a']);
		expect(ids(filterRecipes(all, 'tahini', ''))).toEqual(['a']);
		expect(ids(filterRecipes(all, 'lemon', ''))).toEqual(['b']);
		expect(ids(filterRecipes(all, 'zzz', ''))).toEqual([]);
	});
	it('filters by exact tag, combined with the query', () => {
		expect(ids(filterRecipes(all, '', 'vegan'))).toEqual(['a']);
		expect(ids(filterRecipes(all, '', 'veg'))).toEqual([]);
		expect(ids(filterRecipes(all, 'rice', 'dip'))).toEqual([]);
		expect(ids(filterRecipes(all, 'rice', 'side'))).toEqual(['b']);
	});
});

describe('tagsOf', () => {
	it('lists each tag once, sorted', () => {
		expect(tagsOf(all)).toEqual(['dip', 'side', 'vegan']);
		expect(tagsOf([])).toEqual([]);
	});
});

describe('offlineHref', () => {
	it('keeps the recipe for recipe pages', () => {
		expect(offlineHref('/recipes/abc-123')).toBe('/offline#abc-123');
		expect(offlineHref('/recipes/abc-123/history')).toBe('/offline#abc-123');
	});
	it('sends everything else to the list', () => {
		for (const p of ['/', '/settings', '/recipes/new', '/recipes']) expect(offlineHref(p)).toBe('/offline');
	});
});
