import type { z } from 'zod';
import { parseModelJson } from './import';

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string | ContentPart[];
}

/** One chat-completion call; returns the raw text the model produced. */
export type Complete = (messages: ChatMessage[]) => Promise<string>;

export type StructuredResult<T> = { ok: true; data: T } | { ok: false; raw: string; errors: string[] };

function validate<T extends z.ZodTypeAny>(schema: T, raw: string): { ok: true; data: z.infer<T> } | { ok: false; errors: string[] } {
	let json: unknown;
	try {
		json = parseModelJson(raw);
	} catch (e) {
		return { ok: false, errors: [e instanceof Error ? e.message : 'Invalid JSON'] };
	}
	const parsed = schema.safeParse(json);
	if (parsed.success) return { ok: true, data: parsed.data };
	return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}

/**
 * Calls the model and validates its JSON with Zod. On failure it retries once,
 * telling the model what was wrong; a second failure returns the raw text.
 */
export async function completeStructured<T extends z.ZodTypeAny>(
	complete: Complete,
	messages: ChatMessage[],
	schema: T
): Promise<StructuredResult<z.infer<T>>> {
	const first = await complete(messages);
	const v1 = validate(schema, first);
	if (v1.ok) return v1;

	const retry: ChatMessage[] = [
		...messages,
		{ role: 'assistant', content: first },
		{
			role: 'user',
			content: `Your output did not match the required JSON schema:\n- ${v1.errors.slice(0, 20).join('\n- ')}\nReturn the corrected JSON object only.`
		}
	];
	const second = await complete(retry);
	const v2 = validate(schema, second);
	if (v2.ok) return v2;
	return { ok: false, raw: second, errors: v2.errors };
}
