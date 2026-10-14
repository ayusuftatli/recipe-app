import { addDays, weekStart } from './dates';
import { exactGrams } from './editor';
import { normalizeName } from './food-sources';
import { formatGrams, formatQty } from './format';
import { roundGrams, roundQty, scaleFactor } from './scaling';
import type { Ingredient } from './schema';

/**
 * The grocery list is computed from the meal plan, never stored (spec 4.11):
 * every ingredient of every planned recipe, at the planned size, merged by
 * shopping name. Only ticks, manual items, staples and the shopping names are
 * saved. Everything here is pure.
 */

/** Sections of a shop, in the order one walks through it. */
export const AISLES = [
	'produce',
	'bakery',
	'meat-fish',
	'dairy-eggs',
	'dry-goods',
	'tins-jars',
	'spices-baking',
	'frozen',
	'drinks',
	'household',
	'other'
] as const;
export type Aisle = (typeof AISLES)[number];

export const AISLE_LABELS: Record<Aisle, string> = {
	produce: 'Fruit & vegetables',
	bakery: 'Bakery',
	'meat-fish': 'Meat & fish',
	'dairy-eggs': 'Dairy & eggs',
	'dry-goods': 'Pasta, rice & pulses',
	'tins-jars': 'Tins, jars & sauces',
	'spices-baking': 'Spices & baking',
	frozen: 'Frozen',
	drinks: 'Drinks',
	household: 'Household',
	other: 'Other'
};

/**
 * What an ingredient name is called on the list and where in the shop it is.
 * Names that are the same product share a `canonical` and so become one item.
 */
export interface GroceryTerm {
	/** The normalised ingredient name this is for. */
	name_key: string;
	canonical: string;
	aisle: Aisle;
}

/** One ingredient of one planned recipe, scaled to the planned servings but not rounded. */
export interface Contribution {
	entry_id: string;
	/** 'YYYY-MM-DD' */
	date: string;
	recipe_id: string;
	title: string;
	name: string;
	qty: number | null;
	unit: string | null;
	grams: number | null;
	grams_estimated: boolean;
	optional: boolean;
}

export interface ManualItem {
	id: string;
	name: string;
}

/** A tick, with the amount it was made for; `at` decides between two devices (the later one wins). */
export interface GroceryCheck {
	key: string;
	sig: string;
	checked: boolean;
	at: string;
}

export interface Staple {
	key: string;
	name: string;
	/** Put back on the list for this shop. */
	needed: boolean;
}

/** What the server keeps and sends; the list itself is built from it wherever it is shown. */
export interface GroceryData {
	contributions: Contribution[];
	manual: ManualItem[];
	checks: GroceryCheck[];
	staples: Staple[];
	terms: GroceryTerm[];
}

export interface Amount {
	/** "3 piece", "450 g", "200 g + 1 pinch"; empty when nothing is known ("salt to taste"). */
	text: string;
	/** The weight behind a counted amount ("≈450 g"), when it adds something. */
	weight: string | null;
}

export interface GroceryItem {
	/** What ticks and staples refer to: the normalised shopping name, or `manual:<id>`. */
	key: string;
	name: string;
	aisle: Aisle;
	/** The normalised ingredient names behind it: what a change of name or section applies to. */
	names: string[];
	amount: Amount;
	/** Changes whenever the amount shown does; a tick only holds for the amount it was made for. */
	sig: string;
	checked: boolean;
	/** Typed in by hand; has no amount and no recipes. */
	manual: boolean;
	/** Every recipe that asks for it calls it optional. */
	optional: boolean;
	/** A staple that was put back on the list for this shop. */
	needed: boolean;
	/** Where it comes from, in plan order. */
	parts: { entry_id: string; recipe_id: string; title: string; date: string; amount: string }[];
}

export interface GroceryList {
	/** To buy, ticked or not, by shop section and then by name. */
	items: GroceryItem[];
	/** Left off because they are always in the house. */
	staples: GroceryItem[];
}

/**
 * Ticks from two places as one set: for each item the later change wins, and
 * `local` wins a tie (it is what the person just did on this device).
 */
export function mergeChecks(server: GroceryCheck[], local: GroceryCheck[]): GroceryCheck[] {
	const merged = new Map(server.map((c) => [c.key, c]));
	for (const c of local) {
		const other = merged.get(c.key);
		if (!other || other.at <= c.at) merged.set(c.key, c);
	}
	return [...merged.values()];
}

const MANUAL_PREFIX = 'manual:';

export function manualKey(id: string): string {
	return MANUAL_PREFIX + id;
}

const MAX_NAME_LENGTH = 80;

/**
 * Turns the LLM's answer for `asked` names (numbered from 1 in the request)
 * into terms. Answers for a number that was not asked, without a usable name
 * or with an unknown section are dropped; those names are asked about again.
 */
export function termsFromAnswer(asked: string[], answer: { id: string; name: string; aisle: string }[]): GroceryTerm[] {
	const terms = new Map<string, GroceryTerm>();
	for (const a of answer) {
		const name = /^\d+$/.test(a.id.trim()) ? asked[Number(a.id) - 1] : undefined;
		const canonical = a.name.trim().replace(/\s+/g, ' ');
		const aisle = AISLES.find((x) => x === a.aisle);
		if (name === undefined || !canonical || canonical.length > MAX_NAME_LENGTH || !aisle) continue;
		const name_key = normalizeName(name);
		if (name_key && !terms.has(name_key)) terms.set(name_key, { name_key, canonical, aisle });
	}
	return [...terms.values()];
}

/** Ingredient and manual item names that have no shopping name yet, as first written. */
export function namesWithoutTerm(data: Pick<GroceryData, 'contributions' | 'manual' | 'terms'>): string[] {
	const known = new Set(data.terms.map((t) => t.name_key));
	const missing = new Map<string, string>();
	for (const { name } of [...data.contributions, ...data.manual]) {
		const key = normalizeName(name);
		if (key && !known.has(key) && !missing.has(key)) missing.set(key, name.trim());
	}
	return [...missing.values()];
}

/** The ingredients of a planned recipe at the planned size. Without planned servings, or for a recipe without a servings count, as written. */
export function contributions(
	entry: { id: string; date: string; servings: number | null },
	recipe: { id: string; title: string; servings: number | null; ingredients: Ingredient[] }
): Contribution[] {
	const factor = entry.servings === null ? 1 : (scaleFactor(recipe, { mode: 'servings', target: entry.servings }) ?? 1);
	return recipe.ingredients.map((i) => ({
		entry_id: entry.id,
		date: entry.date,
		recipe_id: recipe.id,
		title: recipe.title,
		name: i.name,
		qty: i.qty === null ? null : i.qty * factor,
		unit: i.unit,
		grams: i.grams === null ? null : i.grams * factor,
		grams_estimated: i.grams_estimated,
		optional: i.optional ?? false
	}));
}

type Measured = Pick<Contribution, 'qty' | 'unit' | 'grams' | 'grams_estimated'>;

function unitOf(p: Measured): string {
	return p.unit?.trim().toLowerCase() ?? '';
}

function quantity(qty: number, unit: string): string {
	return [formatQty(roundQty(qty, unit || null)), unit].filter(Boolean).join(' ');
}

/**
 * The amount to buy for parts of one item. Sums are rounded once, here.
 * Parts that share a unit keep it ("3 piece", with the weight beside it);
 * otherwise the weights are added up; parts without a weight are listed as
 * written ("200 g + 1 pinch").
 */
export function sumAmount(parts: Measured[]): Amount {
	const weighed = parts.filter((p) => p.grams !== null);
	const counted = parts.filter((p) => p.grams === null && p.qty !== null);
	const pieces: string[] = [];
	let weight: string | null = null;

	if (weighed.length > 0) {
		const grams = weighed.reduce((sum, p) => sum + (p.grams ?? 0), 0);
		const gramsText = formatGrams(roundGrams(grams));
		const unit = unitOf(weighed[0]!);
		const sameUnit = counted.length === 0 && weighed.every((p) => p.qty !== null && unitOf(p) === unit);
		if (sameUnit) {
			const qty = weighed.reduce((sum, p) => sum + (p.qty ?? 0), 0);
			pieces.push(quantity(qty, unit));
			// "450 g" next to "450 g" would only repeat it.
			if (exactGrams(qty, unit) === null) weight = (weighed.some((p) => p.grams_estimated) ? '≈' : '') + gramsText;
		} else {
			pieces.push(gramsText);
		}
	}

	const byUnit = new Map<string, number>();
	for (const p of counted) byUnit.set(unitOf(p), (byUnit.get(unitOf(p)) ?? 0) + (p.qty ?? 0));
	for (const [unit, qty] of byUnit) pieces.push(quantity(qty, unit));

	return { text: pieces.join(' + '), weight };
}

function signature(amount: Amount): string {
	return amount.weight === null ? amount.text : `${amount.text} (${amount.weight})`;
}

/** How far ahead to shop: everything planned, to the end of this week, or today and the two days after. */
export const GROCERY_RANGES = [
	{ id: 'all', label: 'Everything planned' },
	{ id: 'week', label: 'This week' },
	{ id: 'days', label: 'Next 3 days' }
] as const;
export type GroceryRange = (typeof GROCERY_RANGES)[number]['id'];

/** The last day a range covers, counted from `today`; null for everything planned. */
export function rangeEnd(range: GroceryRange, today: string): string | null {
	if (range === 'week') return addDays(weekStart(today), 6);
	if (range === 'days') return addDays(today, 2);
	return null;
}

export interface BuildOptions {
	/** The first day to shop for: the user's today. */
	from: string;
	/** The last day to shop for; without it, everything planned. */
	through?: string | null;
}

/** Builds the list for the plan entries between `from` and `through`, plus the manual items. */
export function buildGroceryList(data: GroceryData, { from, through }: BuildOptions): GroceryList {
	const checks = new Map(data.checks.map((c) => [c.key, c]));
	const staples = new Map(data.staples.map((s) => [s.key, s]));
	const terms = new Map(data.terms.map((t) => [t.name_key, t]));
	const isChecked = (key: string, sig: string) => {
		const c = checks.get(key);
		return c !== undefined && c.checked && c.sig === sig;
	};

	const groups = new Map<string, Contribution[]>();
	const inRange = data.contributions
		.filter((c) => c.date >= from && (!through || c.date <= through))
		.sort((a, b) => a.date.localeCompare(b.date));
	for (const c of inRange) {
		const key = normalizeName(terms.get(normalizeName(c.name))?.canonical ?? c.name);
		const group = groups.get(key);
		if (group) group.push(c);
		else groups.set(key, [c]);
	}

	const items: GroceryItem[] = [];
	const hidden: GroceryItem[] = [];
	for (const [key, parts] of groups) {
		const amount = sumAmount(parts);
		const sig = signature(amount);
		const names = [...new Set(parts.map((p) => normalizeName(p.name)))];
		const term = names.map((n) => terms.get(n)).find((t) => t !== undefined);
		// A staple marked before its ingredient got a shopping name is still found under the name as written.
		const staple = [key, ...names].map((k) => staples.get(k)).find((s) => s !== undefined);
		const item: GroceryItem = {
			key,
			name: term?.canonical ?? parts[0]!.name.trim(),
			aisle: term?.aisle ?? 'other',
			names,
			amount,
			sig,
			checked: isChecked(key, sig),
			manual: false,
			optional: parts.every((p) => p.optional),
			needed: staple?.needed ?? false,
			parts: parts.map((p) => {
				const a = sumAmount([p]);
				return { entry_id: p.entry_id, recipe_id: p.recipe_id, title: p.title, date: p.date, amount: a.text };
			})
		};
		if (staple && !staple.needed) hidden.push(item);
		else items.push(item);
	}

	for (const m of data.manual) {
		const key = manualKey(m.id);
		const nameKey = normalizeName(m.name);
		items.push({
			key,
			// A manual item keeps the name it was typed with; only its section is looked up.
			name: m.name,
			aisle: terms.get(nameKey)?.aisle ?? 'other',
			names: [nameKey],
			amount: { text: '', weight: null },
			sig: '',
			checked: isChecked(key, ''),
			manual: true,
			optional: false,
			needed: false,
			parts: []
		});
	}

	const byName = (a: GroceryItem, b: GroceryItem) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
	const bySection = (a: GroceryItem, b: GroceryItem) => AISLES.indexOf(a.aisle) - AISLES.indexOf(b.aisle) || byName(a, b);
	return { items: items.sort(bySection), staples: hidden.sort(byName) };
}

export interface FinishPlan {
	/** Ticked items that were typed in by hand: bought, so they go. */
	delete_manual: string[];
	/**
	 * Items from recipes that were not ticked: kept as manual items, since their
	 * recipes now count as shopped for. Optional ones are left out: not buying
	 * those is a choice, not something forgotten.
	 */
	carry_over: string[];
}

/** What "Finish shopping" does to a list, besides marking its plan entries as shopped and clearing the ticks. */
export function finishShopping(list: GroceryList): FinishPlan {
	const delete_manual: string[] = [];
	const carry_over: string[] = [];
	for (const item of list.items) {
		if (item.manual) {
			if (item.checked) delete_manual.push(item.key.slice(MANUAL_PREFIX.length));
		} else if (!item.checked && !item.optional) {
			carry_over.push(item.amount.text ? `${item.name} (${item.amount.text})` : item.name);
		}
	}
	return { delete_manual, carry_over };
}
