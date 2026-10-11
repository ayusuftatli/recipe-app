import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

export const SESSION_COOKIE = 'session';
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

function secret(): string {
	const s = env.SESSION_SECRET;
	if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters)');
	return s;
}

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	// timingSafeEqual needs equal lengths; compare against self to keep timing flat.
	if (ab.length !== bb.length) {
		timingSafeEqual(ab, ab);
		return false;
	}
	return timingSafeEqual(ab, bb);
}

export function checkPassword(input: string): boolean {
	const expected = env.APP_PASSWORD;
	if (!expected) throw new Error('APP_PASSWORD must be set');
	return safeEqual(input, expected);
}

function sign(payload: string): string {
	return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** Token = "<expiry ms>.<hmac>". Nothing else to store: there is only one user. */
export function createSessionToken(now = Date.now()): string {
	const payload = String(now + SESSION_MAX_AGE_S * 1000);
	return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
	if (!token) return false;
	const dot = token.indexOf('.');
	if (dot < 1) return false;
	const payload = token.slice(0, dot);
	if (!safeEqual(token.slice(dot + 1), sign(payload))) return false;
	const expires = Number(payload);
	return Number.isFinite(expires) && expires > now;
}
