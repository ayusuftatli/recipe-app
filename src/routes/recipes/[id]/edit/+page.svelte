<script lang="ts">
	import RecipeEditor from '$lib/components/RecipeEditor.svelte';
	import { versionToDraft } from '$lib/types';

	let { data } = $props();
</script>

<svelte:head><title>Edit {data.recipe.current.title} · Recipe Box</title></svelte:head>

<h1>Edit <span class="badge">v{data.recipe.current.version_number}</span></h1>
{#key data.recipe.current.id}
	<RecipeEditor
		draft={versionToDraft(data.recipe.current)}
		tags={data.recipe.tags}
		allTags={data.allTags}
		recipeId={data.recipe.id}
		photoPath={data.recipe.photo_path}
	/>
{/key}
