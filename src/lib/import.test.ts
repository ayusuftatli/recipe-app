import { describe, expect, it } from 'vitest';
import { asUrl, describeDraft, extractImageUrl, extractJsonLdRecipe, finalizeDraft, htmlToText, parseModelJson } from './import';
import type { RecipeDraft } from './schema';

const UUID = /^[0-9a-f-]{36}$/;

function draft(over: Partial<RecipeDraft> = {}): RecipeDraft {
	return { title: 'Soup', servings: 2, yield_g: null, ingredients: [], steps: [], ...over };
}

describe('parseModelJson', () => {
	it('parses plain JSON, fenced JSON and JSON surrounded by prose', () => {
		expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
		expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
		expect(parseModelJson('Here you go: {"a":{"b":2}} hope it helps')).toEqual({ a: { b: 2 } });
	});
	it('throws when there is no JSON', () => {
		expect(() => parseModelJson('sorry')).toThrow();
	});
});

describe('finalizeDraft', () => {
	it('replaces model-made ids with uuids on a fresh import', () => {
		const out = finalizeDraft(
			draft({
				ingredients: [
					{ id: 'i1', qty: 1, unit: 'piece', name: 'onion', grams: 150, grams_estimated: true },
					{ id: 'i1', qty: 2, unit: 'tbsp', name: 'oil', grams: 27, grams_estimated: true }
				],
				steps: [{ id: 's1', text: 'Chop' }]
			})
		);
		expect(out.ingredients[0]!.id).toMatch(UUID);
		expect(out.ingredients[1]!.id).toMatch(UUID);
		expect(out.ingredients[0]!.id).not.toBe(out.ingredients[1]!.id);
		expect(out.steps[0]!.id).toMatch(UUID);
	});

	it('keeps ids and food_id of items from the previous draft, once each', () => {
		const prev = draft({
			ingredients: [{ id: 'keep', qty: 1, unit: 'piece', name: 'onion', grams: 150, grams_estimated: true, food_id: 'f1' }],
			steps: [{ id: 'step-keep', text: 'Chop' }]
		});
		const out = finalizeDraft(
			draft({
				ingredients: [
					{ id: 'keep', qty: 2, unit: 'piece', name: 'onion', grams: 300, grams_estimated: true },
					{ id: 'keep', qty: 1, unit: 'clove', name: 'garlic', grams: 5, grams_estimated: true }
				],
				steps: [{ id: 'step-keep', text: 'Chop finely' }, { id: 'new-1', text: 'Fry' }]
			}),
			prev
		);
		expect(out.ingredients[0]).toMatchObject({ id: 'keep', food_id: 'f1', qty: 2 });
		expect(out.ingredients[1]!.id).toMatch(UUID);
		expect(out.ingredients[1]!.food_id).toBeUndefined();
		expect(out.steps.map((s) => s.id)).toEqual(['step-keep', expect.stringMatching(UUID)]);
	});

	it('uses exact grams for mass units and clears the estimate flag for null grams', () => {
		const out = finalizeDraft(
			draft({
				ingredients: [
					{ id: 'a', qty: 0.5, unit: 'kg', name: 'flour', grams: 480, grams_estimated: true },
					{ id: 'b', qty: null, unit: null, name: 'salt', grams: null, grams_estimated: true }
				]
			})
		);
		expect(out.ingredients[0]).toMatchObject({ grams: 500, grams_estimated: false });
		expect(out.ingredients[1]).toMatchObject({ grams: null, grams_estimated: false });
	});
});

describe('describeDraft', () => {
	it('summarises counts and weight flags', () => {
		const d = draft({
			ingredients: [
				{ id: 'a', qty: 1, unit: 'piece', name: 'onion', grams: 150, grams_estimated: true },
				{ id: 'b', qty: null, unit: null, name: 'salt', grams: null, grams_estimated: false }
			],
			steps: [{ id: 's', text: 'Cook' }]
		});
		expect(describeDraft(d)).toBe('Soup: 2 ingredients, 1 step (1 weight estimated, 1 without weight)');
	});
});

describe('asUrl', () => {
	it('detects a message that is only a URL', () => {
		expect(asUrl(' https://example.com/r/1 ')?.hostname).toBe('example.com');
		expect(asUrl('see https://example.com')).toBeNull();
		expect(asUrl('ftp://x')).toBeNull();
	});
});

describe('extractJsonLdRecipe', () => {
	it('finds a Recipe inside @graph and drops bulky fields', () => {
		const html = `<html><head>
			<script type="application/ld+json">{"@type":"WebSite","name":"x"}</script>
			<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Article"},
				{"@type":["Recipe"],"name":"Pancakes","recipeIngredient":["2 eggs"],"review":[{"a":1}],"image":"x.jpg"}]}</script>
			</head></html>`;
		const out = JSON.parse(extractJsonLdRecipe(html)!);
		expect(out).toEqual({ '@type': ['Recipe'], name: 'Pancakes', recipeIngredient: ['2 eggs'] });
	});
	it('returns null when there is no Recipe or the JSON is broken', () => {
		expect(extractJsonLdRecipe('<script type="application/ld+json">{broken</script>')).toBeNull();
		expect(extractJsonLdRecipe('<p>hi</p>')).toBeNull();
	});
});

describe('extractImageUrl', () => {
	const page = 'https://example.com/recipes/soup';
	const ld = (image: unknown) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'x', image })}</script>`;

	it('takes the first JSON-LD image, whatever its shape', () => {
		expect(extractImageUrl(ld('https://cdn.example.com/a.jpg'), page)).toBe('https://cdn.example.com/a.jpg');
		expect(extractImageUrl(ld(['/img/a.jpg', '/img/b.jpg']), page)).toBe('https://example.com/img/a.jpg');
		expect(extractImageUrl(ld({ '@type': 'ImageObject', url: 'a.jpg' }), page)).toBe('https://example.com/recipes/a.jpg');
		expect(extractImageUrl(ld([{ '@type': 'ImageObject', url: '//cdn.example.com/a.jpg' }]), page)).toBe('https://cdn.example.com/a.jpg');
	});
	it('prefers JSON-LD over og:image and falls back to meta tags', () => {
		const og = '<meta property="og:image" content="https://example.com/og.jpg?a=1&amp;b=2">';
		expect(extractImageUrl(og + ld('https://example.com/ld.jpg'), page)).toBe('https://example.com/ld.jpg');
		expect(extractImageUrl(og, page)).toBe('https://example.com/og.jpg?a=1&b=2');
		expect(extractImageUrl("<meta content='/tw.png' name='twitter:image' />", page)).toBe('https://example.com/tw.png');
	});
	it('returns null when there is no usable image', () => {
		expect(extractImageUrl('<p>hi</p>', page)).toBeNull();
		expect(extractImageUrl(ld({ caption: 'no url' }), page)).toBeNull();
		expect(extractImageUrl(ld('data:image/png;base64,AAAA'), page)).toBeNull();
		expect(extractImageUrl('<meta property="og:image:width" content="800">', page)).toBeNull();
	});
});

describe('htmlToText', () => {
	it('strips scripts and tags, keeps line structure and decodes entities', () => {
		const html = `<head><title>t</title></head><body><nav>menu</nav><h1>Tomato &amp; Egg</h1>
			<script>alert(1)</script><ul><li>2 eggs</li><li>&frac12; tsp salt</li></ul><p>Cook&nbsp;well.<br>Serve&#33;</p></body>`;
		expect(htmlToText(html)).toBe('Tomato & Egg\n- 2 eggs\n- ½ tsp salt\nCook well.\nServe!');
	});
	it('caps the length', () => {
		expect(htmlToText('<p>' + 'a'.repeat(20000) + '</p>').length).toBe(15000);
	});
});
