<script lang="ts">
	import { onMount } from 'svelte';
	import RecipeView from '$lib/components/RecipeView.svelte';
	import { loadOffline } from '$lib/offline';
	import { filterRecipes, OFFLINE_PATH, tagsOf } from '$lib/offline-view';
	import type { RecipeDetail } from '$lib/types';

	let recipes = $state<RecipeDetail[]>([]);
	/** Object URLs of the stored thumbnails, by photo name. */
	let thumbs = $state<Record<string, string>>({});
	let status = $state<'loading' | 'ready' | 'failed'>('loading');
	let q = $state('');
	let tag = $state('');
	/** The open recipe; lives in the URL hash so Back returns to the list. */
	let id = $state('');

	const tags = $derived(tagsOf(recipes));
	const shown = $derived(filterRecipes(recipes, q, tag));
	const recipe = $derived(recipes.find((r) => r.id === id));

	onMount(() => {
		const readHash = () => {
			id = decodeURIComponent(location.hash.slice(1));
			window.scrollTo(0, 0);
		};
		readHash();
		window.addEventListener('hashchange', readHash);

		const urls: string[] = [];
		loadOffline()
			.then((copy) => {
				recipes = copy.recipes;
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
{:else if id}
	<p class="back">
		<a
			href={OFFLINE_PATH}
			onclick={(e) => {
				e.preventDefault();
				location.hash = '';
			}}>← All recipes</a
		>
	</p>
	{#if recipe}
		{@const thumb = recipe.photo_path ? thumbs[recipe.photo_path] : undefined}
		{#if thumb}<img class="hero" src={thumb} alt="" />{/if}
		<h1>{recipe.current.title}</h1>
		<div class="row meta">
			<span class="badge">v{recipe.current.version_number}</span>
			{#each recipe.tags as t (t)}<span class="chip">{t}</span>{/each}
		</div>
		{#key recipe.current.id}
			<RecipeView version={recipe.current} scalable />
		{/key}
	{:else}
		<p class="muted empty">This recipe is not saved on this device.</p>
	{/if}
{:else if recipes.length === 0}
	<p class="muted empty">No recipes are saved on this device yet. Open the app once while online and they will be here next time.</p>
{:else}
	<div class="search">
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
		<ul class="list">
			{#each shown as r (r.id)}
				{@const thumb = r.photo_path ? thumbs[r.photo_path] : undefined}
				<li>
					<a href="#{r.id}" class="item">
						{#if thumb}
							<img src={thumb} alt="" width="64" height="64" />
						{:else}
							<div class="ph" aria-hidden="true">🍽</div>
						{/if}
						<div class="info">
							<div class="title">{r.current.title}</div>
							{#if r.tags.length}<div class="tags">{r.tags.join(' · ')}</div>{/if}
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	.search {
		margin-top: 12px;
	}
	.chips {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding: 10px 0 4px;
		scrollbar-width: none;
	}
	.chips .chip {
		cursor: pointer;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 8px 0 0;
		display: grid;
		gap: 8px;
	}
	.item {
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 8px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--text);
	}
	.item img,
	.ph {
		width: 64px;
		height: 64px;
		border-radius: 8px;
		object-fit: cover;
		flex-shrink: 0;
	}
	.ph {
		display: grid;
		place-items: center;
		background: var(--bg);
		font-size: 1.5rem;
	}
	.info {
		min-width: 0;
	}
	.title {
		font-weight: 600;
	}
	.tags {
		font-size: 0.85rem;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.empty {
		margin-top: 32px;
		text-align: center;
	}
	.back {
		margin: 12px 0 0;
	}
	.hero {
		display: block;
		width: calc(100% + 32px);
		margin: 12px -16px 0;
		max-height: 50vh;
		object-fit: cover;
	}
	.meta {
		margin-bottom: 4px;
	}
</style>
