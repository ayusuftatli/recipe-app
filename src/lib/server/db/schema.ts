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

/** The meal plan: one recipe on one calendar day. Refers to the recipe, so it always shows the current version. */
export const planEntries = sqliteTable(
	'plan_entries',
	{
		id: text('id').primaryKey(),
		/** 'YYYY-MM-DD', as the user's calendar has it. */
		date: text('date').notNull(),
		recipeId: text('recipe_id')
			.notNull()
			.references(() => recipes.id, { onDelete: 'cascade' }),
		/** null: the recipe as written. */
		servings: real('servings'),
		position: integer('position').notNull(),
		shopped: integer('shopped', { mode: 'boolean' }).notNull().default(false),
		createdAt: text('created_at').notNull()
	},
	(t) => [index('plan_entries_date_idx').on(t.date)]
);

// ---- Grocery list (spec 4.11). The list is computed from the plan; these hold only what cannot be derived. ----

/** Items typed in by hand. */
export const groceryManual = sqliteTable('grocery_manual', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	createdAt: text('created_at').notNull()
});

/** Ticks. `key` is an item key or `manual:<id>`; `sig` is the amount the tick was made for. */
export const groceryChecks = sqliteTable('grocery_checks', {
	key: text('key').primaryKey(),
	sig: text('sig').notNull(),
	// Unticking keeps the row, so the later of two changes can win when they arrive out of order.
	checked: integer('checked', { mode: 'boolean' }).notNull(),
	checkedAt: text('checked_at').notNull()
});

/** Things that are always in the house, left off the list unless `needed` for this shop. */
export const pantryStaples = sqliteTable('pantry_staples', {
	key: text('key').primaryKey(),
	name: text('name').notNull(),
	needed: integer('needed', { mode: 'boolean' }).notNull().default(false),
	createdAt: text('created_at').notNull()
});

/**
 * The name an ingredient goes by on the grocery list and its shop section,
 * per normalised ingredient name. Suggested by the LLM; a 'manual' row is the
 * user's own choice and is never overwritten.
 */
export const groceryTerms = sqliteTable('grocery_terms', {
	nameKey: text('name_key').primaryKey(),
	canonical: text('canonical').notNull(),
	aisle: text('aisle').notNull(),
	source: text('source', { enum: ['llm', 'manual'] }).notNull(),
	createdAt: text('created_at').notNull()
});
