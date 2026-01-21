/* Responsive table labels + lazy pagination for large lists */
(function() {
  'use strict';

  const TABLE_SELECTOR = '[data-responsive-table]';

  function getHeaderLabels(table) {
    const headerRow = table.querySelector('thead tr');
    if (!headerRow) return [];
    return Array.from(headerRow.children).map((th) => {
      const label = th.dataset.label || th.textContent || '';
      return label.trim();
    });
  }

  function applyLabels(table) {
    const labels = getHeaderLabels(table);
    table.querySelectorAll('tbody tr').forEach((row) => {
      row.querySelectorAll('td').forEach((cell, index) => {
        if (!cell.dataset.label) {
          cell.dataset.label = labels[index] || '';
        }
      });
    });
  }

  function getPageSize(table) {
    const raw = table.getAttribute('data-page-size');
    if (!raw) return 0;
    const size = parseInt(raw, 10);
    return Number.isFinite(size) ? size : 0;
  }

  function applyLazy(table) {
    const pageSize = getPageSize(table);
    if (!pageSize) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const rows = Array.from(tbody.children).filter((node) => node.nodeType === 1);
    const currentPage = parseInt(table.dataset.page || '1', 10) || 1;
    const visibleCount = pageSize * currentPage;

    rows.forEach((row, index) => {
      row.hidden = index >= visibleCount;
    });

    const remaining = rows.length - visibleCount;
    let pager = table.parentElement.querySelector('[data-lazy-pagination]');
    if (!pager) {
      pager = document.createElement('div');
      pager.setAttribute('data-lazy-pagination', '');
      pager.className = 'table-pagination';
      table.parentElement.appendChild(pager);
    }

    if (remaining > 0) {
      pager.innerHTML = `<button type="button" class="btn btn-secondary" data-lazy-more>Carregar mais (${remaining})</button>`;
      const btn = pager.querySelector('[data-lazy-more]');
      btn.addEventListener('click', () => {
        table.dataset.page = String(currentPage + 1);
        applyLazy(table);
      }, { once: true });
    } else {
      pager.innerHTML = '';
    }
  }

  function refreshTable(table) {
    applyLabels(table);
    applyLazy(table);
  }

  function observeTable(table) {
    const tbody = table.querySelector('tbody');
    if (!tbody || tbody.dataset.lazyObserver === 'true') return;
    tbody.dataset.lazyObserver = 'true';
    const observer = new MutationObserver(() => refreshTable(table));
    observer.observe(tbody, { childList: true });
  }

  function init() {
    document.querySelectorAll(TABLE_SELECTOR).forEach((table) => {
      refreshTable(table);
      observeTable(table);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('tables:refresh', init);
})();
