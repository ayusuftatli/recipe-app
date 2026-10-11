/** Fixed-window in-memory limiter. Fine for a single-replica, single-user app. */
export function createRateLimiter(limit: number, windowMs: number) {
	const hits = new Map<string, { count: number; resetAt: number }>();

	return {
		/** Records a hit; returns false when the key is over its limit. */
		hit(key: string, now = Date.now()): boolean {
			const entry = hits.get(key);
			if (!entry || entry.resetAt <= now) {
				hits.set(key, { count: 1, resetAt: now + windowMs });
				if (hits.size > 10_000) {
					for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
				}
				return true;
			}
			entry.count++;
			return entry.count <= limit;
		},
		reset(key: string) {
			hits.delete(key);
		}
	};
}

export const loginLimiter = createRateLimiter(5, 15 * 60 * 1000);
export const llmLimiter = createRateLimiter(30, 60 * 60 * 1000);
