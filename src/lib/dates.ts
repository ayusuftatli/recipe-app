/**
 * Calendar days for the meal plan (spec 4.10), as 'YYYY-MM-DD' strings. A day
 * is a date on the user's calendar, not a moment: the arithmetic runs in UTC
 * so it never shifts with a time zone or a clock change. Everything here is pure.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtc(day: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
	if (!m) return null;
	const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	// Rejects days that do not exist: Date.UTC would roll "02-30" over into March.
	return fromUtc(ms) === day ? ms : null;
}

function fromUtc(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

export function isDay(day: string): boolean {
	return toUtc(day) !== null;
}

/** The calendar day of a moment where the code runs: in the browser, the user's own day. */
export function localDay(now: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `day` must be valid (see `isDay`). */
export function addDays(day: string, n: number): string {
	return fromUtc((toUtc(day) ?? NaN) + n * DAY_MS);
}

/** The Monday of the week `day` is in. */
export function weekStart(day: string): string {
	const weekday = new Date(toUtc(day) ?? NaN).getUTCDay();
	return addDays(day, -((weekday + 6) % 7));
}

/** The seven days from `start`. */
export function weekDays(start: string): string[] {
	return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** "Tue 14 Oct" in the user's language; `weekday: 'long'` gives "Tuesday 14 Oct". */
export function formatDay(day: string, weekday: 'short' | 'long' = 'short'): string {
	return new Date(toUtc(day) ?? NaN).toLocaleDateString(undefined, { weekday, day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "13 – 19 Oct", or "27 Oct – 2 Nov" across a month end. */
export function formatWeek(start: string): string {
	const end = addDays(start, 6);
	const part = (day: string, month: boolean) =>
		new Date(toUtc(day) ?? NaN).toLocaleDateString(undefined, { day: 'numeric', month: month ? 'short' : undefined, timeZone: 'UTC' });
	return `${part(start, start.slice(0, 7) !== end.slice(0, 7))} – ${part(end, true)}`;
}
