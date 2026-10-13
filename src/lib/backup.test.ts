import { describe, expect, it } from 'vitest';
import { checkExport, ExportFile } from './backup';

function file(): ExportFile {
	const at = '2026-01-01T00:00:00.000Z';
	const version = (id: string, recipe_id: string, version_number: number) => ({
		id,
		recipe_id,
		version_number,
		title: 'Soup',
		servings: 2,
		yield_g: null,
		ingredients: [{ id: 'i1', qty: 1, unit: 'piece', name: 'onion', grams: 150, grams_estimated: true, food_id: 'f1' }],
		steps: [{ id: 's1', text: 'Cook.' }],
		notes: null,
		source_url: null,
		change_note: null,
		created_at: at
	});
	return {
		format: 'recipe-box-export',
		version: 1,
		exported_at: at,
		recipes: [
			{ id: 'r1', current_version_id: 'v2', tags: ['soup'], photo_path: null, archived: false, created_at: at, updated_at: at },
			{ id: 'r2', current_version_id: 'v3', tags: [], photo_path: 'abc', archived: true, created_at: at, updated_at: at }
		],
		versions: [version('v1', 'r1', 1), version('v2', 'r1', 2), version('v3', 'r2', 1)],
		foods: [
			{ id: 'f1', name: 'Onions, raw', source: 'usda', source_id: '170000', nutrients: { kcal: 40, protein_g: 1.1, fat_g: 0.1, carbs_g: 9.3 }, created_at: at },
			{ id: 'f2', name: 'Label', source: 'manual', source_id: null, nutrients: { kcal: 1, protein_g: 0, fat_g: 0, carbs_g: 0 }, created_at: at },
			{ id: 'f3', name: 'Label 2', source: 'manual', source_id: null, nutrients: { kcal: 1, protein_g: 0, fat_g: 0, carbs_g: 0 }, created_at: at }
		]
	};
}

describe('ExportFile', () => {
	it('accepts a well-formed backup', () => {
		expect(ExportFile.safeParse(file()).success).toBe(true);
		expect(ExportFile.safeParse(JSON.parse(JSON.stringify(file()))).success).toBe(true);
	});
	it('rejects other files and broken rows', () => {
		expect(ExportFile.safeParse({}).success).toBe(false);
		expect(ExportFile.safeParse({ ...file(), format: 'something-else' }).success).toBe(false);
		expect(ExportFile.safeParse({ ...file(), version: 2 }).success).toBe(false);
		const bad = file();
		(bad.versions[0]!.ingredients[0] as { name: unknown }).name = 5;
		expect(ExportFile.safeParse(bad).success).toBe(false);
	});
});

describe('checkExport', () => {
	it('finds nothing wrong with a consistent backup', () => {
		expect(checkExport(file())).toEqual([]);
		expect(checkExport({ ...file(), recipes: [], versions: [], foods: [] })).toEqual([]);
	});
	it('reports a recipe whose current version is missing or belongs to another recipe', () => {
		const missing = file();
		missing.recipes[0]!.current_version_id = 'nope';
		expect(checkExport(missing)).toEqual(['Recipe r1 points at a current version that is not in the file']);
		const wrong = file();
		wrong.recipes[0]!.current_version_id = 'v3';
		expect(checkExport(wrong)).toEqual(['Recipe r1 points at a version of another recipe']);
	});
	it('reports versions without their recipe', () => {
		const f = file();
		f.recipes.pop();
		expect(checkExport(f)).toEqual(['Version v3 belongs to a recipe that is not in the file']);
	});
	it('reports duplicate ids, version numbers and food sources', () => {
		const f = file();
		f.versions[1]!.version_number = 1;
		f.foods.push({ ...f.foods[0]!, id: 'f9' });
		f.recipes.push({ ...f.recipes[1]! });
		expect(checkExport(f)).toEqual(['Duplicate recipe id: r2', 'Duplicate version number: r1 v1', 'Duplicate food source id: usda 170000']);
	});
});
