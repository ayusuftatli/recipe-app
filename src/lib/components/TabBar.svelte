<script lang="ts">
	import Icon, { type IconName } from './Icon.svelte';

	let { tabs }: { tabs: { href: string; label: string; icon: IconName; current: boolean }[] } = $props();
</script>

<!-- The top-level sections, at the bottom of the screen. Pages keep clear of it through --tabbar (app.css). -->
<nav class="tabbar" aria-label="Sections">
	{#each tabs as tab (tab.href)}
		<a href={tab.href} class:current={tab.current} aria-current={tab.current ? 'page' : undefined}>
			<Icon name={tab.icon} size={22} />
			{tab.label}
		</a>
	{/each}
</nav>

<style>
	.tabbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 10;
		display: flex;
		padding: 0 max(8px, calc(50% - 372px)) env(safe-area-inset-bottom);
		background: var(--surface);
		border-top: 1px solid var(--border);
	}
	a {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		height: 58px;
		color: var(--muted);
		font-size: 0.75rem;
		font-weight: 600;
		text-decoration: none;
	}
	a.current {
		color: var(--accent);
	}
</style>
