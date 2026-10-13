import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { photoUrl } from './format';
import type { RecipeDetail } from './types';

/**
 * The device's read-only copy of the recipes (spec 4.8): every non-archived
 * recipe with its current version, plus thumbnails, in IndexedDB.
 */
interface OfflineDb extends DBSchema {
	recipes: { key: string; value: RecipeDetail };
	/** Keyed by photo name. */
	thumbs: { key: string; value: Blob };
}

let opened: Promise<IDBPDatabase<OfflineDb>> | undefined;

function db(): Promise<IDBPDatabase<OfflineDb>> {
	return (opened ??= openDB<OfflineDb>('recipe-box', 1, {
		upgrade(d) {
			d.createObjectStore('recipes', { keyPath: 'id' });
			d.createObjectStore('thumbs');
		}
	}));
}

let syncing: Promise<boolean> | undefined;

/** Replaces the offline copy with the server's current state. Returns false when not logged in. */
export function syncOffline(): Promise<boolean> {
	// One at a time: overlapping runs would only repeat the same work.
	return (syncing ??= sync().finally(() => (syncing = undefined)));
}

async function sync(): Promise<boolean> {
	const res = await fetch('/api/sync');
	if (!res.ok) return false;
	const recipes = (await res.json()) as RecipeDetail[];
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

	const tx = d.transaction(['recipes', 'thumbs'], 'readwrite');
	const recipeStore = tx.objectStore('recipes');
	const thumbStore = tx.objectStore('thumbs');
	await recipeStore.clear();
	for (const r of recipes) await recipeStore.put(r);
	for (const name of have) if (!wanted.has(name)) await thumbStore.delete(name);
	for (const [name, blob] of fetched) await thumbStore.put(blob, name);
	await tx.done;
	return true;
}

export interface OfflineCopy {
	/** Most recently updated first. */
	recipes: RecipeDetail[];
	thumbs: Map<string, Blob>;
}

export async function loadOffline(): Promise<OfflineCopy> {
	const d = await db();
	const [recipes, names] = await Promise.all([d.getAll('recipes'), d.getAllKeys('thumbs')]);
	const blobs = await Promise.all(names.map((n) => d.get('thumbs', n)));
	const thumbs = new Map<string, Blob>();
	names.forEach((n, i) => {
		const blob = blobs[i];
		if (blob) thumbs.set(n, blob);
	});
	recipes.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
	return { recipes, thumbs };
}

/** Removes the offline copy, e.g. on logout. */
export async function clearOffline(): Promise<void> {
	const d = await db();
	await Promise.all([d.clear('recipes'), d.clear('thumbs')]);
}
