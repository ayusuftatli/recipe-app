import { error } from '@sveltejs/kit';
import type { z } from 'zod';

/** Parses and validates a JSON request body; responds 400 on failure. */
export async function readBody<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		error(400, 'Body must be valid JSON');
	}
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`);
		error(400, `Invalid request: ${issues.join('; ')}`);
	}
	return parsed.data;
}
