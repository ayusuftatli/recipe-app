<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import NutritionPanel from '$lib/components/NutritionPanel.svelte';
	import RecipeView from '$lib/components/RecipeView.svelte';
	import { photoUrl } from '$lib/format';
	import type { RecipeDraft } from '$lib/schema';

	let { data } = $props();
	const recipe = $derived(data.recipe);
	// Changes only when amounts do, so a background nutrition match (new version, same amounts)
	// doesn't reset the scaling controls or close cooking mode.
	const amountsKey = $derived(
		JSON.stringify([recipe.current.servings, recipe.current.yield_g, recipe.current.ingredients.map((i) => [i.id, i.qty, i.unit, i.grams])])
	);

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
	{#each recipe.tags as t (t)}
		<a class="chip" href="/?tag={encodeURIComponent(t)}">{t}</a>
	{/each}
	<a class="link-btn version" href="/recipes/{recipe.id}/history" title="Version history">
		<Icon name="history" size={16} /> Version {recipe.current.version_number}
	</a>
</div>

{#key amountsKey}
	<RecipeView version={recipe.current} scalable pinCook onSaveScaled={saveScaled} />
{/key}
<NutritionPanel recipeId={recipe.id} version={recipe.current} foods={data.foods} matching={data.matching} onChanged={invalidateAll} />

<form method="POST" action={recipe.archived ? '?/unarchive' : '?/archive'} use:enhance class="archive-form">
	<button class="link-btn quiet" type="submit">{recipe.archived ? 'Unarchive this recipe' : 'Archive this recipe'}</button>
</form>

<style>
	.hero {
		display: block;
		width: calc(100% + 32px);
		margin: 0 -16px;
		max-height: 50vh;
		object-fit: cover;
	}
	.archived {
		margin-top: 12px;
	}
	.version {
		margin-left: auto;
		gap: 6px;
	}
	.archive-form {
		margin-top: 24px;
	}
</style>
