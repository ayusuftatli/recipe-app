import { error, json } from '@sveltejs/kit';
import { checkExport, ExportFile } from '$lib/backup';
import { importAll, isEmpty } from '$lib/server/backup';
import { readBody } from '$lib/server/http';
import type { RequestHandler } from './$types';

/**
 * Restores a JSON backup. Refuses when there is already data, unless
 * `?force=true`, which replaces everything with the backup's contents.
 */
export const POST: RequestHandler = async ({ request, url }) => {
	const data = await readBody(request, ExportFile);
	const problems = checkExport(data);
	if (problems.length > 0) error(400, `This backup is not consistent: ${problems.join('; ')}`);

	const force = url.searchParams.get('force') === 'true';
	if (!force && !isEmpty()) error(409, 'There is already data here. Restoring replaces all of it.');
	return json(importAll(data, force));
};
