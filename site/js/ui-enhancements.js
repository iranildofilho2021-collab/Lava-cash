/**
 * LAVACASH UI/UX Enhancements
 * Recursos progressivos: ações destacadas, skeleton, estados vazios e tabelas.
 */
(function initLavaCashUI(global) {
  'use strict';

  if (!global || !global.document) return;

  const documentRef = global.document;
  const ENHANCED_ATTR = 'data-ui-enhanced';
  const tableStates = new WeakMap();

  const pageActions = {
    dashboard: [
      { id: 'btnNovaReceita', label: 'Nova Receita', href: 'receitas.html?acao=nova-receita', type: 'success' },
      { id: 'btnNovaDespesa', label: 'Nova Despesa', href: 'despesas.html?acao=nova-despesa', type: 'danger' },
      { id: 'btnImportarVendasDashboard', label: 'Importar Vendas', href: 'receitas.html?acao=importar-vendas', type: 'secondary' }
    ],
    receitas: [
      { id: 'btnNovaReceita', label: 'Nova Receita', queryAction: 'nova-receita', type: 'primary' },
      { id: 'btnImportarVendas', label: 'Importar Vendas', queryAction: 'importar-vendas', type: 'secondary' }
    ],
    despesas: [
      { id: 'btnNovaDespesa', label: 'Nova Despesa', queryAction: 'nova-despesa', type: 'danger' }
    ],
    'analise-financeira': [
      { id: 'btnExportar', label: 'Exportar Relatório', type: 'primary' }
    ],
    'investimento-inicial': [
      { id: 'btnNovoInvestimento', label: 'Novo Investimento', queryAction: 'novo-investimento', type: 'primary' },
      { id: 'btnNovoSocio', label: 'Novo Sócio', queryAction: 'novo-socio', type: 'secondary' }
    ],
    investimento: [
      { id: 'btnNovoInvestimento', label: 'Novo Investimento', queryAction: 'novo-investimento', type: 'primary' },
      { id: 'btnNovoSocio', label: 'Novo Sócio', queryAction: 'novo-socio', type: 'secondary' }
    ]
  };

  const queryActionSelectors = {
    'nova-receita': '#btnNovaReceita',
    'importar-vendas': '#btnImportarVendas',
    'nova-despesa': '#btnNovaDespesa',
    'novo-investimento': '#btnNovoInvestimento',
    'novo-socio': '#btnNovoSocio'
  };

  function onReady(callback) {
    if (documentRef.readyState === 'loading') {
      documentRef.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function getPageName() {
    const dataPage = documentRef.body?.dataset?.page;
    if (dataPage) return dataPage;
    return String(global.location?.pathname || '')
      .split('/')
      .pop()
      .replace('.html', '') || 'dashboard';
  }

  function isHidden(element) {
    if (!element) return true;
    return element.classList.contains('hidden') || element.hidden || element.style.display === 'none';
  }

  function canUseRevenueActions() {
    try {
      return !global.UserSystem || global.UserSystem.hasPermission?.('receitas') !== false;
    } catch (error) {
      return true;
    }
  }

  function canUseExpenseActions() {
    try {
      return !global.UserSystem || global.UserSystem.hasPermission?.('despesas') !== false;
    } catch (error) {
      return true;
    }
  }

  function createIconPath(kind) {
    const svg = documentRef.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    const path = documentRef.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    if (kind === 'import') {
      path.setAttribute('d', 'M7 16a4 4 0 01-.88-7.9A5 5 0 1116 6a5 5 0 011 9.9M12 12v9m0 0l-3-3m3 3l3-3');
    } else if (kind === 'expense') {
      path.setAttribute('d', 'M20 12H4');
    } else {
      path.setAttribute('d', 'M12 5v14m7-7H5');
    }
    svg.appendChild(path);
    return svg;
  }

  function addDashboardImportAction() {
    if (getPageName() !== 'dashboard') return;
    const quickActions = documentRef.querySelector('.page-header .quick-actions');
    if (!quickActions || documentRef.getElementById('btnImportarVendasDashboard')) return;
    if (!canUseRevenueActions()) return;

    const importLink = documentRef.createElement('a');
    importLink.href = 'receitas.html?acao=importar-vendas';
    importLink.id = 'btnImportarVendasDashboard';
    importLink.className = 'btn btn-secondary ui-secondary-action';
    importLink.appendChild(createIconPath('import'));
    importLink.appendChild(documentRef.createTextNode('Importar Vendas'));
    quickActions.appendChild(importLink);
  }

  function updateDashboardLinks() {
    if (getPageName() !== 'dashboard') return;
    const revenueLink = documentRef.getElementById('btnNovaReceita');
    const expenseLink = documentRef.getElementById('btnNovaDespesa');
    if (revenueLink?.tagName === 'A') revenueLink.setAttribute('href', 'receitas?acao=nova-receita');
    if (expenseLink?.tagName === 'A') expenseLink.setAttribute('href', 'despesas?acao=nova-despesa');
  }

  function highlightPrimaryActions() {
    const actions = pageActions[getPageName()] || [];
    actions.forEach((action, actionIndex) => {
      const element = documentRef.getElementById(action.id);
      if (!element) return;
      element.classList.add(actionIndex === 0 ? 'ui-primary-action' : 'ui-secondary-action');
      if (action.href && element.tagName === 'A') {
        element.setAttribute('href', action.href);
      }
      if (action.label && element.textContent.trim().length < 4) {
        element.appendChild(documentRef.createTextNode(action.label));
      }
    });
  }

  function handleQueryAction() {
    const params = new URLSearchParams(global.location.search || '');
    const action = params.get('acao');
    const selector = queryActionSelectors[action];
    if (!selector) return;

    global.setTimeout(() => {
      const target = documentRef.querySelector(selector);
      if (!target || isHidden(target)) return;
      target.click();
      const cleanUrl = global.location.pathname + (global.location.hash || '');
      global.history?.replaceState?.(null, documentRef.title, cleanUrl);
    }, 550);
  }

  function enhanceLoadingOverlay() {
    const overlay = documentRef.getElementById('loadingOverlay');
    if (!overlay || overlay.querySelector('.ui-loading-skeleton')) return;
    const skeleton = documentRef.createElement('div');
    skeleton.className = 'ui-loading-skeleton';
    skeleton.setAttribute('aria-hidden', 'true');
    skeleton.innerHTML = '<div class="ui-skeleton-line"></div><div class="ui-skeleton-line"></div><div class="ui-skeleton-line"></div>';
    overlay.appendChild(skeleton);
  }

  function getEmptyActionConfig(pageName, emptyStateText) {
    const text = emptyStateText.toLowerCase();
    if (pageName === 'receitas' || text.includes('receita')) {
      return { selector: '#btnNovaReceita', label: 'Cadastrar receita' };
    }
    if (pageName === 'despesas' || text.includes('despesa')) {
      return { selector: '#btnNovaDespesa', label: 'Cadastrar despesa' };
    }
    if (pageName === 'investimento-inicial' || pageName === 'investimento') {
      if (text.includes('sócio') || text.includes('socio')) {
        return { selector: '#btnNovoSocio', label: 'Cadastrar sócio' };
      }
      return { selector: '#btnNovoInvestimento', label: 'Novo investimento' };
    }
    return null;
  }

  function enhanceEmptyStates(root) {
    const pageName = getPageName();
    const scope = root?.querySelectorAll ? root : documentRef;
    scope.querySelectorAll(`.empty-state:not([${ENHANCED_ATTR}])`).forEach(emptyState => {
      emptyState.setAttribute(ENHANCED_ATTR, 'true');
      const config = getEmptyActionConfig(pageName, emptyState.textContent || '');
      if (!config) return;
      const target = documentRef.querySelector(config.selector);
      if (!target || isHidden(target)) return;

      const actionButton = documentRef.createElement('button');
      actionButton.type = 'button';
      actionButton.className = 'btn btn-primary ui-empty-action';
      actionButton.textContent = config.label;
      actionButton.addEventListener('click', () => target.click());
      emptyState.appendChild(actionButton);
    });
  }

  function shouldEnhanceTable(table) {
    if (!table || table.hasAttribute('data-ui-table-off')) return false;
    if (!table.classList.contains('data-table')) return false;
    if (!table.tHead || !table.tBodies || !table.tBodies[0]) return false;
    if (table.closest('#dreSection')) return false;
    if (table.closest('.modal-overlay')) return false;
    if (table.closest('.preview-table-container')) return false;
    if (table.closest('.help-table-wrap')) return false;
    if (table.querySelector('thead input[type="checkbox"]')) return false;
    if (table.closest('.table-scroll-fit')) return false;
    return Boolean(table.closest('.main-content'));
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function parseComparableValue(value) {
    const text = String(value || '').trim();
    const numericCandidate = text
      .replace(/[^\d,.-]/g, '')
      .replace(/\.(?=\d{3}(?:\D|$))/g, '')
      .replace(',', '.');
    const numberValue = Number(numericCandidate);
    if (numericCandidate && Number.isFinite(numberValue)) {
      return { type: 'number', value: numberValue };
    }
    const dateValue = Date.parse(text.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'));
    if (Number.isFinite(dateValue)) {
      return { type: 'date', value: dateValue };
    }
    return { type: 'text', value: normalizeText(text) };
  }

  function getDataRows(table) {
    const tbody = table.tBodies[0];
    if (!tbody) return [];
    return Array.from(tbody.rows || []).filter(row => {
      if (row.hasAttribute('data-ui-generated')) return false;
      if (row.classList.contains('table-row--full')) return false;
      if (row.querySelector('td[colspan]')) return false;
      return true;
    });
  }

  function ensureSelectionColumn(table) {
    const headerRow = table.tHead?.rows?.[0];
    if (headerRow) {
      let selectHead = headerRow.querySelector('.ui-select-head');
      if (!selectHead) {
        selectHead = documentRef.createElement('th');
        selectHead.className = 'ui-select-head';
        selectHead.setAttribute('aria-label', 'Selecionar linhas');
        headerRow.insertBefore(selectHead, headerRow.firstElementChild);
      }

      if (!selectHead.querySelector('.ui-select-title') || !selectHead.querySelector('.ui-table-select-all')) {
        selectHead.innerHTML = '<span class="ui-select-title">Filtro</span><input class="ui-table-checkbox ui-table-select-all" type="checkbox" aria-label="Selecionar todas as linhas visiveis">';
      }
    }
    table.dataset.uiSelectionReady = 'true';

    getDataRows(table).forEach(row => {
      const existingCheckbox = row.querySelector('.ui-row-select');
      if (existingCheckbox) {
        const existingCell = existingCheckbox.closest('td');
        if (existingCell) {
          existingCell.classList.add('ui-select-cell');
          existingCell.setAttribute('data-label', 'Filtro');
        }
        return;
      }

      const selectCell = documentRef.createElement('td');
      selectCell.className = 'ui-select-cell';
      selectCell.setAttribute('data-label', 'Filtro');
      selectCell.innerHTML = '<input class="ui-table-checkbox ui-row-select" type="checkbox" aria-label="Selecionar linha">';
      selectCell.addEventListener('click', event => event.stopPropagation());
      selectCell.querySelector('input')?.addEventListener('change', () => updateSelectionCount(table));
      row.insertBefore(selectCell, row.firstElementChild);
    });
  }
  function ensureToolbar(table) {
    const existingToolbar = table.previousElementSibling;
    if (existingToolbar?.classList?.contains('ui-table-tools')) return existingToolbar;

    const toolbar = documentRef.createElement('div');
    toolbar.className = 'ui-table-tools';
    toolbar.innerHTML = [
      '<div class="ui-table-tools-left">',
      '<input class="input-glass ui-table-search" type="search" placeholder="Buscar nesta tabela..." aria-label="Buscar nesta tabela">',
      '<span class="ui-table-selected">0 selecionadas</span>',
      '</div>',
      '<div class="ui-table-tools-right">',
      '<span class="ui-table-info">0 registros</span>',
      '<select class="input-glass ui-table-page-size" aria-label="Linhas por página">',
      '<option value="10">10 por página</option>',
      '<option value="25" selected>25 por página</option>',
      '<option value="50">50 por página</option>',
      '<option value="100">100 por página</option>',
      '</select>',
      '<div class="ui-table-pagination">',
      '<button type="button" class="ui-table-page-btn" data-ui-page="prev">Anterior</button>',
      '<button type="button" class="ui-table-page-btn" data-ui-page="next">Próxima</button>',
      '</div>',
      '</div>'
    ].join('');

    table.parentElement?.insertBefore(toolbar, table);
    return toolbar;
  }

  function bindToolbar(table, toolbar) {
    if (toolbar.dataset.uiBound === 'true') return;
    toolbar.dataset.uiBound = 'true';
    const state = tableStates.get(table);

    toolbar.querySelector('.ui-table-search')?.addEventListener('input', event => {
      state.query = event.target.value || '';
      state.page = 1;
      applyTableView(table);
    });

    toolbar.querySelector('.ui-table-page-size')?.addEventListener('change', event => {
      state.pageSize = Number(event.target.value) || 25;
      state.page = 1;
      applyTableView(table);
    });

    toolbar.querySelector('[data-ui-page="prev"]')?.addEventListener('click', () => {
      state.page = Math.max(1, state.page - 1);
      applyTableView(table);
    });

    toolbar.querySelector('[data-ui-page="next"]')?.addEventListener('click', () => {
      state.page += 1;
      applyTableView(table);
    });
  }

  function bindSort(table) {
    if (table.dataset.uiSortReady === 'true') return;
    table.dataset.uiSortReady = 'true';
    const headers = Array.from(table.tHead?.rows?.[0]?.cells || []);
    headers.forEach(header => {
      if (header.classList.contains('ui-select-head')) return;
      const label = normalizeText(header.textContent);
      if (!label || label.includes('ações') || label.includes('acoes')) return;
      header.classList.add('ui-sortable');
      header.tabIndex = 0;
      header.setAttribute('role', 'button');
      header.setAttribute('aria-label', `Ordenar por ${header.textContent.trim()}`);
      const sortHandler = () => sortByColumn(table, header.cellIndex, header);
      header.addEventListener('click', sortHandler);
      header.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          sortHandler();
        }
      });
    });
  }

  function sortByColumn(table, columnIndex, header) {
    const state = tableStates.get(table);
    if (!state) return;
    const nextDirection = state.sortIndex === columnIndex && state.sortDirection === 'asc' ? 'desc' : 'asc';
    state.sortIndex = columnIndex;
    state.sortDirection = nextDirection;
    state.page = 1;

    Array.from(table.tHead?.querySelectorAll('th') || []).forEach(cell => {
      cell.classList.remove('ui-sort-asc', 'ui-sort-desc');
    });
    header.classList.add(nextDirection === 'asc' ? 'ui-sort-asc' : 'ui-sort-desc');

    const tbody = table.tBodies[0];
    const rows = getDataRows(table);
    rows.sort((firstRow, secondRow) => {
      const firstValue = parseComparableValue(firstRow.cells[columnIndex]?.textContent || '');
      const secondValue = parseComparableValue(secondRow.cells[columnIndex]?.textContent || '');
      let result = 0;
      if (firstValue.type === 'number' || firstValue.type === 'date') {
        result = firstValue.value - secondValue.value;
      } else {
        result = String(firstValue.value).localeCompare(String(secondValue.value), 'pt-BR');
      }
      return nextDirection === 'asc' ? result : result * -1;
    });

    rows.forEach(row => tbody.appendChild(row));
    applyTableView(table);
  }

  function removeGeneratedRows(table) {
    table.tBodies[0]?.querySelectorAll('[data-ui-generated="true"]').forEach(row => row.remove());
  }

  function getMatchingRows(table, rows, query) {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return rows;
    return rows.filter(row => normalizeText(row.textContent).includes(normalizedQuery));
  }

  function updateSelectionCount(table) {
    const toolbar = table.previousElementSibling?.classList?.contains('ui-table-tools') ? table.previousElementSibling : null;
    const selectedCount = getDataRows(table).filter(row => row.querySelector('.ui-row-select')?.checked).length;
    const selectedLabel = toolbar?.querySelector('.ui-table-selected');
    if (selectedLabel) selectedLabel.textContent = `${selectedCount} selecionada${selectedCount === 1 ? '' : 's'}`;

    const visibleRows = getDataRows(table).filter(row => row.style.display !== 'none');
    const checkedVisibleRows = visibleRows.filter(row => row.querySelector('.ui-row-select')?.checked);
    const selectAll = table.querySelector('.ui-table-select-all');
    if (selectAll) {
      selectAll.checked = visibleRows.length > 0 && checkedVisibleRows.length === visibleRows.length;
      selectAll.indeterminate = checkedVisibleRows.length > 0 && checkedVisibleRows.length < visibleRows.length;
    }
  }

  function addNoResultRow(table, colspan) {
    const row = documentRef.createElement('tr');
    row.className = 'ui-table-no-results table-row--full';
    row.setAttribute('data-ui-generated', 'true');
    const cell = documentRef.createElement('td');
    cell.colSpan = colspan;
    cell.textContent = 'Nenhum registro encontrado para a busca atual.';
    row.appendChild(cell);
    table.tBodies[0]?.appendChild(row);
  }

  function applyTableView(table) {
    const state = tableStates.get(table);
    if (!state || state.applying) return;
    state.applying = true;

    try {
      ensureSelectionColumn(table);
      bindSelectAll(table);
      removeGeneratedRows(table);

      const toolbar = table.previousElementSibling?.classList?.contains('ui-table-tools') ? table.previousElementSibling : null;
      const allRows = getDataRows(table);
      const matchingRows = getMatchingRows(table, allRows, state.query);
      const totalPages = Math.max(1, Math.ceil(matchingRows.length / state.pageSize));
      state.page = Math.min(Math.max(1, state.page), totalPages);
      const start = (state.page - 1) * state.pageSize;
      const pageRows = new Set(matchingRows.slice(start, start + state.pageSize));

      allRows.forEach(row => {
        row.style.display = pageRows.has(row) ? '' : 'none';
      });

      if (!matchingRows.length && allRows.length) {
        addNoResultRow(table, table.tHead?.rows?.[0]?.cells?.length || 1);
      }

      const info = toolbar?.querySelector('.ui-table-info');
      if (info) {
        const pageInfo = matchingRows.length ? `${start + 1}-${Math.min(start + state.pageSize, matchingRows.length)}` : '0';
        info.textContent = `${pageInfo} de ${matchingRows.length} registros`;
      }

      const prev = toolbar?.querySelector('[data-ui-page="prev"]');
      const next = toolbar?.querySelector('[data-ui-page="next"]');
      if (prev) prev.disabled = state.page <= 1;
      if (next) next.disabled = state.page >= totalPages;

      updateSelectionCount(table);
      global.IRANCASH?.applyResponsiveTableLabels?.(table.parentElement || documentRef);
    } finally {
      state.applying = false;
    }
  }

  function bindSelectAll(table) {
    const selectAll = table.querySelector('.ui-table-select-all');
    if (!selectAll || selectAll.dataset.uiBound === 'true') return;
    selectAll.dataset.uiBound = 'true';
    selectAll.addEventListener('change', () => {
      getDataRows(table)
        .filter(row => row.style.display !== 'none')
        .forEach(row => {
          const checkbox = row.querySelector('.ui-row-select');
          if (checkbox) checkbox.checked = selectAll.checked;
        });
      updateSelectionCount(table);
    });
  }

  function observeTable(table) {
    const tbody = table.tBodies[0];
    const state = tableStates.get(table);
    if (!tbody || !global.MutationObserver || state.observer) return;

    let scheduled = false;
    const scheduleApply = () => {
      if (state.applying) return;
      if (scheduled) return;
      scheduled = true;
      global.requestAnimationFrame(() => {
        scheduled = false;
        ensureSelectionColumn(table);
        bindSelectAll(table);
        applyTableView(table);
      });
    };

    state.observer = new MutationObserver(scheduleApply);
    state.observer.observe(tbody, { childList: true, subtree: true });

    if (table.tHead && !state.headerObserver) {
      state.headerObserver = new MutationObserver(scheduleApply);
      state.headerObserver.observe(table.tHead, { childList: true, subtree: true, characterData: true });
    }
  }

  function enhanceTable(table) {
    if (!shouldEnhanceTable(table)) return;
    if (!tableStates.has(table)) {
      tableStates.set(table, {
        query: '',
        page: 1,
        pageSize: 25,
        sortIndex: null,
        sortDirection: 'asc',
        applying: false,
        observer: null,
        headerObserver: null
      });
    }

    table.setAttribute(ENHANCED_ATTR, 'true');
    const toolbar = ensureToolbar(table);
    bindToolbar(table, toolbar);
    ensureSelectionColumn(table);
    bindSelectAll(table);
    bindSort(table);
    observeTable(table);
    applyTableView(table);
  }

  function enhanceTables(root) {
    const scope = root?.querySelectorAll ? root : documentRef;
    scope.querySelectorAll('table.data-table').forEach(enhanceTable);
  }

  function createMobileActionDock() {
    if (getPageName() !== 'dashboard') return;
    if (documentRef.querySelector('.ui-mobile-action-dock')) return;
    if (!documentRef.body.classList.contains('mobile-dashboard-active') && global.innerWidth > 767) return;

    const wrapper = documentRef.getElementById('mobilePageWrapper') || documentRef.querySelector('.main-content');
    if (!wrapper) return;
    const dock = documentRef.createElement('div');
    dock.id = 'uiMobileActionDock';
    dock.className = 'ui-mobile-action-dock';

    const actions = [
      { label: 'Receita', href: 'receitas.html?acao=nova-receita', className: 'btn btn-success' },
      { label: 'Despesa', href: 'despesas.html?acao=nova-despesa', className: 'btn btn-danger' },
      { label: 'Importar', href: 'receitas.html?acao=importar-vendas', className: 'btn btn-secondary' }
    ];

    actions.forEach(action => {
      const link = documentRef.createElement('a');
      link.href = action.href;
      link.className = action.className;
      link.textContent = action.label;
      dock.appendChild(link);
    });

    wrapper.insertBefore(dock, wrapper.firstElementChild?.nextElementSibling || wrapper.firstElementChild || null);
  }

  function isMobileDashboard() {
    return getPageName() === 'dashboard' && global.innerWidth <= 767;
  }

  function setupMutationEnhancer() {
    if (!global.MutationObserver || documentRef.body?.dataset?.uiObserverReady === 'true') return;
    documentRef.body.dataset.uiObserverReady = 'true';
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      global.setTimeout(() => {
        scheduled = false;
        highlightPrimaryActions();
        if (isMobileDashboard()) return;
        enhanceEmptyStates(documentRef);
        enhanceTables(documentRef);
        createMobileActionDock();
      }, 80);
    });
    observer.observe(documentRef.body, { childList: true, subtree: true });
  }

  function init() {
    enhanceLoadingOverlay();
    addDashboardImportAction();
    updateDashboardLinks();
    highlightPrimaryActions();
    if (!isMobileDashboard()) {
      enhanceEmptyStates(documentRef);
      enhanceTables(documentRef);
    }
    handleQueryAction();
    if (!isMobileDashboard()) createMobileActionDock();
    setupMutationEnhancer();
  }

  global.LavaCashUI = {
    enhanceTables,
    enhanceEmptyStates,
    highlightPrimaryActions,
    version: '20260608-uiux'
  };

  onReady(init);
})(window);
