<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		exactGrams,
		ingredientsToRows,
		newHeadingRow,
		newIngredientRow,
		newStepRow,
		parseNumber,
		parseTags,
		rowsToIngredients,
		rowsToSteps,
		stepsToRows,
		type IngredientEditorRow,
		type IngredientRow,
		type StepEditorRow
	} from '$lib/editor';
	import { photoUrl } from '$lib/format';
	import { RecipeDraft } from '$lib/schema';

	interface Props {
		draft: RecipeDraft;
		tags: string[];
		allTags: string[];
		/** Present when editing an existing recipe. */
		recipeId?: string;
		photoPath?: string | null;
	}

	let { draft, tags, allTags, recipeId, photoPath = null }: Props = $props();

	// The form owns its state from here on; props only seed it.
	const seed = untrack(() => $state.snapshot(draft));
	let title = $state(seed.title);
	let servings = $state(seed.servings === null ? '' : String(seed.servings));
	let yieldG = $state(seed.yield_g === null ? '' : String(seed.yield_g));
	let notes = $state(seed.notes ?? '');
	let sourceUrl = $state(seed.source_url ?? '');
	let tagText = $state(untrack(() => tags.join(', ')));
	let ingRows = $state<IngredientEditorRow[]>(
		seed.ingredients.length ? ingredientsToRows(seed.ingredients) : [newIngredientRow()]
	);
	let stepRows = $state<StepEditorRow[]>(seed.steps.length ? stepsToRows(seed.steps) : [newStepRow()]);
	let changeNote = $state('');
	let photoFile = $state<File | null>(null);
	let removePhoto = $state(false);

	let errors = $state<string[]>([]);
	let rowErrors = $state<Record<string, string>>({});
	let saving = $state(false);

	const currentTags = $derived(parseTags(tagText));
	const suggestions = $derived(allTags.filter((t) => !currentTags.includes(t)));

	function addTag(t: string) {
		tagText = [...currentTags, t].join(', ');
	}

	function move<T>(list: T[], i: number, delta: number) {
		const j = i + delta;
		if (j < 0 || j >= list.length) return;
		[list[i], list[j]] = [list[j]!, list[i]!];
	}

	function onQtyOrUnitChange(row: IngredientRow) {
		const g = exactGrams(parseNumber(row.qty) ?? null, row.unit);
		if (g !== null) {
			row.grams = String(g);
			row.grams_estimated = false;
		}
	}

	function onGramsInput(row: IngredientRow) {
		// A weight typed by hand is no longer an estimate.
		row.grams_estimated = false;
	}

	function needsAttention(row: IngredientRow): boolean {
		return row.name.trim() !== '' && (row.grams.trim() === '' || row.grams_estimated);
	}

	function optionalNumber(label: string, input: string, errs: string[]): number | null {
		const n = parseNumber(input);
		if (n === undefined || (n !== null && n <= 0)) {
			errs.push(`${label}: “${input}” is not a positive number`);
			return null;
		}
		return n;
	}

	async function save() {
		const errs: string[] = [];
		const { ingredients, errors: ingErrors } = rowsToIngredients($state.snapshot(ingRows));
		rowErrors = Object.fromEntries(ingErrors.map((e) => [e.key, e.message]));
		if (ingErrors.length) errs.push('Fix the highlighted ingredients.');

		const candidate = {
			title: title.trim(),
			servings: optionalNumber('Servings', servings, errs),
			yield_g: optionalNumber('Final weight', yieldG, errs),
			ingredients,
			steps: rowsToSteps($state.snapshot(stepRows)),
			notes: notes.trim() || undefined,
			source_url: sourceUrl.trim() || undefined
		};
		const parsed = RecipeDraft.safeParse(candidate);
		if (!parsed.success) {
			for (const issue of parsed.error.issues) {
				errs.push(issue.path[0] === 'title' ? 'Title is required.' : `${issue.path.join('.')}: ${issue.message}`);
			}
		}
		errors = errs;
		if (errs.length || !parsed.success) return;

		saving = true;
		try {
			const body = JSON.stringify({ draft: parsed.data, tags: currentTags, change_note: changeNote.trim() || undefined });
			const res = await fetch(recipeId ? `/api/recipes/${recipeId}` : '/api/recipes', {
				method: recipeId ? 'PUT' : 'POST',
				headers: { 'content-type': 'application/json' },
				body
			});
			if (!res.ok) throw new Error(await errorMessage(res));
			const id: string = recipeId ?? (await res.json()).id;

			if (photoFile) {
				const form = new FormData();
				form.set('photo', photoFile);
				const up = await fetch(`/api/recipes/${id}/photo`, { method: 'POST', body: form });
				if (!up.ok) throw new Error(`Recipe saved, but the photo failed: ${await errorMessage(up)}`);
			} else if (removePhoto && photoPath) {
				await fetch(`/api/recipes/${id}/photo`, { method: 'DELETE' });
			}
			await goto(`/recipes/${id}`, { invalidateAll: true });
		} catch (e) {
			errors = [e instanceof Error ? e.message : 'Save failed'];
		} finally {
			saving = false;
		}
	}

	async function errorMessage(res: Response): Promise<string> {
		try {
			const data = await res.json();
			return typeof data?.message === 'string' ? data.message : res.statusText;
		} catch {
			return res.statusText;
		}
	}
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		save();
	}}
>
	<div class="field">
		<label for="title">Title</label>
		<input id="title" type="text" bind:value={title} required />
	</div>

	<div class="two">
		<div class="field">
			<label for="servings">Servings</label>
			<input id="servings" type="text" inputmode="decimal" bind:value={servings} placeholder="e.g. 4" />
		</div>
		<div class="field">
			<label for="yield">Final weight (g)</label>
			<input id="yield" type="text" inputmode="decimal" bind:value={yieldG} placeholder="optional" />
		</div>
	</div>

	<h2>Ingredients</h2>
	<p class="hint muted">Rows marked <span class="swatch"></span> have an estimated or missing weight.</p>
	<ul class="rows">
		{#each ingRows as row, i (row.key)}
			<li class="row-item" class:heading={row.kind === 'heading'} class:attention={row.kind === 'item' && needsAttention(row)} class:invalid={rowErrors[row.key]}>
				{#if row.kind === 'heading'}
					<input type="text" class="heading-input" bind:value={row.text} placeholder="Section (blank = no section)" aria-label="Section heading" />
				{:else}
					<div class="ing-grid">
						<input type="text" inputmode="decimal" bind:value={row.qty} onchange={() => onQtyOrUnitChange(row)} placeholder="Qty" aria-label="Quantity" />
						<input type="text" bind:value={row.unit} onchange={() => onQtyOrUnitChange(row)} placeholder="Unit" aria-label="Unit" autocapitalize="off" />
						<input type="text" class="name" bind:value={row.name} placeholder="Ingredient" aria-label="Ingredient name" />
						<input type="text" class="note" bind:value={row.note} placeholder="Note (e.g. chopped)" aria-label="Note" />
						<div class="grams">
							<input type="text" inputmode="decimal" bind:value={row.grams} oninput={() => onGramsInput(row)} placeholder="g" aria-label="Weight in grams" />
							<span class="muted">g{row.grams_estimated ? ' est.' : ''}</span>
						</div>
					</div>
					<label class="opt"><input type="checkbox" bind:checked={row.optional} /> optional</label>
				{/if}
				<div class="tools">
					<button type="button" class="icon-btn" onclick={() => move(ingRows, i, -1)} aria-label="Move up" disabled={i === 0}>↑</button>
					<button type="button" class="icon-btn" onclick={() => move(ingRows, i, 1)} aria-label="Move down" disabled={i === ingRows.length - 1}>↓</button>
					<button type="button" class="icon-btn" onclick={() => ingRows.splice(i, 1)} aria-label="Remove">✕</button>
				</div>
				{#if rowErrors[row.key]}<p class="error">{rowErrors[row.key]}</p>{/if}
			</li>
		{/each}
	</ul>
	<div class="row">
		<button type="button" class="btn small" onclick={() => ingRows.push(newIngredientRow())}>+ Ingredient</button>
		<button type="button" class="btn small" onclick={() => ingRows.push(newHeadingRow())}>+ Section</button>
	</div>

	<h2>Steps</h2>
	<ol class="rows">
		{#each stepRows as row, i (row.key)}
			<li class="row-item" class:heading={row.kind === 'heading'}>
				{#if row.kind === 'heading'}
					<input type="text" class="heading-input" bind:value={row.text} placeholder="Section (blank = no section)" aria-label="Section heading" />
				{:else}
					<textarea rows="2" bind:value={row.text} placeholder="Step" aria-label="Step"></textarea>
				{/if}
				<div class="tools">
					<button type="button" class="icon-btn" onclick={() => move(stepRows, i, -1)} aria-label="Move up" disabled={i === 0}>↑</button>
					<button type="button" class="icon-btn" onclick={() => move(stepRows, i, 1)} aria-label="Move down" disabled={i === stepRows.length - 1}>↓</button>
					<button type="button" class="icon-btn" onclick={() => stepRows.splice(i, 1)} aria-label="Remove">✕</button>
				</div>
			</li>
		{/each}
	</ol>
	<div class="row">
		<button type="button" class="btn small" onclick={() => stepRows.push(newStepRow())}>+ Step</button>
		<button type="button" class="btn small" onclick={() => stepRows.push(newHeadingRow())}>+ Section</button>
	</div>

	<h2>Details</h2>
	<div class="field">
		<label for="notes">Notes</label>
		<textarea id="notes" rows="3" bind:value={notes}></textarea>
	</div>
	<div class="field">
		<label for="source">Source URL</label>
		<input id="source" type="url" bind:value={sourceUrl} placeholder="https://" />
	</div>
	<div class="field">
		<label for="tags">Tags (comma-separated)</label>
		<input id="tags" type="text" bind:value={tagText} autocapitalize="off" />
		{#if suggestions.length}
			<div class="chips">
				{#each suggestions as t (t)}
					<button type="button" class="chip" onclick={() => addTag(t)}>+ {t}</button>
				{/each}
			</div>
		{/if}
	</div>

	<div class="field">
		<label for="photo">Photo</label>
		{#if photoPath && !removePhoto && !photoFile}
			<div class="row current-photo">
				<img src={photoUrl(photoPath, 'thumb')} alt="" width="64" height="64" />
				<button type="button" class="btn small" onclick={() => (removePhoto = true)}>Remove</button>
			</div>
		{/if}
		<input
			id="photo"
			type="file"
			accept="image/*"
			capture="environment"
			onchange={(e) => (photoFile = e.currentTarget.files?.[0] ?? null)}
		/>
	</div>

	{#if recipeId}
		<div class="field">
			<label for="change-note">Change note (optional)</label>
			<input id="change-note" type="text" bind:value={changeNote} placeholder="e.g. less molasses, +10 g garlic" />
		</div>
	{/if}

	{#if errors.length}
		<ul class="error errors">
			{#each errors as e, i (i)}<li>{e}</li>{/each}
		</ul>
	{/if}

	<div class="action-bar">
		<a class="btn" href={recipeId ? `/recipes/${recipeId}` : '/'}>Cancel</a>
		<button class="btn primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
	</div>
</form>

<style>
	.field {
		margin: 12px 0;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.hint {
		margin: 0 0 8px;
		font-size: 0.85rem;
	}
	.swatch {
		display: inline-block;
		width: 12px;
		height: 12px;
		vertical-align: middle;
		background: var(--warn-bg);
		border: 1px solid var(--warn-border);
		border-radius: 3px;
	}
	.rows {
		list-style: none;
		padding: 0;
		margin: 0 0 8px;
		display: grid;
		gap: 8px;
	}
	.row-item {
		position: relative;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 8px 8px 4px;
	}
	.row-item.heading {
		background: transparent;
		border-style: dashed;
	}
	.row-item.attention {
		background: var(--warn-bg);
		border-color: var(--warn-border);
	}
	.row-item.invalid {
		border-color: var(--danger);
	}
	.heading-input {
		font-weight: 600;
	}
	.ing-grid {
		display: grid;
		grid-template-columns: 64px 72px 1fr;
		gap: 6px;
	}
	.ing-grid .note {
		grid-column: 1 / 3;
	}
	.ing-grid input {
		min-width: 0;
	}
	.grams {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.grams span {
		white-space: nowrap;
		font-size: 0.85rem;
	}
	.opt {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin: 6px 0 0;
	}
	.tools {
		display: flex;
		justify-content: flex-end;
		margin-top: 2px;
	}
	.tools .icon-btn:disabled {
		opacity: 0.3;
	}
	.row-item .error {
		margin: 0 0 4px;
		font-size: 0.85rem;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}
	button.chip {
		cursor: pointer;
	}
	.current-photo {
		margin-bottom: 8px;
	}
	.current-photo img {
		border-radius: 8px;
		object-fit: cover;
	}
	.errors {
		padding-left: 20px;
	}
</style>
