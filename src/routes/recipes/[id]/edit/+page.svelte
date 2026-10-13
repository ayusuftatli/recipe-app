<script lang="ts">
	import RecipeChat from '$lib/components/RecipeChat.svelte';
	import RecipeEditor from '$lib/components/RecipeEditor.svelte';
	import { versionToDraft } from '$lib/types';

	let { data } = $props();
	let editor = $state<ReturnType<typeof RecipeEditor>>();
</script>

<svelte:head><title>Edit {data.recipe.current.title} · Recipe Box</title></svelte:head>

<h1>{data.recipe.current.title} <span class="badge">v{data.recipe.current.version_number}</span></h1>

{#key data.recipe.current.id}
	<RecipeChat
		getCurrent={() => editor?.getDraft() ?? null}
		onDraft={(d, reply) => editor?.setDraft(d, reply)}
		placeholder="Describe a change, e.g. “use 3 eggs and add 1 tsp cumin”"
		intro="Tell the assistant what to change, or edit the form directly. Nothing is saved until you press Save."
	/>

	<RecipeEditor
		bind:this={editor}
		draft={versionToDraft(data.recipe.current)}
		tags={data.recipe.tags}
		allTags={data.allTags}
		recipeId={data.recipe.id}
		photoPath={data.recipe.photo_path}
	/>
{/key}
