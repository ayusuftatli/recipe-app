import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { photoUrl } from './format';
import { mergeChecks, type GroceryCheck, type GroceryData } from './grocery';
import type { OfflineSync, PlanEntry, RecipeDetail } from './types';

/**
 * The device's copy for offline use (spec 4.8): every non-archived recipe
 * with its current version and thumbnail, the meal plan and what the grocery
 * list is built from, in IndexedDB. All of it is read-only, except that ticks
 * on the grocery list are kept in an outbox and sent when there is a connection.
 */
interface OfflineDb extends DBSchema {
	recipes: { key: string; value: RecipeDetail };
	/** Keyed by photo name. */
	thumbs: { key: string; value: Blob };
	plan: { key: string; value: PlanEntry };
	/** Single records by name; 'grocery' is what the grocery list is built from. */
	state: { key: string; value: GroceryData };
	/** Ticks that have not reached the server yet, by item key. */
	outbox: { key: string; value: GroceryCheck };
}

const GROCERY = 'grocery';

let opened: Promise<IDBPDatabase<OfflineDb>> | undefined;

function db(): Promise<IDBPDatabase<OfflineDb>> {
	return (opened ??= openDB<OfflineDb>('recipe-box', 2, {
		upgrade(d, oldVersion) {
			if (oldVersion < 1) {
				d.createObjectStore('recipes', { keyPath: 'id' });
				d.createObjectStore('thumbs');
			}
			if (oldVersion < 2) {
				d.createObjectStore('plan', { keyPath: 'id' });
				d.createObjectStore('state');
				d.createObjectStore('outbox', { keyPath: 'key' });
			}
		}
	}));
}

let syncing: Promise<boolean> | undefined;

/** Sends what is waiting, then replaces the offline copy with the server's current state. Returns false when not logged in. */
export function syncOffline(): Promise<boolean> {
	// One at a time: overlapping runs would only repeat the same work.
	return (syncing ??= sync().finally(() => (syncing = undefined)));
}

async function sync(): Promise<boolean> {
	// First, so that what comes back already has the ticks made on this device.
	await flushChecks().catch(() => false);

	const res = await fetch('/api/sync');
	if (!res.ok) return false;
	const { recipes, plan, grocery } = (await res.json()) as OfflineSync;
	const d = await db();

	const wanted = new Set(recipes.flatMap((r) => (r.photo_path ? [r.photo_path] : [])));
	const have = new Set(await d.getAllKeys('thumbs'));
	// Network first, then one short transaction (IndexedDB transactions can't wait on fetch).
	const fetched = new Map<string, Blob>();
	for (const name of wanted) {
		if (have.has(name)) continue;
		try {
			const img = await fetch(photoUrl(name, 'thumb'));
			if (img.ok) fetched.set(name, await img.blob());
		} catch {
			// A missing thumbnail is not worth failing the sync for.
		}
	}

	const tx = d.transaction(['recipes', 'thumbs', 'plan', 'state'], 'readwrite');
	const recipeStore = tx.objectStore('recipes');
	const thumbStore = tx.objectStore('thumbs');
	const planStore = tx.objectStore('plan');
	await recipeStore.clear();
	for (const r of recipes) await recipeStore.put(r);
	for (const name of have) if (!wanted.has(name)) await thumbStore.delete(name);
	for (const [name, blob] of fetched) await thumbStore.put(blob, name);
	await planStore.clear();
	for (const e of plan) await planStore.put(e);
	await tx.objectStore('state').put(grocery, GROCERY);
	await tx.done;
	return true;
}

export interface OfflineCopy {
	/** Most recently updated first. */
	recipes: RecipeDetail[];
	thumbs: Map<string, Blob>;
	/** In day order. */
	plan: PlanEntry[];
	/** null when nothing has been synced since the grocery list exists. */
	grocery: GroceryData | null;
	/** Ticks made on this device that the server does not have yet. */
	pending: GroceryCheck[];
}

export async function loadOffline(): Promise<OfflineCopy> {
	const d = await db();
	const [recipes, names, plan, grocery, pending] = await Promise.all([
		d.getAll('recipes'),
		d.getAllKeys('thumbs'),
		d.getAll('plan'),
		d.get('state', GROCERY),
		d.getAll('outbox')
	]);
	const blobs = await Promise.all(names.map((n) => d.get('thumbs', n)));
	const thumbs = new Map<string, Blob>();
	names.forEach((n, i) => {
		const blob = blobs[i];
		if (blob) thumbs.set(n, blob);
	});
	recipes.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
	plan.sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position);
	return { recipes, thumbs, plan, grocery: grocery ?? null, pending };
}

/** Keeps a tick on the device until `flushChecks` gets it to the server. A later tick on the same item replaces it. */
export async function queueCheck(check: GroceryCheck): Promise<void> {
	await (await db()).put('outbox', check);
}

export async function pendingChecks(): Promise<GroceryCheck[]> {
	return (await db()).getAll('outbox');
}

/**
 * Sends the waiting ticks. Returns false when the server refused them (they
 * stay for the next try) and throws without a connection.
 */
export async function flushChecks(): Promise<boolean> {
	const d = await db();
	const sent = await d.getAll('outbox');
	if (sent.length === 0) return true;
	const res = await fetch('/api/grocery/checks', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ changes: sent })
	});
	if (!res.ok) return false;

	const tx = d.transaction(['outbox', 'state'], 'readwrite');
	const outbox = tx.objectStore('outbox');
	for (const check of sent) {
		// A newer tick on the same item, made while this was on its way, waits for the next round.
		if ((await outbox.get(check.key))?.at === check.at) await outbox.delete(check.key);
	}
	// The copy on the device now knows them too, without waiting for the next sync.
	const state = tx.objectStore('state');
	const grocery = await state.get(GROCERY);
	if (grocery) await state.put({ ...grocery, checks: mergeChecks(grocery.checks, sent) }, GROCERY);
	await tx.done;
	return true;
}

/** Removes the offline copy, e.g. on logout. */
export async function clearOffline(): Promise<void> {
	const d = await db();
	await Promise.all([d.clear('recipes'), d.clear('thumbs'), d.clear('plan'), d.clear('state'), d.clear('outbox')]);
}
