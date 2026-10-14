import { exportAll } from '$lib/server/backup';
import type { RequestHandler } from './$types';

/** JSON backup: all recipes, all versions, all foods, the meal plan and the grocery list's manual items and staples. */
export const GET: RequestHandler = () => {
	const data = exportAll();
	return new Response(JSON.stringify(data, null, '\t'), {
		headers: {
			'content-type': 'application/json',
			'content-disposition': `attachment; filename="recipe-box-${data.exported_at.slice(0, 10)}.json"`,
			'cache-control': 'no-store'
		}
	});
};
