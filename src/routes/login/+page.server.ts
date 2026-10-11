import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { z } from 'zod';
import { checkPassword, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_S } from '$lib/server/auth';
import { loginLimiter } from '$lib/server/rate-limit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.authenticated) redirect(303, '/');
};

const LoginForm = z.object({ password: z.string().min(1).max(500) });

/** Only allow same-site relative redirects after login. */
function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, url }) => {
		const ip = getClientAddress();
		if (!loginLimiter.hit(ip)) {
			return fail(429, { error: 'Too many attempts. Try again in 15 minutes.' });
		}
		const parsed = LoginForm.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success || !checkPassword(parsed.data.password)) {
			return fail(400, { error: 'Wrong password.' });
		}
		loginLimiter.reset(ip);
		cookies.set(SESSION_COOKIE, createSessionToken(), {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax',
			maxAge: SESSION_MAX_AGE_S
		});
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
