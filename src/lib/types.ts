import type { Ingredient, Nutrients, RecipeDraft, Step } from './schema';

export interface RecipeVersion {
	id: string;
	recipe_id: string;
	version_number: number;
	title: string;
	servings: number | null;
	yield_g: number | null;
	ingredients: Ingredient[];
	steps: Step[];
	notes: string | null;
	source_url: string | null;
	change_note: string | null;
	created_at: string;
}

export type VersionMeta = Pick<RecipeVersion, 'id' | 'version_number' | 'title' | 'change_note' | 'created_at'>;

export interface RecipeSummary {
	id: string;
	title: string;
	tags: string[];
	photo_path: string | null;
	archived: boolean;
	version_number: number;
	updated_at: string;
}

export interface RecipeDetail {
	id: string;
	tags: string[];
	photo_path: string | null;
	archived: boolean;
	created_at: string;
	updated_at: string;
	current: RecipeVersion;
}

/** The editable content of a version, in a fixed key order (used for "did anything change?"). */
export function versionToDraft(v: RecipeVersion): RecipeDraft {
	return normalizeDraft({
		title: v.title,
		servings: v.servings,
		yield_g: v.yield_g,
		ingredients: v.ingredients,
		steps: v.steps,
		notes: v.notes ?? undefined,
		source_url: v.source_url ?? undefined
	});
}

function clean(s: string | undefined): string | undefined {
	const t = s?.trim();
	return t ? t : undefined;
}

export function normalizeDraft(d: RecipeDraft): RecipeDraft {
	return {
		title: d.title.trim(),
		servings: d.servings,
		yield_g: d.yield_g,
		ingredients: d.ingredients.map((i) => ({
			id: i.id,
			group: clean(i.group),
			qty: i.qty,
			unit: clean(i.unit ?? undefined)?.toLowerCase() ?? null,
			name: i.name.trim(),
			note: clean(i.note),
			grams: i.grams,
			grams_estimated: i.grams_estimated,
			optional: i.optional || undefined,
			food_id: i.food_id
		})),
		steps: d.steps.map((s) => ({ id: s.id, text: s.text.trim(), group: clean(s.group) })),
		notes: clean(d.notes),
		source_url: clean(d.source_url)
	};
}

export function sameContent(a: RecipeDraft, b: RecipeDraft): boolean {
	return JSON.stringify(normalizeDraft(a)) === JSON.stringify(normalizeDraft(b));
}

/** Response of POST /api/assistant. */
export type AssistantResponse =
	| {
			ok: true;
			reply: string;
			draft: RecipeDraft | null;
			summary: string | null;
			/** data: URL of the picture found on an imported page (new recipes only). */
			photo?: string;
	  }
	| { ok: false; error: string; raw?: string };

/** A row of the `foods` table: values per 100 g from a food database or typed in by hand. */
export interface Food {
	id: string;
	name: string;
	source: 'usda' | 'off' | 'manual';
	source_id: string | null;
	nutrients: Nutrients;
}

/** Response of GET and POST /api/recipes/[id]/nutrition: is background matching running for this recipe? */
export interface MatchStatus {
	running: boolean;
}
