import type { Ingredient, RecipeDraft, Step } from './schema';
import { uuid } from './uuid';

/**
 * The form edits flat lists where section headings are rows of their own;
 * on save each item takes the group of the heading above it.
 */

export type HeadingRow = { kind: 'heading'; key: string; text: string };

export type IngredientRow = {
	kind: 'item';
	key: string;
	id: string;
	qty: string;
	unit: string;
	name: string;
	note: string;
	grams: string;
	grams_estimated: boolean;
	optional: boolean;
	food_id: string | null;
};

export type StepRow = { kind: 'item'; key: string; id: string; text: string };

export type IngredientEditorRow = HeadingRow | IngredientRow;
export type StepEditorRow = HeadingRow | StepRow;

const UNICODE_FRACTIONS: Record<string, string> = { '¼': '1/4', '½': '1/2', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8' };

/** Parses "2", "1,5", "1/2", "1 1/2", "1½". Returns null for empty, undefined for invalid. */
export function parseNumber(input: string): number | null | undefined {
	let s = input.trim();
	if (!s) return null;
	s = s.replace(/[¼½¾⅓⅔⅛]/g, (c) => ` ${UNICODE_FRACTIONS[c]}`).trim().replace(',', '.');
	const mixed = /^(\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+))?$/.exec(s);
	if (!mixed || (!mixed[1] && !mixed[2])) return undefined;
	const whole = mixed[1] ? Number(mixed[1]) : 0;
	if (!mixed[2]) return whole;
	const den = Number(mixed[3]);
	if (den === 0) return undefined;
	return whole + Number(mixed[2]) / den;
}

function numToString(n: number | null): string {
	return n === null ? '' : String(Math.round(n * 1000) / 1000);
}

const MASS_UNITS: Record<string, number> = { mg: 0.001, g: 1, kg: 1000 };

/** Exact grams when the unit is a mass unit, else null. */
export function exactGrams(qty: number | null, unit: string): number | null {
	const factor = MASS_UNITS[unit.trim().toLowerCase()];
	return factor !== undefined && qty !== null ? Math.round(qty * factor * 1000) / 1000 : null;
}

export function newIngredientRow(): IngredientRow {
	return {
		kind: 'item',
		key: uuid(),
		id: uuid(),
		qty: '',
		unit: '',
		name: '',
		note: '',
		grams: '',
		grams_estimated: false,
		optional: false,
		food_id: null
	};
}

export function newStepRow(): StepRow {
	return { kind: 'item', key: uuid(), id: uuid(), text: '' };
}

export function newHeadingRow(): HeadingRow {
	return { kind: 'heading', key: uuid(), text: '' };
}

function withHeadings<T extends { group?: string }, R>(items: T[], toRow: (item: T) => R): (R | HeadingRow)[] {
	const rows: (R | HeadingRow)[] = [];
	let group: string | undefined;
	for (const item of items) {
		if (item.group !== group) {
			group = item.group;
			// An empty heading ends a section, so ungrouped items after a group survive the round-trip.
			rows.push({ kind: 'heading', key: uuid(), text: group ?? '' });
		}
		rows.push(toRow(item));
	}
	return rows;
}

export function ingredientsToRows(ingredients: Ingredient[]): IngredientEditorRow[] {
	return withHeadings(ingredients, (i) => ({
		kind: 'item' as const,
		key: uuid(),
		id: i.id,
		qty: numToString(i.qty),
		unit: i.unit ?? '',
		name: i.name,
		note: i.note ?? '',
		grams: numToString(i.grams),
		grams_estimated: i.grams_estimated,
		optional: i.optional ?? false,
		food_id: i.food_id ?? null
	}));
}

export function stepsToRows(steps: Step[]): StepEditorRow[] {
	return withHeadings(steps, (s) => ({ kind: 'item' as const, key: uuid(), id: s.id, text: s.text }));
}

export interface RowError {
	key: string;
	message: string;
}

/** Converts rows back to ingredients. Blank rows are dropped; unparseable numbers are reported. */
export function rowsToIngredients(rows: IngredientEditorRow[]): { ingredients: Ingredient[]; errors: RowError[] } {
	const ingredients: Ingredient[] = [];
	const errors: RowError[] = [];
	let group: string | undefined;
	for (const row of rows) {
		if (row.kind === 'heading') {
			group = row.text.trim() || undefined;
			continue;
		}
		const name = row.name.trim();
		if (!name) {
			if (row.qty.trim() || row.unit.trim() || row.grams.trim()) errors.push({ key: row.key, message: 'Name is required' });
			continue;
		}
		const qty = parseNumber(row.qty);
		const grams = parseNumber(row.grams);
		if (qty === undefined) errors.push({ key: row.key, message: `“${row.qty}” is not a number` });
		if (grams === undefined || (grams !== null && grams < 0)) errors.push({ key: row.key, message: `“${row.grams}” is not a valid weight` });
		if (qty === undefined || grams === undefined) continue;
		const ing: Ingredient = {
			id: row.id,
			qty,
			unit: row.unit.trim().toLowerCase() || null,
			name,
			grams,
			grams_estimated: grams === null ? false : row.grams_estimated
		};
		if (group) ing.group = group;
		if (row.note.trim()) ing.note = row.note.trim();
		if (row.optional) ing.optional = true;
		if (row.food_id) ing.food_id = row.food_id;
		ingredients.push(ing);
	}
	return { ingredients, errors };
}

export function rowsToSteps(rows: StepEditorRow[]): Step[] {
	const steps: Step[] = [];
	let group: string | undefined;
	for (const row of rows) {
		if (row.kind === 'heading') {
			group = row.text.trim() || undefined;
			continue;
		}
		const text = row.text.trim();
		if (!text) continue;
		steps.push(group ? { id: row.id, text, group } : { id: row.id, text });
	}
	return steps;
}

export function emptyDraft(): RecipeDraft {
	return { title: '', servings: null, yield_g: null, ingredients: [], steps: [] };
}

/** Tags typed as "dinner, vegan; quick" → ["dinner", "vegan", "quick"]. */
export function parseTags(input: string): string[] {
	return [...new Set(input.split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean))];
}
