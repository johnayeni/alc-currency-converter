const cachesName = 'currency-converter-v1';

const filesToCache = [
  '/',
  'js/material.min.js',
  'js/idb.min.js',
  'js/app.js',
  'https://fonts.googleapis.com/icon?family=Material+Icons',
  'css/material.min.css',
  'css/custom.css',
];

// on installation of service worker, add files to the cache
self.addEventListener('install', e => {
  let filesToCache_ = new Array();

  // github pages fix
  if (e.currentTarget.location.origin === 'https://johnayeni.github.io') {
    filesToCache_ = filesToCache.map(
      file =>
        file === 'https://fonts.googleapis.com/icon?family=Material+Icons'
          ? file
          : `/alc-currency-converter/${file == '/' ? '' : file}`,
    );
  } else filesToCache_ = filesToCache;

  console.log('[ServiceWorker] Install');
  e.waitUntil(
    caches.open(cachesName).then(cache => {
      console.log('[ServiceWorker] Caching app shell');
      return cache.addAll(filesToCache_);
    }),
  );
});

// delete old caches when a new one activates
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => {
            return (
              cacheName.startsWith('currency-converter-') &&
              cacheName != cachesName
            );
          })
          .map(cacheName => {
            return caches.delete(cacheName);
          }),
      );
    }),
  );
});

// intercept requests
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin === 'https://free.currencyconverterapi.com') {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    }),
  );
});
