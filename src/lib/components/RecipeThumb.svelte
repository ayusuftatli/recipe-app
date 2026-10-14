<script lang="ts">
	import { photoUrl } from '$lib/format';

	let {
		title,
		photo,
		size = 48
	}: {
		title: string;
		/** Photo name. Without one the thumb shows the title's first letter. */
		photo: string | null;
		size?: number;
	} = $props();

	const initial = $derived(([...title.trim()][0] ?? '?').toUpperCase());
</script>

{#if photo}
	<img class="thumb" src={photoUrl(photo, 'thumb')} alt="" loading="lazy" width={size} height={size} />
{:else}
	<span class="thumb letter" style:width="{size}px" style:height="{size}px" style:font-size="{size * 0.45}px" aria-hidden="true">{initial}</span>
{/if}

<style>
	.thumb {
		display: block;
		flex-shrink: 0;
		border-radius: 10px;
		object-fit: cover;
	}
	.letter {
		display: grid;
		place-items: center;
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 700;
		line-height: 1;
	}
</style>
