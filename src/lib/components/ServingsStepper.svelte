<script lang="ts">
	import { formatQty } from '$lib/format';
	import Icon from './Icon.svelte';

	let {
		servings,
		onStep,
		small = false,
		disabled = false
	}: {
		servings: number;
		onStep: (delta: 1 | -1) => void;
		/** For a row that holds other controls too. */
		small?: boolean;
		disabled?: boolean;
	} = $props();
</script>

<div class="stepper" class:small role="group" aria-label="Servings">
	<button type="button" class="round" aria-label="Fewer servings" disabled={disabled || servings <= 1} onclick={() => onStep(-1)}>
		<Icon name="minus" size={small ? 18 : 20} />
	</button>
	<span class="servings" aria-live="polite">{formatQty(servings)} {servings === 1 ? 'serving' : 'servings'}</span>
	<button type="button" class="round" aria-label="More servings" {disabled} onclick={() => onStep(1)}>
		<Icon name="plus" size={small ? 18 : 20} />
	</button>
</div>

<style>
	.stepper {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.round {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		cursor: pointer;
	}
	.round:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.servings {
		min-width: 6.5ch;
		padding: 0 4px;
		text-align: center;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.small .round {
		width: 40px;
		height: 40px;
	}
	.small .servings {
		font-size: 0.95rem;
	}
</style>
