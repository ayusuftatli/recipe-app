import { z } from 'zod';
import { Day, Ingredient, Nutrients, Step, Tags } from './schema';

/**
 * The JSON backup (spec 4.9): every recipe, every version, every food, the
 * meal plan and what is kept of the grocery list (manual items, staples and shopping names),
 * with ids and timestamps exactly as stored, so a restore is a faithful copy.
 * Photos are files and are not part of it; ticks on the grocery list belong
 * to a shop in progress and are not either.
 */

export const EXPORT_FORMAT = 'recipe-box-export';
/** 2 added the meal plan and the grocery list. Files of version 1 are still read; they simply have neither. */
export const EXPORT_VERSION = 2;

const Id = z.string().min(1);
const Timestamp = z.string().min(1);

export const ExportedRecipe = z.object({
	id: Id,
	current_version_id: Id,
	tags: Tags,
	photo_path: z.string().nullable(),
	archived: z.boolean(),
	created_at: Timestamp,
	updated_at: Timestamp
});

export const ExportedVersion = z.object({
	id: Id,
	recipe_id: Id,
	version_number: z.number().int().positive(),
	title: z.string().min(1),
	servings: z.number().nullable(),
	yield_g: z.number().nullable(),
	ingredients: z.array(Ingredient),
	steps: z.array(Step),
	notes: z.string().nullable(),
	source_url: z.string().nullable(),
	change_note: z.string().nullable(),
	created_at: Timestamp
});

export const ExportedFood = z.object({
	id: Id,
	name: z.string().min(1),
	source: z.enum(['usda', 'off', 'manual']),
	source_id: z.string().nullable(),
	nutrients: Nutrients,
	created_at: Timestamp
});

export const ExportedPlanEntry = z.object({
	id: Id,
	date: Day,
	recipe_id: Id,
	servings: z.number().nullable(),
	position: z.number().int(),
	shopped: z.boolean(),
	created_at: Timestamp
});

export const ExportedManualItem = z.object({ id: Id, name: z.string().min(1), created_at: Timestamp });

export const ExportedStaple = z.object({ key: Id, name: z.string().min(1), needed: z.boolean(), created_at: Timestamp });

export const ExportedTerm = z.object({
	name_key: Id,
	canonical: z.string().min(1),
	// Not checked against today's sections: an unknown one is shown under Other.
	aisle: z.string().min(1),
	source: z.enum(['llm', 'manual']),
	created_at: Timestamp
});

export const ExportFile = z.object({
	format: z.literal(EXPORT_FORMAT),
	version: z.union([z.literal(1), z.literal(EXPORT_VERSION)]),
	exported_at: Timestamp,
	recipes: z.array(ExportedRecipe),
	versions: z.array(ExportedVersion),
	foods: z.array(ExportedFood),
	plan: z.array(ExportedPlanEntry).default([]),
	grocery_manual: z.array(ExportedManualItem).default([]),
	staples: z.array(ExportedStaple).default([]),
	grocery_terms: z.array(ExportedTerm).default([])
});
export type ExportFile = z.infer<typeof ExportFile>;

/**
 * Checks that the pieces of a backup fit together, beyond each row being
 * well-formed. Returns the problems found (empty when it can be restored).
 */
export function checkExport(data: ExportFile): string[] {
	const problems: string[] = [];
	const duplicates = (what: string, keys: string[]) => {
		const seen = new Set<string>();
		for (const k of keys) {
			if (seen.has(k)) problems.push(`Duplicate ${what}: ${k}`);
			seen.add(k);
		}
	};
	duplicates('recipe id', data.recipes.map((r) => r.id));
	duplicates('version id', data.versions.map((v) => v.id));
	duplicates('food id', data.foods.map((f) => f.id));
	duplicates('plan entry id', data.plan.map((e) => e.id));
	duplicates('grocery item id', data.grocery_manual.map((m) => m.id));
	duplicates('staple', data.staples.map((s) => s.key));
	duplicates('shopping name', data.grocery_terms.map((t) => t.name_key));
	duplicates('version number', data.versions.map((v) => `${v.recipe_id} v${v.version_number}`));
	duplicates('food source id', data.foods.flatMap((f) => (f.source_id === null ? [] : [`${f.source} ${f.source_id}`])));

	const recipeIds = new Set(data.recipes.map((r) => r.id));
	const versionRecipe = new Map(data.versions.map((v) => [v.id, v.recipe_id]));
	for (const v of data.versions) {
		if (!recipeIds.has(v.recipe_id)) problems.push(`Version ${v.id} belongs to a recipe that is not in the file`);
	}
	for (const r of data.recipes) {
		const owner = versionRecipe.get(r.current_version_id);
		if (owner === undefined) problems.push(`Recipe ${r.id} points at a current version that is not in the file`);
		else if (owner !== r.id) problems.push(`Recipe ${r.id} points at a version of another recipe`);
	}
	for (const e of data.plan) {
		if (!recipeIds.has(e.recipe_id)) problems.push(`Plan entry ${e.id} is for a recipe that is not in the file`);
	}
	return problems.slice(0, 20);
}
