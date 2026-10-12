<script lang="ts">
	import { formatGrams } from '$lib/format';
	import { roundGrams, totalGrams, type ScaleMode } from '$lib/scaling';
	import type { RecipeVersion } from '$lib/types';

	let {
		version,
		mode = $bindable(),
		target = $bindable(),
		anchorId = $bindable(),
		factor,
		onSave,
		saving = false,
		error = ''
	}: {
		version: RecipeVersion;
		mode: ScaleMode;
		/** Raw text of the amount field; its meaning depends on the mode. */
		target: string;
		anchorId: string;
		/** The factor the current input gives, or null if it is not usable. */
		factor: number | null;
		/** Omit to hide "Save as new version". */
		onSave?: () => void;
		saving?: boolean;
		error?: string;
	} = $props();

	const total = $derived(totalGrams(version.ingredients));
	const anchors = $derived(version.ingredients.filter((i) => i.grams !== null && i.grams > 0));
	const modes = $derived<{ id: ScaleMode; label: string; enabled: boolean }[]>([
		{ id: 'off', label: 'Original', enabled: true },
		{ id: 'servings', label: 'Servings', enabled: version.servings !== null },
		{ id: 'weight', label: 'Total weight', enabled: total > 0 },
		{ id: 'anchor', label: 'By ingredient', enabled: anchors.length > 0 },
		{ id: 'percent', label: 'Per 100 g', enabled: total > 0 }
	]);
	const someDisabled = $derived(modes.some((m) => !m.enabled));

	// Unrounded (to 3 decimals), so the prefilled amount gives exactly ×1.
	function exact(grams: number): string {
		return String(Math.round(grams * 1000) / 1000);
	}

	function anchorGrams(id: string): string {
		const grams = anchors.find((i) => i.id === id)?.grams;
		return grams == null ? '' : exact(grams);
	}

	// Each mode starts at the recipe's own amount, so the first thing shown is ×1.
	function select(next: ScaleMode) {
		mode = next;
		if (next === 'servings') target = String(version.servings ?? '');
		else if (next === 'weight') target = exact(total);
		else if (next === 'anchor') {
			if (!anchors.some((i) => i.id === anchorId)) anchorId = anchors[0]?.id ?? '';
			target = anchorGrams(anchorId);
		}
	}

	function formatFactor(f: number): string {
		return `×${Number(f.toPrecision(3))}`;
	}
</script>

<div class="card scale">
	<div class="row" role="group" aria-label="Scale recipe">
		{#each modes as m (m.id)}
			<button
				type="button"
				class="chip"
				class:active={mode === m.id}
				aria-pressed={mode === m.id}
				disabled={!m.enabled}
				onclick={() => select(m.id)}
			>
				{m.label}
			</button>
		{/each}
	</div>

	{#if mode === 'servings'}
		<div class="field">
			<label for="scale-target">Servings (recipe makes {version.servings})</label>
			<input id="scale-target" type="text" inputmode="decimal" autocomplete="off" bind:value={target} />
		</div>
	{:else if mode === 'weight'}
		<div class="field">
			<label for="scale-target">Total weight in grams (recipe is {formatGrams(roundGrams(total))})</label>
			<input id="scale-target" type="text" inputmode="decimal" autocomplete="off" bind:value={target} />
		</div>
	{:else if mode === 'anchor'}
		<div class="field">
			<label for="scale-anchor">Ingredient you have</label>
			<select id="scale-anchor" bind:value={anchorId} onchange={() => (target = anchorGrams(anchorId))}>
				{#each anchors as i (i.id)}
					<option value={i.id}>{i.name} ({formatGrams(i.grams)})</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="scale-target">Grams available</label>
			<input id="scale-target" type="text" inputmode="decimal" autocomplete="off" bind:value={target} />
		</div>
	{:else if mode === 'percent'}
		<p class="muted hint">Each ingredient as a share of the total weight ({formatGrams(roundGrams(total))}).</p>
	{/if}

	{#if mode === 'servings' || mode === 'weight' || mode === 'anchor'}
		{#if factor === null}
			<p class="error hint">Enter an amount greater than 0.</p>
		{:else}
			<div class="row result">
				<span class="muted">{factor === 1 ? 'Same as the recipe' : `Scaled ${formatFactor(factor)}`}</span>
				{#if onSave && factor !== 1}
					<button type="button" class="btn small" disabled={saving} onclick={onSave}>
						{saving ? 'Saving…' : 'Save as new version'}
					</button>
				{/if}
			</div>
		{/if}
	{/if}
	{#if error}<p class="error hint">{error}</p>{/if}

	{#if someDisabled}
		<p class="muted hint small">
			{#if version.servings === null}Add a servings count to scale by servings.{/if}
			{#if total <= 0}Add ingredient weights to scale by weight.{/if}
		</p>
	{/if}
</div>

<style>
	.scale {
		margin-top: 12px;
	}
	button.chip {
		min-height: 36px;
		cursor: pointer;
	}
	button.chip:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.field {
		margin-top: 10px;
	}
	.hint {
		margin: 10px 0 0;
	}
	.small {
		font-size: 0.85rem;
	}
	.result {
		margin-top: 10px;
		justify-content: space-between;
	}
</style>
