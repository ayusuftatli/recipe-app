<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	let { children } = $props();
</script>

{#if page.url.pathname !== '/login'}
	<header>
		<a class="brand" href="/">Recipe Box</a>
		<nav>
			<a href="/recipes/new" class="btn small primary">+ Add recipe</a>
			<a href="/settings" class="icon-btn" aria-label="Settings" title="Settings">⚙</a>
		</nav>
	</header>
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
	.brand {
		font-weight: 700;
		text-decoration: none;
		color: var(--text);
	}
	nav {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	nav .icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
	}
</style>
