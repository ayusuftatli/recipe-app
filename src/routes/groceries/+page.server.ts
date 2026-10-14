import { earliestToday, groceryData, queueTidy } from '$lib/server/grocery';
import type { PageServerLoad } from './$types';

// The browser leaves out what is already past on the user's calendar. Naming and sorting
// runs in the background; the page shows what is there and refreshes when it is done.
export const load: PageServerLoad = () => ({ grocery: groceryData(earliestToday()), tidying: queueTidy() });
