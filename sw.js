// sw.js —— Service Worker：让 App 可离线使用、可加到主屏幕
// 第一版用简单的「缓存优先」策略缓存自身文件。
const CACHE = "health-app-v20";
const ASSETS = [
  ".",
  "index.html",
  "css/style.css",
  "js/main.js",
  "js/storage.js",
  "js/models.js",
  "js/i18n.js",
  "js/supabase.js",
  "js/ocr.js",
  "js/seed.js",
  "js/handbook.js",
  "img/signature.png",
  "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // 只缓存本站资源；Google 登录/Drive API 等跨域请求一律直连网络，不缓存
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("index.html")))
  );
});
