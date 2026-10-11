import { redirect, type Handle, type ServerInit } from '@sveltejs/kit';
import { runMigrations } from '$lib/server/db';
import { SESSION_COOKIE, verifySessionToken } from '$lib/server/auth';

// adapter-node awaits init() before the server starts listening.
export const init: ServerInit = () => {
	runMigrations();
};

const PUBLIC_PATHS = new Set(['/login', '/api/health']);

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;
	event.locals.authenticated = verifySessionToken(event.cookies.get(SESSION_COOKIE));

	if (!event.locals.authenticated && !PUBLIC_PATHS.has(pathname)) {
		if (pathname.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		const next = pathname + event.url.search;
		redirect(303, next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`);
	}

	return resolve(event);
};
