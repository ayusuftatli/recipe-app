<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import GroceryList from '$lib/components/GroceryList.svelte';
	import GroceryRangeChips from '$lib/components/GroceryRangeChips.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { localDay } from '$lib/dates';
	import { buildGroceryList, mergeChecks, rangeEnd, type Aisle, type GroceryCheck, type GroceryItem, type GroceryRange } from '$lib/grocery';
	import { flushChecks, pendingChecks, queueCheck } from '$lib/offline';

	let { data } = $props();

	// The user's own calendar day; only the browser knows it.
	let today = $state<string | null>(null);
	let range = $state<GroceryRange>('all');
	const through = $derived(today === null ? null : rangeEnd(range, today));

	/**
	 * Ticks made on this device, shown at once. They go through the outbox kept
	 * on the device, so one made without a connection is sent when it is back.
	 */
	let ticks = $state<GroceryCheck[]>([]);
	onMount(() => {
		today = localDay(new Date());
		pendingChecks()
			.then((waiting) => (ticks = mergeChecks(waiting, ticks)))
			.catch(() => {});
	});
	const list = $derived(
		today === null ? null : buildGroceryList({ ...data.grocery, checks: mergeChecks(data.grocery.checks, ticks) }, { from: today, through })
	);
	const toBuy = $derived(list?.items.filter((i) => !i.checked).length ?? 0);
	const tickedCount = $derived((list?.items.length ?? 0) - toBuy);
	const planned = $derived(today !== null && data.grocery.contributions.some((c) => c.date >= (today ?? '')));

	let busy = $state(false);
	let error = $state('');
	let newItem = $state('');
	let finishing = $state(false);

	async function post(path: string, body: unknown, method: 'POST' | 'PUT' | 'DELETE' = 'POST'): Promise<boolean> {
		error = '';
		try {
			const res = await fetch(path, {
				method,
				headers: body === undefined ? undefined : { 'content-type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body)
			});
			if (!res.ok) throw new Error(`That did not work (${res.status}).`);
			return true;
		} catch (e) {
			error = e instanceof TypeError ? 'Network error. Are you online?' : e instanceof Error ? e.message : 'That did not work.';
			return false;
		}
	}

	/** For changes the list has to be loaded again for. */
	async function change(path: string, body: unknown, method: 'POST' | 'PUT' | 'DELETE' = 'POST'): Promise<boolean> {
		busy = true;
		const ok = await post(path, body, method);
		if (ok) await invalidateAll();
		busy = false;
		return ok;
	}

	async function toggle(item: GroceryItem) {
		const tick: GroceryCheck = { key: item.key, sig: item.sig, checked: !item.checked, at: new Date().toISOString() };
		ticks = [...ticks.filter((t) => t.key !== tick.key), tick];
		error = '';
		try {
			await queueCheck(tick);
		} catch {
			// No storage on this device (e.g. a private window): straight to the server, then.
			if (!(await post('/api/grocery/checks', { changes: [tick] }))) ticks = ticks.filter((t) => t !== tick);
			return;
		}
		try {
			if (!(await flushChecks())) error = 'The tick is saved on this device but could not be sent yet.';
		} catch {
			// No connection: it stays in the outbox and is sent when there is one.
		}
	}

	async function add(e: SubmitEvent) {
		e.preventDefault();
		const name = newItem.trim();
		if (name && (await change('/api/grocery/manual', { name }))) newItem = '';
	}

	// Naming and sorting runs on the server in the background; poll until it is done, then reload.
	let tidying = $state(false);
	$effect(() => {
		tidying = data.tidying;
	});
	$effect(() => {
		if (!tidying) return;
		const timer = setInterval(async () => {
			try {
				const res = await fetch('/api/grocery/terms');
				if (res.ok && ((await res.json()) as { running: boolean }).running) return;
			} catch {
				// Offline or the server is restarting: stop asking; the next visit picks it up.
			}
			tidying = false;
			await invalidateAll();
		}, 2000);
		return () => clearInterval(timer);
	});

	function setTerm(item: GroceryItem, canonical: string, aisle: Aisle): Promise<boolean> {
		return change('/api/grocery/terms', { names: item.names, canonical, aisle }, 'PUT');
	}

	async function finish() {
		if (today === null) return;
		if (await change('/api/grocery/finish', { from: today, through })) {
			ticks = [];
			finishing = false;
		}
	}
</script>

<svelte:head><title>Groceries · Recipe Box</title></svelte:head>

<h1 class="sr-only">Grocery list</h1>

<form class="add" onsubmit={add}>
	<input type="text" bind:value={newItem} placeholder="Add an item" aria-label="Add an item" maxlength="200" enterkeyhint="done" />
	<button type="submit" class="btn" disabled={busy || !newItem.trim()}><Icon name="plus" size={18} /> Add</button>
</form>

{#if planned}
	<GroceryRangeChips bind:range />
{/if}

{#if error}<p class="error" role="alert">{error}</p>{/if}

{#if list}
	{#if list.items.length === 0 && list.staples.length === 0}
		<div class="empty">
			<h2>Nothing to buy</h2>
			<p class="muted">
				{planned ? 'Nothing is planned for these days.' : 'Put recipes on the plan and their ingredients show up here.'}
			</p>
			<a class="btn" href="/plan"><Icon name="calendar" size={18} /> Open the plan</a>
		</div>
	{:else}
		<p class="count muted" aria-live="polite">
			{#if toBuy === 0 && list.items.length > 0}Everything is ticked off.{:else}{toBuy} to buy{/if}
			{#if tidying}· sorting into shop sections…{/if}
		</p>
		<GroceryList
			{list}
			onToggle={toggle}
			onStaple={(item, state) => change('/api/grocery/staples', { key: item.key, name: item.name, state })}
			onRemove={(item) => change(`/api/grocery/manual/${item.key.slice('manual:'.length)}`, undefined, 'DELETE')}
			onTerm={setTerm}
			{busy}
		/>

		{#if list.items.length > 0}
			{#if finishing}
				<div class="card finish">
					<p>
						<strong>Finish this shop?</strong>
						{#if tickedCount > 0}What is ticked off goes.{/if}
						{#if toBuy > 0}What is not ticked stays on the list for next time.{/if}
						The planned recipes count as shopped for.
					</p>
					<div class="row">
						<button type="button" class="btn primary" disabled={busy} onclick={finish}>Finish</button>
						<button type="button" class="btn" disabled={busy} onclick={() => (finishing = false)}>Cancel</button>
					</div>
				</div>
			{:else}
				<button type="button" class="btn finish-btn" onclick={() => (finishing = true)}><Icon name="check" size={18} /> Finish shopping</button>
			{/if}
		{/if}
	{/if}
{/if}

<style>
	.add {
		display: flex;
		gap: 8px;
		margin-top: 12px;
	}
	.add input {
		min-height: 48px;
		border-radius: 12px;
	}
	.add .btn {
		min-height: 48px;
		border-radius: 12px;
	}
	.count {
		margin: 10px 0 8px;
		font-size: 0.9rem;
	}
	.empty {
		margin-top: 48px;
		text-align: center;
	}
	.empty h2 {
		margin-top: 0;
	}
	.finish-btn {
		width: 100%;
		margin-top: 24px;
		min-height: 52px;
	}
	.finish {
		margin-top: 24px;
	}
	.finish p {
		margin: 0 0 12px;
	}
</style>
