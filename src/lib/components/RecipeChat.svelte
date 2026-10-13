<script lang="ts">
	import { tick } from 'svelte';
	import type { RecipeDraft } from '$lib/schema';
	import type { AssistantResponse } from '$lib/types';

	interface Props {
		/** Returns the recipe being edited (to refine), or null to start a new one. */
		getCurrent: () => { draft: RecipeDraft | null; errors: string[] } | null;
		onDraft: (draft: RecipeDraft, reply: string, photo: File | null) => void;
		placeholder: string;
		intro?: string;
	}

	let { getCurrent, onDraft, placeholder, intro }: Props = $props();

	type Message =
		| { role: 'user'; text: string; photo?: string }
		| { role: 'assistant'; text: string; summary?: string | null; photo?: boolean }
		| { role: 'error'; text: string; raw?: string };

	let messages = $state<Message[]>([]);
	let text = $state('');
	let photo = $state<File | null>(null);
	let busy = $state(false);
	let fileInput = $state<HTMLInputElement>();
	let textarea = $state<HTMLTextAreaElement>();
	let log = $state<HTMLElement>();

	async function scrollDown() {
		await tick();
		log?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}

	async function send() {
		const message = text.trim();
		if ((!message && !photo) || busy) return;

		const current = getCurrent();
		if (current && !current.draft) {
			messages.push({ role: 'error', text: `Fix the form first: ${current.errors.join(' ')}` });
			return scrollDown();
		}

		const sentPhoto = photo;
		messages.push({ role: 'user', text: message, photo: sentPhoto?.name });
		text = '';
		photo = null;
		if (fileInput) fileInput.value = '';
		busy = true;
		scrollDown();

		const form = new FormData();
		form.set('message', message);
		if (sentPhoto) form.set('photo', sentPhoto);
		if (current?.draft) form.set('draft', JSON.stringify(current.draft));

		try {
			const res = await fetch('/api/assistant', { method: 'POST', body: form });
			const data = (await res.json().catch(() => null)) as (AssistantResponse & { message?: string }) | null;
			if (!res.ok || !data) {
				messages.push({ role: 'error', text: data?.message ?? `Request failed (${res.status})` });
			} else if (!data.ok) {
				messages.push({ role: 'error', text: data.error, raw: data.raw });
			} else {
				messages.push({ role: 'assistant', text: data.reply, summary: data.summary, photo: Boolean(data.draft && data.photo) });
				if (data.draft) onDraft(data.draft, data.reply, sentPhoto ?? (await pagePhoto(data.photo)));
			}
		} catch {
			messages.push({ role: 'error', text: 'Network error — are you online?' });
		} finally {
			busy = false;
			scrollDown();
		}
	}

	/** The picture the server found on an imported page, as a file the editor can upload. */
	async function pagePhoto(dataUrl: string | undefined): Promise<File | null> {
		if (!dataUrl) return null;
		try {
			const blob = await (await fetch(dataUrl)).blob();
			return new File([blob], 'photo.jpg', { type: blob.type });
		} catch {
			return null;
		}
	}

	function useRaw(raw: string) {
		text = raw;
		textarea?.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			send();
		}
	}
</script>

<section class="chat">
	{#if intro && messages.length === 0}
		<p class="intro muted">{intro}</p>
	{/if}

	<div class="log" bind:this={log} aria-live="polite">
		{#each messages as m, i (i)}
			<div class="msg {m.role}">
				{#if m.role === 'user'}
					{#if m.photo}<div class="attachment">📷 {m.photo}</div>{/if}
					{#if m.text}<div class="text">{m.text}</div>{/if}
				{:else if m.role === 'assistant'}
					<div class="text">{m.text}</div>
					{#if m.summary}<div class="summary">✓ {m.summary}{m.photo ? ' · photo included' : ''}</div>{/if}
				{:else}
					<div class="text">{m.text}</div>
					{#if m.raw}
						<details>
							<summary>Show what the assistant returned</summary>
							<pre>{m.raw}</pre>
							<button type="button" class="btn small" onclick={() => useRaw(m.raw ?? '')}>Edit and resend</button>
						</details>
					{/if}
				{/if}
			</div>
		{/each}
		{#if busy}<div class="msg assistant thinking">Thinking…</div>{/if}
	</div>

	<form
		class="composer"
		onsubmit={(e) => {
			e.preventDefault();
			send();
		}}
	>
		{#if photo}
			<div class="chip-row">
				<span class="chip">📷 {photo.name}</span>
				<button type="button" class="icon-btn" aria-label="Remove photo" onclick={() => { photo = null; if (fileInput) fileInput.value = ''; }}>✕</button>
			</div>
		{/if}
		<textarea
			bind:this={textarea}
			bind:value={text}
			rows="3"
			{placeholder}
			aria-label="Message to the recipe assistant"
			onkeydown={onKeydown}
		></textarea>
		<div class="buttons">
			<label class="btn" title="Add a photo of a recipe">
				📷 Photo
				<input
					bind:this={fileInput}
					type="file"
					accept="image/*"
					capture="environment"
					hidden
					onchange={(e) => (photo = e.currentTarget.files?.[0] ?? null)}
				/>
			</label>
			<button class="btn primary send" type="submit" disabled={busy || (!text.trim() && !photo)}>
				{busy ? 'Working…' : 'Send'}
			</button>
		</div>
	</form>
</section>

<style>
	.chat {
		margin: 12px 0;
	}
	.intro {
		margin: 0 0 8px;
	}
	.log {
		display: grid;
		gap: 8px;
		margin-bottom: 8px;
	}
	.msg {
		max-width: 88%;
		padding: 8px 12px;
		border-radius: 14px;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.msg.user {
		justify-self: end;
		background: var(--accent);
		color: var(--accent-text);
		border-bottom-right-radius: 4px;
		max-height: 12em;
		overflow: auto;
	}
	.msg.assistant {
		justify-self: start;
		background: var(--surface);
		border: 1px solid var(--border);
		border-bottom-left-radius: 4px;
	}
	.msg.error {
		justify-self: start;
		background: var(--del-bg);
		border-bottom-left-radius: 4px;
	}
	.thinking {
		color: var(--muted);
	}
	.summary {
		margin-top: 4px;
		font-size: 0.9rem;
		color: var(--muted);
	}
	.attachment {
		font-size: 0.85rem;
		opacity: 0.85;
	}
	pre {
		white-space: pre-wrap;
		font-size: 0.8rem;
		max-height: 200px;
		overflow: auto;
	}
	.composer {
		display: grid;
		gap: 8px;
	}
	.chip-row {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.buttons {
		display: flex;
		gap: 8px;
	}
	.buttons label {
		margin: 0;
		color: var(--text);
		font-size: 1rem;
	}
	.send {
		flex: 1;
	}
</style>
