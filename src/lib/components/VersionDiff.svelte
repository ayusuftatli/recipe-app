<script lang="ts">
	import type { IngredientField, LineOp, VersionDiff } from '$lib/diff';
	import { formatGrams, formatQty } from '$lib/format';
	import type { Ingredient } from '$lib/schema';

	let { diff }: { diff: VersionDiff } = $props();

	const FIELD_LABELS: Record<string, string> = {
		title: 'Title',
		servings: 'Servings',
		yield_g: 'Final weight (g)',
		source_url: 'Source URL'
	};

	function amount(i: Ingredient): string {
		const parts = [formatQty(i.qty), i.unit ?? ''].filter(Boolean).join(' ');
		const g = i.grams !== null ? ` (${formatGrams(i.grams)})` : '';
		return `${parts}${g}`.trim();
	}

	function fieldValue(i: Ingredient, f: IngredientField): string {
		switch (f) {
			case 'qty':
				return formatQty(i.qty) || '—';
			case 'grams':
				return i.grams === null ? '—' : formatGrams(i.grams);
			case 'optional':
				return i.optional ? 'yes' : 'no';
			default:
				return i[f] || '—';
		}
	}

	const changedLines = (ops: LineOp[]) => ops.some((o) => o.op !== 'same');
	const ing = $derived(diff.ingredients);
	const nothing = $derived(
		!diff.fields.length &&
			!ing.added.length &&
			!ing.removed.length &&
			!ing.changed.length &&
			!changedLines(diff.steps) &&
			!changedLines(diff.notes)
	);
</script>

{#if nothing}
	<p class="muted">No differences.</p>
{/if}

{#if diff.fields.length}
	<h3>Details</h3>
	<ul class="plain">
		{#each diff.fields as f (f.field)}
			<li>
				{FIELD_LABELS[f.field]}: <del>{f.before ?? '—'}</del> → <ins>{f.after ?? '—'}</ins>
			</li>
		{/each}
	</ul>
{/if}

{#if ing.added.length || ing.removed.length || ing.changed.length}
	<h3>Ingredients</h3>
	<ul class="plain">
		{#each ing.added as i (i.id)}
			<li class="add">+ {amount(i)} {i.name}</li>
		{/each}
		{#each ing.removed as i (i.id)}
			<li class="del">− {amount(i)} {i.name}</li>
		{/each}
		{#each ing.changed as c (c.after.id)}
			<li class="chg">
				<strong>{c.after.name}</strong>
				{#each c.fields as f (f)}
					<div class="field">{f}: <del>{fieldValue(c.before, f)}</del> → <ins>{fieldValue(c.after, f)}</ins></div>
				{/each}
			</li>
		{/each}
	</ul>
{/if}

{#snippet lines(title: string, ops: LineOp[])}
	{#if changedLines(ops)}
		<h3>{title}</h3>
		<div class="lines">
			{#each ops as o, i (i)}
				<div class={o.op}><span class="mark">{o.op === 'add' ? '+' : o.op === 'del' ? '−' : ' '}</span>{o.text}</div>
			{/each}
		</div>
	{/if}
{/snippet}

{@render lines('Steps', diff.steps)}
{@render lines('Notes', diff.notes)}

<style>
	.plain {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 4px;
	}
	.plain li,
	.lines > div {
		padding: 4px 8px;
		border-radius: 6px;
	}
	.add {
		background: var(--add-bg);
	}
	.del {
		background: var(--del-bg);
	}
	.chg {
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.field {
		font-size: 0.9rem;
	}
	del {
		color: var(--danger);
	}
	ins {
		text-decoration: none;
		font-weight: 600;
	}
	.lines {
		display: grid;
		gap: 2px;
		white-space: pre-wrap;
	}
	.lines .same {
		color: var(--muted);
	}
	.mark {
		display: inline-block;
		width: 1.2em;
		font-weight: 700;
	}
</style>
