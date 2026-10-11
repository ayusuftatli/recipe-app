import { exactGrams } from './editor';
import type { RecipeDraft } from './schema';
import { uuid } from './uuid';

export const MAX_SOURCE_CHARS = 15_000;

/** Parses model output that should be JSON, tolerating ```json fences or stray prose around it. */
export function parseModelJson(text: string): unknown {
	const trimmed = text.trim();
	try {
		return JSON.parse(trimmed);
	} catch {
		const start = trimmed.indexOf('{');
		const end = trimmed.lastIndexOf('}');
		if (start === -1 || end <= start) throw new Error('No JSON object found in the model output');
		return JSON.parse(trimmed.slice(start, end + 1));
	}
}

/**
 * Makes LLM output safe to store:
 * - ids: kept only when they match an item of the previous draft (so the
 *   version diff can match them); everything else gets a fresh uuid
 * - food_id carried over from the previous draft when the model dropped it
 * - mass units (g/kg/mg) get exact grams, never an estimate
 */
export function finalizeDraft(draft: RecipeDraft, previous: RecipeDraft | null = null): RecipeDraft {
	const prevIngredients = new Map((previous?.ingredients ?? []).map((i) => [i.id, i]));
	const prevSteps = new Set((previous?.steps ?? []).map((s) => s.id));
	const used = new Set<string>();

	const keepId = (id: string, known: boolean) => {
		if (known && !used.has(id)) {
			used.add(id);
			return id;
		}
		return uuid();
	};

	return {
		...draft,
		ingredients: draft.ingredients.map((ing) => {
			const prev = prevIngredients.get(ing.id);
			const id = keepId(ing.id, prev !== undefined);
			const exact = exactGrams(ing.qty, ing.unit ?? '');
			const grams = exact ?? ing.grams;
			const food_id = ing.food_id ?? (id === prev?.id ? prev.food_id : undefined);
			const out = { ...ing, id, grams, grams_estimated: exact !== null || grams === null ? false : ing.grams_estimated };
			if (food_id) out.food_id = food_id;
			else delete out.food_id;
			return out;
		}),
		steps: draft.steps.map((s) => ({ ...s, id: keepId(s.id, prevSteps.has(s.id)) }))
	};
}

/** One-line description for the chat, e.g. "Shakshuka: 8 ingredients, 5 steps (3 weights estimated)". */
export function describeDraft(d: RecipeDraft): string {
	const estimated = d.ingredients.filter((i) => i.grams_estimated).length;
	const missing = d.ingredients.filter((i) => i.grams === null).length;
	const flags = [estimated && `${estimated} weight${estimated === 1 ? '' : 's'} estimated`, missing && `${missing} without weight`].filter(Boolean);
	const counts = `${d.ingredients.length} ingredient${d.ingredients.length === 1 ? '' : 's'}, ${d.steps.length} step${d.steps.length === 1 ? '' : 's'}`;
	return `${d.title}: ${counts}${flags.length ? ` (${flags.join(', ')})` : ''}`;
}

/** True when the whole message is a single http(s) URL. */
export function asUrl(message: string): URL | null {
	const s = message.trim();
	if (!/^https?:\/\/\S+$/i.test(s)) return null;
	try {
		return new URL(s);
	} catch {
		return null;
	}
}

function isRecipeNode(node: Record<string, unknown>): boolean {
	const t = node['@type'];
	return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
}

function findRecipe(node: unknown): Record<string, unknown> | null {
	if (Array.isArray(node)) {
		for (const item of node) {
			const found = findRecipe(item);
			if (found) return found;
		}
		return null;
	}
	if (node && typeof node === 'object') {
		const obj = node as Record<string, unknown>;
		if (isRecipeNode(obj)) return obj;
		return findRecipe(obj['@graph']) ?? findRecipe(obj['mainEntity']);
	}
	return null;
}

/** Finds a schema.org Recipe in the page's JSON-LD blocks; returns it as JSON text or null. */
export function extractJsonLdRecipe(html: string): string | null {
	const re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
	for (const match of html.matchAll(re)) {
		let data: unknown;
		try {
			data = JSON.parse(match[1]!.trim());
		} catch {
			continue;
		}
		const recipe = findRecipe(data);
		if (recipe) {
			// Drop bulky fields the model doesn't need.
			const { review, aggregateRating, video, image, author, publisher, ...rest } = recipe;
			void [review, aggregateRating, video, image, author, publisher];
			return JSON.stringify(rest).slice(0, MAX_SOURCE_CHARS);
		}
	}
	return null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°' };

function decodeEntities(s: string): string {
	return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
		if (e[0] === '#') {
			const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
			return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
		}
		return ENTITIES[e.toLowerCase()] ?? m;
	});
}

/** Readable text from an HTML page (no dependency; good enough to hand to an LLM). */
export function htmlToText(html: string): string {
	let s = html.replace(/<!--[\s\S]*?-->/g, ' ');
	s = s.replace(/<(script|style|noscript|svg|head|nav|footer|form|iframe)\b[\s\S]*?<\/\1>/gi, ' ');
	s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr|section|article|ul|ol)>/gi, '\n');
	s = s.replace(/<li\b[^>]*>/gi, '\n- ');
	s = s.replace(/<[^>]+>/g, ' ');
	s = decodeEntities(s);
	s = s
		.split('\n')
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.join('\n');
	return s.slice(0, MAX_SOURCE_CHARS);
}
