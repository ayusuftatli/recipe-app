<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import RecipeView from '$lib/components/RecipeView.svelte';
	import { photoUrl } from '$lib/format';
	import type { RecipeDraft } from '$lib/schema';

	let { data } = $props();
	const recipe = $derived(data.recipe);

	async function saveScaled(draft: RecipeDraft, changeNote: string) {
		const res = await fetch(`/api/recipes/${recipe.id}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ draft, tags: recipe.tags, change_note: changeNote })
		});
		if (!res.ok) throw new Error(`Save failed (${res.status})`);
		await invalidateAll();
	}
</script>

<svelte:head><title>{recipe.current.title} · Recipe Box</title></svelte:head>

{#if recipe.photo_path}
	<img class="hero" src={photoUrl(recipe.photo_path)} alt="" />
{/if}

{#if recipe.archived}
	<p class="card archived">This recipe is archived.</p>
{/if}

<h1>{recipe.current.title}</h1>
<div class="row meta">
	<a class="badge" href="/recipes/{recipe.id}/history" title="Version history">v{recipe.current.version_number}</a>
	{#each recipe.tags as t (t)}
		<a class="chip" href="/?tag={encodeURIComponent(t)}">{t}</a>
	{/each}
</div>

{#key recipe.current.id}
	<RecipeView version={recipe.current} scalable onSaveScaled={saveScaled} />
{/key}

<form method="POST" action={recipe.archived ? '?/unarchive' : '?/archive'} use:enhance class="archive-form">
	<button class="btn small" type="submit">{recipe.archived ? 'Unarchive' : 'Archive'}</button>
</form>

<div class="action-bar">
	<a class="btn" href="/recipes/{recipe.id}/history">History</a>
	<a class="btn primary" href="/recipes/{recipe.id}/edit">Edit</a>
</div>

<style>
	.hero {
		display: block;
		width: calc(100% + 32px);
		margin: 0 -16px;
		max-height: 50vh;
		object-fit: cover;
	}
	.meta {
		margin-bottom: 4px;
	}
	.archived {
		margin-top: 12px;
	}
	.archive-form {
		margin-top: 32px;
	}
</style>
