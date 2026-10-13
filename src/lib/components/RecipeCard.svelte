<script lang="ts">
	let {
		href,
		title,
		tags,
		photo
	}: {
		href: string;
		title: string;
		tags: string[];
		/** Thumbnail URL. Without one the card shows the title's first letter. */
		photo?: string;
	} = $props();

	const initial = $derived(([...title.trim()][0] ?? '?').toUpperCase());
</script>

<a {href} class="recipe-card">
	{#if photo}
		<img src={photo} alt="" loading="lazy" width="400" height="400" />
	{:else}
		<div class="letter" aria-hidden="true">{initial}</div>
	{/if}
	<div class="meta">
		<div class="title">{title}</div>
		{#if tags.length}
			<div class="tags">{tags.join(' · ')}</div>
		{/if}
	</div>
</a>

<style>
	.recipe-card {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 14px;
		overflow: hidden;
		text-decoration: none;
		color: var(--text);
	}
	img,
	.letter {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 1;
		object-fit: cover;
	}
	.letter {
		display: grid;
		place-items: center;
		background: var(--accent-soft);
		color: var(--accent);
		font-size: 4rem;
		font-weight: 700;
		line-height: 1;
	}
	.meta {
		min-width: 0;
		padding: 10px 12px 12px;
	}
	.title {
		font-weight: 600;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.tags {
		margin-top: 2px;
		font-size: 0.8rem;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
