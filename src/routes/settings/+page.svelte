<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let confirming = $state<string | null>(null);
</script>

<svelte:head><title>Settings · Recipe Box</title></svelte:head>

<h1>Settings</h1>

<h2>Archived recipes</h2>
{#if data.archived.length === 0}
	<p class="muted">Nothing archived.</p>
{:else}
	<ul class="list">
		{#each data.archived as r (r.id)}
			<li class="card">
				<div class="row head">
					<a href="/recipes/{r.id}">{r.title}</a>
					<div class="row">
						<form method="POST" action="?/unarchive" use:enhance>
							<input type="hidden" name="id" value={r.id} />
							<button class="btn small" type="submit">Unarchive</button>
						</form>
						<button class="btn small danger" type="button" onclick={() => (confirming = confirming === r.id ? null : r.id)}>
							Delete…
						</button>
					</div>
				</div>
				{#if confirming === r.id}
					<form method="POST" action="?/delete" use:enhance class="confirm">
						<input type="hidden" name="id" value={r.id} />
						<label for="confirm-{r.id}">
							This permanently deletes the recipe, all {r.version_number} version(s) and its photo. Type
							<strong>{r.title}</strong> to confirm.
						</label>
						<input id="confirm-{r.id}" name="confirm" type="text" autocomplete="off" />
						{#if form?.id === r.id && form?.error}<p class="error">{form.error}</p>{/if}
						<button class="btn danger" type="submit">Delete permanently</button>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<h2>Session</h2>
<form method="POST" action="/logout">
	<button class="btn" type="submit">Log out</button>
</form>

<style>
	.list {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.head {
		justify-content: space-between;
	}
	.confirm {
		display: grid;
		gap: 8px;
		margin-top: 12px;
	}
	.confirm label {
		color: var(--text);
	}
</style>
