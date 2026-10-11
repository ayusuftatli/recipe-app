const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

/** Quantity as written, with common fractions shown as glyphs (1.5 → 1½). */
export function formatQty(qty: number | null): string {
	if (qty === null) return '';
	const whole = Math.floor(qty);
	const frac = Math.round((qty - whole) * 100) / 100;
	const glyph = FRACTIONS[frac];
	if (glyph) return whole ? `${whole}${glyph}` : glyph;
	return String(Math.round(qty * 100) / 100);
}

export function formatGrams(g: number | null): string {
	if (g === null) return '';
	return `${g >= 100 ? Math.round(g) : Math.round(g * 10) / 10} g`;
}

export function formatDate(iso: string): string {
	return new Date(iso).toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

/** Splits a list into consecutive runs sharing the same `group`. */
export function groupRuns<T extends { group?: string }>(items: T[]): { group: string | undefined; items: T[] }[] {
	const runs: { group: string | undefined; items: T[] }[] = [];
	for (const item of items) {
		const last = runs.at(-1);
		if (last && last.group === item.group) last.items.push(item);
		else runs.push({ group: item.group, items: [item] });
	}
	return runs;
}

export function photoUrl(name: string, size: 'full' | 'thumb' = 'full'): string {
	return `/api/photos/${name}${size === 'thumb' ? '?size=thumb' : ''}`;
}
