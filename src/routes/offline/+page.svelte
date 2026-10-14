<script lang="ts">
	import { onMount } from 'svelte';
	import GroceryList from '$lib/components/GroceryList.svelte';
	import GroceryRangeChips from '$lib/components/GroceryRangeChips.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import RecipeView from '$lib/components/RecipeView.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import { formatDay, localDay } from '$lib/dates';
	import { formatQty } from '$lib/format';
	import { buildGroceryList, mergeChecks, rangeEnd, type GroceryCheck, type GroceryData, type GroceryItem, type GroceryRange } from '$lib/grocery';
	import { flushChecks, loadOffline, queueCheck } from '$lib/offline';
	import { filterRecipes, OFFLINE_GROCERIES, OFFLINE_PATH, OFFLINE_PLAN, tagsOf } from '$lib/offline-view';
	import type { PlanEntry, RecipeDetail } from '$lib/types';

	let recipes = $state<RecipeDetail[]>([]);
	let plan = $state<PlanEntry[]>([]);
	let grocery = $state<GroceryData | null>(null);
	/** Ticks made on this device that the server does not have yet. */
	let pending = $state<GroceryCheck[]>([]);
	let range = $state<GroceryRange>('all');
	let today = $state('');
	let tickError = $state('');
	/** Object URLs of the stored thumbnails, by photo name. */
	let thumbs = $state<Record<string, string>>({});
	let status = $state<'loading' | 'ready' | 'failed'>('loading');
	let q = $state('');
	let tag = $state('');
	/** The open recipe, or the plan or grocery view; lives in the URL hash so Back returns to the list. */
	let id = $state('');

	const view = $derived(id === '' ? 'recipes' : id === OFFLINE_PLAN ? 'plan' : id === OFFLINE_GROCERIES ? 'groceries' : 'recipe');
	const tags = $derived(tagsOf(recipes));
	const shown = $derived(filterRecipes(recipes, q, tag));
	const recipe = $derived(recipes.find((r) => r.id === id));

	const list = $derived(
		grocery && today
			? buildGroceryList({ ...grocery, checks: mergeChecks(grocery.checks, pending) }, { from: today, through: rangeEnd(range, today) })
			: null
	);
	const toBuy = $derived(list?.items.filter((i) => !i.checked).length ?? 0);

	/** The plan from today on, day by day. */
	const days = $derived.by(() => {
		const byDay = new Map<string, PlanEntry[]>();
		for (const e of plan) {
			if (e.date < today) continue;
			const entries = byDay.get(e.date);
			if (entries) entries.push(e);
			else byDay.set(e.date, [e]);
		}
		return [...byDay].map(([date, entries]) => ({ date, entries }));
	});
	const saved = $derived(new Set(recipes.map((r) => r.id)));

	// The one thing that can be changed offline: the tick is kept on the device and sent when there is a connection.
	async function toggle(item: GroceryItem) {
		const tick: GroceryCheck = { key: item.key, sig: item.sig, checked: !item.checked, at: new Date().toISOString() };
		const before = pending;
		pending = [...pending.filter((t) => t.key !== tick.key), tick];
		tickError = '';
		try {
			await queueCheck(tick);
		} catch {
			pending = before;
			tickError = 'The tick could not be saved on this device.';
			return;
		}
		// In case there is a connection after all.
		flushChecks().catch(() => {});
	}

	onMount(() => {
		const readHash = () => {
			id = decodeURIComponent(location.hash.slice(1));
			window.scrollTo(0, 0);
		};
		readHash();
		window.addEventListener('hashchange', readHash);
		today = localDay(new Date());

		const urls: string[] = [];
		loadOffline()
			.then((copy) => {
				recipes = copy.recipes;
				plan = copy.plan;
				grocery = copy.grocery;
				pending = copy.pending;
				const map: Record<string, string> = {};
				for (const [name, blob] of copy.thumbs) {
					const url = URL.createObjectURL(blob);
					urls.push(url);
					map[name] = url;
				}
				thumbs = map;
				status = 'ready';
			})
			.catch(() => (status = 'failed'));

		return () => {
			window.removeEventListener('hashchange', readHash);
			urls.forEach((u) => URL.revokeObjectURL(u));
		};
	});
</script>

<svelte:head><title>{recipe ? `${recipe.current.title} · ` : ''}Recipe Box (offline)</title></svelte:head>

{#if status === 'loading'}
	<p class="muted empty">Loading saved recipes…</p>
{:else if status === 'failed'}
	<p class="muted empty">The recipes saved on this device could not be read.</p>
{:else if view === 'groceries'}
	<h1 class="sr-only">Grocery list</h1>
	{#if !list}
		<p class="muted empty">The grocery list is not saved on this device yet. Open the app once while online and it will be here next time.</p>
	{:else if list.items.length === 0 && list.staples.length === 0}
		<p class="muted empty">Nothing to buy.</p>
	{:else}
		<GroceryRangeChips bind:range />
		<p class="count muted" aria-live="polite">
			{#if toBuy === 0 && list.items.length > 0}Everything is ticked off.{:else}{toBuy} to buy{/if}
		</p>
		{#if tickError}<p class="error" role="alert">{tickError}</p>{/if}
		<GroceryList {list} onToggle={toggle} />
		<p class="muted note">Ticks are kept on this device and sent when you are back online. Everything else on the list needs a connection.</p>
	{/if}
{:else if view === 'plan'}
	<h1 class="sr-only">Meal plan</h1>
	{#if days.length === 0}
		<p class="muted empty">Nothing is planned from today on, as far as this device knows.</p>
	{:else}
		<ul class="days">
			{#each days as day (day.date)}
				<li class="card">
					<h2>{formatDay(day.date, 'long')}{#if day.date === today}<span class="badge">Today</span>{/if}</h2>
					<ul class="entries">
						{#each day.entries as entry (entry.id)}
							{@const servings = entry.servings ?? entry.recipe_servings}
							<li>
								{#if saved.has(entry.recipe_id)}<a href="#{entry.recipe_id}">{entry.title}</a>{:else}<span>{entry.title}</span>{/if}
								<span class="muted">{servings === null ? 'as written' : `${formatQty(servings)} ${servings === 1 ? 'serving' : 'servings'}`}</span>
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ul>
	{/if}
{:else if id}
	<p class="back">
		<a
			class="link-btn"
			href={OFFLINE_PATH}
			onclick={(e) => {
				e.preventDefault();
				location.hash = '';
			}}><Icon name="back" size={18} /> All recipes</a
		>
	</p>
	{#if recipe}
		{@const thumb = recipe.photo_path ? thumbs[recipe.photo_path] : undefined}
		{#if thumb}<img class="hero" src={thumb} alt="" />{/if}
		<h1>{recipe.current.title}</h1>
		<div class="row meta">
			{#each recipe.tags as t (t)}<span class="chip">{t}</span>{/each}
			<span class="muted version">Version {recipe.current.version_number}</span>
		</div>
		{#key recipe.current.id}
			<RecipeView version={recipe.current} scalable pinCook />
		{/key}
	{:else}
		<p class="muted empty">This recipe is not saved on this device.</p>
	{/if}
{:else if recipes.length === 0}
	<p class="muted empty">No recipes are saved on this device yet. Open the app once while online and they will be here next time.</p>
{:else}
	<div class="search">
		<Icon name="search" />
		<input type="search" placeholder="Search title or ingredient" bind:value={q} aria-label="Search" />
	</div>
	{#if tags.length}
		<div class="chips">
			<button type="button" class="chip" class:active={!tag} onclick={() => (tag = '')}>All</button>
			{#each tags as t (t)}
				<button type="button" class="chip" class:active={tag === t} onclick={() => (tag = tag === t ? '' : t)}>{t}</button>
			{/each}
		</div>
	{/if}
	{#if shown.length === 0}
		<p class="muted empty">No recipes match.</p>
	{:else}
		<ul class="grid">
			{#each shown as r (r.id)}
				<li>
					<RecipeCard href="#{r.id}" title={r.current.title} tags={r.tags} photo={r.photo_path ? thumbs[r.photo_path] : undefined} />
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<!-- A recipe has its own bar at the bottom of the screen ("Start cooking"). -->
{#if status === 'ready' && view !== 'recipe'}
	<TabBar
		tabs={[
			{ href: '#', label: 'Recipes', icon: 'book', current: view === 'recipes' },
			{ href: `#${OFFLINE_PLAN}`, label: 'Plan', icon: 'calendar', current: view === 'plan' },
			{ href: `#${OFFLINE_GROCERIES}`, label: 'Groceries', icon: 'cart', current: view === 'groceries' }
		]}
	/>
{/if}

<style>
	.search {
		position: relative;
		margin-top: 12px;
	}
	.search :global(.icon) {
		position: absolute;
		left: 14px;
		top: 14px;
		color: var(--muted);
		pointer-events: none;
	}
	.search input {
		min-height: 48px;
		padding-left: 44px;
		border-radius: 12px;
	}
	.chips {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		margin: 0 -16px;
		padding: 12px 16px 4px;
		scrollbar-width: none;
	}
	.chips .chip {
		min-height: 36px;
		cursor: pointer;
	}
	.grid {
		list-style: none;
		padding: 0;
		margin: 12px 0 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
	}
	@media (min-width: 560px) {
		.grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	@media (min-width: 720px) {
		.grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
	.empty {
		margin-top: 32px;
		text-align: center;
	}
	.back {
		margin: 4px 0 0;
	}
	.hero {
		display: block;
		width: calc(100% + 32px);
		margin: 4px -16px 0;
		max-height: 50vh;
		object-fit: cover;
	}
	.version {
		margin-left: auto;
		font-size: 0.9rem;
	}
	.count {
		margin: 10px 0 8px;
		font-size: 0.9rem;
	}
	.note {
		margin-top: 20px;
		font-size: 0.9rem;
	}
	.days {
		list-style: none;
		margin: 12px 0 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.days h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 6px;
		font-size: 1.05rem;
	}
	.days h2 .badge {
		font-weight: 400;
	}
	.entries {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.entries li {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 0;
		border-top: 1px solid var(--line);
	}
	.entries li .muted {
		flex-shrink: 0;
		font-size: 0.9rem;
	}
</style>
