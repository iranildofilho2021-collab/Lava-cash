/**
 * responsive-tables.js
 * - Adds `data-label` to each <td> based on its column header (<th>)
 * - Enables a mobile "card" layout via CSS without rewriting page templates
 */
(function initResponsiveTables(global) {
  'use strict';

  if (!global || !global.document) return;

  function normalizeHeaderText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function getTableHeaders(table) {
    const ths = Array.from(table.querySelectorAll('thead th'));
    return ths.map(th => normalizeHeaderText(th.textContent));
  }

  function labelRowCells(row, headers) {
    if (!row || !headers || !headers.length) return;

    // Skip rows that are "empty state" or summary rows using colspan.
    if (row.querySelector('td[colspan]')) {
      row.classList.add('table-row--full');
      return;
    }
    row.classList.remove('table-row--full');

    const cells = Array.from(row.cells || []);
    cells.forEach((cell, idx) => {
      if (!cell || cell.tagName !== 'TD') return;
      const label = headers[idx] || '';
      if (cell.getAttribute('data-label') !== label) {
        cell.setAttribute('data-label', label);
      }
    });
  }

  function applyTableLabels(table) {
    if (!table) return;
    const headers = getTableHeaders(table);
    const tbody = table.tBodies && table.tBodies[0];
    if (!tbody) return;

    Array.from(tbody.rows || []).forEach(row => labelRowCells(row, headers));
  }

  function observeTable(table) {
    const tbody = table.tBodies && table.tBodies[0];
    if (!tbody || !global.MutationObserver) return;

    let scheduled = false;
    const pending = new Set();

    function flush() {
      scheduled = false;
      const headers = getTableHeaders(table);
      pending.forEach(row => labelRowCells(row, headers));
      pending.clear();
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes && mutation.addedNodes.forEach(node => {
          if (!node) return;
          if (node.nodeType !== 1) return; // ELEMENT_NODE

          if (node.tagName === 'TR') {
            pending.add(node);
            return;
          }

          // Sometimes innerHTML adds a fragment; scan for rows.
          const rows = node.querySelectorAll ? node.querySelectorAll('tr') : [];
          rows && rows.forEach(r => pending.add(r));
        });
      }

      if (pending.size && !scheduled) {
        scheduled = true;
        global.requestAnimationFrame ? global.requestAnimationFrame(flush) : setTimeout(flush, 16);
      }
    });

    observer.observe(tbody, { childList: true, subtree: true });

    const thead = table.tHead;
    if (thead) {
      const headerObserver = new MutationObserver(() => applyTableLabels(table));
      headerObserver.observe(thead, { childList: true, subtree: true, characterData: true });
    }
  }

  function init(root) {
    const scope = root && root.querySelectorAll ? root : global.document;
    const tables = Array.from(scope.querySelectorAll('table.data-table'));
    tables.forEach(table => {
      applyTableLabels(table);
      observeTable(table);
    });
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', () => init(global.document));
  } else {
    init(global.document);
  }

  // Public hook for pages that want to re-apply manually.
  global.IRANCASH = global.IRANCASH || {};
  global.IRANCASH.applyResponsiveTableLabels = init;
})(window);
