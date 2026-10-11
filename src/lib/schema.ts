import { z } from 'zod';

/** Single source of truth for recipe shapes (API, UI and, later, LLM output). */

export const Ingredient = z.object({
	id: z.string().min(1),
	group: z.string().optional(),
	qty: z.number().finite().nullable(),
	unit: z.string().nullable(),
	name: z.string().min(1),
	note: z.string().optional(),
	grams: z.number().finite().nonnegative().nullable(),
	grams_estimated: z.boolean(),
	optional: z.boolean().optional(),
	food_id: z.string().nullable().optional()
});
export type Ingredient = z.infer<typeof Ingredient>;

export const Step = z.object({
	id: z.string().min(1),
	text: z.string().min(1),
	group: z.string().optional()
});
export type Step = z.infer<typeof Step>;

export const Nutrients = z.object({
	kcal: z.number(),
	protein_g: z.number(),
	fat_g: z.number(),
	sat_fat_g: z.number().optional(),
	carbs_g: z.number(),
	sugar_g: z.number().optional(),
	fiber_g: z.number().optional(),
	salt_g: z.number().optional()
});
export type Nutrients = z.infer<typeof Nutrients>;

export const RecipeDraft = z.object({
	title: z.string().trim().min(1),
	servings: z.number().positive().nullable(),
	yield_g: z.number().positive().nullable(),
	ingredients: z.array(Ingredient),
	steps: z.array(Step),
	notes: z.string().optional(),
	source_url: z.string().optional()
});
export type RecipeDraft = z.infer<typeof RecipeDraft>;

export const Tags = z.array(z.string().trim().min(1).max(40)).max(30);

/** Body of POST /api/recipes and PUT /api/recipes/[id]. */
export const SaveRecipeRequest = z.object({
	draft: RecipeDraft,
	tags: Tags,
	change_note: z.string().trim().max(500).optional()
});
export type SaveRecipeRequest = z.infer<typeof SaveRecipeRequest>;

/** Body of PATCH /api/recipes/[id] — non-versioned metadata only. */
export const PatchRecipeRequest = z.object({
	tags: Tags.optional(),
	archived: z.boolean().optional()
});
