<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { syncOffline } from '$lib/offline';
	import { OFFLINE_PATH, offlineHref } from '$lib/offline-view';

	let { children } = $props();

	const path = $derived(page.url.pathname);
	const offlinePage = $derived(path === OFFLINE_PATH);
	let online = $state(true);

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
	afterNavigate(() => {
		if (navigator.onLine && path !== '/login' && !offlinePage) syncOffline().catch(() => {});
	});

	// Pages need the server; without a connection, show the offline copy instead.
	beforeNavigate((nav) => {
		if (navigator.onLine || nav.willUnload || !nav.to || nav.to.url.pathname === OFFLINE_PATH) return;
		nav.cancel();
		location.href = offlineHref(nav.to.url.pathname);
	});
</script>

{#if path !== '/login'}
	<header>
		<a class="brand" href={offlinePage ? OFFLINE_PATH : '/'}>Recipe Box</a>
		{#if !offlinePage}
			<nav>
				<a href="/recipes/new" class="btn small primary">+ Add recipe</a>
				<a href="/settings" class="icon-btn" aria-label="Settings" title="Settings">⚙</a>
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
		justify-content: space-between;
		padding: 8px 16px;
		padding-top: calc(8px + env(safe-area-inset-top));
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
		font-weight: 700;
		text-decoration: none;
		color: var(--text);
	}
	nav {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	nav .icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		font-size: 1.7rem;
		line-height: 1;
		color: var(--text);
		text-decoration: none;
	}
</style>
