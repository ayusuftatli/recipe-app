/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { build, files, prerendered, version } from '$service-worker';
import { offlineHref } from '$lib/offline-view';

const sw = self as unknown as ServiceWorkerGlobalScope;

// The app shell: built JS/CSS, static files (manifest, icons) and the prerendered offline page.
const CACHE = `shell-${version}`;
const SHELL = new Set([...build, ...files, ...prerendered]);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll([...SHELL]))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	if (SHELL.has(url.pathname)) {
		event.respondWith(caches.match(url.pathname).then((hit) => hit ?? fetch(request)));
		return;
	}

	// Pages need the server (and a session). Without a connection, go to the
	// offline copy instead; recipe data itself lives in IndexedDB, not here.
	if (request.mode === 'navigate') {
		event.respondWith(fetch(request).catch(() => Response.redirect(offlineHref(url.pathname), 302)));
	}
});
