import type { Ingredient, RecipeDraft } from './schema';

/**
 * Scaling is display-only and computed from grams (spec 4.4). Everything here
 * is pure; the UI decides whether a scaled recipe is ever saved.
 */

/** What the recipe view is showing: as written, one of the three scaled modes, or percentages. */
export type ScaleMode = 'off' | 'servings' | 'weight' | 'anchor' | 'percent';

export type ScaleRequest =
	| { mode: 'servings'; target: number }
	| { mode: 'weight'; target: number }
	| { mode: 'anchor'; ingredientId: string; available: number };

function positive(n: number | null | undefined): n is number {
	return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/** `total_g`: sum of grams over non-optional ingredients with a known weight. */
export function totalGrams(ingredients: Ingredient[]): number {
	let total = 0;
	for (const i of ingredients) {
		if (!i.optional && i.grams !== null) total += i.grams;
	}
	return total;
}

/** The multiplier for a request, or null when it cannot be computed (missing servings, zero total, bad input). */
export function scaleFactor(
	recipe: { servings: number | null; ingredients: Ingredient[] },
	req: ScaleRequest
): number | null {
	let factor: number;
	if (req.mode === 'servings') {
		if (!positive(req.target) || !positive(recipe.servings)) return null;
		factor = req.target / recipe.servings;
	} else if (req.mode === 'weight') {
		const total = totalGrams(recipe.ingredients);
		if (!positive(req.target) || !positive(total)) return null;
		factor = req.target / total;
	} else {
		const anchor = recipe.ingredients.find((i) => i.id === req.ingredientId);
		if (!positive(req.available) || !positive(anchor?.grams)) return null;
		factor = req.available / anchor.grams;
	}
	if (!Number.isFinite(factor) || factor <= 0) return null;
	// An amount typed back as shown (e.g. "613.5" for 613.4996 g) is the recipe as written.
	return Math.abs(factor - 1) < 1e-6 ? 1 : factor;
}

/** The next whole number of servings up or down from whatever is shown (2.5 → 3 or 2); null below one serving. */
export function stepServings(servings: number, delta: 1 | -1): number | null {
	const next = delta > 0 ? Math.floor(servings + 1e-9) + 1 : Math.ceil(servings - 1e-9) - 1;
	return next < 1 ? null : next;
}

function roundToStep(value: number, step: number): number {
	return Math.round(Math.round(value / step) * step * 1000) / 1000;
}

/** Keeps one significant digit for amounts too small for the normal step, so they never show as 0. */
function tiny(value: number): number {
	return Number(value.toPrecision(1));
}

/** ≥ 100 g → whole numbers; 10–100 g → 0.5; < 10 g → 0.1. */
export function roundGrams(g: number): number {
	if (g >= 100) return Math.round(g);
	const rounded = roundToStep(g, g >= 10 ? 0.5 : 0.1);
	return rounded === 0 && g > 0 ? tiny(g) : rounded;
}

// Grams per unit for mass units, so qty and grams stay in step after rounding.
const MASS_UNITS: Record<string, number> = { mg: 0.001, g: 1, kg: 1000 };
// Other measured units read better as decimals than as quarters.
const DECIMAL_UNITS = new Set(['ml', 'cl', 'dl', 'l', 'oz', 'lb', 'fl oz']);

/** Piece-like units (piece, clove, tsp, cup, no unit …) go to the nearest ¼; measured units keep decimals. */
export function roundQty(qty: number, unit: string | null): number {
	const u = unit?.trim().toLowerCase() ?? '';
	const perUnit = MASS_UNITS[u];
	if (perUnit !== undefined) return Number((roundGrams(qty * perUnit) / perUnit).toPrecision(6));
	if (u === 'ml') return roundGrams(qty);
	if (DECIMAL_UNITS.has(u)) return Number(qty.toPrecision(3));
	const rounded = roundToStep(qty, 0.25);
	return rounded === 0 && qty > 0 ? tiny(qty) : rounded;
}

export type ScaledIngredient = Ingredient & {
	/** true when there is no weight, so only `qty` could be scaled. */
	qty_only: boolean;
};

/** Scales and rounds both `grams` and `qty`. A factor of exactly 1 returns the amounts as written. */
export function scaleIngredients(ingredients: Ingredient[], factor: number): ScaledIngredient[] {
	return ingredients.map((i) => {
		const qty_only = i.grams === null;
		if (factor === 1) return { ...i, qty_only };
		return {
			...i,
			qty: i.qty === null ? null : roundQty(i.qty * factor, i.unit),
			grams: i.grams === null ? null : roundGrams(i.grams * factor),
			qty_only
		};
	});
}

/** The whole recipe at a new size, for "Save as new version". */
export function scaleDraft(draft: RecipeDraft, factor: number): RecipeDraft {
	return {
		...draft,
		servings: draft.servings === null ? null : Math.round(draft.servings * factor * 100) / 100,
		yield_g: draft.yield_g === null ? null : roundGrams(draft.yield_g * factor),
		ingredients: scaleIngredients(draft.ingredients, factor).map(({ qty_only: _, ...i }) => i)
	};
}

/**
 * "Per 100 g" mode: each ingredient's share of `total_g` in percent (one
 * decimal), keyed by ingredient id. null when the ingredient has no weight or
 * the total is zero. Optional ingredients are shown relative to the same total.
 */
export function percentages(ingredients: Ingredient[]): Map<string, number | null> {
	const total = totalGrams(ingredients);
	const result = new Map<string, number | null>();
	for (const i of ingredients) {
		result.set(i.id, i.grams === null || total <= 0 ? null : Math.round((i.grams / total) * 1000) / 10);
	}
	return result;
}
