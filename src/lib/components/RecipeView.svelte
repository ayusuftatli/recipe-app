<script lang="ts">
	import { exactGrams, parseNumber } from '$lib/editor';
	import { formatGrams, formatQty, groupRuns } from '$lib/format';
	import {
		percentages,
		roundGrams,
		scaleDraft,
		scaleFactor,
		scaleIngredients,
		type ScaleMode,
		type ScaleRequest
	} from '$lib/scaling';
	import type { Ingredient, RecipeDraft } from '$lib/schema';
	import { versionToDraft, type RecipeVersion } from '$lib/types';
	import CookMode from './CookMode.svelte';
	import Icon from './Icon.svelte';
	import ScaleControls from './ScaleControls.svelte';

	let {
		version,
		scalable = false,
		pinCook = false,
		onSaveScaled
	}: {
		version: RecipeVersion;
		/** Shows the scaling controls. Scaling only changes what is displayed. */
		scalable?: boolean;
		/** Puts "Start cooking" in the bar pinned to the bottom of the screen; for pages with no bar of their own. */
		pinCook?: boolean;
		/** Enables "Save as new version" for a scaled recipe; should throw on failure. */
		onSaveScaled?: (draft: RecipeDraft, changeNote: string) => Promise<void>;
	} = $props();

	let mode = $state<ScaleMode>('off');
	let target = $state('');
	let anchorId = $state('');
	let saving = $state(false);
	let saveError = $state('');
	let cooking = $state(false);

	const request = $derived.by((): ScaleRequest | null => {
		const amount = parseNumber(target);
		if (!amount) return null;
		if (mode === 'servings' || mode === 'weight') return { mode, target: amount };
		if (mode === 'anchor') return { mode, ingredientId: anchorId, available: amount };
		return null;
	});
	const factor = $derived(request ? scaleFactor(version, request) : null);
	const scaled = $derived(factor !== null && factor !== 1);
	const ingredients = $derived(scaleIngredients(version.ingredients, factor ?? 1));
	const percents = $derived(mode === 'percent' ? percentages(version.ingredients) : null);
	const servings = $derived(version.servings === null ? null : version.servings * (factor ?? 1));
	const yieldG = $derived(version.yield_g === null ? null : roundGrams(version.yield_g * (factor ?? 1)));

	const canScale = $derived(scalable && version.ingredients.length > 0);
	const hasStepper = $derived(canScale && version.servings !== null);
	// The stepper already says how many servings; the line above the ingredients carries the rest.
	const facts = $derived(
		[
			servings !== null && !hasStepper ? `${formatQty(servings)} servings` : '',
			yieldG !== null ? `${formatGrams(yieldG)} final weight` : ''
		]
			.filter(Boolean)
			.join(' · ')
	);

	/** Moves to the next whole number of servings from whatever is shown. */
	function stepServings(delta: 1 | -1) {
		if (servings === null) return;
		const next = delta > 0 ? Math.floor(servings + 1e-9) + 1 : Math.ceil(servings - 1e-9) - 1;
		if (next < 1) return;
		if (next === version.servings) {
			mode = 'off';
			return;
		}
		mode = 'servings';
		target = String(next);
	}

	/** A weight next to "120 g" would only repeat it. */
	function showGrams(ing: Ingredient): boolean {
		return ing.grams !== null && (percents !== null || exactGrams(ing.qty, ing.unit ?? '') === null);
	}

	function changeNote(req: ScaleRequest): string {
		if (req.mode === 'servings') return `Scaled to ${formatQty(req.target)} servings`;
		if (req.mode === 'weight') return `Scaled to ${formatGrams(req.target)} total`;
		const name = version.ingredients.find((i) => i.id === req.ingredientId)?.name ?? '';
		return `Scaled to ${formatGrams(req.available)} ${name}`.trim();
	}

	async function saveScaled() {
		if (!onSaveScaled || !request || factor === null) return;
		saving = true;
		saveError = '';
		try {
			await onSaveScaled(scaleDraft(versionToDraft(version), factor), changeNote(request));
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Save failed';
		} finally {
			saving = false;
		}
	}

	const ingredientRuns = $derived(groupRuns(ingredients));
	const stepRuns = $derived(groupRuns(version.steps));
	const cookable = $derived(version.ingredients.length > 0 || version.steps.length > 0);
</script>

{#if facts}
	<p class="muted facts">{facts}</p>
{/if}

{#if cookable && !pinCook}
	<button type="button" class="btn cook" onclick={() => (cooking = true)}><Icon name="play" size={16} /> Start cooking</button>
{/if}
{#if cooking}
	<CookMode title={version.title} {ingredients} steps={version.steps} onClose={() => (cooking = false)} />
{/if}

<div class="section-head">
	<h2>Ingredients</h2>
	{#if hasStepper && servings !== null}
		<div class="stepper" role="group" aria-label="Servings">
			<button type="button" class="round" aria-label="Fewer servings" disabled={servings <= 1} onclick={() => stepServings(-1)}>
				<Icon name="minus" />
			</button>
			<span class="servings" aria-live="polite">{formatQty(servings)} {servings === 1 ? 'serving' : 'servings'}</span>
			<button type="button" class="round" aria-label="More servings" onclick={() => stepServings(1)}>
				<Icon name="plus" />
			</button>
		</div>
	{/if}
</div>

{#if canScale}
	<ScaleControls
		{version}
		bind:mode
		bind:target
		bind:anchorId
		{factor}
		{hasStepper}
		onSave={onSaveScaled ? saveScaled : undefined}
		{saving}
		error={saveError}
	/>
{/if}

{#if version.ingredients.length === 0}
	<p class="muted">None.</p>
{/if}
{#each ingredientRuns as run, r (r)}
	{#if run.group}<h3>{run.group}</h3>{/if}
	<ul class="ingredients card">
		{#each run.items as ing (ing.id)}
			<li>
				{#if percents}
					{@const percent = percents.get(ing.id)}
					<span class="amount">{percent == null ? '–' : `${percent} %`}</span>
				{:else}
					<span class="amount">{formatQty(ing.qty)} {ing.unit ?? ''}</span>
				{/if}
				<span class="name">
					{ing.name}{#if ing.note}<span class="muted">, {ing.note}</span>{/if}
					{#if ing.optional}<span class="badge">optional</span>{/if}
					{#if ing.qty_only && (scaled || percents)}
						<span class="badge warn">{percents ? 'no weight' : 'no weight, scaled by quantity'}</span>
					{/if}
				</span>
				<span class="grams muted">
					{#if showGrams(ing)}{ing.grams_estimated ? '≈' : ''}{formatGrams(ing.grams)}{/if}
				</span>
			</li>
		{/each}
	</ul>
{/each}

<h2>Steps</h2>
{#if version.steps.length === 0}
	<p class="muted">None.</p>
{/if}
<!-- Numbered straight through the sections, the way cooking mode counts them. -->
<div class="all-steps">
	{#each stepRuns as run, r (r)}
		{#if run.group}<h3>{run.group}</h3>{/if}
		<ol class="steps">
			{#each run.items as step (step.id)}
				<li>{step.text}</li>
			{/each}
		</ol>
	{/each}
</div>

{#if version.notes}
	<h2>Notes</h2>
	<p class="notes">{version.notes}</p>
{/if}

{#if version.source_url}
	<p class="source">
		Source: <a href={version.source_url} rel="noopener noreferrer" target="_blank">{version.source_url}</a>
	</p>
{/if}

{#if cookable && pinCook}
	<div class="action-bar single">
		<button type="button" class="btn primary" onclick={() => (cooking = true)}><Icon name="play" size={18} /> Start cooking</button>
	</div>
{/if}

<style>
	.facts {
		margin: 0;
	}
	.cook {
		width: 100%;
		margin-top: 12px;
	}
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
	.ingredients {
		list-style: none;
		margin: 0;
		padding: 0 14px;
		/* One grid for the whole list, so the names line up whatever the amounts are. */
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		column-gap: 12px;
	}
	.ingredients li {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
		align-items: baseline;
		padding: 11px 0;
		border-bottom: 1px solid var(--line);
	}
	@supports not (grid-template-columns: subgrid) {
		.ingredients li {
			grid-template-columns: minmax(64px, auto) minmax(0, 1fr) auto;
			column-gap: 12px;
		}
	}
	.ingredients li:last-child {
		border-bottom: none;
	}
	.amount {
		font-weight: 600;
		text-align: right;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.name {
		overflow-wrap: anywhere;
	}
	.grams {
		white-space: nowrap;
		font-size: 0.9rem;
		font-variant-numeric: tabular-nums;
	}
	.all-steps {
		counter-reset: step;
	}
	.steps {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.steps li {
		position: relative;
		min-height: 32px;
		margin: 0 0 16px;
		padding: 3px 0 0 46px;
		font-size: 1.05rem;
		counter-increment: step;
	}
	.steps li::before {
		content: counter(step);
		position: absolute;
		left: 0;
		top: 0;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 999px;
		background: var(--accent-soft);
		color: var(--accent);
		font-size: 0.95rem;
		font-weight: 700;
	}
	.notes {
		white-space: pre-wrap;
	}
	.source {
		font-size: 0.9rem;
		overflow-wrap: anywhere;
	}
</style>
