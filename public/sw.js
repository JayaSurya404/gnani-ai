// VoiceNexus AI — Production PWA Service Worker
const CACHE_NAME = "voicenexus-v1.0.0";
const OFFLINE_FALLBACK = "/offline.html";

// Static assets safe to cache
const STATIC_ASSETS = [
  "/manifest.json",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // NEVER cache API requests, auth calls, WebSockets, or live streaming
  if (
    request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.includes("supabase.co") ||
    url.pathname.includes("vachana.ai") ||
    url.protocol === "ws:" ||
    url.protocol === "wss:"
  ) {
    return;
  }

  // Network-first strategy for pages to ensure real-time consistency
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request);
    })
  );
});

