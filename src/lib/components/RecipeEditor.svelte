<script lang="ts">
	import { tick, untrack } from 'svelte';
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
	import { reorder } from '$lib/reorder';
	import { RecipeDraft } from '$lib/schema';
	import Icon from './Icon.svelte';

	interface Props {
		draft: RecipeDraft;
		tags: string[];
		allTags: string[];
		/** Present when editing an existing recipe. */
		recipeId?: string;
		photoPath?: string | null;
		/** Photo used for an import; becomes the recipe photo unless the user clears it. */
		initialPhoto?: File | null;
	}

	let { draft, tags, allTags, recipeId, photoPath = null, initialPhoto = null }: Props = $props();

	// The form owns its state from here on; props only seed it.
	const seed = untrack(() => $state.snapshot(draft));
	let title = $state(seed.title);
	let servings = $state(seed.servings === null ? '' : String(seed.servings));
	let yieldG = $state(seed.yield_g === null ? '' : String(seed.yield_g));
	let notes = $state(seed.notes ?? '');
	let sourceUrl = $state(seed.source_url ?? '');
	let tagText = $state(untrack(() => tags.join(', ')));
	const blankRow = newIngredientRow();
	let ingRows = $state<IngredientEditorRow[]>(seed.ingredients.length ? ingredientsToRows(seed.ingredients) : [blankRow]);
	/** The ingredient being edited; the others show as one-line summaries. An empty recipe starts on its blank row. */
	let openKey = $state<string | null>(seed.ingredients.length ? null : blankRow.key);
	/** Set when a row opens because the user asked for it, so its first field takes the cursor. */
	let focusKey: string | null = null;
	/** Read out by screen readers after a row is moved. */
	let moved = $state('');
	let stepRows = $state<StepEditorRow[]>(seed.steps.length ? stepsToRows(seed.steps) : [newStepRow()]);
	let changeNote = $state('');
	let photoFile = $state<File | null>(untrack(() => initialPhoto));
	let removePhoto = $state(false);
	let importPreview = $state<string>();
	$effect(() => {
		if (!initialPhoto) return;
		const url = URL.createObjectURL(initialPhoto);
		importPreview = url;
		return () => URL.revokeObjectURL(url);
	});

	let errors = $state<string[]>([]);
	let rowErrors = $state<Record<string, string>>({});
	let saving = $state(false);

	const currentTags = $derived(parseTags(tagText));
	const suggestions = $derived(allTags.filter((t) => !currentTags.includes(t)));

	function addTag(t: string) {
		tagText = [...currentTags, t].join(', ');
	}

	function moveRow<T>(list: T[], from: number, to: number) {
		const [row] = list.splice(from, 1);
		if (row === undefined) return;
		list.splice(to, 0, row);
		moved = `Moved to position ${to + 1} of ${list.length}.`;
	}

	function openRow(key: string) {
		focusKey = key;
		openKey = key;
	}

	async function closeRow() {
		const key = openKey;
		openKey = null;
		// The fields are gone; hand focus to the row's summary so the keyboard keeps its place.
		await tick();
		if (key) document.getElementById(`row-${key}`)?.focus();
	}

	function takeFocus(node: HTMLElement, key: string) {
		if (focusKey !== key) return;
		focusKey = null;
		node.focus();
	}

	function addIngredient() {
		const row = newIngredientRow();
		ingRows.push(row);
		openRow(row.key);
	}

	function addStep() {
		const row = newStepRow();
		stepRows.push(row);
		focusKey = row.key;
	}

	function removeIngredient(i: number) {
		ingRows.splice(i, 1);
		openKey = null;
	}

	// Enter in one of a row's fields means "done with this row", not "save the recipe".
	function doneOnEnter(e: KeyboardEvent) {
		if (e.key !== 'Enter' || e.isComposing) return;
		e.preventDefault();
		// Blurring first lets a changed quantity or unit update the weight.
		(e.currentTarget as HTMLElement).blur();
		void closeRow();
	}

	/** The quantity is itself a weight, so showing the grams next to it would only repeat it. */
	function isMass(row: IngredientRow): boolean {
		return exactGrams(parseNumber(row.qty) ?? null, row.unit) !== null;
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

	/** Reads the form into a validated draft, or reports what is wrong. */
	function collectDraft(): { draft: RecipeDraft | null; errors: string[] } {
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
		return { draft: errs.length || !parsed.success ? null : parsed.data, errors: errs };
	}

	/** Current form content, for the assistant to refine. */
	export function getDraft(): { draft: RecipeDraft | null; errors: string[] } {
		return collectDraft();
	}

	/** Replaces the recipe content with a draft from the assistant (tags and photo stay). */
	export function setDraft(d: RecipeDraft, note?: string) {
		title = d.title;
		servings = d.servings === null ? '' : String(d.servings);
		yieldG = d.yield_g === null ? '' : String(d.yield_g);
		notes = d.notes ?? '';
		sourceUrl = d.source_url ?? '';
		ingRows = d.ingredients.length ? ingredientsToRows(d.ingredients) : [newIngredientRow()];
		stepRows = d.steps.length ? stepsToRows(d.steps) : [newStepRow()];
		openKey = null;
		rowErrors = {};
		errors = [];
		if (note !== undefined) changeNote = note;
	}

	async function save() {
		const { draft: valid, errors: errs } = collectDraft();
		errors = errs;
		if (!valid) {
			const bad = ingRows.find((r) => rowErrors[r.key]);
			if (bad) openKey = bad.key;
			return;
		}

		saving = true;
		try {
			const body = JSON.stringify({ draft: valid, tags: currentTags, change_note: changeNote.trim() || undefined });
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

{#snippet handle(what: string)}
	<button type="button" class="handle" data-drag-handle aria-label="Reorder {what}: drag, or use the up and down arrow keys" title="Drag to reorder">
		<Icon name="grip" size={18} />
	</button>
{/snippet}

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
	<p class="hint muted">Tap an ingredient to change it. Drag the handle to reorder.</p>
	<ul class="rows ingredients" use:reorder={(from, to) => moveRow(ingRows, from, to)}>
		{#each ingRows as row, i (row.key)}
			<li class:open={openKey === row.key} class:invalid={rowErrors[row.key]}>
				{#if row.kind === 'heading'}
					<div class="line">
						{@render handle(row.text.trim() ? `section ${row.text}` : 'section')}
						<input type="text" class="heading-input" bind:value={row.text} placeholder="Section (blank = no section)" aria-label="Section heading" />
						<button type="button" class="icon-btn" aria-label="Remove section" onclick={() => ingRows.splice(i, 1)}><Icon name="trash" size={18} /></button>
					</div>
				{:else if openKey === row.key}
					<div class="panel">
						<div class="fields three">
							<div>
								<label for="qty-{row.key}">Qty</label>
								<input
									id="qty-{row.key}"
									type="text"
									inputmode="decimal"
									bind:value={row.qty}
									onchange={() => onQtyOrUnitChange(row)}
									onkeydown={doneOnEnter}
									use:takeFocus={row.key}
								/>
							</div>
							<div>
								<label for="unit-{row.key}">Unit</label>
								<input id="unit-{row.key}" type="text" bind:value={row.unit} onchange={() => onQtyOrUnitChange(row)} onkeydown={doneOnEnter} autocapitalize="off" />
							</div>
							<div>
								<label for="name-{row.key}">Ingredient</label>
								<input id="name-{row.key}" type="text" bind:value={row.name} onkeydown={doneOnEnter} />
							</div>
						</div>
						<div class="fields two">
							<div>
								<label for="note-{row.key}">Note</label>
								<input id="note-{row.key}" type="text" bind:value={row.note} placeholder="e.g. chopped" onkeydown={doneOnEnter} />
							</div>
							<div>
								<label for="grams-{row.key}">Weight (g)</label>
								<input
									id="grams-{row.key}"
									type="text"
									inputmode="decimal"
									class:flag={needsAttention(row)}
									bind:value={row.grams}
									oninput={() => onGramsInput(row)}
									onkeydown={doneOnEnter}
								/>
							</div>
						</div>
						{#if needsAttention(row)}
							<p class="hint muted">
								{row.grams.trim() ? 'This weight is an estimate. Change it if you weighed it.' : 'No weight yet. Scaling by weight and nutrition need one.'}
							</p>
						{/if}
						<div class="foot">
							<label class="opt"><input type="checkbox" bind:checked={row.optional} /> Optional</label>
							<button type="button" class="link-btn danger" onclick={() => removeIngredient(i)}><Icon name="trash" size={18} /> Remove</button>
							<button type="button" class="btn small" onclick={closeRow}>Done</button>
						</div>
					</div>
				{:else}
					<div class="line">
						{@render handle(row.name.trim() || 'ingredient')}
						<button type="button" id="row-{row.key}" class="summary" onclick={() => openRow(row.key)}>
							<span class="amount">{row.qty} {row.unit}</span>
							<span class="name">
								{#if row.name.trim()}
									{row.name}{#if row.note.trim()}<span class="muted">, {row.note}</span>{/if}
								{:else}
									<span class="muted">New ingredient</span>
								{/if}
							</span>
							{#if row.grams.trim() && !isMass(row)}
								<span class="grams muted">{row.grams_estimated ? '≈' : ''}{row.grams} g</span>
							{/if}
							{#if row.optional}<span class="badge">optional</span>{/if}
							{#if needsAttention(row)}<span class="badge warn">{row.grams.trim() ? 'estimated' : 'no weight'}</span>{/if}
						</button>
					</div>
				{/if}
				{#if rowErrors[row.key]}<p class="error">{rowErrors[row.key]}</p>{/if}
			</li>
		{/each}
	</ul>
	<div class="row">
		<button type="button" class="btn small" onclick={addIngredient}><Icon name="plus" size={16} /> Ingredient</button>
		<button type="button" class="btn small" onclick={() => ingRows.push(newHeadingRow())}><Icon name="plus" size={16} /> Section</button>
	</div>

	<h2>Steps</h2>
	<ol class="rows steps" use:reorder={(from, to) => moveRow(stepRows, from, to)}>
		{#each stepRows as row, i (row.key)}
			<li class:heading={row.kind === 'heading'}>
				{@render handle(row.kind === 'heading' ? 'section' : 'step')}
				{#if row.kind === 'heading'}
					<input type="text" class="heading-input" bind:value={row.text} placeholder="Section (blank = no section)" aria-label="Section heading" />
				{:else}
					<textarea rows="2" bind:value={row.text} placeholder="Step" aria-label="Step" use:takeFocus={row.key}></textarea>
				{/if}
				<button type="button" class="icon-btn" aria-label={row.kind === 'heading' ? 'Remove section' : 'Remove step'} onclick={() => stepRows.splice(i, 1)}>
					<Icon name="trash" size={18} />
				</button>
			</li>
		{/each}
	</ol>
	<div class="row">
		<button type="button" class="btn small" onclick={addStep}><Icon name="plus" size={16} /> Step</button>
		<button type="button" class="btn small" onclick={() => stepRows.push(newHeadingRow())}><Icon name="plus" size={16} /> Section</button>
	</div>
	<p class="sr-only" aria-live="polite">{moved}</p>

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
		{#if photoFile && photoFile === initialPhoto}
			<div class="row current-photo">
				{#if importPreview}<img src={importPreview} alt="" width="64" height="64" />{/if}
				<span class="muted">Using the photo from the import.</span>
				<button type="button" class="btn small" onclick={() => (photoFile = null)}>Don't use</button>
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
	.rows {
		list-style: none;
		padding: 0;
		margin: 0 0 8px;
	}
	.ingredients {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.ingredients > li {
		border-bottom: 1px solid var(--line);
	}
	.ingredients > li:first-child {
		border-radius: 11px 11px 0 0;
	}
	.ingredients > li:last-child {
		border-bottom: none;
		border-radius: 0 0 11px 11px;
	}
	.ingredients > li.open {
		background: color-mix(in srgb, var(--accent-soft) 45%, var(--surface));
	}
	.ingredients > li.invalid {
		box-shadow: inset 0 0 0 1px var(--danger);
	}
	.line {
		display: flex;
		align-items: center;
		min-height: 52px;
	}
	.handle {
		display: grid;
		place-items: center;
		align-self: stretch;
		flex-shrink: 0;
		width: 40px;
		min-height: 44px;
		padding: 0;
		border: none;
		background: none;
		color: var(--muted);
		cursor: grab;
		/* A touch on the handle moves the row, not the page. */
		touch-action: none;
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
	}
	.summary {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px 10px;
		min-height: 52px;
		padding: 8px 12px 8px 0;
		border: none;
		background: none;
		text-align: left;
		cursor: pointer;
	}
	.amount {
		font-weight: 600;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.name {
		flex: 1 1 6ch;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.grams {
		font-size: 0.9rem;
		white-space: nowrap;
	}
	.heading-input {
		flex: 1;
		min-width: 0;
		font-weight: 600;
	}
	.panel {
		padding: 12px 14px 8px;
	}
	.fields {
		display: grid;
		gap: 8px;
	}
	.fields.three {
		grid-template-columns: 64px 72px minmax(0, 1fr);
	}
	.fields.two {
		grid-template-columns: minmax(0, 1fr) 104px;
		margin-top: 10px;
	}
	.fields label {
		margin-bottom: 2px;
	}
	.fields input {
		min-width: 0;
	}
	.fields input.flag {
		background: var(--warn-bg);
		border-color: var(--warn-border);
	}
	.panel .hint {
		margin: 8px 0 0;
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 4px;
	}
	.opt {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		margin: 0 auto 0 0;
		font-size: 0.95rem;
		color: var(--text);
	}
	.opt input {
		width: 20px;
		height: 20px;
		margin: 0;
		accent-color: var(--accent);
	}
	.ingredients .error {
		margin: 0;
		padding: 0 14px 8px;
		font-size: 0.85rem;
	}
	.steps {
		display: grid;
		gap: 8px;
	}
	.steps > li {
		display: flex;
		align-items: center;
		padding: 4px 0;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.steps > li.heading {
		background: transparent;
		border-style: dashed;
	}
	.steps textarea,
	.steps .heading-input {
		flex: 1;
		min-width: 0;
		margin: 4px 0;
	}
	/* Where the browser can, the box grows with the step so none of it hides behind a scrollbar. */
	.steps textarea {
		field-sizing: content;
		min-height: 60px;
	}
	/* While a row is dragged it floats above the rest, which slide out of its way. */
	.rows > :global([data-dragging]) {
		position: relative;
		z-index: 2;
		background: var(--surface);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
	}
	.rows:global([data-reordering]) > li {
		transition: transform 0.15s;
	}
	.rows:global([data-reordering]) > :global([data-dragging]) {
		transition: none;
	}
	.rows:global([data-reordering]) .handle {
		cursor: grabbing;
	}
	@media (prefers-reduced-motion: reduce) {
		.rows:global([data-reordering]) > li {
			transition: none;
		}
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
