<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		title,
		onClose,
		children
	}: {
		title: string;
		onClose: () => void;
		children: Snippet;
	} = $props();

	onMount(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') onClose();
		}
		window.addEventListener('keydown', onKey);
		const overflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			window.removeEventListener('keydown', onKey);
			document.body.style.overflow = overflow;
		};
	});
</script>

<!-- A screen laid over the page for one short task: pick something, then it closes. -->
<div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
	<div class="top">
		<button type="button" class="icon-btn" aria-label="Close" onclick={onClose}><Icon name="close" size={24} /></button>
		<div class="title">{title}</div>
	</div>
	<div class="body">
		{@render children()}
	</div>
</div>

<style>
	.sheet {
		position: fixed;
		inset: 0;
		z-index: 30;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		padding-top: env(safe-area-inset-top);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 56px;
		/* Lines up with the page column on wide screens. */
		padding: 6px max(8px, calc(50% - 372px));
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.top .icon-btn {
		color: var(--text);
	}
	.title {
		min-width: 0;
		font-weight: 700;
		font-size: 1.05rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: 12px max(16px, calc(50% - 364px)) calc(24px + env(safe-area-inset-bottom));
	}
</style>
