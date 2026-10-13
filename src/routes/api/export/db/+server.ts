import { snapshotDb } from '$lib/server/backup';
import type { RequestHandler } from './$types';

/** The SQLite database as one file. */
export const GET: RequestHandler = async () => {
	const data = await snapshotDb();
	return new Response(new Uint8Array(data), {
		headers: {
			'content-type': 'application/vnd.sqlite3',
			'content-disposition': `attachment; filename="recipe-box-${new Date().toISOString().slice(0, 10)}.db"`,
			'content-length': String(data.length),
			'cache-control': 'no-store'
		}
	});
};
