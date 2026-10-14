<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { clearOffline } from '$lib/offline';

	let { data, form } = $props();
	let confirming = $state<string | null>(null);

	// Logging out also removes the recipes kept on this device for offline use.
	async function logout(e: SubmitEvent) {
		e.preventDefault();
		const form = e.currentTarget as HTMLFormElement;
		await clearOffline().catch(() => {});
		form.submit();
	}

	// ---- Restore from a JSON backup ----
	let backupFile = $state<File | null>(null);
	let restoring = $state(false);
	/** The server said there is data already: ask before replacing it. */
	let confirmReplace = $state(false);
	let restoreMessage = $state('');
	let restoreError = $state('');

	async function restore(force: boolean) {
		if (!backupFile) return;
		restoring = true;
		restoreMessage = '';
		restoreError = '';
		try {
			const res = await fetch(`/api/import${force ? '?force=true' : ''}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: await backupFile.text()
			});
			const data = (await res.json().catch(() => null)) as
				| { message?: string; recipes?: number; versions?: number; foods?: number; plan?: number; photos_missing?: number }
				| null;
			if (res.status === 409 && !force) {
				confirmReplace = true;
			} else if (!res.ok || !data) {
				restoreError = data?.message ?? `Restore failed (${res.status})`;
			} else {
				confirmReplace = false;
				backupFile = null;
				restoreMessage =
					`Restored ${data.recipes} recipes, ${data.versions} versions, ${data.foods} foods and ${data.plan} planned meals.` +
					(data.photos_missing ? ` ${data.photos_missing} recipes came back without their photo (photos are not in the backup).` : '');
				await invalidateAll();
			}
		} catch {
			restoreError = 'Network error. Are you online?';
		} finally {
			restoring = false;
		}
	}
</script>

<svelte:head><title>Settings · Recipe Box</title></svelte:head>

<h1 class="sr-only">Settings</h1>

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

<h2>Backup</h2>
<p class="muted hint">The JSON file holds all recipes, versions and foods, the meal plan and the grocery list. Photos are not included.</p>
<div class="row">
	<a class="btn" href="/api/export" download>Download backup (JSON)</a>
	<a class="btn" href="/api/export/db" download>Download database</a>
</div>

<h3>Restore</h3>
<div class="restore">
	<input
		type="file"
		accept="application/json,.json"
		aria-label="Backup file to restore"
		onchange={(e) => {
			backupFile = e.currentTarget.files?.[0] ?? null;
			confirmReplace = false;
			restoreMessage = '';
			restoreError = '';
		}}
	/>
	{#if backupFile && !confirmReplace}
		<button class="btn" type="button" disabled={restoring} onclick={() => restore(false)}>
			{restoring ? 'Restoring…' : 'Restore from this file'}
		</button>
	{/if}
	{#if confirmReplace}
		<div class="card warn">
			<p>There is already data here. Restoring <strong>replaces all recipes, versions and foods, the meal plan and the grocery list</strong> with the contents of the file.</p>
			<div class="row">
				<button class="btn danger" type="button" disabled={restoring} onclick={() => restore(true)}>
					{restoring ? 'Restoring…' : 'Replace everything'}
				</button>
				<button class="btn" type="button" disabled={restoring} onclick={() => (confirmReplace = false)}>Cancel</button>
			</div>
		</div>
	{/if}
	{#if restoreMessage}<p class="muted">{restoreMessage}</p>{/if}
	{#if restoreError}<p class="error">{restoreError}</p>{/if}
</div>

<h2>Session</h2>
<form method="POST" action="/logout" onsubmit={logout}>
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
	.hint {
		margin-top: 0;
		font-size: 0.9rem;
	}
	.restore {
		display: grid;
		gap: 8px;
		justify-items: start;
	}
	.restore input {
		max-width: 100%;
	}
	.warn {
		background: var(--warn-bg);
		border-color: var(--warn-border);
	}
	.warn p {
		margin: 0 0 10px;
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
