<script lang="ts">
	import { tick } from 'svelte';
	import RecipeChat from '$lib/components/RecipeChat.svelte';
	import RecipeEditor from '$lib/components/RecipeEditor.svelte';
	import { emptyDraft } from '$lib/editor';
	import type { RecipeDraft } from '$lib/schema';

	let { data } = $props();

	let draft = $state<RecipeDraft | null>(null);
	let importPhoto = $state<File | null>(null);
	let editor = $state<ReturnType<typeof RecipeEditor>>();

	async function onDraft(d: RecipeDraft, _reply: string, photo: File | null) {
		if (draft && editor) {
			editor.setDraft(d);
			return;
		}
		importPhoto = photo;
		draft = d;
		await tick();
		document.getElementById('review')?.scrollIntoView({ behavior: 'smooth' });
	}
</script>

<svelte:head><title>New recipe · Recipe Box</title></svelte:head>

<h1>New recipe</h1>

<RecipeChat
	getCurrent={() => (draft && editor ? editor.getDraft() : null)}
	{onDraft}
	placeholder={draft
		? 'Ask for changes, e.g. “add 1 tsp cumin” or “it serves 4”'
		: 'Paste a recipe, a link, or just type it: “pancakes: 2 eggs, 250 ml milk, 120 g flour…”'}
	intro="Paste or type a recipe, send a link, or snap a photo of a recipe card. You'll review everything before it's saved."
/>

{#if draft}
	<h2 id="review">Review</h2>
	<p class="muted hint">Check the result, especially highlighted weights, then save. You can keep chatting above to change it.</p>
	<RecipeEditor bind:this={editor} {draft} tags={[]} allTags={data.allTags} initialPhoto={importPhoto} />
{:else}
	<p class="manual"><button type="button" class="btn small" onclick={() => (draft = emptyDraft())}>Or fill in the form by hand</button></p>
{/if}

<style>
	.hint {
		margin-top: 0;
		font-size: 0.9rem;
	}
	.manual {
		margin-top: 24px;
		text-align: center;
	}
</style>
