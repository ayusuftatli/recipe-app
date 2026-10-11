import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { completeStructured, type ChatMessage } from './llm-structured';

const Schema = z.object({ title: z.string().min(1) });
const base: ChatMessage[] = [{ role: 'user', content: 'go' }];

function fake(outputs: string[]) {
	const calls: ChatMessage[][] = [];
	return {
		calls,
		complete: async (messages: ChatMessage[]) => {
			calls.push(messages);
			return outputs[calls.length - 1] ?? '';
		}
	};
}

describe('completeStructured', () => {
	it('returns valid output from the first call', async () => {
		const f = fake(['{"title":"Soup"}']);
		expect(await completeStructured(f.complete, base, Schema)).toEqual({ ok: true, data: { title: 'Soup' } });
		expect(f.calls).toHaveLength(1);
	});

	it('retries once with the validation errors and accepts the fix', async () => {
		const f = fake(['{"title":""}', '{"title":"Soup"}']);
		const result = await completeStructured(f.complete, base, Schema);
		expect(result).toEqual({ ok: true, data: { title: 'Soup' } });
		expect(f.calls).toHaveLength(2);
		const retry = f.calls[1]!;
		expect(retry.at(-2)).toEqual({ role: 'assistant', content: '{"title":""}' });
		expect(String(retry.at(-1)!.content)).toContain('title:');
	});

	it('gives up after the second failure and returns the raw text', async () => {
		const f = fake(['not json', 'still not json']);
		const result = await completeStructured(f.complete, base, Schema);
		expect(result).toMatchObject({ ok: false, raw: 'still not json' });
		expect(f.calls).toHaveLength(2);
	});
});
