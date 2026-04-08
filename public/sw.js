/// SnapBooks.ai — lightweight service worker (no build-tool dependency)
/// Provides: install-prompt support, offline app-shell, runtime caching.

const CACHE_VERSION = "snapbooks-sw-v1";

// Minimal app-shell assets cached on install so the portal opens instantly.
// Heavy page JS is handled by runtime caching below — no need to precache
// every Next.js chunk.
const APP_SHELL = ["/manifest.json", "/icon-192.png", "/icon-512.png"];

// ─── Install ────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  // Activate immediately — don't wait for old tabs to close.
  self.skipWaiting();
});

// ─── Activate ───────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  // Evict old cache versions.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

// ─── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Skip cross-origin requests (analytics, Supabase, etc.).
  if (url.origin !== self.location.origin) return;

  // Skip API routes — always go to network.
  if (url.pathname.startsWith("/api/")) return;

  // ── Immutable hashed assets (_next/static/*) → Cache-First ──
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
            return response;
          })
      )
    );
    return;
  }

  // ── Everything else (pages, RSC payloads) → Network-First with cache fallback ──
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful navigations so the portal works offline.
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
