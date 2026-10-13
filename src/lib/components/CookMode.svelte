<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { formatGrams, formatQty, groupRuns } from '$lib/format';
	import type { Ingredient, Step } from '$lib/schema';

	let {
		title,
		ingredients,
		steps,
		onClose
	}: {
		title: string;
		/** As shown on the recipe page, i.e. already scaled. */
		ingredients: Ingredient[];
		steps: Step[];
		onClose: () => void;
	} = $props();

	let tab = $state<'ingredients' | 'steps'>(untrack(() => (ingredients.length > 0 ? 'ingredients' : 'steps')));
	let checked = $state<Record<string, boolean>>({});
	let stepIndex = $state(0);
	let awake = $state(false);

	const ingredientRuns = $derived(groupRuns(ingredients));
	const step = $derived(steps[stepIndex]);
	const remaining = $derived(ingredients.filter((i) => !checked[i.id]).length);

	onMount(() => {
		let lock: WakeLockSentinel | null = null;
		let closed = false;

		// The lock is dropped whenever the page is hidden, so take it again on return.
		async function keepAwake() {
			if (closed || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
			try {
				lock = await navigator.wakeLock.request('screen');
				awake = true;
				lock.addEventListener('release', () => (awake = false));
				if (closed) void lock.release();
			} catch {
				awake = false;
			}
		}

		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') onClose();
		}

		void keepAwake();
		document.addEventListener('visibilitychange', keepAwake);
		window.addEventListener('keydown', onKey);
		const overflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		return () => {
			closed = true;
			document.removeEventListener('visibilitychange', keepAwake);
			window.removeEventListener('keydown', onKey);
			document.body.style.overflow = overflow;
			void lock?.release();
		};
	});
</script>

<div class="cook" role="dialog" aria-modal="true" aria-label="Cooking mode: {title}">
	<div class="top">
		<div class="heading">
			<div class="title">{title}</div>
			<div class="muted awake">{awake ? 'Screen stays on' : 'Screen may turn off'}</div>
		</div>
		<button type="button" class="btn" onclick={onClose}>Done</button>
	</div>

	<div class="tabs" role="group" aria-label="Cooking mode view">
		<button type="button" class="chip" class:active={tab === 'ingredients'} aria-pressed={tab === 'ingredients'} onclick={() => (tab = 'ingredients')}>
			Ingredients{ingredients.length ? ` (${remaining} left)` : ''}
		</button>
		<button type="button" class="chip" class:active={tab === 'steps'} aria-pressed={tab === 'steps'} onclick={() => (tab = 'steps')}>
			Steps{steps.length ? ` (${stepIndex + 1}/${steps.length})` : ''}
		</button>
	</div>

	{#if tab === 'ingredients'}
		<div class="body">
			{#if ingredients.length === 0}<p class="muted">No ingredients.</p>{/if}
			{#each ingredientRuns as run, r (r)}
				{#if run.group}<h3>{run.group}</h3>{/if}
				<ul class="checklist">
					{#each run.items as ing (ing.id)}
						<li>
							<label class:done={checked[ing.id]}>
								<input type="checkbox" bind:checked={checked[ing.id]} />
								<span>
									<strong>{formatQty(ing.qty)} {ing.unit ?? ''}</strong>
									{ing.name}{#if ing.note}<span class="muted">, {ing.note}</span>{/if}
									{#if ing.grams !== null}<span class="muted grams">{ing.grams_estimated ? '≈' : ''}{formatGrams(ing.grams)}</span>{/if}
								</span>
							</label>
						</li>
					{/each}
				</ul>
			{/each}
		</div>
		{#if steps.length > 0}
			<div class="bottom">
				<button type="button" class="btn primary" onclick={() => (tab = 'steps')}>Go to steps</button>
			</div>
		{/if}
	{:else}
		<div class="body">
			{#if step}
				{#if step.group}<h3>{step.group}</h3>{/if}
				<p class="count muted">Step {stepIndex + 1} of {steps.length}</p>
				<p class="step">{step.text}</p>
			{:else}
				<p class="muted">No steps.</p>
			{/if}
		</div>
		{#if steps.length > 0}
			<div class="bottom">
				<button type="button" class="btn" disabled={stepIndex === 0} onclick={() => stepIndex--}>Back</button>
				{#if stepIndex < steps.length - 1}
					<button type="button" class="btn primary" onclick={() => stepIndex++}>Next</button>
				{:else}
					<button type="button" class="btn primary" onclick={onClose}>Finish</button>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.cook {
		position: fixed;
		inset: 0;
		z-index: 30;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		font-size: 1.3rem;
		padding-top: env(safe-area-inset-top);
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 16px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.heading {
		min-width: 0;
	}
	.title {
		font-weight: 700;
		font-size: 1.1rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.awake {
		font-size: 0.8rem;
	}
	.tabs {
		display: flex;
		gap: 8px;
		padding: 10px 16px 0;
	}
	.tabs .chip {
		flex: 1;
		min-height: 44px;
		justify-content: center;
		text-align: center;
		cursor: pointer;
		font-size: 1rem;
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: 8px 16px 16px;
	}
	.checklist {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.checklist label {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		padding: 12px 0;
		border-bottom: 1px solid var(--border);
		color: var(--text);
		font-size: inherit;
		cursor: pointer;
	}
	.checklist input {
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		margin: 2px 0 0;
		accent-color: var(--accent);
	}
	.checklist label.done span {
		text-decoration: line-through;
		color: var(--muted);
	}
	.grams {
		font-size: 1rem;
		margin-left: 6px;
		white-space: nowrap;
	}
	.count {
		margin: 12px 0 0;
		font-size: 1rem;
	}
	.step {
		margin: 8px 0 0;
		font-size: 1.6rem;
		line-height: 1.4;
		white-space: pre-wrap;
	}
	.bottom {
		display: flex;
		gap: 8px;
		padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
		background: var(--surface);
		border-top: 1px solid var(--border);
	}
	.bottom .btn {
		flex: 1;
		min-height: 52px;
		font-size: 1.1rem;
	}
</style>
