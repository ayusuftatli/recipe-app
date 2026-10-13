<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { syncOffline } from '$lib/offline';
	import { OFFLINE_PATH, offlineHref } from '$lib/offline-view';

	let { children } = $props();

	const path = $derived(page.url.pathname);
	const offlinePage = $derived(path === OFFLINE_PATH);
	let online = $state(true);

	const recipeHref = $derived(`/recipes/${page.params.id}`);
	/** Pages below the list get a back arrow to their parent and say where you are. */
	const sub = $derived.by((): { back: string; backLabel: string; label: string } | null => {
		switch (page.route.id) {
			case '/recipes/new':
				return { back: '/', backLabel: 'Back to recipes', label: 'New recipe' };
			case '/recipes/[id]':
				return { back: '/', backLabel: 'Back to recipes', label: '' };
			case '/recipes/[id]/edit':
				return { back: recipeHref, backLabel: 'Back to the recipe', label: 'Edit recipe' };
			case '/recipes/[id]/history':
				return { back: recipeHref, backLabel: 'Back to the recipe', label: 'Version history' };
			case '/recipes/[id]/v/[n]':
				return { back: `${recipeHref}/history`, backLabel: 'Back to the history', label: `Version ${page.params.n}` };
			case '/settings':
				return { back: '/', backLabel: 'Back to recipes', label: 'Settings' };
			default:
				return null;
		}
	});

	/** The page we just came from by following a link, so it is the previous history entry. */
	let cameFrom = $state<string | null>(null);

	onMount(() => {
		const update = () => (online = navigator.onLine);
		update();
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		return () => {
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
		};
	});

	// Every page shown while online refreshes the copy kept on this device for
	// offline use, so it also reflects a login or an edit made a moment ago.
	afterNavigate((nav) => {
		cameFrom = nav.from && nav.type !== 'popstate' && nav.type !== 'enter' ? nav.from.url.pathname : null;
		if (navigator.onLine && path !== '/login' && !offlinePage) syncOffline().catch(() => {});
	});

	// Pages need the server; without a connection, show the offline copy instead.
	beforeNavigate((nav) => {
		if (navigator.onLine || nav.willUnload || !nav.to || nav.to.url.pathname === OFFLINE_PATH) return;
		nav.cancel();
		location.href = offlineHref(nav.to.url.pathname);
	});

	// Going back in history, rather than to a fresh copy of the parent, keeps its search and scroll position.
	function goBack(e: MouseEvent) {
		if (!sub || cameFrom !== sub.back || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		e.preventDefault();
		history.back();
	}
</script>

{#if path !== '/login'}
	<header>
		{#if sub}
			<a class="icon-btn" href={sub.back} aria-label={sub.backLabel} onclick={goBack}><Icon name="back" size={24} /></a>
			<span class="where">{sub.label}</span>
		{:else}
			<a class="brand" href={offlinePage ? OFFLINE_PATH : '/'}>Recipe Box</a>
		{/if}
		{#if !offlinePage}
			<nav>
				{#if page.route.id === '/recipes/[id]' && !page.error}
					<a class="btn small" href="{recipeHref}/edit"><Icon name="edit" size={18} /> Edit</a>
				{:else if !sub}
					<a href="/settings" class="icon-btn" aria-label="Settings" title="Settings"><Icon name="settings" size={22} /></a>
				{/if}
			</nav>
		{/if}
	</header>
	{#if offlinePage || !online}
		<p class="offline-banner" role="status">
			Offline: read-only
			{#if !offlinePage}
				· <a href={offlineHref(path)}>Open saved recipes</a>
			{:else if online}
				· <a href="/" data-sveltekit-reload>Back online? Open the app</a>
			{/if}
		</p>
	{/if}
{/if}

<main>
	{@render children()}
</main>

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 56px;
		/* Lines up with the page column on wide screens. */
		padding: 6px max(8px, calc(50% - 372px));
		padding-top: calc(6px + env(safe-area-inset-top));
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.offline-banner {
		margin: 0;
		padding: 6px 16px;
		background: var(--warn-bg);
		border-bottom: 1px solid var(--warn-border);
		font-size: 0.9rem;
		text-align: center;
	}
	.brand {
		padding-left: 8px;
		font-weight: 700;
		font-size: 1.2rem;
		text-decoration: none;
		color: var(--text);
	}
	.where {
		min-width: 0;
		font-weight: 700;
		font-size: 1.05rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	header .icon-btn {
		color: var(--text);
	}
	nav {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: auto;
		padding-right: 4px;
	}
</style>
