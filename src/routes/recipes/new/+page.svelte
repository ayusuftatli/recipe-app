<script lang="ts">
	import { tick } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeChat from '$lib/components/RecipeChat.svelte';
	import RecipeEditor from '$lib/components/RecipeEditor.svelte';
	import { emptyDraft } from '$lib/editor';
	import type { RecipeDraft } from '$lib/schema';

	let { data } = $props();

	let draft = $state<RecipeDraft | null>(null);
	let importPhoto = $state<File | null>(null);
	let editor = $state<ReturnType<typeof RecipeEditor>>();
	let chat = $state<ReturnType<typeof RecipeChat>>();
	/** A message has gone to the assistant, so the ways to start have done their job. */
	let started = $state(false);
	/** The form was opened empty rather than filled in from an import. */
	let manual = $state(false);
	let pasting = $state<'link' | 'text'>('text');

	async function showForm() {
		await tick();
		document.getElementById('review')?.scrollIntoView({ behavior: 'smooth' });
	}

	async function onDraft(d: RecipeDraft, _reply: string, photo: File | null) {
		if (draft && editor) {
			editor.setDraft(d);
			return;
		}
		importPhoto = photo;
		draft = d;
		await showForm();
	}

	function write(what: 'link' | 'text') {
		pasting = what;
		chat?.focus();
	}

	async function fillIn() {
		manual = true;
		draft = emptyDraft();
		await showForm();
	}
</script>

<svelte:head><title>New recipe · Recipe Box</title></svelte:head>

<h1>Add a recipe</h1>

{#if !draft && !started}
	<p class="muted lead">Pick whichever is easiest. You'll review everything before it's saved.</p>
	<ul class="ways">
		<li>
			<button type="button" class="way" onclick={() => write('link')}>
				<span class="tile"><Icon name="link" size={24} /></span>
				<span class="what"><strong>Paste a link</strong><span class="muted">We read the page and bring its photo along.</span></span>
				<Icon name="next" />
			</button>
		</li>
		<li>
			<button type="button" class="way" onclick={() => chat?.choosePhoto()}>
				<span class="tile"><Icon name="camera" size={24} /></span>
				<span class="what"><strong>Take a photo</strong><span class="muted">A recipe card, a cookbook page or a screenshot.</span></span>
				<Icon name="next" />
			</button>
		</li>
		<li>
			<button type="button" class="way" onclick={() => write('text')}>
				<span class="tile"><Icon name="text" size={24} /></span>
				<span class="what"><strong>Type or paste text</strong><span class="muted">Any format works, even “pancakes: 2 eggs, 250 ml milk, 120 g flour”.</span></span>
				<Icon name="next" />
			</button>
		</li>
		<li>
			<button type="button" class="way" onclick={fillIn}>
				<span class="tile"><Icon name="form" size={24} /></span>
				<span class="what"><strong>Fill in the form</strong><span class="muted">Enter the ingredients and steps yourself.</span></span>
				<Icon name="next" />
			</button>
		</li>
	</ul>
{/if}

<RecipeChat
	bind:this={chat}
	getCurrent={() => (draft && editor ? editor.getDraft() : null)}
	{onDraft}
	onSend={() => (started = true)}
	placeholder={draft
		? 'Ask for changes, e.g. “add 1 tsp cumin” or “it serves 4”'
		: pasting === 'link'
			? 'Paste the link here'
			: 'Paste a recipe, a link, or just type it: “pancakes: 2 eggs, 250 ml milk, 120 g flour…”'}
/>

{#if draft}
	<h2 id="review">{manual ? 'Your recipe' : 'Review'}</h2>
	{#if !manual}
		<p class="muted hint">Check the result, especially weights marked estimated, then save. You can keep chatting above to change it.</p>
	{/if}
	<RecipeEditor bind:this={editor} {draft} tags={[]} allTags={data.allTags} initialPhoto={importPhoto} />
{/if}

<style>
	.lead {
		margin: 0 0 16px;
	}
	.hint {
		margin-top: 0;
		font-size: 0.9rem;
	}
	.ways {
		list-style: none;
		margin: 0 0 20px;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.way {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		padding: 14px 12px 14px 14px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--surface);
		text-align: left;
		cursor: pointer;
	}
	.way > :global(.icon) {
		color: var(--muted);
	}
	.tile {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		border-radius: 12px;
		background: var(--accent-soft);
		color: var(--accent);
	}
	.what {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.what strong {
		font-weight: 600;
		line-height: 1.3;
	}
	.what span {
		font-size: 0.9rem;
		line-height: 1.4;
	}
	/* The id is scrolled to; keep it clear of the sticky header. */
	h2 {
		scroll-margin-top: 72px;
	}
</style>
