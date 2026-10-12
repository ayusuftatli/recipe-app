import { describe, expect, it } from 'vitest';
import { FetchPageError, fetchRecipeSource, isPrivateAddress } from './fetch-page';

describe('isPrivateAddress', () => {
	it('flags loopback, private, link-local and non-IP input', () => {
		for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'localhost', '']) {
			expect(isPrivateAddress(ip), ip).toBe(true);
		}
	});
	it('allows public addresses', () => {
		for (const ip of ['8.8.8.8', '172.32.0.1', '151.101.0.81', '2606:4700::1111', '::ffff:8.8.8.8']) {
			expect(isPrivateAddress(ip), ip).toBe(false);
		}
	});
});

describe('fetchRecipeSource', () => {
	it('refuses local addresses and other protocols before fetching', async () => {
		for (const u of ['http://127.0.0.1:1/x', 'http://[::1]/x', 'http://localhost/x', 'http://192.168.0.10/', 'ftp://example.com/x']) {
			await expect(fetchRecipeSource(new URL(u)), u).rejects.toBeInstanceOf(FetchPageError);
		}
	});
});
