<script lang="ts">
	import { parseNumber } from '$lib/editor';
	import type { FoodCandidate } from '$lib/food-sources';
	import { computeNutrition, formatNutrient, NUTRIENT_KEYS, NUTRIENT_LABELS, type NutrientKey } from '$lib/nutrition';
	import type { Ingredient, Nutrients, SetFoodRequest } from '$lib/schema';
	import type { Food, MatchResponse, RecipeVersion } from '$lib/types';

	let {
		recipeId,
		version,
		foods,
		onChanged
	}: {
		recipeId: string;
		version: RecipeVersion;
		/** The foods this version's ingredients point at, by id. */
		foods: Record<string, Food>;
		/** Called after a new version was saved; should reload the page data. */
		onChanged: () => Promise<void>;
	} = $props();

	const SOURCES: Record<Food['source'], string> = { usda: 'USDA', off: 'Open Food Facts', manual: 'entered by hand' };

	const perFood = $derived(Object.fromEntries(Object.entries(foods).map(([id, f]) => [id, f.nutrients])));
	const result = $derived(computeNutrition(version, perFood));
	const rows = $derived(NUTRIENT_KEYS.filter((k) => result.totals[k] !== undefined));
	const counted = $derived(version.ingredients.filter((i) => !i.optional));
	const noWeight = $derived(counted.filter((i) => i.grams === null).length);
	const matchable = $derived(counted.filter((i) => i.grams !== null && !(i.food_id && foods[i.food_id])).length);

	const coverage = $derived(
		`${result.matched} of ${result.counted} ingredients matched` +
			(noWeight ? ` · ${noWeight} without a weight` : '') +
			(result.matched > 0 && result.matched < result.counted ? '. The values above leave the others out.' : '')
	);

	let busy = $state(false);
	let message = $state('');
	let error = $state('');

	async function calculate() {
		busy = true;
		message = '';
		error = '';
		try {
			const res = await fetch(`/api/recipes/${recipeId}/nutrition`, { method: 'POST' });
			const data = (await res.json().catch(() => null)) as (MatchResponse & { message?: string }) | null;
			if (!res.ok || !data) error = data?.message ?? `Request failed (${res.status})`;
			else if (!data.ok) error = data.error;
			else {
				const parts = [`Matched ${data.matched} ingredient${data.matched === 1 ? '' : 's'}`];
				if (data.reused) parts.push(`${data.reused} from earlier matches`);
				if (data.unmatched) parts.push(`${data.unmatched} not found`);
				message = `${parts.join(', ')}.`;
				if (data.version_number !== null) await onChanged();
			}
		} catch {
			error = 'Network error. Are you online?';
		} finally {
			busy = false;
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
			message = '';
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

<h2>Nutrition</h2>

{#if result.matched > 0}
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
{:else}
	<p class="muted">Not calculated yet.</p>
{/if}

{#if counted.length > 0}
	<p class="coverage" class:partial={result.matched < result.counted}>
		{coverage}
	</p>
{/if}

{#if matchable > 0}
	<button type="button" class="btn" disabled={busy} onclick={calculate}>
		{busy ? 'Matching ingredients…' : result.matched > 0 ? 'Match the remaining ingredients' : 'Calculate nutrition'}
	</button>
{/if}
{#if message}<p class="muted note">{message}</p>{/if}
{#if error}<p class="error note">{error}</p>{/if}

{#if counted.length > 0}
	<details>
		<summary>Matched foods</summary>
		<ul class="matches">
			{#each counted as ing (ing.id)}
				{@const food = ing.food_id ? foods[ing.food_id] : undefined}
				<li>
					<div class="row match">
						<div class="who">
							<div class="name">{ing.name}</div>
							{#if food}
								<div class="muted food">{food.name} · {SOURCES[food.source]} · {formatNutrient('kcal', food.nutrients.kcal)} kcal/100 g</div>
							{:else}
								<div class="muted food">no match</div>
							{/if}
							{#if ing.grams === null}<div class="muted food">no weight, so it adds nothing</div>{/if}
						</div>
						<button type="button" class="btn small" onclick={() => startEdit(ing)}>{editing === ing.id ? 'Close' : 'Change'}</button>
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
								{#if food}
									<button type="button" class="btn small" disabled={saving} onclick={() => setFood(ing.id, null)}>Remove match</button>
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
		<p class="muted food">Changing a match saves a new version of the recipe. Optional ingredients are not counted.</p>
	</details>
{/if}

<style>
	.table-wrap {
		overflow-x: auto;
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
		margin: 10px 0;
		font-size: 0.9rem;
		color: var(--muted);
	}
	.coverage.partial {
		padding: 6px 10px;
		border: 1px solid var(--warn-border);
		background: var(--warn-bg);
		border-radius: 8px;
		color: var(--text);
	}
	.note {
		margin: 8px 0 0;
	}
	details {
		margin-top: 12px;
	}
	summary {
		cursor: pointer;
		padding: 6px 0;
	}
	.matches,
	.candidates {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.matches > li,
	.candidates > li {
		padding: 8px 0;
		border-bottom: 1px solid var(--border);
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
