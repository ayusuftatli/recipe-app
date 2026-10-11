import { allTags } from '$lib/server/recipes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ allTags: allTags() });
