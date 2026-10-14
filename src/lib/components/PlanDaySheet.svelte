<script lang="ts">
	import { onMount } from 'svelte';
	import { addDays, formatDay, localDay } from '$lib/dates';
	import { stepServings } from '$lib/scaling';
	import type { PlanEntry } from '$lib/types';
	import ServingsStepper from './ServingsStepper.svelte';
	import Sheet from './Sheet.svelte';

	let {
		recipeId,
		title,
		servings: initial,
		recipeServings,
		onClose
	}: {
		recipeId: string;
		title: string;
		/** What to plan to begin with; null for the recipe as written. */
		servings: number | null;
		/** null when the recipe has no servings count, so it can only be planned as written. */
		recipeServings: number | null;
		onClose: () => void;
	} = $props();

	// How far ahead a day can be picked here; the week view reaches any day.
	const DAYS_AHEAD = 14;

	const today = localDay(new Date());
	const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));

	// svelte-ignore state_referenced_locally
	let servings = $state(initial ?? recipeServings);
	/** What is already planned, by day, so a day is picked knowing what else is on it. */
	let planned = $state<Record<string, string[]>>({});
	let busy = $state(false);
	let error = $state('');
	let added = $state<string | null>(null);

	onMount(async () => {
		try {
			const res = await fetch(`/api/plan?from=${today}&to=${days.at(-1)}`);
			if (!res.ok) return;
			const map: Record<string, string[]> = {};
			for (const e of (await res.json()) as PlanEntry[]) (map[e.date] ??= []).push(e.title);
			planned = map;
		} catch {
			// The days can still be picked without knowing what is on them.
		}
	});

	function label(day: string, i: number): string {
		return i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : formatDay(day, 'long');
	}

	async function add(day: string) {
		busy = true;
		error = '';
		try {
			const res = await fetch('/api/plan', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				// The recipe's own amount is sent as "as written", so the plan follows a later change to the recipe.
				body: JSON.stringify({ date: day, recipe_id: recipeId, servings: servings === recipeServings ? null : servings })
			});
			if (!res.ok) throw new Error(`Could not add it to the plan (${res.status}).`);
			added = day;
		} catch (e) {
			error = e instanceof TypeError ? 'Network error. Are you online?' : e instanceof Error ? e.message : 'Could not add it to the plan.';
		} finally {
			busy = false;
		}
	}
</script>

<Sheet title={added ? 'Added to the plan' : 'Add to plan'} {onClose}>
	{#if added}
		<p class="done"><strong>{title}</strong> is planned for {formatDay(added, 'long')}.</p>
		<div class="row">
			<button type="button" class="btn primary" onclick={onClose}>Done</button>
			<a class="btn" href="/plan?week={added}">Open the plan</a>
		</div>
	{:else}
		<p class="what"><strong>{title}</strong></p>
		{#if servings !== null}
			<ServingsStepper {servings} onStep={(d) => (servings = stepServings(servings ?? 1, d) ?? servings)} disabled={busy} />
		{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<h2>Which day?</h2>
		<ul>
			{#each days as day, i (day)}
				<li>
					<button type="button" disabled={busy} onclick={() => add(day)}>
						<span class="day">{label(day, i)}{#if i < 2}<span class="muted">&nbsp;· {formatDay(day)}</span>{/if}</span>
						{#if planned[day]}<span class="has muted">{planned[day].join(', ')}</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</Sheet>

<style>
	.what {
		margin: 4px 0 8px;
		font-size: 1.1rem;
	}
	.done {
		margin: 12px 0 16px;
		font-size: 1.1rem;
	}
	h2 {
		margin: 16px 0 4px;
		font-size: 1rem;
		color: var(--muted);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li button {
		display: block;
		width: 100%;
		min-height: 52px;
		padding: 8px 0;
		border: none;
		border-bottom: 1px solid var(--line);
		background: none;
		text-align: left;
		cursor: pointer;
	}
	li button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.day {
		display: block;
		font-weight: 600;
	}
	.has {
		display: block;
		font-size: 0.85rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
