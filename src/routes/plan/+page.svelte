<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import RecipePicker from '$lib/components/RecipePicker.svelte';
	import RecipeThumb from '$lib/components/RecipeThumb.svelte';
	import ServingsStepper from '$lib/components/ServingsStepper.svelte';
	import { addDays, formatDay, formatWeek, localDay, weekDays, weekStart } from '$lib/dates';
	import { stepServings } from '$lib/scaling';
	import type { PlanEntry, RecipeSummary } from '$lib/types';

	let { data } = $props();

	// The user's own calendar day; only the browser knows it.
	let today = $state<string | null>(null);
	onMount(() => {
		today = localDay(new Date());
	});

	const thisWeek = $derived(today ? weekStart(today) : null);
	const week = $derived(data.week ?? thisWeek);
	const days = $derived(week ? weekDays(week) : []);
	const byDay = $derived.by(() => {
		const map = new Map<string, PlanEntry[]>();
		for (const e of data.entries) {
			const list = map.get(e.date);
			if (list) list.push(e);
			else map.set(e.date, [e]);
		}
		return map;
	});

	/** The day a recipe is being picked for. */
	let addingTo = $state<string | null>(null);
	let busy = $state(false);
	let error = $state('');

	async function send(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<boolean> {
		busy = true;
		error = '';
		try {
			const res = await fetch(path, {
				method,
				headers: body === undefined ? undefined : { 'content-type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body)
			});
			if (!res.ok) throw new Error(`The plan could not be changed (${res.status}).`);
			await invalidateAll();
			return true;
		} catch (e) {
			error = e instanceof TypeError ? 'Network error. Are you online?' : e instanceof Error ? e.message : 'The plan could not be changed.';
			return false;
		} finally {
			busy = false;
		}
	}

	async function add(recipe: RecipeSummary) {
		if (!addingTo) return;
		if (await send('/api/plan', 'POST', { date: addingTo, recipe_id: recipe.id })) addingTo = null;
	}

	function step(entry: PlanEntry, delta: 1 | -1) {
		const shown = entry.servings ?? entry.recipe_servings;
		const next = shown === null ? null : stepServings(shown, delta);
		if (next !== null) void send(`/api/plan/${entry.id}`, 'PATCH', { servings: next });
	}

	function move(entry: PlanEntry, e: Event) {
		const date = (e.currentTarget as HTMLSelectElement).value;
		if (date !== entry.date) void send(`/api/plan/${entry.id}`, 'PATCH', { date });
	}
</script>

<svelte:head><title>Meal plan · Recipe Box</title></svelte:head>

<h1 class="sr-only">Meal plan</h1>

{#if week}
	<div class="week">
		<a class="icon-btn" href="/plan?week={addDays(week, -7)}" aria-label="Previous week" data-sveltekit-noscroll><Icon name="back" size={24} /></a>
		<div class="range">
			<div class="dates">{formatWeek(week)}</div>
			{#if thisWeek && week !== thisWeek}
				<a class="link-btn" href="/plan">Back to this week</a>
			{:else if thisWeek}
				<div class="muted now">This week</div>
			{/if}
		</div>
		<a class="icon-btn" href="/plan?week={addDays(week, 7)}" aria-label="Next week" data-sveltekit-noscroll><Icon name="next" size={24} /></a>
	</div>

	{#if error && !addingTo}<p class="error" role="alert">{error}</p>{/if}

	<ul class="days">
		{#each days as day (day)}
			{@const entries = byDay.get(day) ?? []}
			<li class="card day" class:today={day === today} class:past={today !== null && day < today}>
				<div class="head">
					<h2>{formatDay(day, 'long')}</h2>
					{#if day === today}<span class="badge">Today</span>{/if}
					<button type="button" class="btn small add" onclick={() => ((error = ''), (addingTo = day))} aria-label="Add a recipe to {formatDay(day, 'long')}">
						<Icon name="plus" size={18} /> Add
					</button>
				</div>
				{#if entries.length > 0}
					<ul class="entries">
						{#each entries as entry (entry.id)}
							{@const shown = entry.servings ?? entry.recipe_servings}
							<li>
								<a class="recipe" href="/recipes/{entry.recipe_id}">
									<RecipeThumb title={entry.title} photo={entry.photo_path} size={44} />
									<span class="title">{entry.title}</span>
								</a>
								<button
									type="button"
									class="icon-btn"
									disabled={busy}
									aria-label="Remove {entry.title} from {formatDay(day, 'long')}"
									onclick={() => send(`/api/plan/${entry.id}`, 'DELETE')}
								>
									<Icon name="close" />
								</button>
								<div class="controls">
									{#if shown !== null}
										<ServingsStepper servings={shown} onStep={(d) => step(entry, d)} small disabled={busy} />
									{:else}
										<span class="muted written">As written</span>
									{/if}
									<select value={entry.date} disabled={busy} onchange={(e) => move(entry, e)} aria-label="Move {entry.title} to another day">
										{#each days as d (d)}
											<option value={d}>{formatDay(d)}</option>
										{/each}
										<option value={addDays(entry.date, 7)}>A week later</option>
									</select>
								</div>
								{#if entry.shopped}
									<div class="shopped muted">
										<Icon name="check" size={16} /> Shopped for
										<button type="button" class="link-btn" disabled={busy} onclick={() => send(`/api/plan/${entry.id}`, 'PATCH', { shopped: false })}>
											Put back on the grocery list
										</button>
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

{#if addingTo}
	<RecipePicker title="Add to {formatDay(addingTo, 'long')}" onPick={add} onClose={() => (addingTo = null)} {busy} {error} />
{/if}

<style>
	.week {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin: 8px -8px 4px;
	}
	.week .icon-btn {
		color: var(--text);
	}
	.range {
		text-align: center;
		line-height: 1.25;
	}
	.dates {
		font-size: 1.2rem;
		font-weight: 700;
	}
	.range .link-btn {
		min-height: 0;
	}
	.now {
		font-size: 0.9rem;
	}
	.days {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.day {
		padding: 8px 12px;
	}
	.day.today {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.day.past h2 {
		color: var(--muted);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
	}
	.head h2 {
		margin: 0;
		font-size: 1.05rem;
	}
	.add {
		margin-left: auto;
	}
	.entries {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	/* The recipe and its remove button on one line, what can be changed about it on the next. */
	.entries li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 8px 4px;
		padding: 10px 0 8px;
		border-top: 1px solid var(--line);
	}
	.recipe {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		color: var(--text);
		text-decoration: none;
	}
	.title {
		min-width: 0;
		font-weight: 600;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.entries .icon-btn {
		margin-right: -10px;
	}
	.controls {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.written {
		font-size: 0.95rem;
	}
	.shopped {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 6px;
		font-size: 0.9rem;
	}
	.shopped .link-btn {
		margin-left: auto;
	}
	.controls select {
		width: auto;
		min-height: 40px;
		padding: 4px 8px;
		font-size: 0.95rem;
	}
</style>
