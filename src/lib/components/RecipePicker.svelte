<script lang="ts">
	import { onMount } from 'svelte';
	import type { RecipeSummary } from '$lib/types';
	import Icon from './Icon.svelte';
	import RecipeThumb from './RecipeThumb.svelte';
	import Sheet from './Sheet.svelte';

	let {
		title,
		onPick,
		onClose,
		busy = false,
		error = ''
	}: {
		title: string;
		onPick: (recipe: RecipeSummary) => void;
		onClose: () => void;
		/** A pick is being saved: no second one meanwhile. */
		busy?: boolean;
		error?: string;
	} = $props();

	let recipes = $state<RecipeSummary[]>([]);
	let status = $state<'loading' | 'ready' | 'failed'>('loading');
	let q = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	// Answers can arrive out of order while typing; only the latest search counts.
	let latest = 0;

	async function search() {
		const mine = ++latest;
		try {
			const res = await fetch(`/api/recipes?q=${encodeURIComponent(q)}`);
			if (mine !== latest) return;
			if (!res.ok) throw new Error();
			recipes = (await res.json()) as RecipeSummary[];
			status = 'ready';
		} catch {
			if (mine === latest) status = 'failed';
		}
	}

	function onInput() {
		clearTimeout(timer);
		timer = setTimeout(search, 200);
	}

	onMount(() => {
		void search();
		return () => clearTimeout(timer);
	});
</script>

<Sheet {title} {onClose}>
	<div class="search">
		<Icon name="search" />
		<input type="search" placeholder="Search title or ingredient" bind:value={q} oninput={onInput} aria-label="Search recipes" />
	</div>
	{#if error}<p class="error" role="alert">{error}</p>{/if}

	{#if status === 'loading'}
		<p class="muted">Loading recipes…</p>
	{:else if status === 'failed'}
		<p class="error">The recipes could not be loaded. Are you online?</p>
	{:else if recipes.length === 0}
		<p class="muted">{q.trim() ? 'No recipes match.' : 'No recipes yet.'}</p>
	{:else}
		<ul>
			{#each recipes as r (r.id)}
				<li>
					<button type="button" disabled={busy} onclick={() => onPick(r)}>
						<RecipeThumb title={r.title} photo={r.photo_path} />
						<span class="text">
							<span class="name">{r.title}</span>
							{#if r.tags.length}<span class="tags muted">{r.tags.join(' · ')}</span>{/if}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</Sheet>

<style>
	.search {
		position: relative;
		margin-bottom: 8px;
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
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li button {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 64px;
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
	.text {
		min-width: 0;
	}
	.name {
		display: block;
		font-weight: 600;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.tags {
		display: block;
		font-size: 0.8rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
