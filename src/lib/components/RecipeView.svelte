<script lang="ts">
	import { parseNumber } from '$lib/editor';
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
	import type { RecipeDraft } from '$lib/schema';
	import { versionToDraft, type RecipeVersion } from '$lib/types';
	import CookMode from './CookMode.svelte';
	import ScaleControls from './ScaleControls.svelte';

	let {
		version,
		scalable = false,
		onSaveScaled
	}: {
		version: RecipeVersion;
		/** Shows the scaling controls. Scaling only changes what is displayed. */
		scalable?: boolean;
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
</script>

{#if servings !== null || yieldG !== null}
	<p class="muted facts">
		{#if servings !== null}{formatQty(servings)} servings{/if}
		{#if servings !== null && yieldG !== null} · {/if}
		{#if yieldG !== null}{formatGrams(yieldG)} final weight{/if}
	</p>
{/if}

{#if scalable && version.ingredients.length > 0}
	<ScaleControls
		{version}
		bind:mode
		bind:target
		bind:anchorId
		{factor}
		onSave={onSaveScaled ? saveScaled : undefined}
		{saving}
		error={saveError}
	/>
{/if}

{#if version.ingredients.length > 0 || version.steps.length > 0}
	<button type="button" class="btn cook" onclick={() => (cooking = true)}>Start cooking</button>
{/if}
{#if cooking}
	<CookMode title={version.title} {ingredients} steps={version.steps} onClose={() => (cooking = false)} />
{/if}

<h2>Ingredients</h2>
{#if version.ingredients.length === 0}
	<p class="muted">None.</p>
{/if}
{#each ingredientRuns as run, r (r)}
	{#if run.group}<h3>{run.group}</h3>{/if}
	<ul class="ingredients">
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
					{#if ing.grams !== null}{ing.grams_estimated ? '≈' : ''}{formatGrams(ing.grams)}{/if}
				</span>
			</li>
		{/each}
	</ul>
{/each}

<h2>Steps</h2>
{#if version.steps.length === 0}
	<p class="muted">None.</p>
{/if}
{#each stepRuns as run, r (r)}
	{#if run.group}<h3>{run.group}</h3>{/if}
	<ol class="steps">
		{#each run.items as step (step.id)}
			<li>{step.text}</li>
		{/each}
	</ol>
{/each}

{#if version.notes}
	<h2>Notes</h2>
	<p class="notes">{version.notes}</p>
{/if}

{#if version.source_url}
	<p class="source">
		Source: <a href={version.source_url} rel="noopener noreferrer" target="_blank">{version.source_url}</a>
	</p>
{/if}

<style>
	.facts {
		margin: 0;
	}
	.cook {
		width: 100%;
		margin-top: 12px;
	}
	.ingredients {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.ingredients li {
		display: grid;
		grid-template-columns: minmax(64px, auto) 1fr auto;
		gap: 8px;
		padding: 6px 0;
		border-bottom: 1px solid var(--border);
	}
	.badge.warn {
		background: var(--warn-bg);
		border: 1px solid var(--warn-border);
	}
	.amount {
		font-weight: 600;
		white-space: nowrap;
	}
	.grams {
		white-space: nowrap;
		font-size: 0.9rem;
	}
	.steps {
		padding-left: 22px;
		margin: 0;
	}
	.steps li {
		margin: 0 0 10px;
	}
	.notes {
		white-space: pre-wrap;
	}
	.source {
		font-size: 0.9rem;
		overflow-wrap: anywhere;
	}
</style>
