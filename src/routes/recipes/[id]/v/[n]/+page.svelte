<script lang="ts">
	import { enhance } from '$app/forms';
	import RecipeView from '$lib/components/RecipeView.svelte';
	import { formatDate } from '$lib/format';

	let { data } = $props();
	const isCurrent = $derived(data.version.id === data.recipe.current.id);
</script>

<svelte:head><title>v{data.version.version_number} · {data.version.title}</title></svelte:head>

<p class="back"><a href="/recipes/{data.recipe.id}/history">← History</a></p>

<div class="card banner">
	<strong>Version {data.version.version_number}</strong>
	{#if isCurrent}<span class="badge">current</span>{/if}
	<div class="muted">{formatDate(data.version.created_at)}</div>
	{#if data.version.change_note}<div>{data.version.change_note}</div>{/if}
</div>

<h1>{data.version.title}</h1>
<RecipeView version={data.version} />

<div class="action-bar">
	<a class="btn" href="/recipes/{data.recipe.id}/history?a={data.version.version_number}&b={data.recipe.current.version_number}">Compare with current</a>
	{#if !isCurrent}
		<form method="POST" action="?/restore" use:enhance>
			<button class="btn primary" type="submit" style="width: 100%">Restore this version</button>
		</form>
	{/if}
</div>

<style>
	.back {
		margin: 12px 0 0;
	}
	.banner {
		margin-top: 12px;
	}
</style>
