<script lang="ts">
	import { goto } from '$app/navigation';
	import { photoUrl } from '$lib/format';

	let { data } = $props();

	let timer: ReturnType<typeof setTimeout> | undefined;

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
	<p class="muted empty">
		{#if data.q || data.tag}No recipes match.{:else}No recipes yet. <a href="/recipes/new">Add your first one.</a>{/if}
	</p>
{:else}
	<ul class="list">
		{#each data.recipes as r (r.id)}
			<li>
				<a href="/recipes/{r.id}" class="item">
					{#if r.photo_path}
						<img src={photoUrl(r.photo_path, 'thumb')} alt="" loading="lazy" width="64" height="64" />
					{:else}
						<div class="ph" aria-hidden="true">🍽</div>
					{/if}
					<div class="meta">
						<div class="title">{r.title}</div>
						{#if r.tags.length}
							<div class="tags">{r.tags.join(' · ')}</div>
						{/if}
					</div>
				</a>
			</li>
		{/each}
	</ul>
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
	img,
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
	.meta {
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
</style>
