<script lang="ts">
	import RecipeEditor from '$lib/components/RecipeEditor.svelte';
	import { emptyDraft } from '$lib/editor';

	let { data } = $props();
</script>

<svelte:head><title>New recipe · Recipe Box</title></svelte:head>

<h1>New recipe</h1>
<RecipeEditor draft={emptyDraft()} tags={[]} allTags={data.allTags} />
