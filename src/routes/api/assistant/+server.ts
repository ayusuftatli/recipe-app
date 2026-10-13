import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { asUrl, describeDraft, finalizeDraft } from '$lib/import';
import { RecipeDraft } from '$lib/schema';
import { FetchPageError, fetchImage, fetchRecipeSource } from '$lib/server/fetch-page';
import { LlmError, runAssistant, type AssistantInput } from '$lib/server/llm';
import { MAX_UPLOAD_BYTES, photoToDataUrl } from '$lib/server/photos';
import { llmLimiter } from '$lib/server/rate-limit';
import type { AssistantResponse } from '$lib/types';
import type { RequestHandler } from './$types';

const Form = z
	.object({
		message: z.string().max(20_000).default(''),
		photo: z
			.instanceof(File)
			.refine((f) => f.size <= MAX_UPLOAD_BYTES, 'Photo is larger than 15 MB')
			.optional(),
		draft: z
			.string()
			.transform((s, ctx) => {
				try {
					return JSON.parse(s) as unknown;
				} catch {
					ctx.addIssue({ code: 'custom', message: 'draft must be JSON' });
					return z.NEVER;
				}
			})
			.pipe(RecipeDraft)
			.optional()
	})
	.refine((f) => f.message.trim() || f.photo, 'Send a message or a photo');

async function pagePhotoDataUrl(imageUrl: string): Promise<string | undefined> {
	const data = await fetchImage(imageUrl);
	if (!data) return undefined;
	return photoToDataUrl(data).catch(() => undefined);
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!llmLimiter.hit(getClientAddress())) error(429, 'Too many assistant requests. Try again later.');

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		error(400, 'Expected multipart/form-data');
	}
	const photo = form.get('photo');
	const parsed = Form.safeParse({
		message: form.get('message') ?? undefined,
		photo: photo instanceof File && photo.size > 0 ? photo : undefined,
		draft: form.get('draft') ?? undefined
	});
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Invalid request');
	const { message, draft: current } = parsed.data;

	const input: AssistantInput = { message, current: current ?? null };
	try {
		const url = asUrl(message);
		let pagePhoto: Promise<string | undefined> | undefined;
		if (url) {
			const { imageUrl, ...source } = await fetchRecipeSource(url);
			input.source = { url: url.href, ...source };
			// A new recipe from a link takes the page's picture along; downloaded while the model works.
			if (imageUrl && !current && !parsed.data.photo) pagePhoto = pagePhotoDataUrl(imageUrl);
		}
		if (parsed.data.photo) {
			try {
				input.image = await photoToDataUrl(Buffer.from(await parsed.data.photo.arrayBuffer()));
			} catch {
				return json({ ok: false, error: 'Could not read that image.' } satisfies AssistantResponse);
			}
		}
		const result = await runAssistant(input);
		if (!result.ok) return json(result satisfies AssistantResponse);

		const draft = result.reply.draft ? finalizeDraft(result.reply.draft, current ?? null) : null;
		const photo = draft ? await pagePhoto : undefined;
		return json({
			ok: true,
			reply: result.reply.reply,
			draft,
			summary: draft ? describeDraft(draft) : null,
			...(photo ? { photo } : {})
		} satisfies AssistantResponse);
	} catch (e) {
		if (e instanceof LlmError || e instanceof FetchPageError) {
			return json({ ok: false, error: e.message } satisfies AssistantResponse);
		}
		throw e;
	}
};
