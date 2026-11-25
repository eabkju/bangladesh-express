// sw.js - Offline Service Worker Cache (Section 15.4)
const CACHE_NAME = 'train-v3';
const CORE_ASSETS = [
    './',
    'index.html',
    'css/style.css',
    'libs/three.min.js',
    'js/config.js',
    'js/audio.js',
    'js/track.js',
    'js/physics.js',
    'js/train.js',
    'js/environment.js',
    'js/village.js',
    'js/weather.js',
    'js/journey.js',
    'js/controls.js',
    'js/main.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(CORE_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // Cache-first strategy for local assets
    e.respondWith(
        caches.match(e.request).then((res) => {
            return res || fetch(e.request).then((fetchRes) => {
                return fetchRes;
            });
        }).catch(() => caches.match('index.html'))
    );
});
