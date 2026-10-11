import type { Ingredient, Step } from './schema';

export type IngredientField = 'name' | 'qty' | 'unit' | 'grams' | 'note' | 'group' | 'optional';

const FIELDS: IngredientField[] = ['name', 'qty', 'unit', 'grams', 'note', 'group', 'optional'];

export interface IngredientChange {
	before: Ingredient;
	after: Ingredient;
	fields: IngredientField[];
}

export interface IngredientDiff {
	added: Ingredient[];
	removed: Ingredient[];
	changed: IngredientChange[];
	unchanged: number;
}

function norm(v: unknown): unknown {
	return v === undefined || v === '' || v === false ? null : v;
}

/** Ingredients are matched by their stable `id`. */
export function diffIngredients(a: Ingredient[], b: Ingredient[]): IngredientDiff {
	const before = new Map(a.map((i) => [i.id, i]));
	const afterIds = new Set(b.map((i) => i.id));
	const result: IngredientDiff = { added: [], removed: [], changed: [], unchanged: 0 };

	for (const ing of b) {
		const old = before.get(ing.id);
		if (!old) {
			result.added.push(ing);
			continue;
		}
		const fields = FIELDS.filter((f) => norm(old[f]) !== norm(ing[f]));
		if (fields.length) result.changed.push({ before: old, after: ing, fields });
		else result.unchanged++;
	}
	for (const ing of a) if (!afterIds.has(ing.id)) result.removed.push(ing);
	return result;
}

export type LineOp = { op: 'same' | 'add' | 'del'; text: string };

/** Line-level diff (LCS). Inputs are small (recipe steps/notes), so O(n·m) is fine. */
export function diffLines(a: string[], b: string[]): LineOp[] {
	const n = a.length;
	const m = b.length;
	// lcs[i][j] = LCS length of a[i..] and b[j..]
	const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
		}
	}
	const out: LineOp[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			out.push({ op: 'same', text: a[i]! });
			i++;
			j++;
		} else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
			out.push({ op: 'del', text: a[i++]! });
		} else {
			out.push({ op: 'add', text: b[j++]! });
		}
	}
	while (i < n) out.push({ op: 'del', text: a[i++]! });
	while (j < m) out.push({ op: 'add', text: b[j++]! });
	return out;
}

/** Steps flattened to lines, with group headings as their own lines. */
export function stepsToLines(steps: Step[]): string[] {
	const lines: string[] = [];
	let group: string | undefined;
	for (const s of steps) {
		if (s.group !== group) {
			group = s.group;
			if (group) lines.push(`## ${group}`);
		}
		lines.push(s.text);
	}
	return lines;
}

export function textToLines(text: string | null | undefined): string[] {
	return text ? text.split(/\r?\n/) : [];
}

export interface FieldChange {
	field: 'title' | 'servings' | 'yield_g' | 'source_url';
	before: string | number | null;
	after: string | number | null;
}

export interface VersionContent {
	title: string;
	servings: number | null;
	yield_g: number | null;
	source_url: string | null;
	ingredients: Ingredient[];
	steps: Step[];
	notes: string | null;
}

export interface VersionDiff {
	fields: FieldChange[];
	ingredients: IngredientDiff;
	steps: LineOp[];
	notes: LineOp[];
}

export function diffVersions(a: VersionContent, b: VersionContent): VersionDiff {
	const fields: FieldChange[] = [];
	for (const field of ['title', 'servings', 'yield_g', 'source_url'] as const) {
		const before = a[field] ?? null;
		const after = b[field] ?? null;
		if (before !== after) fields.push({ field, before, after });
	}
	return {
		fields,
		ingredients: diffIngredients(a.ingredients, b.ingredients),
		steps: diffLines(stepsToLines(a.steps), stepsToLines(b.steps)),
		notes: diffLines(textToLines(a.notes), textToLines(b.notes))
	};
}
