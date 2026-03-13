const STATIC_CACHE = "christapp-static-v2"
const RUNTIME_CACHE = "christapp-runtime-v2"
const OFFLINE_URL = "/offline"

const APP_SHELL = [
  "/",
  OFFLINE_URL,
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/apple-touch-icon.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

function isNavigationRequest(request) {
  return request.mode === "navigate"
}

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/_next/image") ||
      /\.(?:js|css|png|jpg|jpeg|svg|webp|avif|ico|woff2?|ttf)$/i.test(url.pathname))
  )
}

function shouldBypass(request) {
  const url = new URL(request.url)

  if (request.method !== "GET") {
    return true
  }

  if (request.headers.has("authorization")) {
    return true
  }

  if (url.pathname.startsWith("/socket.io/")) {
    return true
  }

  if (/\/(login|register|auth|users|verses)(\/|$)/.test(url.pathname)) {
    return true
  }

  return false
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)

    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE)
      cache.put(request, response.clone())
    }

    return response
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) {
      return cached
    }

    if (isNavigationRequest(request)) {
      const offlinePage = await caches.match(OFFLINE_URL)
      if (offlinePage) {
        return offlinePage
      }
    }

    throw error
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(request)

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => undefined)

  if (cached) {
    return cached
  }

  const networkResponse = await networkPromise
  if (networkResponse) {
    return networkResponse
  }

  return new Response("", { status: 504, statusText: "Gateway Timeout" })
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (shouldBypass(request)) {
    return
  }

  const url = new URL(request.url)

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request))
    return
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  if (url.origin !== self.location.origin) {
    event.respondWith(networkFirst(request))
  }
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const targetPath =
    typeof event.notification?.data?.url === "string" ? event.notification.data.url : "/chat"
  const destinationUrl = new URL(targetPath, self.location.origin)

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url)
        if (clientUrl.pathname === destinationUrl.pathname && "focus" in client) {
          return client.focus()
        }
      }

      for (const client of clientList) {
        if ("navigate" in client && "focus" in client) {
          return client.navigate(destinationUrl.toString()).then(() => client.focus())
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(destinationUrl.toString())
      }

      return undefined
    }),
  )
})
