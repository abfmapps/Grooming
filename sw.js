/* Offline shell and install-as-app support. Bump VERSION when you change files in assets/ so phones pick up the update. */
const VERSION = "abfm-grooming-v3";
const SHELL = [
  "./", "index.html", "admin.html", "config.js", "manifest.webmanifest",
  "assets/app.css", "assets/core.js", "assets/standards.js", "assets/field.js", "assets/admin.js",
  "assets/logo.png", "assets/icon-192.png", "assets/icon-512.png", "assets/favicon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // App files: network first so updates arrive quickly, saved copy when offline.
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
