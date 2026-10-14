import { addDays, isDay, localDay, weekStart } from '$lib/dates';
import { listPlan } from '$lib/server/plan';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const param = url.searchParams.get('week') ?? '';
	if (isDay(param)) {
		const week = weekStart(param);
		return { week, entries: listPlan(week, addDays(week, 6)) };
	}
	// Which week is "this week" depends on the user's calendar, not the server's:
	// send enough days around the server's date for the browser to pick its own.
	const serverWeek = weekStart(localDay(new Date()));
	return { week: null, entries: listPlan(addDays(serverWeek, -7), addDays(serverWeek, 13)) };
};
