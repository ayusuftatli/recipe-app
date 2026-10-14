<script lang="ts">
	import { onMount } from 'svelte';
	import { GROCERY_RANGES, type GroceryRange } from '$lib/grocery';

	/** How far ahead to shop. Remembered on this device. */
	let { range = $bindable() }: { range: GroceryRange } = $props();

	const KEY = 'grocery-range';

	onMount(() => {
		try {
			const saved = localStorage.getItem(KEY);
			const known = GROCERY_RANGES.find((r) => r.id === saved);
			if (known) range = known.id;
		} catch {
			// Without storage the list simply starts on everything planned.
		}
	});

	function pick(next: GroceryRange) {
		range = next;
		try {
			localStorage.setItem(KEY, next);
		} catch {
			// Not remembered, then.
		}
	}
</script>

<div class="chips" role="group" aria-label="Days to shop for">
	{#each GROCERY_RANGES as r (r.id)}
		<button type="button" class="chip" class:active={range === r.id} aria-pressed={range === r.id} onclick={() => pick(r.id)}>{r.label}</button>
	{/each}
</div>

<style>
	.chips {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		/* Bleeds to the screen edge so a cut-off chip shows there is more to scroll to. */
		margin: 0 -16px;
		padding: 12px 16px 4px;
		scrollbar-width: none;
	}
	.chip {
		min-height: 36px;
		cursor: pointer;
	}
</style>
