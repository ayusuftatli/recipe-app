import { describe, expect, it } from 'vitest';
import {
	buildGroceryList,
	contributions,
	finishShopping,
	manualKey,
	mergeChecks,
	namesWithoutTerm,
	rangeEnd,
	sumAmount,
	termsFromAnswer,
	type Contribution,
	type GroceryData,
	type GroceryTerm
} from './grocery';
import type { Ingredient } from './schema';

function ing(name: string, qty: number | null, unit: string | null, grams: number | null, over: Partial<Ingredient> = {}): Ingredient {
	return { id: name, name, qty, unit, grams, grams_estimated: unit !== 'g' && unit !== 'kg', ...over };
}

const chili = {
	id: 'chili',
	title: 'Chili',
	servings: 4,
	ingredients: [ing('onion', 2, 'piece', 300), ing('kidney beans', 400, 'g', 400), ing('olive oil', 2, 'tbsp', 27), ing('salt', null, null, null)]
};
const soup = {
	id: 'soup',
	title: 'Soup',
	servings: 2,
	ingredients: [ing('Onion', 1, 'piece', 150), ing('red lentils', 200, 'g', 200), ing('salt', 1, 'pinch', null), ing('parsley', 1, 'bunch', 30, { optional: true })]
};
const sauce = { id: 'sauce', title: 'Sauce', servings: null, ingredients: [ing('tahini', 3, 'tbsp', 45), ing('kidney beans', 1, 'can', 240)] };

function data(parts: Contribution[], over: Partial<GroceryData> = {}): GroceryData {
	return { contributions: parts, manual: [], checks: [], staples: [], terms: [], ...over };
}

const monday = '2026-10-12';
const week = [
	...contributions({ id: 'e1', date: '2026-10-13', servings: null }, chili),
	...contributions({ id: 'e2', date: '2026-10-15', servings: null }, soup)
];

function item(list: ReturnType<typeof buildGroceryList>, name: string) {
	const found = [...list.items, ...list.staples].find((i) => i.name.toLowerCase() === name);
	if (!found) throw new Error(`no item ${name}`);
	return found;
}

describe('contributions', () => {
	it('takes the recipe as written without planned servings', () => {
		const parts = contributions({ id: 'e', date: monday, servings: null }, chili);
		expect(parts.map((p) => [p.name, p.qty, p.grams])).toEqual([
			['onion', 2, 300],
			['kidney beans', 400, 400],
			['olive oil', 2, 27],
			['salt', null, null]
		]);
		expect(parts[0]).toMatchObject({ entry_id: 'e', date: monday, recipe_id: 'chili', title: 'Chili', optional: false });
	});
	it('scales quantity and weight to the planned servings, unrounded', () => {
		const parts = contributions({ id: 'e', date: monday, servings: 6 }, chili);
		expect(parts[0]).toMatchObject({ qty: 3, grams: 450 });
		expect(parts[2]!.grams).toBeCloseTo(40.5);
		const third = contributions({ id: 'e', date: monday, servings: 1 }, { ...chili, servings: 3 });
		expect(third[1]!.grams).toBeCloseTo(133.3333);
	});
	it('plans a recipe without a servings count as written', () => {
		expect(contributions({ id: 'e', date: monday, servings: 8 }, sauce)[0]).toMatchObject({ qty: 3, grams: 45 });
	});
	it('carries optional through', () => {
		expect(contributions({ id: 'e', date: monday, servings: null }, soup)[3]!.optional).toBe(true);
	});
});

describe('sumAmount', () => {
	const part = (qty: number | null, unit: string | null, grams: number | null, grams_estimated = false) => ({ qty, unit, grams, grams_estimated });

	it('keeps a shared unit and shows the weight beside it', () => {
		expect(sumAmount([part(2, 'piece', 300, true), part(1, 'Piece', 150, true)])).toEqual({ text: '3 piece', weight: '≈450 g' });
		expect(sumAmount([part(2, null, 120)])).toEqual({ text: '2', weight: '120 g' });
	});
	it('does not repeat a weight that is the amount', () => {
		expect(sumAmount([part(400, 'g', 400), part(250, 'g', 250)])).toEqual({ text: '650 g', weight: null });
		expect(sumAmount([part(1.5, 'kg', 1500)])).toEqual({ text: '1½ kg', weight: null });
	});
	it('adds up weights when the units differ', () => {
		expect(sumAmount([part(400, 'g', 400), part(1, 'can', 240, true)])).toEqual({ text: '640 g', weight: null });
		expect(sumAmount([part(500, 'g', 500), part(1, 'kg', 1000)])).toEqual({ text: '1500 g', weight: null });
	});
	it('rounds once, on the sum', () => {
		// Three thirds of 400 g are 400 g, not 3 × 133.5 g.
		const third = part(400 / 3, 'g', 400 / 3);
		expect(sumAmount([third, third, third])).toEqual({ text: '400 g', weight: null });
		expect(sumAmount([part(0.5, 'piece', 30, true), part(0.25, 'piece', 15, true)])).toEqual({ text: '¾ piece', weight: '≈45 g' });
	});
	it('lists parts without a weight as written', () => {
		expect(sumAmount([part(200, 'g', 200), part(1, 'pinch', null), part(2, 'pinch', null)])).toEqual({ text: '200 g + 3 pinch', weight: null });
		expect(sumAmount([part(2, 'tsp', 10, true), part(1, 'tsp', null)])).toEqual({ text: '10 g + 1 tsp', weight: null });
		expect(sumAmount([part(1, 'pinch', null)])).toEqual({ text: '1 pinch', weight: null });
	});
	it('is empty when nothing is known', () => {
		expect(sumAmount([part(null, null, null)])).toEqual({ text: '', weight: null });
		expect(sumAmount([part(null, null, null), part(1, 'tsp', 5, true)])).toEqual({ text: '1 tsp', weight: '≈5 g' });
	});
});

describe('buildGroceryList', () => {
	it('merges the same name across recipes, whatever its case, and sorts by name', () => {
		const list = buildGroceryList(data(week), { from: monday });
		expect(list.items.map((i) => i.name)).toEqual(['kidney beans', 'olive oil', 'onion', 'parsley', 'red lentils', 'salt']);
		const onion = item(list, 'onion');
		expect(onion.amount).toEqual({ text: '3 piece', weight: '≈450 g' });
		expect(onion.parts).toEqual([
			{ entry_id: 'e1', recipe_id: 'chili', title: 'Chili', date: '2026-10-13', amount: '2 piece' },
			{ entry_id: 'e2', recipe_id: 'soup', title: 'Soup', date: '2026-10-15', amount: '1 piece' }
		]);
		expect(item(list, 'salt').amount.text).toBe('1 pinch');
	});
	it('scales to the planned servings before merging', () => {
		const parts = [...contributions({ id: 'e1', date: monday, servings: 8 }, chili), ...contributions({ id: 'e2', date: monday, servings: 1 }, soup)];
		const list = buildGroceryList(data(parts), { from: monday });
		expect(item(list, 'onion').amount).toEqual({ text: '4½ piece', weight: '≈675 g' });
		expect(item(list, 'kidney beans').amount.text).toBe('800 g');
	});
	it('covers only the days asked for', () => {
		const from15 = buildGroceryList(data(week), { from: '2026-10-14' });
		expect(from15.items.map((i) => i.name)).toEqual(['Onion', 'parsley', 'red lentils', 'salt']);
		const through14 = buildGroceryList(data(week), { from: monday, through: '2026-10-14' });
		expect(through14.items.map((i) => i.name)).toEqual(['kidney beans', 'olive oil', 'onion', 'salt']);
		expect(buildGroceryList(data(week), { from: monday, through: '2026-10-15' }).items).toHaveLength(6);
		expect(buildGroceryList(data(week), { from: monday, through: null }).items).toHaveLength(6);
	});
	it('marks an item optional only when every recipe calls it optional', () => {
		const list = buildGroceryList(data(week), { from: monday });
		expect(item(list, 'parsley').optional).toBe(true);
		const needed = contributions({ id: 'e3', date: monday, servings: null }, { ...sauce, ingredients: [ing('parsley', 1, 'bunch', 30)] });
		expect(item(buildGroceryList(data([...week, ...needed]), { from: monday }), 'parsley').optional).toBe(false);
	});
	it('adds manual items, without an amount', () => {
		const list = buildGroceryList(data(week, { manual: [{ id: 'm1', name: 'Bin bags' }] }), { from: monday });
		expect(list.items[0]).toMatchObject({ key: 'manual:m1', name: 'Bin bags', manual: true, amount: { text: '', weight: null }, parts: [] });
	});

	describe('shopping names', () => {
		const term = (name_key: string, canonical: string, aisle: GroceryTerm['aisle']): GroceryTerm => ({ name_key, canonical, aisle });
		const diced = contributions({ id: 'e3', date: '2026-10-16', servings: null }, { ...sauce, ingredients: [ing('onions, diced', 150, 'g', 150)] });
		const terms = [
			term('onion', 'onion', 'produce'),
			term('onions, diced', 'onion', 'produce'),
			term('kidney beans', 'kidney beans', 'tins-jars'),
			term('red lentils', 'red lentils', 'dry-goods'),
			term('milk', 'milk', 'dairy-eggs')
		];

		it('merge names that are the same product', () => {
			const list = buildGroceryList(data([...week, ...diced], { terms }), { from: monday });
			const onion = item(list, 'onion');
			expect(onion).toMatchObject({ key: 'onion', aisle: 'produce', amount: { text: '600 g', weight: null } });
			expect(onion.names).toEqual(['onion', 'onions, diced']);
			expect(onion.parts.map((p) => p.amount)).toEqual(['2 piece', '1 piece', '150 g']);
			expect(list.items.filter((i) => i.name.toLowerCase().includes('onion'))).toHaveLength(1);
		});
		it('leave names without one as written, under Other', () => {
			const list = buildGroceryList(data([...week, ...diced]), { from: monday });
			expect(item(list, 'onions, diced')).toMatchObject({ key: 'onions, diced', aisle: 'other' });
			expect(item(list, 'onion').amount.text).toBe('3 piece');
		});
		it('use the shopping name for the item and its key', () => {
			const list = buildGroceryList(data(week, { terms: [term('olive oil', 'Olive Oil, extra virgin', 'tins-jars')] }), { from: monday });
			expect(item(list, 'olive oil, extra virgin')).toMatchObject({ key: 'olive oil, extra virgin', name: 'Olive Oil, extra virgin', names: ['olive oil'] });
		});
		it('sort by shop section, then by name', () => {
			const list = buildGroceryList(data(week, { terms, manual: [{ id: 'm1', name: 'Milk' }, { id: 'm2', name: 'Bin bags' }] }), { from: monday });
			expect(list.items.map((i) => [i.aisle, i.name])).toEqual([
				['produce', 'onion'],
				['dairy-eggs', 'Milk'],
				['dry-goods', 'red lentils'],
				['tins-jars', 'kidney beans'],
				['other', 'Bin bags'],
				['other', 'olive oil'],
				['other', 'parsley'],
				['other', 'salt']
			]);
		});
		it('keep a staple that was marked under the name as written', () => {
			const list = buildGroceryList(data([...week, ...diced], { terms, staples: [{ key: 'onions, diced', name: 'onions, diced', needed: false }] }), {
				from: monday
			});
			expect(list.staples.map((i) => i.key)).toEqual(['onion']);
		});
	});

	describe('namesWithoutTerm', () => {
		it('lists each unknown name once, as first written, manual items included', () => {
			const d = data(week, {
				manual: [{ id: 'm1', name: ' Milk ' }],
				terms: [
					{ name_key: 'onion', canonical: 'onion', aisle: 'produce' },
					{ name_key: 'salt', canonical: 'salt', aisle: 'spices-baking' }
				]
			});
			expect(namesWithoutTerm(d)).toEqual(['kidney beans', 'olive oil', 'red lentils', 'parsley', 'Milk']);
			expect(namesWithoutTerm(data([]))).toEqual([]);
		});
	});

	describe('ticks', () => {
		const at = '2026-10-12T10:00:00.000Z';
		it('apply to the amount they were made for', () => {
			const sig = item(buildGroceryList(data(week), { from: monday }), 'onion').sig;
			const list = buildGroceryList(data(week, { checks: [{ key: 'onion', sig, checked: true, at }] }), { from: monday });
			expect(item(list, 'onion').checked).toBe(true);
			expect(item(list, 'salt').checked).toBe(false);
		});
		it('no longer apply once the amount has changed', () => {
			const sig = item(buildGroceryList(data(week), { from: monday }), 'onion').sig;
			const more = [...week, ...contributions({ id: 'e3', date: '2026-10-16', servings: null }, chili)];
			const list = buildGroceryList(data(more, { checks: [{ key: 'onion', sig, checked: true, at }] }), { from: monday });
			expect(item(list, 'onion')).toMatchObject({ checked: false, amount: { text: '5 piece' } });
		});
		it('can be taken back', () => {
			const sig = item(buildGroceryList(data(week), { from: monday }), 'onion').sig;
			const list = buildGroceryList(data(week, { checks: [{ key: 'onion', sig, checked: false, at }] }), { from: monday });
			expect(item(list, 'onion').checked).toBe(false);
		});
		it('work on manual items', () => {
			const list = buildGroceryList(
				data([], { manual: [{ id: 'm1', name: 'Bin bags' }], checks: [{ key: manualKey('m1'), sig: '', checked: true, at }] }),
				{ from: monday }
			);
			expect(list.items[0]!.checked).toBe(true);
		});
	});

	describe('staples', () => {
		it('are left off the list', () => {
			const list = buildGroceryList(data(week, { staples: [{ key: 'salt', name: 'salt', needed: false }, { key: 'olive oil', name: 'olive oil', needed: false }] }), {
				from: monday
			});
			expect(list.items.map((i) => i.name)).toEqual(['kidney beans', 'onion', 'parsley', 'red lentils']);
			expect(list.staples.map((i) => [i.name, i.amount.text])).toEqual([
				['olive oil', '2 tbsp'],
				['salt', '1 pinch']
			]);
		});
		it('come back when needed for this shop', () => {
			const list = buildGroceryList(data(week, { staples: [{ key: 'salt', name: 'salt', needed: true }] }), { from: monday });
			expect(item(list, 'salt').needed).toBe(true);
			expect(list.staples).toEqual([]);
		});
		it('that nothing asks for do not show at all', () => {
			const list = buildGroceryList(data(week, { staples: [{ key: 'flour', name: 'flour', needed: false }] }), { from: monday });
			expect(list.staples).toEqual([]);
		});
	});
});

describe('rangeEnd', () => {
	it('ends on the Sunday of this week, two days from today, or never', () => {
		expect(rangeEnd('week', '2026-10-14')).toBe('2026-10-18');
		expect(rangeEnd('week', '2026-10-18')).toBe('2026-10-18');
		expect(rangeEnd('days', '2026-10-30')).toBe('2026-11-01');
		expect(rangeEnd('all', '2026-10-14')).toBeNull();
	});
});

describe('termsFromAnswer', () => {
	const asked = ['Onions, diced', 'kidney  beans', 'Milk'];
	it('pairs each answer with the name it was asked about', () => {
		expect(
			termsFromAnswer(asked, [
				{ id: '2', name: 'kidney beans', aisle: 'tins-jars' },
				{ id: '1', name: ' onion ', aisle: 'produce' },
				{ id: '3', name: 'milk', aisle: 'dairy-eggs' }
			])
		).toEqual([
			{ name_key: 'kidney beans', canonical: 'kidney beans', aisle: 'tins-jars' },
			{ name_key: 'onions, diced', canonical: 'onion', aisle: 'produce' },
			{ name_key: 'milk', canonical: 'milk', aisle: 'dairy-eggs' }
		]);
	});
	it('drops answers it cannot use', () => {
		expect(
			termsFromAnswer(asked, [
				{ id: '0', name: 'zero', aisle: 'produce' },
				{ id: '4', name: 'not asked', aisle: 'produce' },
				{ id: 'one', name: 'not a number', aisle: 'produce' },
				{ id: '1', name: '  ', aisle: 'produce' },
				{ id: '2', name: 'beans', aisle: 'aisle 7' },
				{ id: '3', name: 'x'.repeat(81), aisle: 'produce' }
			])
		).toEqual([]);
	});
	it('takes the first answer when a name is answered twice', () => {
		expect(
			termsFromAnswer(asked, [
				{ id: '1', name: 'onion', aisle: 'produce' },
				{ id: '1', name: 'shallot', aisle: 'produce' }
			])
		).toEqual([{ name_key: 'onions, diced', canonical: 'onion', aisle: 'produce' }]);
	});
});

describe('mergeChecks', () => {
	const check = (key: string, checked: boolean, at: string) => ({ key, sig: '', checked, at });
	it('takes the later change for each item', () => {
		const server = [check('a', true, '2026-10-12T10:00:00.000Z'), check('b', true, '2026-10-12T10:00:00.000Z')];
		const local = [check('a', false, '2026-10-12T11:00:00.000Z'), check('b', false, '2026-10-12T09:00:00.000Z'), check('c', true, '2026-10-12T09:00:00.000Z')];
		expect(mergeChecks(server, local)).toEqual([
			check('a', false, '2026-10-12T11:00:00.000Z'),
			check('b', true, '2026-10-12T10:00:00.000Z'),
			check('c', true, '2026-10-12T09:00:00.000Z')
		]);
	});
	it('lets this device win a tie', () => {
		const at = '2026-10-12T10:00:00.000Z';
		expect(mergeChecks([check('a', true, at)], [check('a', false, at)])).toEqual([check('a', false, at)]);
	});
});

describe('finishShopping', () => {
	const at = '2026-10-12T10:00:00.000Z';
	it('drops what was bought and carries over what was not', () => {
		const base = buildGroceryList(data(week), { from: monday });
		const tick = (name: string) => ({ key: name, sig: item(base, name).sig, checked: true, at });
		const list = buildGroceryList(
			data(week, {
				manual: [
					{ id: 'm1', name: 'Bin bags' },
					{ id: 'm2', name: 'Milk' }
				],
				checks: [tick('onion'), tick('kidney beans'), tick('olive oil'), { key: manualKey('m1'), sig: '', checked: true, at }],
				staples: [{ key: 'salt', name: 'salt', needed: false }]
			}),
			{ from: monday }
		);
		// Unticked: red lentils (carried over), parsley (optional, not carried), Milk (stays as it is). Salt is a staple.
		expect(finishShopping(list)).toEqual({ delete_manual: ['m1'], carry_over: ['red lentils (200 g)'] });
	});
	it('carries an item without an amount by its name', () => {
		const list = buildGroceryList(data(contributions({ id: 'e', date: monday, servings: null }, { ...chili, ingredients: [ing('salt', null, null, null)] })), {
			from: monday
		});
		expect(finishShopping(list)).toEqual({ delete_manual: [], carry_over: ['salt'] });
	});
	it('has nothing to do for an empty list', () => {
		expect(finishShopping({ items: [], staples: [] })).toEqual({ delete_manual: [], carry_over: [] });
	});
});
