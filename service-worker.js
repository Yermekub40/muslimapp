// ═══════════════════════════════════════════
// САЛИХ — Service Worker v1.0
// Офлайн кэш + Push уведомления
// ═══════════════════════════════════════════

const CACHE_NAME = 'salih-v1';
const OFFLINE_URL = '/index.html';

// Файлы для кэширования при установке
const PRECACHE_URLS = [
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Amiri:wght@400;700&display=swap',
];

// ── INSTALL ──
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching files');
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('[SW] Pre-cache partial fail:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ──
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH — Network first, fallback to cache ──
self.addEventListener('fetch', event => {
  // Пропускаем не-GET запросы
  if (event.request.method !== 'GET') return;

  // Пропускаем chrome-extension и другие схемы
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Кэшируем успешный ответ
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Сеть недоступна — берём из кэша
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Для навигационных запросов — возвращаем index.html
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
          return new Response('Офлайн', { status: 503 });
        });
      })
  );
});

// ══════════════════════════════════════════
// PUSH УВЕДОМЛЕНИЯ
// ══════════════════════════════════════════

// ── PUSH EVENT ──
self.addEventListener('push', event => {
  let data = { title: 'Салих', body: 'Напоминание', icon: '/icons/icon-192.png', badge: '/icons/icon-96.png' };

  if (event.data) {
    try { data = { ...data, ...event.data.json() }; }
    catch(e) { data.body = event.data.text(); }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon    || '/icons/icon-192.png',
      badge:   data.badge   || '/icons/icon-96.png',
      tag:     data.tag     || 'salih-notif',
      vibrate: [200, 100, 200],
      data:    { url: data.url || '/' },
      actions: data.actions || [],
    })
  );
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Если приложение уже открыто — фокусируемся
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Иначе открываем новое окно
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── LOCAL NOTIFICATIONS (через setTimeout в SW) ──
// Расписание намазов — хранится в IndexedDB
let prayerSchedule = [];

self.addEventListener('message', event => {
  if (event.data?.type === 'SCHEDULE_PRAYERS') {
    prayerSchedule = event.data.prayers || [];
    console.log('[SW] Prayer schedule received:', prayerSchedule.length, 'prayers');
    schedulePrayerNotifications();
  }

  if (event.data?.type === 'SCHEDULE_FAST') {
    const { tomorrow, dayName } = event.data;
    if (tomorrow) scheduleFastNotification(dayName);
  }

  if (event.data?.type === 'SCHEDULE_WIRD') {
    const { time } = event.data;
    scheduleWirdNotification(time);
  }
});

function schedulePrayerNotifications() {
  // Браузерные уведомления планируются через JS в основном потоке
  // SW получает сигнал и показывает уведомление
  console.log('[SW] Prayer notifications scheduled');
}

function scheduleFastNotification(dayName) {
  console.log('[SW] Fast notification scheduled for', dayName);
}

function scheduleWirdNotification(time) {
  console.log('[SW] Wird notification scheduled for', time);
}

// ── BACKGROUND SYNC ──
self.addEventListener('sync', event => {
  if (event.tag === 'sync-prayer-times') {
    event.waitUntil(syncPrayerTimes());
  }
});

async function syncPrayerTimes() {
  console.log('[SW] Background sync: prayer times');
  // Здесь можно синхронизировать времена намазов с API
}

console.log('[SW] Салих Service Worker загружен ✓');
