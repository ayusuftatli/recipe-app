<script lang="ts">
	import { formatDay } from '$lib/dates';
	import { AISLE_LABELS, AISLES, type Aisle, type GroceryItem, type GroceryList } from '$lib/grocery';
	import Icon from './Icon.svelte';

	let {
		list,
		onToggle,
		onStaple,
		onRemove,
		onTerm,
		busy = false
	}: {
		list: GroceryList;
		onToggle: (item: GroceryItem) => void;
		/** Omit where staples cannot be changed (offline): the buttons are then left out. */
		onStaple?: (item: GroceryItem, state: 'staple' | 'needed' | 'none') => void;
		/** Removes an item typed in by hand; omit where that is not possible. */
		onRemove?: (item: GroceryItem) => void;
		/** Saves the user's own name and shop section for an item; omit where that is not possible. Resolves to whether it worked. */
		onTerm?: (item: GroceryItem, canonical: string, aisle: Aisle) => Promise<boolean>;
		busy?: boolean;
	} = $props();

	/** The item whose details are open. */
	let open = $state<string | null>(null);
	/** The item whose name and section are being changed, with the form's values. */
	let editing = $state<{ key: string; name: string; aisle: Aisle } | null>(null);

	const toBuy = $derived(list.items.filter((i) => !i.checked));
	const ticked = $derived(list.items.filter((i) => i.checked));
	/** What is left to buy, by shop section in walking order. Without any sections yet, one plain list. */
	const sections = $derived.by(() => {
		if (toBuy.every((i) => i.aisle === 'other')) return [{ aisle: null, items: toBuy }];
		return AISLES.map((aisle) => ({ aisle, items: toBuy.filter((i) => i.aisle === aisle) })).filter((s) => s.items.length > 0);
	});

	function hasDetails(item: GroceryItem): boolean {
		return item.parts.length > 0 || onTerm !== undefined || (item.manual ? onRemove !== undefined : onStaple !== undefined);
	}

	function toggleDetails(item: GroceryItem) {
		open = open === item.key ? null : item.key;
		editing = null;
	}

	async function saveTerm(e: SubmitEvent, item: GroceryItem) {
		e.preventDefault();
		if (!onTerm || !editing || !editing.name.trim()) return;
		if (await onTerm(item, editing.name.trim(), editing.aisle)) {
			editing = null;
			open = null;
		}
	}
</script>

{#snippet rows(items: GroceryItem[])}
	<ul class="items card">
		{#each items as item (item.key)}
			<li class:done={item.checked}>
				<div class="line">
					<label>
						<input type="checkbox" checked={item.checked} onchange={() => onToggle(item)} />
						<span class="name">
							{item.name}
							{#if item.optional}<span class="badge">optional</span>{/if}
							{#if item.needed}<span class="badge">staple</span>{/if}
						</span>
						<span class="amount">
							{item.amount.text}
							{#if item.amount.weight}<span class="weight muted">{item.amount.weight}</span>{/if}
						</span>
					</label>
					{#if hasDetails(item)}
						<button
							type="button"
							class="icon-btn more"
							class:open={open === item.key}
							aria-expanded={open === item.key}
							aria-label="Details for {item.name}"
							onclick={() => toggleDetails(item)}
						>
							<Icon name="down" />
						</button>
					{/if}
				</div>
				{#if open === item.key}
					<div class="details">
						{#if item.parts.length > 0}
							<ul class="parts">
								{#each item.parts as part (part.entry_id)}
									<li>
										<span class="part-amount">{part.amount || '–'}</span>
										<span><a href="/recipes/{part.recipe_id}">{part.title}</a> <span class="muted">· {formatDay(part.date)}</span></span>
									</li>
								{/each}
							</ul>
						{/if}
						{#if editing?.key === item.key}
							<form class="term" onsubmit={(e) => saveTerm(e, item)}>
								{#if !item.manual}
									<label for="term-name">Name on the list</label>
									<input id="term-name" type="text" bind:value={editing.name} maxlength="80" required />
								{/if}
								<label for="term-aisle">Section of the shop</label>
								<select id="term-aisle" bind:value={editing.aisle}>
									{#each AISLES as a (a)}<option value={a}>{AISLE_LABELS[a]}</option>{/each}
								</select>
								<div class="row">
									<button type="submit" class="btn small primary" disabled={busy}>Save</button>
									<button type="button" class="btn small" disabled={busy} onclick={() => (editing = null)}>Cancel</button>
								</div>
							</form>
						{/if}
						<div class="row">
							{#if onTerm && editing?.key !== item.key}
								<button type="button" class="btn small" disabled={busy} onclick={() => (editing = { key: item.key, name: item.name, aisle: item.aisle })}>
									{item.manual ? 'Change section' : 'Change name or section'}
								</button>
							{/if}
							{#if item.manual && onRemove}
								<button type="button" class="btn small danger" disabled={busy} onclick={() => onRemove(item)}>Remove</button>
							{:else if !item.manual && onStaple}
								{#if item.needed}
									<button type="button" class="btn small" disabled={busy} onclick={() => onStaple(item, 'staple')}>Don't need it this time</button>
									<button type="button" class="btn small" disabled={busy} onclick={() => onStaple(item, 'none')}>Not a staple any more</button>
								{:else}
									<button type="button" class="btn small" disabled={busy} onclick={() => onStaple(item, 'staple')}>I always have this</button>
								{/if}
							{/if}
						</div>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

{#each sections as section (section.aisle)}
	{#if section.aisle}<h2>{AISLE_LABELS[section.aisle]}</h2>{/if}
	{@render rows(section.items)}
{/each}

{#if ticked.length > 0}
	<h2>Ticked off <span class="muted count">{ticked.length}</span></h2>
	{@render rows(ticked)}
{/if}

{#if list.staples.length > 0}
	<details class="staples">
		<summary>You have these <span class="muted count">{list.staples.length}</span> <Icon name="down" size={18} /></summary>
		<p class="muted hint">Staples the planned recipes use. They are left off the list.</p>
		<ul class="items card">
			{#each list.staples as item (item.key)}
				<li>
					<div class="line staple">
						<span class="name">{item.name}</span>
						<span class="amount muted">{item.amount.text}</span>
					</div>
					{#if onStaple}
						<div class="row staple-actions">
							<button type="button" class="btn small" disabled={busy} onclick={() => onStaple(item, 'needed')}>Need it this time</button>
							<button type="button" class="btn small" disabled={busy} onclick={() => onStaple(item, 'none')}>Not a staple</button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	</details>
{/if}

<style>
	h2,
	summary {
		margin: 20px 0 8px;
		font-size: 1rem;
		font-weight: 700;
		color: var(--muted);
	}
	summary {
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary :global(.icon) {
		transition: transform 0.15s;
	}
	details[open] summary :global(.icon) {
		transform: rotate(180deg);
	}
	.count {
		font-weight: 400;
	}
	.hint {
		margin: 0 0 8px;
		font-size: 0.9rem;
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 0 4px 0 14px;
	}
	.items > li {
		border-bottom: 1px solid var(--line);
	}
	.items > li:last-child {
		border-bottom: none;
	}
	.line {
		display: flex;
		align-items: center;
	}
	.line label {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 52px;
		margin: 0;
		padding: 8px 10px 8px 0;
		color: var(--text);
		font-size: 1rem;
		cursor: pointer;
	}
	input[type='checkbox'] {
		width: 26px;
		height: 26px;
		flex-shrink: 0;
		margin: 0;
		accent-color: var(--accent);
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.amount {
		flex-shrink: 0;
		max-width: 50%;
		text-align: right;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.weight {
		display: block;
		font-size: 0.85rem;
		font-weight: 400;
	}
	.done .name,
	.done .amount {
		color: var(--muted);
		text-decoration: line-through;
	}
	.more :global(.icon) {
		transition: transform 0.15s;
	}
	.more.open :global(.icon) {
		transform: rotate(180deg);
	}
	/* Lines up with the name, past the checkbox. */
	.details {
		padding: 0 10px 12px 38px;
	}
	.parts {
		list-style: none;
		margin: 0 0 10px;
		padding: 0;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 4px 12px;
		font-size: 0.9rem;
	}
	.parts li {
		display: grid;
		grid-template-columns: subgrid;
		grid-column: 1 / -1;
	}
	.part-amount {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.term {
		display: grid;
		gap: 4px;
		margin-bottom: 10px;
	}
	.term label {
		margin: 6px 0 0;
	}
	.term .row {
		margin-top: 8px;
	}
	.line.staple {
		gap: 12px;
		min-height: 44px;
		padding: 8px 10px 0 0;
	}
	.staple-actions {
		padding: 4px 10px 12px 0;
	}
</style>
