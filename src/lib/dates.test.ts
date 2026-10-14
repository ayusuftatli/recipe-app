import { describe, expect, it } from 'vitest';
import { addDays, isDay, localDay, weekDays, weekStart } from './dates';

describe('isDay', () => {
	it('accepts real calendar days', () => {
		expect(isDay('2026-10-14')).toBe(true);
		expect(isDay('2028-02-29')).toBe(true);
	});
	it('rejects other text and days that do not exist', () => {
		expect(isDay('')).toBe(false);
		expect(isDay('2026-10-14T00:00:00Z')).toBe(false);
		expect(isDay('2026-1-4')).toBe(false);
		expect(isDay('2026-02-30')).toBe(false);
		expect(isDay('2026-13-01')).toBe(false);
		expect(isDay('2027-02-29')).toBe(false);
	});
});

describe('localDay', () => {
	it('is the date on the local calendar, padded', () => {
		expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
		expect(localDay(new Date(2026, 9, 14, 0, 0))).toBe('2026-10-14');
	});
});

describe('addDays', () => {
	it('crosses months, years and leap days', () => {
		expect(addDays('2026-10-14', 1)).toBe('2026-10-15');
		expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
		expect(addDays('2026-10-14', 0)).toBe('2026-10-14');
	});
	it('is not thrown off by a clock change', () => {
		// Europe moves its clocks on 2026-03-29 and 2026-10-25.
		expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
		expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
	});
});

describe('weekStart', () => {
	it('is the Monday of the week', () => {
		expect(weekStart('2026-10-14')).toBe('2026-10-12'); // a Wednesday
		expect(weekStart('2026-10-12')).toBe('2026-10-12'); // a Monday
		expect(weekStart('2026-10-18')).toBe('2026-10-12'); // a Sunday
		expect(weekStart('2027-01-01')).toBe('2026-12-28'); // across a year end
	});
});

describe('weekDays', () => {
	it('lists the seven days', () => {
		expect(weekDays('2026-10-26')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
	});
});
