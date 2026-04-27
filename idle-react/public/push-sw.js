self.addEventListener("push", (event) => {
  let payload = {
    title: "Max Idle",
    body: "You have an update.",
    tag: "max-idle-default",
    url: "/"
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = {
        ...payload,
        ...parsed
      };
    }
  } catch {
    // Keep defaults if payload parsing fails.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: {
        url: payload.url
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const existingClient = windowClients.find((client) => "focus" in client);
      if (existingClient) {
        existingClient.navigate(targetUrl);
        return existingClient.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});
