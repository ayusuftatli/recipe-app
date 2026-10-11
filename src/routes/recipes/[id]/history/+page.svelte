<script lang="ts">
	import VersionDiff from '$lib/components/VersionDiff.svelte';
	import { formatDate } from '$lib/format';

	let { data } = $props();
</script>

<svelte:head><title>History · {data.recipe.current.title}</title></svelte:head>

<p class="back"><a href="/recipes/{data.recipe.id}">← {data.recipe.current.title}</a></p>
<h1>Version history</h1>

<form method="GET" class="compare">
	<p class="muted">Pick two versions (A and B) to compare.</p>
	<ul class="timeline">
		{#each data.versions as v (v.id)}
			<li class="card">
				<div class="pick">
					<label><input type="radio" name="a" value={v.version_number} checked={v.version_number === data.a} /> A</label>
					<label><input type="radio" name="b" value={v.version_number} checked={v.version_number === data.b} /> B</label>
				</div>
				<a href="/recipes/{data.recipe.id}/v/{v.version_number}" class="info">
					<strong>v{v.version_number}</strong>
					{#if v.version_number === data.recipe.current.version_number}<span class="badge">current</span>{/if}
					<div class="muted date">{formatDate(v.created_at)}</div>
					{#if v.change_note}<div>{v.change_note}</div>{/if}
				</a>
			</li>
		{/each}
	</ul>
	{#if data.versions.length > 1}
		<button class="btn" type="submit">Compare</button>
	{/if}
</form>

{#if data.diff}
	<h2>v{data.a} → v{data.b}</h2>
	<VersionDiff diff={data.diff} />
{:else if data.versions.length > 1}
	<p class="muted">Choose two different versions.</p>
{/if}

<style>
	.back {
		margin: 12px 0 0;
	}
	.timeline {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.timeline li {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}
	.pick {
		display: grid;
		gap: 4px;
	}
	.pick label {
		display: flex;
		align-items: center;
		gap: 4px;
		margin: 0;
		min-height: 32px;
	}
	.info {
		flex: 1;
		color: var(--text);
		text-decoration: none;
	}
	.date {
		font-size: 0.85rem;
	}
</style>
