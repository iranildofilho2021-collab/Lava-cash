(function() {
  'use strict';

  if (!('serviceWorker' in navigator)) {
    return;
  }

  let refreshing = false;

  function applyUpdate(registration) {
    if (registration?.waiting) {
      registration.waiting.postMessage('skipWaiting');
    }
  }

  window.addEventListener('load', async function() {
    try {
      const registration = await navigator.serviceWorker.register('sw.js', { scope: './' });

      if (registration.waiting) {
        applyUpdate(registration);
      }

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            applyUpdate(registration);
          }
        });
      });
    } catch (error) {
      console.warn('[PWA] Nao foi possivel registrar o Service Worker:', error);
    }
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
})();
