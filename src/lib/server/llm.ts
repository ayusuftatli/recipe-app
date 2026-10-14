import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { env } from '$env/dynamic/private';
import { AISLE_LABELS, AISLES, termsFromAnswer, type GroceryTerm } from '$lib/grocery';
import { AssistantReply, type RecipeDraft } from '$lib/schema';
import { completeStructured, type ChatMessage, type Complete, type ContentPart } from '$lib/llm-structured';

interface ResponseFormat {
	name: string;
	schema: Record<string, unknown>;
}

// Generated from the Zod schema, so the model's contract and the app's validation can't drift.
function responseFormat(name: string, schema: z.ZodTypeAny): ResponseFormat {
	const { $schema, ...jsonSchema } = zodToJsonSchema(schema, { $refStrategy: 'none' }) as Record<string, unknown>;
	void $schema;
	return { name, schema: jsonSchema };
}

const REPLY_FORMAT = responseFormat('assistant_reply', AssistantReply);

const SYSTEM_PROMPT = `You are the recipe assistant inside a personal recipe app. You turn what the user sends (pasted text, a web page, a photo of a recipe, or a request to change the current recipe) into structured recipe data.

Always answer with one JSON object: {"reply": string, "draft": recipe or null}.

Ingredients:
- Keep "qty" and "unit" exactly as written in the source; do not convert units. Use lowercase units such as g, kg, ml, l, tsp, tbsp, cup, piece, pinch, clove, can. Use "piece" for countable items without a unit ("2 eggs" → qty 2, unit "piece"). Use null for qty/unit when absent.
- "name" is the ingredient alone (e.g. "red onion"); preparation goes in "note" (e.g. "finely chopped").
- Estimate "grams" for every ingredient where reasonable (e.g. "1 medium onion" ≈ 150, "1 tbsp olive oil" ≈ 13.5) and set "grams_estimated": true. When the unit is g or kg, grams is exact and "grams_estimated" is false. Use grams null for "salt to taste" and similar.
- Mark ingredients the source calls optional with "optional": true.
- Section headings (e.g. "Sauce", "Marinade") go in "group" on each ingredient or step of that section.

Steps: split into separate, concise steps in source order; keep group headings.

Ids: give each ingredient and step an "id". When a current draft is provided, keep the existing id for every item that is still the same ingredient or step (even if its amount or wording changed), and use ids like "new-1" for new items.

Never invent ingredients or steps that are not in the source. Write the recipe in the same language as the source. "servings" and "yield_g" are null unless stated (or requested).

Changing a recipe: when the user message comes with a current draft, apply exactly the requested change, keep everything else as it is, and return the full updated draft. In "reply", describe the change in a few words, usable as a version note (e.g. "less molasses, +10 g garlic").

New recipe: in "reply", say in one short sentence what you extracted and mention anything unclear.

If the message contains no recipe and no change request, set "draft" to null and answer briefly in "reply".`;

interface OpenRouterResponse {
	choices?: { message?: { content?: string | null } }[];
	usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
	error?: { message?: string };
}

function openRouterComplete(format: ResponseFormat): Complete {
	const apiKey = env.OPENROUTER_API_KEY;
	const model = env.LLM_MODEL;
	if (!apiKey || !model) throw new LlmError('The assistant is not configured: set OPENROUTER_API_KEY and LLM_MODEL.');
	const base = (env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');

	return async (messages: ChatMessage[]) => {
		const started = Date.now();
		let res: Response;
		try {
			res = await fetch(`${base}/chat/completions`, {
				method: 'POST',
				headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'x-title': 'Recipe Box' },
				body: JSON.stringify({
					model,
					messages,
					temperature: 0.2,
					response_format: {
						type: 'json_schema',
						json_schema: { name: format.name, strict: false, schema: format.schema }
					},
					usage: { include: true }
				}),
				signal: AbortSignal.timeout(120_000)
			});
		} catch (e) {
			throw new LlmError(`Could not reach the LLM: ${e instanceof Error ? e.message : String(e)}`);
		}
		const data = (await res.json().catch(() => ({}))) as OpenRouterResponse;
		if (!res.ok || data.error) {
			throw new LlmError(`LLM request failed (${res.status}): ${data.error?.message ?? res.statusText}`);
		}
		const u = data.usage;
		console.log(
			`[llm] model=${model} tokens=${u?.prompt_tokens ?? '?'}+${u?.completion_tokens ?? '?'} ` +
				`cost=${u?.cost !== undefined ? `$${u.cost.toFixed(4)}` : 'n/a'} time=${Date.now() - started}ms`
		);
		return data.choices?.[0]?.message?.content ?? '';
	};
}

export class LlmError extends Error {}

export interface AssistantInput {
	message: string;
	/** Text pulled from a URL, with how it was obtained. */
	source?: { url: string; kind: 'json-ld' | 'text'; content: string };
	/** data: URL of a recipe photo. */
	image?: string;
	/** The recipe currently in the editor; present when refining. */
	current?: RecipeDraft | null;
}

export type AssistantResult = { ok: true; reply: AssistantReply } | { ok: false; error: string; raw?: string };

function buildUserContent(input: AssistantInput): string | ContentPart[] {
	const parts: string[] = [];
	if (input.current) {
		parts.push(`Current recipe draft (JSON):\n${JSON.stringify(input.current)}`);
	}
	if (input.source) {
		const what = input.source.kind === 'json-ld' ? 'schema.org Recipe JSON-LD' : 'page text';
		parts.push(`Recipe source: ${input.source.url} (${what}):\n${input.source.content}`);
	}
	if (input.message.trim() && !input.source) {
		parts.push(input.current ? `Requested change:\n${input.message}` : `Message:\n${input.message}`);
	}
	if (input.image) {
		parts.push(input.current ? 'The attached photo relates to the requested change.' : 'The recipe is in the attached photo.');
	}
	const text = parts.join('\n\n');
	return input.image ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: input.image } }] : text;
}

export async function runAssistant(input: AssistantInput, complete: Complete = openRouterComplete(REPLY_FORMAT)): Promise<AssistantResult> {
	const messages: ChatMessage[] = [
		{ role: 'system', content: SYSTEM_PROMPT },
		{ role: 'user', content: buildUserContent(input) }
	];
	const result = await completeStructured(complete, messages, AssistantReply);
	if (result.ok) return { ok: true, reply: result.data };
	console.warn('[llm] invalid output after retry:', result.errors.slice(0, 5).join('; '));
	return { ok: false, error: 'The assistant returned something that is not a valid recipe.', raw: result.raw };
}

// ---- Nutrition matching (spec 4.5). The model only picks; it never supplies numbers. ----

const SearchTerms = z.object({ terms: z.array(z.object({ id: z.string(), queries: z.array(z.string()) })) });
const SEARCH_TERMS_FORMAT = responseFormat('food_search_terms', SearchTerms);

const SEARCH_TERMS_PROMPT = `You prepare search queries for a food composition database (USDA FoodData Central, English only).

For each recipe ingredient, write one or two short English queries likely to find the plain, generic food: translate to English, drop brands, quantities and preparation, and add the state when it matters (e.g. "raw", "dry", "cooked", "canned"). Put the most specific query first; add a second, broader one whenever the ingredient is a particular variety, cut or regional name, or the database may file it under a different name. Examples: "Tellerlinsen" -> ["lentils, raw"]; "2 large eggs" -> ["egg, whole, raw"]; "red onion, finely chopped" -> ["onions, red, raw", "onions, raw"]; "spaghetti" -> ["spaghetti, dry", "pasta, dry"]; "basmati rice" -> ["rice, basmati, raw", "rice, white, long-grain, raw"]; "olive oil" -> ["oil, olive"]; "plain flour" -> ["wheat flour, white, all-purpose"].

Answer with one JSON object: {"terms": [{"id": the ingredient's id, "queries": [string, ...]}]}, one entry per ingredient.`;

/** English database queries (at most two each) for ingredient names, by ingredient id. Ingredients the model skips are simply absent. */
export async function foodSearchTerms(
	items: { id: string; ingredient: string }[],
	complete: Complete = openRouterComplete(SEARCH_TERMS_FORMAT)
): Promise<Map<string, string[]>> {
	const result = await completeStructured(
		complete,
		[
			{ role: 'system', content: SEARCH_TERMS_PROMPT },
			{ role: 'user', content: JSON.stringify(items) }
		],
		SearchTerms
	);
	if (!result.ok) throw new LlmError('The assistant could not prepare the food search.');
	const known = new Set(items.map((i) => i.id));
	const out = new Map<string, string[]>();
	for (const t of result.data.terms) {
		const queries = [...new Set(t.queries.map((q) => q.trim()).filter(Boolean))].slice(0, 2);
		if (known.has(t.id) && queries.length > 0) out.set(t.id, queries);
	}
	return out;
}

const FoodChoices = z.object({ choices: z.array(z.object({ id: z.string(), candidate: z.string() })) });
const FOOD_CHOICES_FORMAT = responseFormat('food_choices', FoodChoices);

const FOOD_CHOICES_PROMPT = `You match recipe ingredients to entries of a food database so that nutrition can be calculated.

Each ingredient comes with numbered candidates. Pick the candidate that best represents the ingredient as it goes into the recipe: prefer the plain, generic, raw or uncooked form unless the ingredient says otherwise, and avoid branded or prepared products when a generic entry exists.

The exact variety is often not in the database. Then pick the closest equivalent of the same kind of food, whose nutrition is about the same: basmati rice -> white long-grain rice, raw; red onion -> onions, raw; minced beef -> ground beef, raw; any dried pasta shape -> pasta, dry. Answer "none" only when no candidate is the same kind of food (a different food, or a cooked or prepared dish for a raw ingredient); a wrong food is worse than none.

Answer with one JSON object: {"choices": [{"id": the ingredient's id, "candidate": the candidate's number as a string, or "none"}]}, one entry per ingredient. Do not output anything else, and never output nutrition values.`;

/** The model's pick per ingredient id: a candidate number ("1" = first) or "none". Validate with `pickCandidate`. */
export async function chooseFoods(
	items: { id: string; ingredient: string; candidates: string[] }[],
	complete: Complete = openRouterComplete(FOOD_CHOICES_FORMAT)
): Promise<Map<string, string>> {
	const payload = items.map((i) => ({
		id: i.id,
		ingredient: i.ingredient,
		candidates: i.candidates.map((name, n) => `${n + 1}: ${name}`)
	}));
	const result = await completeStructured(
		complete,
		[
			{ role: 'system', content: FOOD_CHOICES_PROMPT },
			{ role: 'user', content: JSON.stringify(payload) }
		],
		FoodChoices
	);
	if (!result.ok) throw new LlmError('The assistant could not choose between the food candidates.');
	return new Map(result.data.choices.map((c) => [c.id, c.candidate]));
}

// ---- Grocery list (spec 4.11). The model names and sorts; it never sees or returns amounts. ----

const GroceryTerms = z.object({ items: z.array(z.object({ id: z.string(), name: z.string(), aisle: z.enum(AISLES) })) });
const GROCERY_TERMS_FORMAT = responseFormat('grocery_terms', GroceryTerms);

const GROCERY_TERMS_PROMPT = `You tidy ingredient names for a shopping list.

For each numbered ingredient name, give:
- "name": what to write on the shopping list. The product itself, singular where that is natural, lower case, in the language the ingredient is written in, without quantities, preparation or notes ("Onions, finely diced" -> "onion"; "2 large eggs" -> "egg").
- "aisle": the section of the shop it is found in, one of:
${AISLES.map((a) => `  "${a}": ${AISLE_LABELS[a]}`).join('\n')}
  Use "other" only when none fits.

Two ingredients get the same "name" only when they are the same product on the shelf: differences in spelling, plural, upper and lower case, or preparation. Different products stay different, however similar: red onion and onion, spaghetti and penne, coconut milk and milk, smoked paprika and paprika, brown rice and basmati rice.

"existing" lists names already on the list. When an ingredient is the same product as one of them, use that name exactly as it is written there.

Answer with one JSON object: {"items": [{"id": the ingredient's number as a string, "name": string, "aisle": string}]}, one entry per ingredient. Do not output anything else.`;

/**
 * Shopping name and shop section for ingredient names. `existing` are the
 * shopping names already in use, so that the same product gets the same name.
 * Names the model skips or answers unusably are simply absent.
 */
export async function groceryTerms(
	names: string[],
	existing: string[],
	complete: Complete = openRouterComplete(GROCERY_TERMS_FORMAT)
): Promise<GroceryTerm[]> {
	const result = await completeStructured(
		complete,
		[
			{ role: 'system', content: GROCERY_TERMS_PROMPT },
			{ role: 'user', content: JSON.stringify({ ingredients: names.map((name, i) => ({ id: String(i + 1), name })), existing }) }
		],
		GroceryTerms
	);
	if (!result.ok) throw new LlmError('The assistant could not tidy the grocery list.');
	return termsFromAnswer(names, result.data.items);
}
