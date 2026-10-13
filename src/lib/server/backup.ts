import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { EXPORT_FORMAT, EXPORT_VERSION, type ExportFile } from '$lib/backup';
import { Ingredient, Nutrients, Step, Tags } from '$lib/schema';
import { uuid } from '$lib/uuid';
import { db } from './db';
import { foods, recipes, recipeVersions } from './db/schema';
import { photoExists } from './photos';

export function exportAll(): ExportFile {
	return {
		format: EXPORT_FORMAT,
		version: EXPORT_VERSION,
		exported_at: new Date().toISOString(),
		recipes: db
			.select()
			.from(recipes)
			.all()
			.map((r) => ({
				id: r.id,
				current_version_id: r.currentVersionId,
				tags: Tags.parse(JSON.parse(r.tags)),
				photo_path: r.photoPath,
				archived: r.archived,
				created_at: r.createdAt,
				updated_at: r.updatedAt
			})),
		versions: db
			.select()
			.from(recipeVersions)
			.all()
			.map((v) => ({
				id: v.id,
				recipe_id: v.recipeId,
				version_number: v.versionNumber,
				title: v.title,
				servings: v.servings,
				yield_g: v.yieldG,
				ingredients: Ingredient.array().parse(JSON.parse(v.ingredients)),
				steps: Step.array().parse(JSON.parse(v.steps)),
				notes: v.notes,
				source_url: v.sourceUrl,
				change_note: v.changeNote,
				created_at: v.createdAt
			})),
		foods: db
			.select()
			.from(foods)
			.all()
			.map((f) => ({
				id: f.id,
				name: f.name,
				source: f.source,
				source_id: f.sourceId,
				nutrients: Nutrients.parse(JSON.parse(f.nutrientsPer100g)),
				created_at: f.createdAt
			}))
	};
}

export function isEmpty(): boolean {
	const row = db.get<{ n: number }>(sql`SELECT (SELECT count(*) FROM recipes) + (SELECT count(*) FROM foods) AS n`);
	return (row?.n ?? 0) === 0;
}

export interface ImportResult {
	recipes: number;
	versions: number;
	foods: number;
	/** Recipes whose photo file is not on this server; they are restored without a photo. */
	photos_missing: number;
}

/**
 * Restores a checked backup as-is, in one transaction. With `replace`, what is
 * in the database goes first: recipes are removed whole (their versions with
 * them, as on a hard delete); version rows are never edited.
 */
export function importAll(data: ExportFile, replace: boolean): ImportResult {
	let photosMissing = 0;
	db.transaction((tx) => {
		if (replace) {
			tx.delete(recipes).run();
			tx.delete(foods).run();
		}
		for (const f of data.foods) {
			tx.insert(foods)
				.values({ id: f.id, name: f.name, source: f.source, sourceId: f.source_id, nutrientsPer100g: JSON.stringify(f.nutrients), createdAt: f.created_at })
				.run();
		}
		for (const r of data.recipes) {
			const hasPhoto = r.photo_path !== null && photoExists(r.photo_path);
			if (r.photo_path !== null && !hasPhoto) photosMissing++;
			tx.insert(recipes)
				.values({
					id: r.id,
					currentVersionId: r.current_version_id,
					tags: JSON.stringify(r.tags),
					photoPath: hasPhoto ? r.photo_path : null,
					archived: r.archived,
					createdAt: r.created_at,
					updatedAt: r.updated_at
				})
				.run();
		}
		for (const v of data.versions) {
			tx.insert(recipeVersions)
				.values({
					id: v.id,
					recipeId: v.recipe_id,
					versionNumber: v.version_number,
					title: v.title,
					servings: v.servings,
					yieldG: v.yield_g,
					ingredients: JSON.stringify(v.ingredients),
					steps: JSON.stringify(v.steps),
					notes: v.notes,
					sourceUrl: v.source_url,
					changeNote: v.change_note,
					createdAt: v.created_at
				})
				.run();
		}
	});
	return { recipes: data.recipes.length, versions: data.versions.length, foods: data.foods.length, photos_missing: photosMissing };
}

/** A consistent copy of the whole SQLite file, made with VACUUM INTO a temp file. */
export async function snapshotDb(): Promise<Buffer> {
	const path = join(tmpdir(), `recipe-box-${uuid()}.db`);
	try {
		db.run(sql`VACUUM INTO ${path}`);
		return await readFile(path);
	} finally {
		await rm(path, { force: true });
	}
}
