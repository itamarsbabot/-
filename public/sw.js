// Offline shell: app files are cached, the tutor itself needs internet.
const CACHE = "liya-tutor-v4";
const SHELL = [
  "./", "index.html", "styles.css", "manifest.webmanifest", "icons/icon.svg",
  "js/app.js", "js/api.js", "js/store.js", "js/render.js", "js/pad.js", "js/composer.js", "js/curriculum.js", "js/guard.js", "js/prompts.js", "js/topics.js",
  "js/views/home.js", "js/views/chat.js", "js/views/practice.js", "js/views/test.js", "js/views/progress.js", "js/views/settings.js", "js/views/syllabus.js",
  "vendor/katex/katex.min.js", "vendor/katex/katex.min.css", "vendor/marked.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.includes("/api/")) return;
  // Network first (so updates arrive), cache as fallback.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok && (url.origin === location.origin || url.hostname.includes("fonts.g"))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});
