/*
 * Offline support. The app has no backend, so once its files are on the device there
 * is nothing else it needs — cache what we fetch, serve from cache when the network
 * is gone, and refresh the cache in the background when it is not.
 */
const CACHE = 'pia-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  event.respondWith(
    caches.match(request).then((hit) => {
      const live = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => hit)

      // Cached copy first so a repeat visit paints instantly; the network refreshes it.
      return hit ?? live
    }),
  )
})
