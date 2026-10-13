import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from './db';
import { recipes, recipeVersions } from './db/schema';
import { dropStaleFoodIds } from '$lib/food-sources';
import { Ingredient, Step, Tags, type RecipeDraft } from '$lib/schema';
import type { RecipeDetail, RecipeSummary, RecipeVersion, VersionMeta } from '$lib/types';
import { normalizeDraft, sameContent, versionToDraft } from '$lib/types';
import { uuid } from '$lib/uuid';

// NOTE: recipe_versions is insert-only. Nothing in this module (or anywhere
// else) may UPDATE or DELETE its rows; a DB trigger also rejects updates.

type VersionRow = typeof recipeVersions.$inferSelect;
type RecipeRow = typeof recipes.$inferSelect;

function parseJson<T>(text: string, schema: { parse: (v: unknown) => T }): T {
	return schema.parse(JSON.parse(text));
}

function toVersion(r: VersionRow): RecipeVersion {
	return {
		id: r.id,
		recipe_id: r.recipeId,
		version_number: r.versionNumber,
		title: r.title,
		servings: r.servings,
		yield_g: r.yieldG,
		ingredients: parseJson(r.ingredients, Ingredient.array()),
		steps: parseJson(r.steps, Step.array()),
		notes: r.notes,
		source_url: r.sourceUrl,
		change_note: r.changeNote,
		created_at: r.createdAt
	};
}

function parseTags(text: string): string[] {
	return parseJson(text, Tags);
}

function uniqueTags(tags: string[]): string[] {
	return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].sort();
}

export interface ListOptions {
	q?: string;
	tag?: string;
	archived?: boolean;
}

export function listRecipes({ q, tag, archived = false }: ListOptions = {}): RecipeSummary[] {
	const where: SQL[] = [eq(recipes.archived, archived)];
	const query = q?.trim();
	if (query) {
		const like = `%${query.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
		where.push(sql`(
			${recipeVersions.title} LIKE ${like} ESCAPE '\\'
			OR EXISTS (
				SELECT 1 FROM json_each(${recipeVersions.ingredients}) AS i
				WHERE json_extract(i.value, '$.name') LIKE ${like} ESCAPE '\\'
			)
		)`);
	}
	if (tag) {
		where.push(sql`EXISTS (SELECT 1 FROM json_each(${recipes.tags}) AS t WHERE t.value = ${tag})`);
	}

	return db
		.select({
			id: recipes.id,
			title: recipeVersions.title,
			tags: recipes.tags,
			photo_path: recipes.photoPath,
			archived: recipes.archived,
			version_number: recipeVersions.versionNumber,
			updated_at: recipes.updatedAt
		})
		.from(recipes)
		.innerJoin(recipeVersions, eq(recipeVersions.id, recipes.currentVersionId))
		.where(and(...where))
		.orderBy(desc(recipes.updatedAt))
		.all()
		.map((r) => ({ ...r, tags: parseTags(r.tags) }));
}

export function allTags(): string[] {
	const rows = db.all<{ value: string }>(
		sql`SELECT DISTINCT t.value AS value FROM recipes, json_each(recipes.tags) AS t
			WHERE recipes.archived = 0 ORDER BY t.value`
	);
	return rows.map((r) => r.value);
}

function toDetail(row: { recipe: RecipeRow; version: VersionRow }): RecipeDetail {
	return {
		id: row.recipe.id,
		tags: parseTags(row.recipe.tags),
		photo_path: row.recipe.photoPath,
		archived: row.recipe.archived,
		created_at: row.recipe.createdAt,
		updated_at: row.recipe.updatedAt,
		current: toVersion(row.version)
	};
}

function getRecipeRow(id: string): RecipeRow | undefined {
	return db.select().from(recipes).where(eq(recipes.id, id)).get();
}

export function getRecipe(id: string): RecipeDetail | null {
	const row = db
		.select({ recipe: recipes, version: recipeVersions })
		.from(recipes)
		.innerJoin(recipeVersions, eq(recipeVersions.id, recipes.currentVersionId))
		.where(eq(recipes.id, id))
		.get();
	return row ? toDetail(row) : null;
}

/** Every non-archived recipe with its current version (the offline copy). */
export function listCurrentRecipes(): RecipeDetail[] {
	return db
		.select({ recipe: recipes, version: recipeVersions })
		.from(recipes)
		.innerJoin(recipeVersions, eq(recipeVersions.id, recipes.currentVersionId))
		.where(eq(recipes.archived, false))
		.orderBy(desc(recipes.updatedAt))
		.all()
		.map(toDetail);
}

export function listVersions(recipeId: string): VersionMeta[] {
	return db
		.select({
			id: recipeVersions.id,
			version_number: recipeVersions.versionNumber,
			title: recipeVersions.title,
			change_note: recipeVersions.changeNote,
			created_at: recipeVersions.createdAt
		})
		.from(recipeVersions)
		.where(eq(recipeVersions.recipeId, recipeId))
		.orderBy(desc(recipeVersions.versionNumber))
		.all();
}

export function getVersion(recipeId: string, versionNumber: number): RecipeVersion | null {
	const row = db
		.select()
		.from(recipeVersions)
		.where(and(eq(recipeVersions.recipeId, recipeId), eq(recipeVersions.versionNumber, versionNumber)))
		.get();
	return row ? toVersion(row) : null;
}

function versionValues(recipeId: string, versionNumber: number, draft: RecipeDraft, changeNote: string | undefined, now: string) {
	const d = normalizeDraft(draft);
	return {
		id: uuid(),
		recipeId,
		versionNumber,
		title: d.title,
		servings: d.servings,
		yieldG: d.yield_g,
		ingredients: JSON.stringify(d.ingredients),
		steps: JSON.stringify(d.steps),
		notes: d.notes ?? null,
		sourceUrl: d.source_url ?? null,
		changeNote: changeNote?.trim() || null,
		createdAt: now
	};
}

/** Creates a recipe and its version 1. */
export function createRecipe(draft: RecipeDraft, tags: string[], changeNote?: string): string {
	const now = new Date().toISOString();
	const recipeId = uuid();
	const version = versionValues(recipeId, 1, draft, changeNote, now);
	db.transaction((tx) => {
		tx.insert(recipes)
			.values({
				id: recipeId,
				currentVersionId: version.id,
				tags: JSON.stringify(uniqueTags(tags)),
				createdAt: now,
				updatedAt: now
			})
			.run();
		tx.insert(recipeVersions).values(version).run();
	});
	return recipeId;
}

export interface SaveResult {
	version_number: number;
	/** false when the content was identical to the current version (only tags changed, if anything). */
	created: boolean;
}

/** Inserts a new version (if the content changed) and updates the tags. */
export function saveRecipe(recipeId: string, draft: RecipeDraft, tags: string[], changeNote?: string): SaveResult | null {
	return db.transaction((tx) => {
		const current = tx
			.select({ version: recipeVersions })
			.from(recipes)
			.innerJoin(recipeVersions, eq(recipeVersions.id, recipes.currentVersionId))
			.where(eq(recipes.id, recipeId))
			.get();
		if (!current) return null;

		const now = new Date().toISOString();
		const currentVersion = toVersion(current.version);
		const newTags = JSON.stringify(uniqueTags(tags));
		draft = { ...draft, ingredients: dropStaleFoodIds(currentVersion.ingredients, draft.ingredients) };

		if (sameContent(versionToDraft(currentVersion), draft)) {
			tx.update(recipes).set({ tags: newTags, updatedAt: now }).where(eq(recipes.id, recipeId)).run();
			return { version_number: currentVersion.version_number, created: false };
		}

		const next = latestVersionNumber(tx, recipeId) + 1;
		const version = versionValues(recipeId, next, draft, changeNote, now);
		tx.insert(recipeVersions).values(version).run();
		tx.update(recipes)
			.set({ currentVersionId: version.id, tags: newTags, updatedAt: now })
			.where(eq(recipes.id, recipeId))
			.run();
		return { version_number: next, created: true };
	});
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function latestVersionNumber(tx: Tx, recipeId: string): number {
	const row = tx
		.select({ max: sql<number>`max(${recipeVersions.versionNumber})` })
		.from(recipeVersions)
		.where(eq(recipeVersions.recipeId, recipeId))
		.get();
	return row?.max ?? 0;
}

/** Restoring = inserting a new version that copies the old one's content. */
export function restoreVersion(recipeId: string, versionNumber: number): number | null {
	return db.transaction((tx) => {
		const recipe = tx.select().from(recipes).where(eq(recipes.id, recipeId)).get();
		const old = tx
			.select()
			.from(recipeVersions)
			.where(and(eq(recipeVersions.recipeId, recipeId), eq(recipeVersions.versionNumber, versionNumber)))
			.get();
		if (!recipe || !old) return null;

		const now = new Date().toISOString();
		const next = latestVersionNumber(tx, recipeId) + 1;
		const version = versionValues(recipeId, next, versionToDraft(toVersion(old)), `Restored from v${versionNumber}`, now);
		tx.insert(recipeVersions).values(version).run();
		tx.update(recipes).set({ currentVersionId: version.id, updatedAt: now }).where(eq(recipes.id, recipeId)).run();
		return next;
	});
}

export function patchRecipe(recipeId: string, patch: { tags?: string[]; archived?: boolean }): boolean {
	const set: Partial<typeof recipes.$inferInsert> = { updatedAt: new Date().toISOString() };
	if (patch.tags) set.tags = JSON.stringify(uniqueTags(patch.tags));
	if (patch.archived !== undefined) set.archived = patch.archived;
	return db.update(recipes).set(set).where(eq(recipes.id, recipeId)).run().changes > 0;
}

/** Sets the photo and returns the previous photo path (so its files can be removed). */
export function setPhoto(recipeId: string, photoPath: string | null): { previous: string | null } | null {
	const row = getRecipeRow(recipeId);
	if (!row) return null;
	db.update(recipes)
		.set({ photoPath, updatedAt: new Date().toISOString() })
		.where(eq(recipes.id, recipeId))
		.run();
	return { previous: row.photoPath };
}

/**
 * Permanent delete, settings screen only. Removes the recipe row; its versions
 * go with it through the FK's ON DELETE CASCADE — history is never edited,
 * only dropped together with the recipe it belongs to.
 */
export function hardDeleteRecipe(recipeId: string): { photo_path: string | null } | null {
	const row = getRecipeRow(recipeId);
	if (!row) return null;
	db.delete(recipes).where(eq(recipes.id, recipeId)).run();
	return { photo_path: row.photoPath };
}
