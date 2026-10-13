<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
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
</style>
