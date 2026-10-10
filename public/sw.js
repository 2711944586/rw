/* global fetch, Response, self */
/*
 * Network-first for navigations.
 * index.html is not stored in Cache Storage, so a stale shell cannot become the source of truth.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.mode !== 'navigate') return;
  event.respondWith(fetch(request).catch(() => new Response(
    '离线时无法打开新页面。已经打开的页面仍可使用本机数据。',
    { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  )));
});
