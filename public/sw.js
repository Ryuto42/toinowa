self.addEventListener('push', function (event) {
  var data = event.data ? event.data.json() : { title: '学習のお知らせ', body: '新しい通知があります' };
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, data: { href: data.href || '/student/home' } }));
});
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.href));
});
