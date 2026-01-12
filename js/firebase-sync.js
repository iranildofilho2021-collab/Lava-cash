(function() {
  'use strict';

  if (window.__firebaseSyncInstalled) return;
  window.__firebaseSyncInstalled = true;

  var pending = new Map();
  var pendingRemovals = new Set();
  var flushTimer = null;

  function shouldSyncKey(key) {
    if (!key) return false;
    if (key === '__firebaseSyncInstalled' || key === '__firebaseSyncing' || key === '__firebaseSyncPatched') return false;
    if (key.indexOf('/') !== -1) return false;
    if (key.indexOf('firestore_') === 0 || key.indexOf('firebase_') === 0 || key.indexOf('goog:') === 0) return false;
    if (key === 'irancash_users_db') return false;
    if (key.indexOf('btc_moldou.') === 0 || key.indexOf('esg_esposa.') === 0 || key.indexOf('ddr_iguala.') === 0) return false;
    if (key === 'vendasDetalhadas' || key === 'vendasDetalhadas_chunks' || key === 'vendasDetalhadas_format') return false;
    if (key.indexOf('vendasDetalhadas_chunk_') === 0) return false;
    if (key === 'vendasResumoDia_chunks') return false;
    if (key.indexOf('vendasResumoDia_chunk_') === 0) return false;
    return true;
  }

  function parseValue(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (e) { return value; }
  }

  function isLargeValue(value) {
    if (typeof value !== 'string') return false;
    try {
      if (typeof Blob !== 'undefined') {
        return (new Blob([value]).size) > 900000;
      }
    } catch (e) {}
    return value.length > 900000;
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flushPending, 500);
  }

  function queueSet(key, value) {
    pending.set(key, value);
    pendingRemovals.delete(key);
    scheduleFlush();
  }

  function queueRemove(key) {
    pendingRemovals.add(key);
    pending.delete(key);
    scheduleFlush();
  }

  async function safeSet(key, value) {
    if (!shouldSyncKey(key)) return;
    if (isLargeValue(value)) { console.warn('[FirebaseSync] Valor muito grande, ignorando:', key); return; }
    if (!window.FirebaseStore || !window.FirebaseStore.isAvailable) {
      queueSet(key, value);
      return;
    }

    try {
      var isAvailable = await window.FirebaseStore.isAvailable();
      if (!isAvailable) {
        queueSet(key, value);
        return;
      }

      window.__firebaseSyncing = true;
      await window.FirebaseStore.setItem(key, parseValue(value));
    } catch (e) {
      // ignore, keep local fallback
    } finally {
      window.__firebaseSyncing = false;
    }
  }

  async function safeRemove(key) {
    if (!shouldSyncKey(key)) return;
    if (!window.FirebaseStore || !window.FirebaseStore.isAvailable) {
      queueRemove(key);
      return;
    }

    try {
      var isAvailable = await window.FirebaseStore.isAvailable();
      if (!isAvailable) {
        queueRemove(key);
        return;
      }

      window.__firebaseSyncing = true;
      await window.FirebaseStore.removeItem(key);
    } catch (e) {
      // ignore, keep local fallback
    } finally {
      window.__firebaseSyncing = false;
    }
  }

  async function flushPending() {
    flushTimer = null;

    if (!window.FirebaseStore || !window.FirebaseStore.isAvailable) return;

    var isAvailable = false;
    try {
      isAvailable = await window.FirebaseStore.isAvailable();
    } catch (e) {
      return;
    }

    if (!isAvailable) return;

    for (var key of Array.from(pendingRemovals)) {
      pendingRemovals.delete(key);
      await safeRemove(key);
    }

    for (var entry of Array.from(pending.entries())) {
      pending.delete(entry[0]);
      await safeSet(entry[0], entry[1]);
    }
  }

  function patchStorage() {
    if (localStorage.__firebaseSyncPatched) return;

    var originalSetItem = localStorage.setItem.bind(localStorage);
    var originalRemoveItem = localStorage.removeItem.bind(localStorage);

    localStorage.setItem = function(key, value) {
      originalSetItem(key, value);
      if (window.__firebaseSyncing) return;
      if (!shouldSyncKey(key)) return;
      queueSet(key, value);
    };

    localStorage.removeItem = function(key) {
      originalRemoveItem(key);
      if (window.__firebaseSyncing) return;
      if (!shouldSyncKey(key)) return;
      queueRemove(key);
    };

    localStorage.__firebaseSyncPatched = true;
  }

  async function syncAllLocalToFirebase() {
    if (!window.FirebaseStore || !window.FirebaseStore.isAvailable) return;
    try {
      var isAvailable = await window.FirebaseStore.isAvailable();
      if (!isAvailable) return;
    } catch (e) {
      return;
    }

    for (var i = 0; i < localStorage.length; i += 1) {
      var key = localStorage.key(i);
      if (!shouldSyncKey(key)) continue;
      try {
        var value = localStorage.getItem(key);
        await safeSet(key, value);
      } catch (e) {
        // ignore single key
      }
    }
  }

  patchStorage();

  window.addEventListener('firebase:initialized', function() {
    flushPending();
    syncAllLocalToFirebase();
  });

  if (window.FirebaseStore && window.FirebaseStore.initialized && window.FirebaseStore.initialized()) {
    flushPending();
    syncAllLocalToFirebase();
  }
})();



