self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || 'Grupo Scout Juan XXIII';
  const options = {
    body: payload.body || 'Tenés un nuevo aviso en la plataforma.',
    icon: '/pwa-icon-192.png',
    badge: '/pwa-icon-192.png',
    tag: payload.tag || 'scout-aviso',
    requireInteraction: Boolean(payload.requireInteraction),
    data: {
      url: payload.url || '/avisos',
      avisoId: payload.avisoId ?? null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/avisos';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === self.location.origin) {
            if ('navigate' in client && typeof client.navigate === 'function') {
              void client.navigate(targetUrl);
            }
            return client.focus();
          }
        } catch {
          // Ignorar URLs inválidas
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
