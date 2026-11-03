(function (global) {
  'use strict';

  const query = global.matchMedia('(max-width: 767px)');
  let loadPromise = null;

  function loadMobileApp() {
    if (!query.matches || global.MobileApp) return Promise.resolve();
    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-lavacash-mobile-app="true"]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'js/mobile-app.js?v=20261103-pages-sync-v1';
      script.async = true;
      script.dataset.lavacashMobileApp = 'true';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    }).catch(() => {}).finally(() => {
      loadPromise = null;
    });

    return loadPromise;
  }

  function syncMobileApp() {
    if (query.matches) {
      document.body?.classList.add('mobile-pending');
      loadMobileApp();
      return;
    }
    document.body?.classList.remove('mobile-pending');
  }

  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', syncMobileApp);
  } else if (typeof query.addListener === 'function') {
    query.addListener(syncMobileApp);
  }

  global.LavaCashMobileLoader = { load: loadMobileApp };
  syncMobileApp();
})(window);
