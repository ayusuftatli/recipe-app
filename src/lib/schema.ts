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
	/** -> foods.id. Absent: not matched yet. null: the user chose "no match", so it is not matched automatically. */
	food_id: z.string().nullable().optional()
});
export type Ingredient = z.infer<typeof Ingredient>;

export const Step = z.object({
	id: z.string().min(1),
	text: z.string().min(1),
	group: z.string().optional()
});
export type Step = z.infer<typeof Step>;

const Amount = z.number().finite().nonnegative();

export const Nutrients = z.object({
	kcal: Amount,
	protein_g: Amount,
	fat_g: Amount,
	sat_fat_g: Amount.optional(),
	carbs_g: Amount,
	sugar_g: Amount.optional(),
	fiber_g: Amount.optional(),
	salt_g: Amount.optional()
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

/**
 * What the assistant returns for each chat message: a short reply for the chat
 * and the full recipe draft (null when the message contained no recipe).
 */
export const AssistantReply = z.object({
	reply: z.string(),
	draft: RecipeDraft.nullable()
});
export type AssistantReply = z.infer<typeof AssistantReply>;

const FoodName = z.string().trim().min(1).max(200);

/**
 * Body of PUT /api/recipes/[id]/nutrition: the user's own choice of food for
 * one ingredient. A database entry, values typed in by hand, or null for none.
 */
export const SetFoodRequest = z.object({
	ingredient_id: z.string().min(1),
	food: z
		.discriminatedUnion('source', [
			z.object({ source: z.enum(['usda', 'off']), source_id: z.string().min(1).max(100), name: FoodName, nutrients: Nutrients }),
			z.object({ source: z.literal('manual'), name: FoodName, nutrients: Nutrients })
		])
		.nullable()
});
export type SetFoodRequest = z.infer<typeof SetFoodRequest>;
