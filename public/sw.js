/* Blockchain owns every native notification; template branding stays inside the app. */
const CACHE = "blockchain-shell-v2";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(["/offline.html", "/icons/icon-192.png"])),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith("blockchain-shell-") && k !== CACHE)
              .map((k) => caches.delete(k)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});
self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET" && event.request.mode === "navigate")
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html")),
    );
});
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload;
      try {
        payload = event.data?.json();
      } catch {
        payload = null;
      }
      const valid =
        payload &&
        payload.v === 1 &&
        typeof payload.id === "string" &&
        payload.id.length < 100 &&
        typeof payload.title === "string" &&
        payload.title.length <= 100 &&
        typeof payload.body === "string" &&
        payload.body.length <= 800;
      await self.registration.showNotification(
        valid ? payload.title : "Blockchain",
        {
          body: valid
            ? payload.body
            : "Open Blockchain to see your notification.",
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: valid ? payload.id : "blockchain",
          data: { id: valid ? payload.id : null },
          renotify: false,
        },
      );
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      // Destination is resolved by the authenticated app, never trusted from a push payload.
      const id = event.notification.data?.id;
      const url = new URL("/", self.location.origin);
      if (typeof id === "string") url.searchParams.set("notification", id);
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.navigate(url.href);
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
