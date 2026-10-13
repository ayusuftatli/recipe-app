import { tick } from 'svelte';
import type { Action } from 'svelte/action';

/**
 * Drag-to-reorder for a list whose direct children are the rows. A row is picked
 * up by an element marked `data-drag-handle` inside it; on a focused handle the
 * up and down arrow keys move the row one place.
 *
 * While dragging, rows only shift visually (the DOM stays as it is, so the
 * pointer stays captured); `onMove` is called once, on drop. The list gets
 * `data-reordering` and the dragged row `data-dragging` for styling.
 */
export const reorder: Action<HTMLElement, (from: number, to: number) => void> = (list, onMove) => {
	interface Drag {
		items: HTMLElement[];
		from: number;
		to: number;
		/** Page-relative top and height of every row when the drag began. */
		tops: number[];
		heights: number[];
		/** How far the other rows move to make room: the dragged row plus one gap. */
		step: number;
		startY: number;
		startScroll: number;
		clientY: number;
		frame: number;
	}
	let drag: Drag | null = null;

	// Near the top or bottom of the screen the page scrolls; the margins clear the sticky header and action bar.
	const SCROLL_ZONE = 110;
	const SCROLL_MAX = 16;

	function hit(e: Event): { handle: HTMLElement; index: number; items: HTMLElement[] } | null {
		const handle = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-drag-handle]') : null;
		if (!handle) return null;
		const items = Array.from(list.children) as HTMLElement[];
		const index = items.findIndex((el) => el.contains(handle));
		return index < 0 ? null : { handle, index, items };
	}

	function place() {
		if (!drag) return;
		const { items, from, tops, heights, step } = drag;
		const last = items.length - 1;
		const moved = drag.clientY - drag.startY + (window.scrollY - drag.startScroll);
		const dy = Math.min(Math.max(moved, tops[0]! - tops[from]!), tops[last]! + heights[last]! - tops[from]! - heights[from]!);

		// The row takes a neighbour's place once its leading edge passes that neighbour's middle.
		const top = tops[from]! + dy;
		const bottom = top + heights[from]!;
		let to = from;
		for (let j = from + 1; j <= last; j++) if (bottom > tops[j]! + heights[j]! / 2) to = j;
		for (let j = from - 1; j >= 0; j--) if (top < tops[j]! + heights[j]! / 2) to = j;
		drag.to = to;

		items.forEach((el, j) => {
			const shift = j === from ? dy : j > from && j <= to ? -step : j < from && j >= to ? step : 0;
			el.style.transform = shift ? `translateY(${shift}px)` : '';
		});
	}

	function autoScroll() {
		if (!drag) return;
		const y = drag.clientY;
		const fromBottom = window.innerHeight - y;
		const speed =
			y < SCROLL_ZONE ? -Math.min(SCROLL_MAX, (SCROLL_ZONE - y) / 6) : fromBottom < SCROLL_ZONE ? Math.min(SCROLL_MAX, (SCROLL_ZONE - fromBottom) / 6) : 0;
		if (speed) {
			window.scrollBy(0, speed);
			place();
		}
		drag.frame = requestAnimationFrame(autoScroll);
	}

	function onPointerDown(e: PointerEvent) {
		if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
		const target = hit(e);
		if (!target || target.items.length < 2) return;
		e.preventDefault();

		const rects = target.items.map((el) => el.getBoundingClientRect());
		drag = {
			items: target.items,
			from: target.index,
			to: target.index,
			tops: rects.map((r) => r.top + window.scrollY),
			heights: rects.map((r) => r.height),
			step: rects[target.index]!.height + (rects[1]!.top - rects[0]!.bottom),
			startY: e.clientY,
			startScroll: window.scrollY,
			clientY: e.clientY,
			frame: requestAnimationFrame(autoScroll)
		};
		list.dataset.reordering = '';
		target.items[target.index]!.dataset.dragging = '';
		try {
			target.handle.setPointerCapture(e.pointerId);
		} catch {
			// Not every pointer can be captured; the window listeners below still follow it.
		}
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', onPointerCancel);
	}

	function onPointerMove(e: PointerEvent) {
		if (!drag) return;
		drag.clientY = e.clientY;
		place();
	}

	async function finish(commit: boolean) {
		if (!drag) return;
		const { items, from, to, frame } = drag;
		drag = null;
		cancelAnimationFrame(frame);
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', onPointerUp);
		window.removeEventListener('pointercancel', onPointerCancel);

		// Drop the shifts and reorder for real before the next paint, without animating the swap.
		for (const el of items) {
			el.style.transition = 'none';
			el.style.transform = '';
		}
		delete list.dataset.reordering;
		delete items[from]!.dataset.dragging;
		if (commit && to !== from) onMove(from, to);
		await tick();
		void list.offsetHeight;
		for (const el of items) el.style.transition = '';
	}

	const onPointerUp = () => void finish(true);
	const onPointerCancel = () => void finish(false);

	async function onKeyDown(e: KeyboardEvent) {
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		const target = hit(e);
		if (!target) return;
		e.preventDefault();
		const to = target.index + (e.key === 'ArrowUp' ? -1 : 1);
		if (to < 0 || to >= target.items.length) return;
		onMove(target.index, to);
		// Moving the row in the DOM drops focus; give it back so the next key press works.
		await tick();
		target.handle.focus();
	}

	list.addEventListener('pointerdown', onPointerDown);
	list.addEventListener('keydown', onKeyDown);

	return {
		update(next) {
			onMove = next;
		},
		destroy() {
			void finish(false);
			list.removeEventListener('pointerdown', onPointerDown);
			list.removeEventListener('keydown', onKeyDown);
		}
	};
};
