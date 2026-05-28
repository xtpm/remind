self.addEventListener("push", (event) => {
  const payload = event.data
    ? event.data.json()
    : { title: "reminder", body: "reminder is due." };

  event.waitUntil(
    self.registration.showNotification(payload.title || "reminder", {
      body: payload.body || "reminder is due.",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: payload.tag || "kuudere-reminder",
      data: {
        url: payload.url || "/",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }),
  );
});
