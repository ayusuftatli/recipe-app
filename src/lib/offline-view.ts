import type { RecipeDetail } from './types';

/**
 * Pure helpers for the offline copy (spec 4.8): the same search and tag filter
 * the server does in SQL, over the recipes stored on the device.
 */

/** Matches title and ingredient names, case-insensitively; `tag` must match exactly. */
export function filterRecipes(recipes: RecipeDetail[], q: string, tag: string): RecipeDetail[] {
	const needle = q.trim().toLowerCase();
	return recipes.filter((r) => {
		if (tag && !r.tags.includes(tag)) return false;
		if (!needle) return true;
		return (
			r.current.title.toLowerCase().includes(needle) ||
			r.current.ingredients.some((i) => i.name.toLowerCase().includes(needle))
		);
	});
}

export function tagsOf(recipes: RecipeDetail[]): string[] {
	return [...new Set(recipes.flatMap((r) => r.tags))].sort();
}

export const OFFLINE_PATH = '/offline';

/** Where a page of the online app lives in the offline copy: recipe pages keep their recipe, the rest go to the list. */
export function offlineHref(pathname: string): string {
	const id = /^\/recipes\/([^/]+)/.exec(pathname)?.[1];
	return id && id !== 'new' ? `${OFFLINE_PATH}#${id}` : OFFLINE_PATH;
}
