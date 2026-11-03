(function (global) {
  'use strict';

  const pendingLoads = new Map();

  function loadScript(name, source, isReady) {
    if (isReady()) return Promise.resolve();
    if (pendingLoads.has(name)) return pendingLoads.get(name);

    const loadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-lavacash-vendor="${name}"]`);
      if (existing) {
        existing.addEventListener('load', () => isReady() ? resolve() : reject(new Error(`${name} não foi inicializado.`)), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Falha ao carregar ${name}.`)), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = source;
      script.async = true;
      script.dataset.lavacashVendor = name;
      script.onload = () => isReady() ? resolve() : reject(new Error(`${name} não foi inicializado.`));
      script.onerror = () => reject(new Error(`Falha ao carregar ${name}.`));
      document.head.appendChild(script);
    });

    pendingLoads.set(name, loadPromise);
    return loadPromise.finally(() => pendingLoads.delete(name));
  }

  global.LavaCashVendorLoader = {
    loadChart: () => loadScript('chart', 'js/vendor/chart.umd.min.js?v=20260621-performance-v2', () => typeof global.Chart !== 'undefined'),
    loadXLSX: () => loadScript('xlsx', 'js/vendor/xlsx.full.min.js?v=20260621-performance-v2', () => typeof global.XLSX !== 'undefined'),
    loadExcelJS: () => loadScript('exceljs', 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js', () => typeof global.ExcelJS !== 'undefined')
  };
})(window);
