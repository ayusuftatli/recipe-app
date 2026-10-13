<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import { photoUrl } from '$lib/format';

	let { data } = $props();

	let timer: ReturnType<typeof setTimeout> | undefined;

	const filtered = $derived(Boolean(data.q || data.tag));

	function href(params: { q?: string; tag?: string }): string {
		const sp = new URLSearchParams();
		if (params.q) sp.set('q', params.q);
		if (params.tag) sp.set('tag', params.tag);
		const s = sp.toString();
		return s ? `/?${s}` : '/';
	}

	function onSearch(e: Event) {
		const q = (e.currentTarget as HTMLInputElement).value;
		clearTimeout(timer);
		timer = setTimeout(() => {
			goto(href({ q, tag: data.tag }), { replaceState: true, keepFocus: true, noScroll: true });
		}, 200);
	}
</script>

<svelte:head><title>Recipe Box</title></svelte:head>

<form class="search" method="GET" action="/" onsubmit={(e) => e.preventDefault()}>
	<Icon name="search" />
	<input type="search" name="q" placeholder="Search title or ingredient" value={data.q} oninput={onSearch} aria-label="Search" />
	{#if data.tag}<input type="hidden" name="tag" value={data.tag} />{/if}
</form>

{#if data.tags.length}
	<div class="chips">
		<a class="chip" class:active={!data.tag} href={href({ q: data.q })}>All</a>
		{#each data.tags as t (t)}
			<a class="chip" class:active={data.tag === t} href={href({ q: data.q, tag: data.tag === t ? '' : t })}>{t}</a>
		{/each}
	</div>
{/if}

{#if data.recipes.length === 0}
	{#if filtered}
		<p class="muted empty">No recipes match.</p>
	{:else}
		<div class="empty">
			<h1>No recipes yet</h1>
			<p class="muted">Paste a link, snap a photo of a recipe card, or type one in.</p>
			<a class="btn primary" href="/recipes/new"><Icon name="plus" /> Add your first recipe</a>
		</div>
	{/if}
{:else}
	<p class="count muted" aria-live="polite">{data.recipes.length} {data.recipes.length === 1 ? 'recipe' : 'recipes'}</p>
	<ul class="grid">
		{#each data.recipes as r (r.id)}
			<li>
				<RecipeCard href="/recipes/{r.id}" title={r.title} tags={r.tags} photo={r.photo_path ? photoUrl(r.photo_path, 'thumb') : undefined} />
			</li>
		{/each}
	</ul>
{/if}

{#if data.recipes.length > 0 || filtered}
	<a class="fab" href="/recipes/new"><Icon name="plus" /> Add recipe</a>
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
	.search input[type='search'] {
		min-height: 48px;
		padding-left: 44px;
		border-radius: 12px;
	}
	.chips {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		/* Bleeds to the screen edge so a cut-off chip shows there is more to scroll to. */
		margin: 0 -16px;
		padding: 12px 16px 4px;
		scrollbar-width: none;
	}
	.chips .chip {
		min-height: 36px;
	}
	.count {
		margin: 10px 0 8px;
		font-size: 0.9rem;
	}
	.grid {
		list-style: none;
		padding: 0;
		margin: 0;
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
		margin-top: 48px;
		text-align: center;
	}
	.empty h1 {
		margin-top: 0;
	}
	.empty .btn {
		margin-top: 8px;
	}
	/* Floats over the list within thumb reach, in line with the page column. */
	.fab {
		position: fixed;
		right: max(16px, calc(50% - 364px));
		bottom: calc(20px + env(safe-area-inset-bottom));
		z-index: 10;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 52px;
		padding: 0 20px 0 16px;
		border-radius: 999px;
		background: var(--accent);
		color: var(--accent-text);
		font-weight: 600;
		text-decoration: none;
		box-shadow: var(--shadow);
	}
</style>
