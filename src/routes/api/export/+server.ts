import { exportAll } from '$lib/server/backup';
import type { RequestHandler } from './$types';

/** JSON backup: all recipes, all versions and all foods. */
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
