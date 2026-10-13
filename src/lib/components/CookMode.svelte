<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { exactGrams } from '$lib/editor';
	import { formatGrams, formatQty, groupRuns } from '$lib/format';
	import type { Ingredient, Step } from '$lib/schema';
	import Icon from './Icon.svelte';

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

	// One mark per step reads at a glance; past this many they get too thin, so it becomes a plain bar.
	const MAX_MARKS = 12;

	let tab = $state<'ingredients' | 'steps'>(untrack(() => (ingredients.length > 0 ? 'ingredients' : 'steps')));
	let checked = $state<Record<string, boolean>>({});
	let stepIndex = $state(0);
	let awake = $state(false);

	const ingredientRuns = $derived(groupRuns(ingredients));
	const step = $derived(steps[stepIndex]);
	const nextStep = $derived(steps[stepIndex + 1]);
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
		<button type="button" class="icon-btn" aria-label="Close cooking mode" onclick={onClose}><Icon name="close" size={24} /></button>
		<div class="heading">
			<div class="title">{title}</div>
			<div class="muted awake">{awake ? 'Screen stays on' : 'Screen may turn off'}</div>
		</div>
	</div>

	<div class="tabs" role="group" aria-label="Cooking mode view">
		<button type="button" class:active={tab === 'ingredients'} aria-pressed={tab === 'ingredients'} onclick={() => (tab = 'ingredients')}>
			Ingredients{ingredients.length ? ` · ${remaining} left` : ''}
		</button>
		<button type="button" class:active={tab === 'steps'} aria-pressed={tab === 'steps'} onclick={() => (tab = 'steps')}>
			Steps{steps.length ? ` · ${stepIndex + 1} of ${steps.length}` : ''}
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
									{#if ing.grams !== null && exactGrams(ing.qty, ing.unit ?? '') === null}
										<span class="muted grams">{ing.grams_estimated ? '≈' : ''}{formatGrams(ing.grams)}</span>
									{/if}
								</span>
							</label>
						</li>
					{/each}
				</ul>
			{/each}
		</div>
		{#if steps.length > 0}
			<div class="bottom">
				<button type="button" class="btn primary" onclick={() => (tab = 'steps')}>Go to steps <Icon name="next" /></button>
			</div>
		{/if}
	{:else}
		<div class="body steps">
			{#if step}
				{#if steps.length <= MAX_MARKS}
					<div class="marks" aria-hidden="true">
						{#each steps as s, i (s.id)}<span class:on={i <= stepIndex}></span>{/each}
					</div>
				{:else}
					<div class="bar" aria-hidden="true"><span style:width="{((stepIndex + 1) / steps.length) * 100}%"></span></div>
				{/if}
				<p class="count muted">Step {stepIndex + 1} of {steps.length}{step.group ? ` · ${step.group}` : ''}</p>
				<p class="step">{step.text}</p>
				{#if nextStep}
					<div class="upcoming">
						<div class="label">Next: step {stepIndex + 2}</div>
						<div class="text">{nextStep.text}</div>
					</div>
				{/if}
			{:else}
				<p class="muted">No steps.</p>
			{/if}
		</div>
		{#if steps.length > 0}
			<div class="bottom">
				<button type="button" class="btn" disabled={stepIndex === 0} onclick={() => stepIndex--}>Back</button>
				{#if stepIndex < steps.length - 1}
					<button type="button" class="btn primary" onclick={() => stepIndex++}>Next <Icon name="next" /></button>
				{:else}
					<button type="button" class="btn primary" onclick={onClose}>Finish <Icon name="check" /></button>
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
		gap: 4px;
		min-height: 56px;
		padding: 6px 16px 6px 6px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.top .icon-btn {
		color: var(--text);
	}
	.heading {
		min-width: 0;
		line-height: 1.25;
	}
	.title {
		font-weight: 700;
		font-size: 1.05rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.awake {
		font-size: 0.8rem;
	}
	.tabs {
		display: flex;
		gap: 4px;
		margin: 12px 16px 0;
		padding: 4px;
		background: var(--sunk);
		border-radius: 12px;
	}
	.tabs button {
		flex: 1;
		min-height: 44px;
		padding: 0 8px;
		border: none;
		border-radius: 9px;
		background: none;
		font-size: 0.95rem;
		cursor: pointer;
	}
	.tabs button.active {
		background: var(--surface);
		font-weight: 600;
		box-shadow: 0 1px 3px rgb(0 0 0 / 0.16);
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: 8px 16px 16px;
	}
	.body.steps {
		display: flex;
		flex-direction: column;
		padding-top: 20px;
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
	.marks {
		display: flex;
		gap: 6px;
	}
	.marks span,
	.bar {
		flex: 1;
		height: 6px;
		border-radius: 3px;
		background: var(--border);
	}
	.bar {
		flex: none;
		overflow: hidden;
	}
	.marks span.on,
	.bar span {
		background: var(--accent);
	}
	.bar span {
		display: block;
		height: 100%;
	}
	.count {
		margin: 10px 0 0;
		font-size: 0.95rem;
		font-weight: 600;
	}
	.step {
		margin: 8px 0 24px;
		font-size: 1.6rem;
		line-height: 1.4;
		white-space: pre-wrap;
	}
	/* Sits at the bottom of the screen while the step is short, and scrolls with it when it is long. */
	.upcoming {
		margin-top: auto;
		padding: 12px 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--muted);
	}
	.upcoming .label {
		font-size: 0.8rem;
		font-weight: 600;
	}
	.upcoming .text {
		font-size: 1rem;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.bottom {
		display: flex;
		gap: 10px;
		padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
		background: var(--surface);
		border-top: 1px solid var(--border);
	}
	.bottom .btn {
		flex: 1;
		min-height: 60px;
		border-radius: 14px;
		font-size: 1.15rem;
	}
	.bottom .btn.primary {
		flex: 2;
	}
</style>
