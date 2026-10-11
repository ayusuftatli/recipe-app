import { zodToJsonSchema } from 'zod-to-json-schema';
import { env } from '$env/dynamic/private';
import { AssistantReply, type RecipeDraft } from '$lib/schema';
import { completeStructured, type ChatMessage, type Complete, type ContentPart } from '$lib/llm-structured';

// Generated from the Zod schema, so the model's contract and the app's validation can't drift.
const { $schema, ...REPLY_JSON_SCHEMA } = zodToJsonSchema(AssistantReply, { $refStrategy: 'none' }) as Record<string, unknown>;
void $schema;

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

function openRouterComplete(): Complete {
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
						json_schema: { name: 'assistant_reply', strict: false, schema: REPLY_JSON_SCHEMA }
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

export async function runAssistant(input: AssistantInput, complete: Complete = openRouterComplete()): Promise<AssistantResult> {
	const messages: ChatMessage[] = [
		{ role: 'system', content: SYSTEM_PROMPT },
		{ role: 'user', content: buildUserContent(input) }
	];
	const result = await completeStructured(complete, messages, AssistantReply);
	if (result.ok) return { ok: true, reply: result.data };
	console.warn('[llm] invalid output after retry:', result.errors.slice(0, 5).join('; '));
	return { ok: false, error: 'The assistant returned something that is not a valid recipe.', raw: result.raw };
}
