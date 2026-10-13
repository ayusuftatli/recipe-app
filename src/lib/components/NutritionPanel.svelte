<script lang="ts">
	import { parseNumber } from '$lib/editor';
	import type { FoodCandidate } from '$lib/food-sources';
	import { computeNutrition, formatNutrient, NUTRIENT_KEYS, NUTRIENT_LABELS, type NutrientKey } from '$lib/nutrition';
	import type { Ingredient, Nutrients, SetFoodRequest } from '$lib/schema';
	import type { Food, MatchStatus, RecipeVersion } from '$lib/types';
	import Icon from './Icon.svelte';

	let {
		recipeId,
		version,
		foods,
		matching,
		onChanged
	}: {
		recipeId: string;
		version: RecipeVersion;
		/** The foods this version's ingredients point at, by id. */
		foods: Record<string, Food>;
		/** Background matching was running for this recipe when the page data was loaded. */
		matching: boolean;
		/** Called after a new version was saved; should reload the page data. */
		onChanged: () => Promise<void>;
	} = $props();

	const SOURCES: Record<Food['source'], string> = { usda: 'USDA', off: 'Open Food Facts', manual: 'entered by hand' };

	const perFood = $derived(Object.fromEntries(Object.entries(foods).map(([id, f]) => [id, f.nutrients])));
	const result = $derived(computeNutrition(version, perFood));
	const rows = $derived(NUTRIENT_KEYS.filter((k) => result.totals[k] !== undefined));
	const counted = $derived(version.ingredients.filter((i) => !i.optional));
	const noWeight = $derived(counted.filter((i) => i.grams === null).length);
	/** Not decided yet and able to contribute: what background matching still has to find. */
	const open = $derived(counted.filter((i) => i.grams !== null && i.food_id === undefined).length);

	/** The four headline figures, on the most useful basis the recipe allows. */
	const summary = $derived(
		result.matched === 0
			? null
			: result.perServing
				? { basis: 'per serving', values: result.perServing }
				: result.per100g
					? { basis: 'per 100 g', values: result.per100g }
					: { basis: 'whole recipe', values: result.totals }
	);
	const TILES = [
		{ key: 'kcal', label: 'kcal', unit: '' },
		{ key: 'protein_g', label: 'protein', unit: ' g' },
		{ key: 'fat_g', label: 'fat', unit: ' g' },
		{ key: 'carbs_g', label: 'carbs', unit: ' g' }
	] as const;

	const coverage = $derived(
		`${result.matched} of ${result.counted} ingredients matched` +
			(noWeight ? ` · ${noWeight} without a weight` : '') +
			(result.matched > 0 && result.matched < result.counted ? '. The values above leave the others out.' : '')
	);

	// Matching runs on the server in the background; poll until it is done, then reload.
	let polling = $state(false);
	let error = $state('');
	$effect(() => {
		polling = matching;
	});
	$effect(() => {
		if (!polling) return;
		const timer = setInterval(async () => {
			try {
				const res = await fetch(`/api/recipes/${recipeId}/nutrition`);
				if (!res.ok || ((await res.json()) as MatchStatus).running) return;
				polling = false;
				await onChanged();
			} catch {
				// Offline or a hiccup: keep waiting.
			}
		}, 2000);
		return () => clearInterval(timer);
	});

	async function retry() {
		error = '';
		try {
			const res = await fetch(`/api/recipes/${recipeId}/nutrition`, { method: 'POST' });
			const data = (await res.json().catch(() => null)) as (MatchStatus & { message?: string }) | null;
			if (!res.ok || !data) error = data?.message ?? `Request failed (${res.status})`;
			else polling = data.running;
		} catch {
			error = 'Network error. Are you online?';
		}
	}

	// ---- Changing one ingredient's match by hand ----
	let editing = $state<string | null>(null);
	let query = $state('');
	let searching = $state(false);
	let candidates = $state<FoodCandidate[] | null>(null);
	let byHand = $state(false);
	let hand = $state<Record<NutrientKey | 'name', string>>(emptyHand());
	let editError = $state('');
	let saving = $state(false);

	function emptyHand(): Record<NutrientKey | 'name', string> {
		return { name: '', kcal: '', protein_g: '', fat_g: '', sat_fat_g: '', carbs_g: '', sugar_g: '', fiber_g: '', salt_g: '' };
	}

	function startEdit(ing: Ingredient) {
		if (editing === ing.id) {
			editing = null;
			return;
		}
		editing = ing.id;
		query = ing.name;
		candidates = null;
		byHand = false;
		hand = { ...emptyHand(), name: ing.name };
		editError = '';
		// Show the alternatives straight away.
		void search();
	}

	async function search() {
		if (!query.trim()) return;
		searching = true;
		editError = '';
		try {
			const res = await fetch(`/api/foods/search?q=${encodeURIComponent(query.trim())}`);
			if (!res.ok) throw new Error();
			candidates = (await res.json()) as FoodCandidate[];
		} catch {
			editError = 'The search failed. Try again.';
		} finally {
			searching = false;
		}
	}

	async function setFood(ingredientId: string, food: SetFoodRequest['food']) {
		saving = true;
		editError = '';
		try {
			const res = await fetch(`/api/recipes/${recipeId}/nutrition`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ingredient_id: ingredientId, food } satisfies SetFoodRequest)
			});
			if (!res.ok) throw new Error(`Save failed (${res.status})`);
			editing = null;
			await onChanged();
		} catch (e) {
			editError = e instanceof Error ? e.message : 'Save failed';
		} finally {
			saving = false;
		}
	}

	function saveByHand(ingredientId: string) {
		const nutrients: Partial<Nutrients> = {};
		for (const key of NUTRIENT_KEYS) {
			const required = key === 'kcal' || key === 'protein_g' || key === 'fat_g' || key === 'carbs_g';
			const value = parseNumber(hand[key]);
			if (value === undefined || (value === null && required)) {
				editError = `${NUTRIENT_LABELS[key]}: enter a number${required ? '' : ' or leave it empty'}.`;
				return;
			}
			if (value !== null) nutrients[key] = value;
		}
		if (!hand.name.trim()) {
			editError = 'Give the food a name.';
			return;
		}
		void setFood(ingredientId, { source: 'manual', name: hand.name.trim(), nutrients: nutrients as Nutrients });
	}
</script>

<div class="section-head">
	<h2>Nutrition</h2>
	{#if summary}<span class="muted basis">{summary.basis}</span>{/if}
</div>

{#if summary}
	<ul class="tiles">
		{#each TILES as tile (tile.key)}
			<li>
				<strong>{formatNutrient(tile.key, summary.values[tile.key])}{tile.unit}</strong>
				<span class="muted">{tile.label}</span>
			</li>
		{/each}
	</ul>
{:else if !polling}
	<p class="muted">{counted.length > 0 ? 'No ingredient is matched to a food yet.' : 'No ingredients.'}</p>
{/if}

{#if summary && result.matched < result.counted}
	<p class="coverage">{coverage}</p>
{/if}

{#if polling}
	<p class="muted note" role="status">Matching ingredients in the background…</p>
{:else if open > 0}
	<button type="button" class="btn small retry" onclick={retry}>Try matching again</button>
{/if}
{#if error}<p class="error note">{error}</p>{/if}

<!-- The detail is one tap away: the full table, and which food each ingredient was matched to. -->
{#if summary || version.ingredients.length > 0}
<div class="folds">
{#if summary}
	<details>
		<summary><span class="grow">All values</span><Icon name="down" size={18} /></summary>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th></th>
						<th>Total</th>
						{#if result.perServing}<th>Per serving</th>{/if}
						{#if result.per100g}<th>Per 100 g</th>{/if}
					</tr>
				</thead>
				<tbody>
					{#each rows as key (key)}
						<tr class:sub={key === 'sat_fat_g' || key === 'sugar_g'}>
							<th scope="row">{NUTRIENT_LABELS[key]}</th>
							<td>{formatNutrient(key, result.totals[key])}</td>
							{#if result.perServing}<td>{formatNutrient(key, result.perServing[key])}</td>{/if}
							{#if result.per100g}<td>{formatNutrient(key, result.per100g[key])}</td>{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
{/if}

{#if version.ingredients.length > 0}
	<details>
		<summary>
			<span class="grow">Foods used</span>
			{#if counted.length > 0}
				<span class="badge" class:warn={result.matched < result.counted}>{result.matched} of {result.counted} matched</span>
			{/if}
			<Icon name="down" size={18} />
		</summary>
	<ul class="matches">
			{#each version.ingredients as ing (ing.id)}
				{@const food = ing.food_id ? foods[ing.food_id] : undefined}
				<li>
					<div class="row match">
						<div class="who">
							<div class="name">{ing.name}</div>
							{#if ing.optional}
								<div class="muted food">optional, not counted</div>
							{:else if food}
								<div class="muted food">{food.name} · {SOURCES[food.source]} · {formatNutrient('kcal', food.nutrients.kcal)} kcal/100 g</div>
							{:else}
								<div class="food"><span class="badge warn">not matched</span>{ing.food_id === null ? ' (your choice)' : ''}</div>
							{/if}
							{#if ing.grams === null && !ing.optional}<div class="muted food">no weight, so it adds nothing</div>{/if}
						</div>
						{#if !ing.optional}
							<button type="button" class="btn small" onclick={() => startEdit(ing)}>{editing === ing.id ? 'Close' : 'Change'}</button>
						{/if}
					</div>

					{#if editing === ing.id}
						<div class="edit">
							<form
								class="row"
								onsubmit={(e) => {
									e.preventDefault();
									void search();
								}}
							>
								<input type="search" bind:value={query} aria-label="Search the food databases" placeholder="Search foods (English works best)" />
								<button type="submit" class="btn small" disabled={searching || !query.trim()}>{searching ? '…' : 'Search'}</button>
							</form>
							{#if candidates}
								{#if candidates.length === 0}<p class="muted note">Nothing found.</p>{/if}
								<ul class="candidates">
									{#each candidates as c (c.source + c.source_id)}
										<li class="row match">
											<div class="who">
												<div>{c.name}</div>
												<div class="muted food">
													{SOURCES[c.source]} · {formatNutrient('kcal', c.nutrients.kcal)} kcal, {formatNutrient('protein_g', c.nutrients.protein_g)} g protein,
													{formatNutrient('fat_g', c.nutrients.fat_g)} g fat, {formatNutrient('carbs_g', c.nutrients.carbs_g)} g carbs per 100 g
												</div>
											</div>
											<button type="button" class="btn small" disabled={saving} onclick={() => setFood(ing.id, c)}>Use</button>
										</li>
									{/each}
								</ul>
							{/if}

							<div class="row options">
								<button type="button" class="btn small" onclick={() => (byHand = !byHand)}>{byHand ? 'Hide' : 'Enter values by hand'}</button>
								{#if ing.food_id !== null}
									<button type="button" class="btn small" disabled={saving} onclick={() => setFood(ing.id, null)}>No match</button>
								{/if}
							</div>
							{#if byHand}
								<div class="hand">
									<label class="wide">Food name <input type="text" bind:value={hand.name} /></label>
									{#each NUTRIENT_KEYS as key (key)}
										<label>{NUTRIENT_LABELS[key]} <input type="text" inputmode="decimal" autocomplete="off" bind:value={hand[key]} /></label>
									{/each}
									<p class="muted food wide">Per 100 g. Energy, protein, fat and carbohydrate are required.</p>
									<button type="button" class="btn small wide" disabled={saving} onclick={() => saveByHand(ing.id)}>Save values</button>
								</div>
							{/if}
							{#if editError}<p class="error note">{editError}</p>{/if}
						</div>
					{/if}
				</li>
			{/each}
	</ul>
	<p class="muted food last">Changing a match saves a new version of the recipe.</p>
	</details>
{/if}
</div>
{/if}

<style>
	.basis {
		font-size: 0.9rem;
	}
	.tiles {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 8px;
	}
	.tiles li {
		display: grid;
		padding: 10px 4px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		text-align: center;
	}
	.tiles strong {
		font-size: 1.25rem;
		line-height: 1.3;
		font-variant-numeric: tabular-nums;
	}
	.tiles span {
		font-size: 0.8rem;
	}
	.folds {
		margin-top: 10px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	details + details {
		border-top: 1px solid var(--line);
	}
	summary {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		padding: 0 12px 0 14px;
		list-style: none;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary :global(.icon) {
		color: var(--muted);
		transition: transform 0.15s;
	}
	details[open] > summary :global(.icon) {
		transform: rotate(180deg);
	}
	.grow {
		flex: 1;
	}
	.last {
		margin: 8px 14px 12px;
	}
	.table-wrap {
		overflow-x: auto;
		margin: 0 14px;
		padding-bottom: 6px;
	}
	tbody tr:last-child th,
	tbody tr:last-child td {
		border-bottom: none;
	}
	@media (prefers-reduced-motion: reduce) {
		summary :global(.icon) {
			transition: none;
		}
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
	}
	th,
	td {
		padding: 6px 4px;
		border-bottom: 1px solid var(--border);
		text-align: right;
	}
	thead th {
		font-size: 0.85rem;
		color: var(--muted);
		font-weight: 600;
	}
	tbody th {
		text-align: left;
		font-weight: 500;
	}
	tr.sub th {
		padding-left: 14px;
		color: var(--muted);
		font-weight: 400;
	}
	.coverage {
		margin: 10px 0 0;
		padding: 6px 10px;
		border: 1px solid var(--warn-border);
		background: var(--warn-bg);
		border-radius: 8px;
		font-size: 0.9rem;
	}
	.note {
		margin: 8px 0 0;
	}
	.retry {
		margin-top: 10px;
	}
	.matches,
	.candidates {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.matches {
		margin: 0 14px;
	}
	.matches > li,
	.candidates > li {
		padding: 8px 0;
		border-bottom: 1px solid var(--line);
	}
	.match {
		justify-content: space-between;
		align-items: flex-start;
		flex-wrap: nowrap;
	}
	.who {
		min-width: 0;
	}
	.name {
		font-weight: 600;
	}
	.food {
		font-size: 0.85rem;
	}
	.edit {
		margin-top: 8px;
		padding: 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.edit form {
		flex-wrap: nowrap;
	}
	.edit form input {
		flex: 1;
		min-width: 0;
	}
	.options {
		margin-top: 10px;
	}
	.hand {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-top: 10px;
	}
	.hand label {
		font-size: 0.85rem;
	}
	.hand .wide {
		grid-column: 1 / -1;
		margin: 0;
	}
</style>
