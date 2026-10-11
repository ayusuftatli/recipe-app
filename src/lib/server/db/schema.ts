import { sqliteTable, text, integer, real, unique, index } from 'drizzle-orm/sqlite-core';

export const recipes = sqliteTable('recipes', {
	id: text('id').primaryKey(),
	// Points at recipe_versions.id. Not a declared FK: the two tables reference
	// each other, and the pair is always written inside one transaction.
	currentVersionId: text('current_version_id').notNull(),
	tags: text('tags').notNull().default('[]'),
	photoPath: text('photo_path'),
	archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
	createdAt: text('created_at').notNull(),
	updatedAt: text('updated_at').notNull()
});

/** IMMUTABLE: insert only. */
export const recipeVersions = sqliteTable(
	'recipe_versions',
	{
		id: text('id').primaryKey(),
		recipeId: text('recipe_id')
			.notNull()
			// Cascade only fires on a hard delete of the whole recipe (settings screen).
			.references(() => recipes.id, { onDelete: 'cascade' }),
		versionNumber: integer('version_number').notNull(),
		title: text('title').notNull(),
		servings: real('servings'),
		yieldG: real('yield_g'),
		ingredients: text('ingredients').notNull(),
		steps: text('steps').notNull(),
		notes: text('notes'),
		sourceUrl: text('source_url'),
		changeNote: text('change_note'),
		createdAt: text('created_at').notNull()
	},
	(t) => [unique().on(t.recipeId, t.versionNumber), index('recipe_versions_recipe_idx').on(t.recipeId)]
);

export const foods = sqliteTable(
	'foods',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		source: text('source', { enum: ['usda', 'off', 'manual'] }).notNull(),
		sourceId: text('source_id'),
		nutrientsPer100g: text('nutrients_per_100g').notNull(),
		createdAt: text('created_at').notNull()
	},
	(t) => [unique().on(t.source, t.sourceId)]
);
