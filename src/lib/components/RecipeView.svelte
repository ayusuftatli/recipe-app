<script lang="ts">
	import { formatGrams, formatQty, groupRuns } from '$lib/format';
	import type { RecipeVersion } from '$lib/types';

	let { version }: { version: RecipeVersion } = $props();

	const ingredientRuns = $derived(groupRuns(version.ingredients));
	const stepRuns = $derived(groupRuns(version.steps));
</script>

{#if version.servings !== null || version.yield_g !== null}
	<p class="muted facts">
		{#if version.servings !== null}{formatQty(version.servings)} servings{/if}
		{#if version.servings !== null && version.yield_g !== null} · {/if}
		{#if version.yield_g !== null}{formatGrams(version.yield_g)} final weight{/if}
	</p>
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
				<span class="amount">{formatQty(ing.qty)} {ing.unit ?? ''}</span>
				<span class="name">
					{ing.name}{#if ing.note}<span class="muted">, {ing.note}</span>{/if}
					{#if ing.optional}<span class="badge">optional</span>{/if}
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
