/**
 * LavaCash - Mobile App Controller
 * Injeta a UI mobile no DOM quando a tela e <= 767px.
 */

(function MobileApp() {
  'use strict';

  const IS_MOBILE = () => window.innerWidth <= 767;
  const ARROW_UP = '\u25B2';
  const ARROW_DOWN = '\u25BC';
  const MOBILE_ICONS = {
    success: '\u2705',
    error: '\u274C',
    info: '\u2139\uFE0F',
    store: '\u{1F3EA}',
    money: '\u{1F4B0}',
    chartDown: '\u{1F4C9}',
    chart: '\u{1F4CA}',
    inbox: '\u{1F4ED}',
    card: '\u{1F4B3}',
    outbox: '\u{1F4E4}',
    lightning: '\u26A1',
    moon: '\u{1F319}',
    sunrise: '\u{1F305}',
    sun: '\u2600\uFE0F',
    cityNight: '\u{1F306}'
  };

  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'S\u00e1b', 'Dom'];
  const mobileDashboardArrayCache = Object.create(null);
  let mobileDashboardHydrationPromise = null;
  let mobileDashboardSyncLaundryId = '';
  let mobileDashboardRefreshFrame = null;
  const mobileDashboardUnsubscribers = [];

  function getFinancialData(overrideMes, overrideAno) {
    const lavId = getMobileLavId();
    if (overrideMes === undefined && overrideAno === undefined) {
      syncInitialDashboardSelection(lavId);
    }

    const mes = (overrideMes !== undefined && overrideMes !== null) ? overrideMes : _mobDashMes;
    const ano = (overrideAno !== undefined && overrideAno !== null) ? overrideAno : _mobDashAno;
    const { receitas, despesas } = getMobileMovimentacoes(lavId);
    const dadosMes = getDadosMesMobile(mes, ano, receitas, despesas);
    const mesAnterior = getMesAnteriorMobile(mes, ano);
    const dadosAnterior = getDadosMesMobile(mesAnterior.mes, mesAnterior.ano, receitas, despesas);

    const lucro = dadosMes.saldo;
    const lucroAnt = dadosAnterior.saldo;
    const var_ = dadosAnterior.receitas > 0 ? ((dadosMes.receitas - dadosAnterior.receitas) / dadosAnterior.receitas * 100).toFixed(1) : null;
    const varL = lucroAnt > 0 ? ((lucro - lucroAnt) / lucroAnt * 100).toFixed(1) : null;
    const margem = dadosMes.receitas > 0 ? (lucro / dadosMes.receitas * 100).toFixed(1) : 0;

    return {
      recMes: dadosMes.receitas,
      despMes: dadosMes.despesas,
      lucro,
      margem,
      var_,
      varL,
      receitas,
      despesas,
      receitasRegistros: dadosMes.receitasRegistros,
      despesasRegistros: dadosMes.despesasRegistros,
      mes,
      ano,
      lavId,
      anterior: dadosAnterior,
      anteriorLabel: `${MESES[mesAnterior.mes]}/${mesAnterior.ano}`
    };
  }

  function fmtBRL(n) {
    return 'R$\u00a0' + Number(n || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getMobileLavId() {
    return document.getElementById('lavanderiaSelect')?.value
      || window.UserSystem?.getLavanderiaSelecionada?.()?.id
      || 'default';
  }

  function readMobileArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(parsed)) return [];
      const normalized = window.LavaCashFinanceDedupe?.normalizeFinanceArrayForKey?.(key, parsed);
      return normalized ? normalized.items : parsed;
    } catch {
      return [];
    }
  }

  function getMobileMovimentacoes(lavId = getMobileLavId()) {
    const receitasKey = `${lavId}_receitas`;
    const despesasKey = `${lavId}_despesas`;

    return {
      receitas: Array.isArray(mobileDashboardArrayCache[receitasKey]) ? mobileDashboardArrayCache[receitasKey] : readMobileArray(receitasKey),
      despesas: Array.isArray(mobileDashboardArrayCache[despesasKey]) ? mobileDashboardArrayCache[despesasKey] : readMobileArray(despesasKey)
    };
  }

  function getMobileArrayIdentity(item) {
    if (window.LavaCashFinanceDedupe?.getFinanceItemIdentity) {
      return window.LavaCashFinanceDedupe.getFinanceItemIdentity(item, 'mobile');
    }
    if (item?.id) return `id:${item.id}`;
    return [item?.data, item?.valor, item?.categoria, item?.descricao]
      .map(value => String(value ?? ''))
      .join('|');
  }

  function mergeMobileArrays(primary, secondary) {
    const combined = [
      ...(Array.isArray(primary) ? primary : []),
      ...(Array.isArray(secondary) ? secondary : [])
    ];
    const normalized = window.LavaCashFinanceDedupe?.dedupeFinanceArray?.(combined, 'mobile');
    if (normalized) return normalized;

    const merged = [];
    const seen = new Set();

    combined.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const key = getMobileArrayIdentity(item);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    });

    return { items: merged, removed: 0 };
  }

  async function readMobileArrayFromStores(key) {
    const localData = readMobileArray(key);
    let storedData = null;

    if (!Array.isArray(storedData) && window.IndexedDBStore && typeof window.IndexedDBStore.getItem === 'function') {
      try {
        storedData = await window.IndexedDBStore.getItem(key, null);
      } catch {}
    }

    if (Array.isArray(storedData)) return storedData;
    return localData;
  }

  async function hydrateMobileDashboardData(options = {}) {
    const force = options.force === true;

    if (mobileDashboardHydrationPromise && !force) {
      return mobileDashboardHydrationPromise;
    }

    mobileDashboardHydrationPromise = (async () => {
      const lavId = getMobileLavId();
      const receitasKey = `${lavId}_receitas`;
      const despesasKey = `${lavId}_despesas`;

      const [receitas, despesas] = await Promise.all([
        readMobileArrayFromStores(receitasKey),
        readMobileArrayFromStores(despesasKey)
      ]);

      mobileDashboardArrayCache[receitasKey] = receitas;
      mobileDashboardArrayCache[despesasKey] = despesas;

      if (!_mobDashUserSelected) {
        _mobDashSelectionInitialized = false;
      }
    })();

    try {
      await mobileDashboardHydrationPromise;
    } finally {
      mobileDashboardHydrationPromise = null;
    }
  }

  function persistMobileDashboardArray(key, data) {
    const safeData = Array.isArray(data) ? data : [];
    mobileDashboardArrayCache[key] = safeData;
    const keepLocalCopy = window.LavaCashFinanceDedupe?.shouldKeepLocalStorageCopy?.(key) !== false;

    if (window.IndexedDBStore && typeof window.IndexedDBStore.setItem === 'function') {
      window.IndexedDBStore.setItem(key, safeData)
        .then(saved => {
          if (saved !== false && !keepLocalCopy) localStorage.removeItem(key);
        })
        .catch(() => {
          try { localStorage.setItem(key, JSON.stringify(safeData)); } catch {}
        });
    }

    if (keepLocalCopy || !window.IndexedDBStore?.setItem) {
      try { localStorage.setItem(key, JSON.stringify(safeData)); } catch {}
    }
  }

  function scheduleMobileDashboardBuild() {
    if (mobileDashboardRefreshFrame !== null) return;
    const run = () => {
      mobileDashboardRefreshFrame = null;
      if (IS_MOBILE() && document.body.getAttribute('data-page') === 'dashboard') buildDashboard();
    };
    mobileDashboardRefreshFrame = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(run)
      : window.setTimeout(run, 16);
  }

  function clearMobileDashboardSync() {
    while (mobileDashboardUnsubscribers.length) {
      try { mobileDashboardUnsubscribers.pop()(); } catch {}
    }
    mobileDashboardSyncLaundryId = '';
  }

  function setupMobileDashboardSync() {
    if (!IS_MOBILE() || document.body.getAttribute('data-page') !== 'dashboard') return;
    if (!window.FirebaseStore || typeof window.FirebaseStore.subscribe !== 'function') return;

    const lavId = getMobileLavId();
    if (mobileDashboardSyncLaundryId === lavId && mobileDashboardUnsubscribers.length) return;

    clearMobileDashboardSync();
    mobileDashboardSyncLaundryId = lavId;

    const syncKey = (key) => window.FirebaseStore.subscribe(key, (data) => {
      const local = Array.isArray(mobileDashboardArrayCache[key])
        ? mobileDashboardArrayCache[key]
        : readMobileArray(key);

      if (!Array.isArray(data)) return;
      const remote = window.FirebaseStore.reconcileFinanceSnapshot(key, local, data);
      persistMobileDashboardArray(key, remote);

      if (!_mobDashUserSelected) _mobDashSelectionInitialized = false;
      scheduleMobileDashboardBuild();
    });

    mobileDashboardUnsubscribers.push(
      syncKey(`${lavId}_receitas`),
      syncKey(`${lavId}_despesas`)
    );
  }

  function parseDataLocal(data) {
    if (!data) return null;
    const date = new Date(String(data).slice(0, 10) + 'T00:00:00');
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function filtrarRegistrosMesAnoMobile(registros, mes, ano) {
    return registros.filter(registro => {
      const data = parseDataLocal(registro?.data);
      return data && data.getMonth() === mes && data.getFullYear() === ano;
    });
  }

  function getDadosMesMobile(mes, ano, receitas, despesas) {
    const receitasRegistros = filtrarRegistrosMesAnoMobile(receitas || [], mes, ano);
    const despesasRegistros = filtrarRegistrosMesAnoMobile(despesas || [], mes, ano);
    const receitasTotal = receitasRegistros.reduce((sum, registro) => sum + Number(registro.valor || 0), 0);
    const despesasTotal = despesasRegistros.reduce((sum, registro) => sum + Number(registro.valor || 0), 0);

    return {
      receitas: receitasTotal,
      despesas: despesasTotal,
      saldo: receitasTotal - despesasTotal,
      receitasRegistros,
      despesasRegistros
    };
  }

  function getMesAnteriorMobile(mes, ano) {
    const referencia = new Date(ano, mes, 1);
    referencia.setMonth(referencia.getMonth() - 1);
    return { mes: referencia.getMonth(), ano: referencia.getFullYear() };
  }

  function getDiaSemanaIndexMobile(data) {
    const dia = data.getDay();
    return dia === 0 ? 6 : dia - 1;
  }

  function getResumoDiaSemanaMobile(d) {
    const resumo = DIAS_SEMANA.map(dia => ({
      dia,
      receitas: 0,
      despesas: 0,
      saldo: 0,
      quantidadeReceitas: 0,
      ticketMedio: 0
    }));

    d.receitasRegistros.forEach(registro => {
      const data = parseDataLocal(registro.data);
      if (!data) return;
      const indice = getDiaSemanaIndexMobile(data);
      resumo[indice].receitas += Number(registro.valor || 0);
      resumo[indice].quantidadeReceitas += 1;
    });

    d.despesasRegistros.forEach(registro => {
      const data = parseDataLocal(registro.data);
      if (!data) return;
      resumo[getDiaSemanaIndexMobile(data)].despesas += Number(registro.valor || 0);
    });

    resumo.forEach(item => {
      item.saldo = item.receitas - item.despesas;
      item.ticketMedio = item.quantidadeReceitas > 0 ? item.receitas / item.quantidadeReceitas : 0;
    });

    return resumo;
  }

  function normalizarHorarioMobile(valor) {
    if (valor === null || valor === undefined) return null;

    const texto = String(valor).trim().replace(/(\d{1,2})h(\d{2})/i, '$1:$2');
    if (!texto) return null;

    const match = texto.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
    if (!match) return null;

    const horas = Number(match[1]);
    const minutos = Number(match[2]);
    if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;

    return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
  }

  function formatarHorarioDateMobile(data) {
    if (!(data instanceof Date) || Number.isNaN(data.getTime())) return null;

    const horas = data.getHours();
    const minutos = data.getMinutes();
    const segundos = data.getSeconds();
    if (horas === 0 && minutos === 0 && segundos === 0) return null;

    return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
  }

  function getHorarioRegistroVendaMobile(registro) {
    if (!registro || typeof registro !== 'object') return null;

    const candidatosDiretos = [
      registro.horarioVenda,
      registro.horario,
      registro.time,
      registro.hora,
      registro.dataHora,
      registro.data_hora
    ];

    for (const candidato of candidatosDiretos) {
      const horario = normalizarHorarioMobile(candidato);
      if (horario) return horario;
    }

    for (const candidato of [registro.obs, registro.descricao]) {
      const horario = normalizarHorarioMobile(candidato);
      if (horario) return horario;
    }

    if (typeof registro.data === 'string' && /\d{1,2}:\d{2}/.test(registro.data)) {
      const horarioData = normalizarHorarioMobile(registro.data);
      if (horarioData) return horarioData;
    }

    const timestamp = Number(registro.timestamp || registro.dateMs || 0);
    if (timestamp > 0) {
      const horarioTimestamp = formatarHorarioDateMobile(new Date(timestamp));
      if (horarioTimestamp) return horarioTimestamp;
    }

    return null;
  }

  function getPeriodoDoDiaMobile(horario) {
    const horarioNormalizado = normalizarHorarioMobile(horario);
    if (!horarioNormalizado) return null;

    const [hora] = horarioNormalizado.split(':').map(Number);
    if (hora <= 4) return 'madrugada';
    if (hora <= 11) return 'manha';
    if (hora <= 17) return 'tarde';
    return 'noite';
  }

  function getResumoPeriodoDiaMobile(d) {
    const resumo = [
      { key: 'madrugada', name: 'Madrugada', faixa: '0h\u20134h59', emoji: MOBILE_ICONS.moon, bg: 'rgba(99,102,241,0.15)', vendas: 0, quantidade: 0 },
      { key: 'manha', name: 'Manh\u00e3', faixa: '5h\u201311h59', emoji: MOBILE_ICONS.sunrise, bg: 'rgba(245,158,11,0.15)', vendas: 0, quantidade: 0 },
      { key: 'tarde', name: 'Tarde', faixa: '12h\u201317h59', emoji: MOBILE_ICONS.sun, bg: 'rgba(14,165,233,0.15)', vendas: 0, quantidade: 0 },
      { key: 'noite', name: 'Noite', faixa: '18h\u201323h59', emoji: MOBILE_ICONS.cityNight, bg: 'rgba(139,92,246,0.15)', vendas: 0, quantidade: 0 }
    ];
    let vendasSemHorario = 0;
    let quantidadeSemHorario = 0;

    d.receitasRegistros.forEach(registro => {
      const valor = Number(registro.valor || 0);
      const periodo = getPeriodoDoDiaMobile(getHorarioRegistroVendaMobile(registro));

      if (!periodo) {
        vendasSemHorario += valor;
        quantidadeSemHorario += 1;
        return;
      }

      const item = resumo.find(entry => entry.key === periodo);
      if (!item) return;
      item.vendas += valor;
      item.quantidade += 1;
    });

    const totalConsiderado = resumo.reduce((sum, item) => sum + item.vendas, 0);
    resumo.forEach(item => {
      item.participacao = totalConsiderado > 0 ? (item.vendas / totalConsiderado) * 100 : 0;
    });

    return { resumo, totalConsiderado, vendasSemHorario, quantidadeSemHorario };
  }

  function getDesktopDashboardSelection() {
    const activeMonth = document.querySelector('#monthsGrid .month-card.active[data-month]');
    const ano = Number(document.getElementById('anoSelect')?.value);
    const mes = Number(activeMonth?.getAttribute('data-month'));
    if (!Number.isInteger(mes) || mes < 0 || mes > 11 || !Number.isInteger(ano)) return null;
    return { mes, ano };
  }

  function getInitialDashboardSelection(lavId) {
    const now = new Date();
    const anoAtual = now.getFullYear();
    const { receitas, despesas } = getMobileMovimentacoes(lavId);
    const anos = new Set();

    [...receitas, ...despesas].forEach(registro => {
      const ano = String(registro?.data || '').slice(0, 4);
      if (/^\d{4}$/.test(ano)) anos.add(Number(ano));
    });

    const anosOrdenados = [...anos].sort((a, b) => a - b);
    const ano = anos.has(anoAtual) ? anoAtual : (anosOrdenados[anosOrdenados.length - 1] || anoAtual);
    let mes = ano === anoAtual ? now.getMonth() : 11;
    const dadosMes = getDadosMesMobile(mes, ano, receitas, despesas);

    if (dadosMes.receitas === 0 && dadosMes.despesas === 0) {
      for (let index = 11; index >= 0; index--) {
        const dados = getDadosMesMobile(index, ano, receitas, despesas);
        if (dados.receitas > 0 || dados.despesas > 0) {
          mes = index;
          break;
        }
      }
    }

    return { mes, ano };
  }

  function syncInitialDashboardSelection(lavId = getMobileLavId()) {
    if (_mobDashUserSelected) return;

    const desktopSelection = getDesktopDashboardSelection();
    if (desktopSelection) {
      _mobDashMes = desktopSelection.mes;
      _mobDashAno = desktopSelection.ano;
      _mobDashSelectionInitialized = true;
      return;
    }

    if (_mobDashSelectionInitialized) return;

    const selection = getInitialDashboardSelection(lavId);
    _mobDashMes = selection.mes;
    _mobDashAno = selection.ano;
    _mobDashSelectionInitialized = true;
  }

  function showToast(msg, type = 'success') {
    let el = document.getElementById('mobileToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mobileToast';
      el.className = 'mobile-toast';
      document.body.appendChild(el);
    }
    const icon = type === 'success' ? MOBILE_ICONS.success : type === 'error' ? MOBILE_ICONS.error : MOBILE_ICONS.info;
    el.className = `mobile-toast ${type}`;
    el.innerHTML = `${icon} ${escapeHtml(msg)}`;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }

  function getAllowedMobileLaundries() {
    return window.UserSystem?.getMinhasLavanderias?.() || [];
  }

  function hasMobilePermission(pageId) {
    if (!window.UserSystem || typeof window.UserSystem.verificarPermissao !== 'function') {
      return ['dashboard', 'analise-financeira', 'ajuda'].includes(pageId);
    }

    return window.UserSystem.verificarPermissao(pageId);
  }

  function getMobileLaundryMarkup(lav, laundries) {
    if (!lav) return '';

    const label = `${MOBILE_ICONS.store} ${escapeHtml(lav.nome)}`;
    if (laundries.length <= 1) {
      return `<div class="mobile-lav-pill">${label}</div>`;
    }

    return `
      <button type="button" class="mobile-lav-pill mobile-lav-pill-button" id="mobileLaundryBtn" title="Trocar lavanderia">
        <span>${label}</span>
        <span class="mobile-lav-caret">\u25BE</span>
      </button>
    `;
  }

  function injectHeader() {
    if (document.getElementById('mobileHeader')) return;

    const user = window.UserSystem?.getCurrentUser?.();
    const lav = window.UserSystem?.getLavanderiaSelecionada?.();
    const laundries = getAllowedMobileLaundries();
    const initials = (user?.nome || 'U').charAt(0).toUpperCase();
    const page = document.body.getAttribute('data-page') || '';
    const pageLabels = {
      dashboard: 'Dashboard',
      receitas: 'Receitas',
      despesas: 'Despesas',
      'analise-financeira': 'An\u00e1lise',
      'investimento-inicial': 'Investimento',
      configuracoes: 'Configura\u00e7\u00f5es',
      ajuda: 'Ajuda'
    };
    const pageTitle = pageLabels[page] || 'LavaCash';

    const header = document.createElement('header');
    header.id = 'mobileHeader';
    header.className = 'mobile-header';
    header.innerHTML = `
      <div class="mobile-header-title">
        <div class="mobile-header-brand">LavaCash</div>
        <div class="mobile-header-page">${pageTitle}</div>
      </div>
      <div class="mobile-header-right">
        ${getMobileLaundryMarkup(lav, laundries)}
        <div class="mobile-avatar" id="mobileAvatarBtn" title="${escapeHtml(user?.nome || 'Usu\u00e1rio')}">${escapeHtml(initials)}</div>
      </div>
    `;
    document.body.prepend(header);

    document.getElementById('mobileLaundryBtn')?.addEventListener('click', openLaundrySheet);
    document.getElementById('mobileAvatarBtn')?.addEventListener('click', openProfileSheet);
  }

  function pageMatches(page, linkId) {
    return page === linkId || (page === 'investimento' && linkId === 'investimento-inicial');
  }

  function injectBottomNav() {
    if (document.getElementById('mobileBottomNav')) return;
    const page = document.body.getAttribute('data-page') || '';

    const allLinks = [
      { id: 'dashboard', href: 'dashboard.html', icon: iconHome(), label: 'Home' },
      { id: 'receitas', href: 'receitas.html', icon: iconReceipts(), label: 'Receitas' },
      { id: 'despesas', href: 'despesas.html', icon: iconExpenses(), label: 'Despesas' },
      { id: 'analise-financeira', href: 'analise-financeira.html', icon: iconChart(), label: 'An\u00e1lise' },
      { id: 'investimento-inicial', href: 'investimento-inicial.html', icon: iconInvestimento(), label: 'Investimento' },
      { id: 'ajuda', href: 'ajuda.html', icon: iconAjuda(), label: 'Ajuda' },
      { id: 'configuracoes', href: 'configuracoes.html', icon: iconSettings(), label: 'Config' }
    ];

    const links = allLinks.filter(link => hasMobilePermission(link.id));

    const nav = document.createElement('nav');
    nav.id = 'mobileBottomNav';
    nav.className = 'mobile-bottom-nav';
    nav.innerHTML = links.map(l => `
      <a href="${l.href}" class="mobile-nav-item ${pageMatches(page, l.id) ? 'active' : ''}" data-page="${l.id}">
        ${l.icon}
        <span>${l.label}</span>
      </a>
    `).join('');
    document.body.appendChild(nav);
  }

  function injectFAB() {
    if (document.getElementById('mobileFAB')) return;
    const page = document.body.getAttribute('data-page') || '';

    const pageActions = {
      dashboard: { href: 'receitas.html?acao=nova-receita', title: 'Nova Receita', permission: 'receitas' },
      receitas: { fn: () => typeof abrirModal !== 'undefined' ? abrirModal() : document.getElementById('btnNovaReceita')?.click(), title: 'Nova Receita', permission: 'receitas' },
      despesas: { fn: () => document.getElementById('btnNovaDespesa')?.click(), title: 'Nova Despesa', permission: 'despesas' },
      'analise-financeira': { fn: () => window.print(), title: 'Exportar PDF', permission: 'analise-financeira' },
      'investimento-inicial': { fn: () => document.getElementById('btnNovoInvestimento')?.click(), title: 'Investimento', permission: 'investimento-inicial' }
    };

    const action = pageActions[page];
    if (!action) return;
    if (action.permission && !hasMobilePermission(action.permission)) return;

    const fab = document.createElement('button');
    fab.id = 'mobileFAB';
    fab.className = 'mobile-fab';
    fab.title = action.title;
    fab.innerHTML = `
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
      </svg>
    `;
    fab.addEventListener('click', () => {
      if (action.href) {
        window.location.href = action.href;
      } else if (action.fn) {
        fab.style.transform = 'rotate(45deg) scale(0.9)';
        action.fn();
        setTimeout(() => {
          fab.style.transform = '';
        }, 300);
      }
    });
    document.body.appendChild(fab);
  }

  function openLaundrySheet() {
    const laundries = getAllowedMobileLaundries();
    const current = window.UserSystem?.getLavanderiaSelecionada?.();

    if (laundries.length <= 1) return;

    openSheet(`
      <div class="mobile-laundry-list">
        ${laundries.map(laundry => {
          const active = String(laundry.id) === String(current?.id);
          return `
            <button type="button" class="mobile-laundry-option ${active ? 'active' : ''}" data-laundry-id="${escapeHtml(laundry.id)}">
              <span class="mobile-laundry-name">${escapeHtml(laundry.nome || 'Lavanderia')}</span>
              ${active ? '<span class="mobile-laundry-check">\u2713</span>' : ''}
            </button>
          `;
        }).join('')}
      </div>
    `, 'Trocar Lavanderia');

    document.querySelectorAll('.mobile-laundry-option[data-laundry-id]').forEach(button => {
      button.addEventListener('click', () => {
        const laundryId = button.getAttribute('data-laundry-id');
        const selected = window.UserSystem?.selecionarLavanderia?.(laundryId);
        if (!selected) {
          showToast('Voc\u00ea n\u00e3o tem acesso a esta lavanderia.', 'error');
          return;
        }

        const desktopSelect = document.getElementById('lavanderiaSelect');
        if (desktopSelect) desktopSelect.value = selected.id;

        window.dispatchEvent(new CustomEvent('laundry:changed', {
          detail: { laundryId: selected.id }
        }));

        showToast(`Lavanderia alterada para ${selected.nome || 'selecionada'}.`, 'info');
        setTimeout(() => window.location.reload(), 250);
      });
    });
  }

  function openProfileSheet() {
    const user = window.UserSystem?.getCurrentUser?.();
    const lav = window.UserSystem?.getLavanderiaSelecionada?.();
    const laundries = getAllowedMobileLaundries();
    openSheet(`
      <div style="text-align:center;margin-bottom:1.5rem;">
        <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:800;color:white;margin:0 auto 0.75rem;">
          ${escapeHtml((user?.nome || 'U').charAt(0).toUpperCase())}
        </div>
        <div style="font-size:1rem;font-weight:700;">${escapeHtml(user?.nome || 'Usu\u00e1rio')}</div>
        <div style="font-size:0.8rem;color:var(--color-text-muted);margin-top:0.25rem;">${escapeHtml(user?.email || '')}</div>
        <div style="margin-top:0.5rem;">
          <span class="badge badge-info">${escapeHtml(window.UserSystem?.ROLE_LABELS?.[user?.tipoAcesso] || 'Visualizador')}</span>
        </div>
      </div>
      ${lav ? `<div style="background:var(--color-glass);border:1px solid var(--color-glass-border);border-radius:14px;padding:0.85rem 1rem;margin-bottom:1rem;font-size:0.875rem;color:var(--color-text-secondary);">
        ${MOBILE_ICONS.store} <strong style="color:var(--color-text-primary);">${escapeHtml(lav.nome)}</strong>
      </div>` : ''}
      ${laundries.length > 1 ? `<button id="mobileProfileLaundryBtn" class="btn btn-secondary w-full" style="width:100%;justify-content:center;margin-bottom:0.75rem;">Trocar lavanderia</button>` : ''}
      <button onclick="UserSystem.logout()" class="btn btn-danger w-full" style="width:100%;justify-content:center;">
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
        Sair da conta
      </button>
    `, 'Minha Conta');

    document.getElementById('mobileProfileLaundryBtn')?.addEventListener('click', openLaundrySheet);
  }

  function openSheet(content, title = '') {
    let overlay = document.getElementById('mobileSheetOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'mobileSheetOverlay';
      overlay.className = 'mobile-sheet-overlay';
      overlay.innerHTML = '<div class="mobile-sheet" id="mobileSheet"><div class="mobile-sheet-handle"></div><div class="mobile-sheet-title" id="mobileSheetTitle"></div><div id="mobileSheetBody"></div></div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', e => {
        if (e.target === overlay) closeSheet();
      });
    }
    document.getElementById('mobileSheetTitle').textContent = title;
    document.getElementById('mobileSheetBody').innerHTML = content;
    overlay.classList.add('active');
    document.getElementById('mobileSheet').classList.add('active');
  }

  function closeSheet() {
    document.getElementById('mobileSheetOverlay')?.classList.remove('active');
    document.getElementById('mobileSheet')?.classList.remove('active');
  }

  function getOrCreateWrapper() {
    let w = document.getElementById('mobilePageWrapper');
    if (!w) {
      w = document.createElement('div');
      w.id = 'mobilePageWrapper';
      w.className = 'mobile-page-wrapper';
      const main = document.querySelector('.main-content');
      main ? main.after(w) : document.body.appendChild(w);
    }
    return w;
  }

  let _mobDashMes = new Date().getMonth();
  let _mobDashAno = new Date().getFullYear();
  let _mobDashSelectionInitialized = false;
  let _mobDashUserSelected = false;
  let mobileWeekdayChartInstance = null;
  let mobileComparisonChartInstance = null;
  let mobileChartLoadStarted = false;
  let mobileChartObserver = null;

  function refreshMobileHeroKPI(d) {
    const varBadge = d.var_ !== null
      ? `<span class="mobile-hero-badge ${parseFloat(d.var_) < 0 ? 'negative' : ''}">${parseFloat(d.var_) >= 0 ? ARROW_UP : ARROW_DOWN} ${Math.abs(d.var_)}%</span>`
      : '';
    const elLabel = document.getElementById('mobileHeroLabel');
    const elValue = document.getElementById('mobileHeroValue');
    const elSub = document.getElementById('mobileHeroSub');
    if (elLabel) elLabel.textContent = `Lucro \u2022 ${MESES[d.mes]} ${d.ano}`;
    if (elValue) elValue.textContent = fmtBRL(d.lucro);
    if (elSub) elSub.innerHTML = `Margem: ${d.margem}% ${varBadge}`;

    const elRec = document.getElementById('mobileKpiRec');
    const elDesp = document.getElementById('mobileKpiDesp');
    const elMar = document.getElementById('mobileKpiMar');
    if (elRec) elRec.textContent = fmtBRL(d.recMes);
    if (elDesp) elDesp.textContent = fmtBRL(d.despMes);
    if (elMar) elMar.textContent = `${d.margem}%`;
  }

  function scheduleMobileChartLoad() {
    if (typeof Chart !== 'undefined' || mobileChartLoadStarted || !window.LavaCashVendorLoader?.loadChart) return;
    const target = document.getElementById('mobileWeekdayChartCanvas')?.closest('.mobile-chart-card');
    if (!target) return;

    const loadCharts = () => {
      if (mobileChartLoadStarted) return;
      mobileChartLoadStarted = true;
      mobileChartObserver?.disconnect();
      mobileChartObserver = null;
      window.LavaCashVendorLoader.loadChart()
        .then(() => scheduleMobileDashboardBuild())
        .catch(() => { mobileChartLoadStarted = false; });
    };

    if (typeof window.IntersectionObserver !== 'function') {
      window.setTimeout(loadCharts, 700);
      return;
    }

    mobileChartObserver?.disconnect();
    mobileChartObserver = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) loadCharts();
    }, { rootMargin: '160px 0px' });
    mobileChartObserver.observe(target);
  }

  function buildDashboard() {
    const d = getFinancialData();
    const wrapper = getOrCreateWrapper();

    const varBadge = d.var_ !== null
      ? `<span class="mobile-hero-badge ${parseFloat(d.var_) < 0 ? 'negative' : ''}">${parseFloat(d.var_) >= 0 ? ARROW_UP : ARROW_DOWN} ${Math.abs(d.var_)}%</span>`
      : '';
    const mobileDashboardActions = [
      hasMobilePermission('receitas') ? '<a class="btn btn-success" href="receitas.html?acao=nova-receita">Receita</a>' : '',
      hasMobilePermission('despesas') ? '<a class="btn btn-danger" href="despesas.html?acao=nova-despesa">Despesa</a>' : '',
      hasMobilePermission('receitas') ? '<a class="btn btn-secondary" href="receitas.html?acao=importar-vendas">Importar</a>' : ''
    ].filter(Boolean).join('');

    wrapper.innerHTML = `
      <div class="mobile-hero mobile-animate">
        <div class="mobile-hero-label" id="mobileHeroLabel">Lucro \u2022 ${MESES[d.mes]} ${d.ano}</div>
        <div class="mobile-hero-value" id="mobileHeroValue">${fmtBRL(d.lucro)}</div>
        <div class="mobile-hero-sub" id="mobileHeroSub">
          Margem: ${d.margem}%
          ${varBadge}
        </div>
      </div>

      ${mobileDashboardActions ? `<div id="uiMobileActionDock" class="ui-mobile-action-dock mobile-animate">${mobileDashboardActions}</div>` : ''}

      <div class="mobile-kpi-scroll mobile-animate">
        <div class="mobile-kpi-card kpi-success">
          <div class="kpi-icon-m">${MOBILE_ICONS.money}</div>
          <div class="kpi-label-m">Receitas</div>
          <div class="kpi-value-m" id="mobileKpiRec">${fmtBRL(d.recMes)}</div>
          ${d.var_ !== null ? `<div class="kpi-change-m" style="color:${parseFloat(d.var_) >= 0 ? '#10b981' : '#ef4444'}">${parseFloat(d.var_) >= 0 ? ARROW_UP : ARROW_DOWN} ${Math.abs(d.var_)}%</div>` : ''}
        </div>
        <div class="mobile-kpi-card kpi-danger">
          <div class="kpi-icon-m">${MOBILE_ICONS.chartDown}</div>
          <div class="kpi-label-m">Despesas</div>
          <div class="kpi-value-m" id="mobileKpiDesp">${fmtBRL(d.despMes)}</div>
        </div>
        <div class="mobile-kpi-card kpi-info">
          <div class="kpi-icon-m">${MOBILE_ICONS.chart}</div>
          <div class="kpi-label-m">Margem</div>
          <div class="kpi-value-m" id="mobileKpiMar">${d.margem}%</div>
        </div>
      </div>

      <div class="mobile-section-title mobile-animate">
        <span>Per\u00edodo</span>
      </div>
      <div class="mobile-month-scroll mobile-animate" id="mobileMonthScroll">
        ${MESES.map((m, i) => `<button class="mobile-month-btn ${i === d.mes ? 'active' : ''}" data-month="${i}">${m}</button>`).join('')}
      </div>

      <div class="mobile-section-title mobile-animate">
        <span>Vendas por Dia da Semana \u2022 ${MESES[d.mes]}/${d.ano}</span>
      </div>
      <div class="mobile-chart-card mobile-animate">
        <div class="chart-container">
          <canvas id="mobileWeekdayChartCanvas"></canvas>
        </div>
        <div id="mobileWeekdayChartFallback" class="mobile-chart-fallback"></div>
      </div>

      <div class="mobile-section-title mobile-animate">
        <span>Per\u00edodos do Dia</span>
      </div>
      <div class="mobile-period-strip mobile-animate" id="mobilePeriodStrip"></div>

      <div class="mobile-section-title mobile-animate">
        <span>${MESES[d.mes]}/${d.ano} x ${d.anteriorLabel}</span>
      </div>
      <div class="mobile-chart-card mobile-animate">
        <div class="chart-container">
          <canvas id="mobileComparisonChartCanvas"></canvas>
        </div>
        <div id="mobileComparisonChartFallback" class="mobile-chart-fallback"></div>
      </div>
    `;

    renderPeriods(d);
    renderMobileCharts(d);
    scheduleMobileChartLoad();

    document.getElementById('mobileMonthScroll')?.querySelectorAll('.mobile-month-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.mobile-month-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const newMes = parseInt(this.dataset.month);
        _mobDashUserSelected = true;
        _mobDashMes = newMes;
        buildDashboard();
        setTimeout(() => {
          document.querySelector('.mobile-month-btn.active')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }, 0);
      });
    });
  }

  function renderWeekdayBars(d) {
    const el = document.getElementById('mobileWeekdayChartFallback');
    if (!el) return;

    const valores = getResumoDiaSemanaMobile(d).map(item => item.receitas);
    const max = Math.max(...valores, 1);

    el.classList.add('active');
    el.innerHTML = `
      <div class="mobile-weekday-bars">
        ${DIAS_SEMANA.map((dia, i) => {
          const h = Math.round((valores[i] / max) * 90);
          return `
            <div class="mobile-bar-wrap">
              <div class="mobile-bar bar-receita" style="height:${Math.max(h, 4)}px" title="${dia}: ${fmtBRL(valores[i])}"></div>
              <span class="mobile-bar-label">${dia}</span>
            </div>
          `;
        }).join('')}
      </div>
      <div style="font-size:0.72rem;color:#475569;text-align:center;margin-top:0.25rem;">Vendas por dia \u2022 ${MESES[d.mes]}/${d.ano}</div>
    `;
  }

  function renderPeriods(d) {
    const el = document.getElementById('mobilePeriodStrip');
    if (!el) return;

    const { resumo, quantidadeSemHorario, vendasSemHorario } = getResumoPeriodoDiaMobile(d);
    const cards = [...resumo];

    if (quantidadeSemHorario > 0) {
      cards.push({
        key: 'sem-horario',
        name: 'Sem hor\u00e1rio',
        faixa: 'N\u00e3o identificado',
        emoji: MOBILE_ICONS.info,
        bg: 'rgba(245,158,11,0.15)',
        vendas: vendasSemHorario,
        quantidade: quantidadeSemHorario
      });
    }

    el.innerHTML = cards.map(p => `
      <div class="mobile-period-pill" title="${p.faixa}">
        <div class="mobile-period-icon" style="background:${p.bg}">${p.emoji}</div>
        <div>
          <div class="period-name">${p.name}</div>
          <div class="period-val">${fmtBRL(p.vendas)}</div>
          <div class="period-meta">${p.quantidade} venda${p.quantidade === 1 ? '' : 's'}</div>
        </div>
      </div>
    `).join('');
  }

  function destroyMobileDashboardCharts() {
    if (mobileWeekdayChartInstance) {
      mobileWeekdayChartInstance.destroy();
      mobileWeekdayChartInstance = null;
    }
    if (mobileComparisonChartInstance) {
      mobileComparisonChartInstance.destroy();
      mobileComparisonChartInstance = null;
    }
  }

  function renderMobileComparisonFallback(d) {
    const el = document.getElementById('mobileComparisonChartFallback');
    if (!el) return;

    const rows = [
      { label: 'Receitas', atual: d.recMes, anterior: d.anterior.receitas },
      { label: 'Despesas', atual: d.despMes, anterior: d.anterior.despesas },
      { label: 'Saldo', atual: d.lucro, anterior: d.anterior.saldo }
    ];

    el.classList.add('active');
    el.innerHTML = rows.map(row => `
      <div class="mobile-compare-row">
        <span>${row.label}</span>
        <strong>${fmtBRL(row.atual)}</strong>
        <small>${d.anteriorLabel}: ${fmtBRL(row.anterior)}</small>
      </div>
    `).join('');
  }

  function renderMobileCharts(d) {
    const weekdayCanvas = document.getElementById('mobileWeekdayChartCanvas');
    const comparisonCanvas = document.getElementById('mobileComparisonChartCanvas');
    const weekdayFallback = document.getElementById('mobileWeekdayChartFallback');
    const comparisonFallback = document.getElementById('mobileComparisonChartFallback');

    if (weekdayFallback) weekdayFallback.classList.remove('active');
    if (comparisonFallback) comparisonFallback.classList.remove('active');
    destroyMobileDashboardCharts();

    if (typeof Chart === 'undefined' || !weekdayCanvas || !comparisonCanvas) {
      renderWeekdayBars(d);
      renderMobileComparisonFallback(d);
      return;
    }

    const resumoSemana = getResumoDiaSemanaMobile(d);
    const receitasPorDia = resumoSemana.map(item => item.receitas);
    const valoresAnteriores = [
      d.anterior.receitas,
      d.anterior.despesas * -1,
      d.anterior.saldo
    ];
    const valoresAtuais = [
      d.recMes,
      d.despMes * -1,
      d.lucro
    ];

    mobileWeekdayChartInstance = new Chart(weekdayCanvas, {
      type: 'bar',
      data: {
        labels: DIAS_SEMANA,
        datasets: [{
          label: 'Vendas',
          data: receitasPorDia,
          backgroundColor: 'rgba(16, 185, 129, 0.75)',
          borderColor: '#10b981',
          borderWidth: 1,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(148, 163, 184, 0.15)' },
            ticks: { callback: (value) => fmtBRL(value) }
          },
          x: { grid: { display: false } }
        }
      }
    });

    mobileComparisonChartInstance = new Chart(comparisonCanvas, {
      type: 'bar',
      data: {
        labels: ['Receitas', 'Despesas', 'Saldo'],
        datasets: [
          {
            label: d.anteriorLabel,
            data: valoresAnteriores,
            backgroundColor: [
              'rgba(148, 163, 184, 0.55)',
              'rgba(239, 68, 68, 0.55)',
              d.anterior.saldo >= 0 ? 'rgba(14, 165, 233, 0.45)' : 'rgba(239, 68, 68, 0.45)'
            ],
            borderColor: [
              '#94a3b8',
              '#ef4444',
              d.anterior.saldo >= 0 ? '#0ea5e9' : '#ef4444'
            ],
            borderWidth: 1,
            borderRadius: 8
          },
          {
            label: `${MESES[d.mes]}/${d.ano}`,
            data: valoresAtuais,
            backgroundColor: [
              'rgba(16, 185, 129, 0.75)',
              'rgba(239, 68, 68, 0.8)',
              d.lucro >= 0 ? 'rgba(14, 165, 233, 0.7)' : 'rgba(239, 68, 68, 0.7)'
            ],
            borderColor: [
              '#10b981',
              '#ef4444',
              d.lucro >= 0 ? '#0ea5e9' : '#ef4444'
            ],
            borderWidth: 1,
            borderRadius: 8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(148, 163, 184, 0.15)' },
            ticks: { callback: (value) => fmtBRL(value) }
          },
          x: { grid: { display: false } }
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { boxWidth: 10, color: '#64748b' }
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: ${fmtBRL(context.parsed.y)}`
            }
          }
        }
      }
    });
  }

  function renderTxList(d) {
    const el = document.getElementById('mobileTxList');
    if (!el) return;

    const combined = [
      ...d.receitas.map(r => ({ ...r, tipo: 'receita' })),
      ...d.despesas.map(r => ({ ...r, tipo: 'despesa' }))
    ].filter(r => {
      const dt = new Date(r.data + 'T00:00:00');
      return dt.getMonth() === d.mes && dt.getFullYear() === d.ano;
    }).sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 8);

    if (!combined.length) {
      el.innerHTML = `<div style="text-align:center;padding:2rem;color:#475569;font-size:0.875rem;">
        <div style="font-size:2rem;margin-bottom:0.5rem;">${MOBILE_ICONS.inbox}</div>
        Nenhuma movimenta\u00e7\u00e3o no per\u00edodo
      </div>`;
      return;
    }

    el.innerHTML = combined.map(r => {
      const isRec = r.tipo === 'receita';
      const cat = r.categoria || (isRec ? 'Receita' : 'Despesa');
      const icon = isRec
        ? (cat === 'PIX' ? MOBILE_ICONS.lightning : cat === 'Cr\u00e9dito' ? MOBILE_ICONS.card : MOBILE_ICONS.money)
        : MOBILE_ICONS.outbox;
      const dt = new Date(r.data + 'T00:00:00');
      const dateStr = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

      return `
        <div class="mobile-tx-item">
          <div class="mobile-tx-icon ${isRec ? 'receita' : 'despesa'}">${icon}</div>
          <div class="mobile-tx-body">
            <div class="tx-desc">${r.descricao || cat}</div>
            <div class="tx-date">${dateStr} ${r.horario ? '\u00B7 ' + r.horario : ''}</div>
          </div>
          <div class="mobile-tx-amount ${isRec ? 'positive' : 'negative'}">${isRec ? '+' : '-'}${fmtBRL(r.valor)}</div>
        </div>
      `;
    }).join('');
  }

  function iconHome() {
    return '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>';
  }

  function iconReceipts() {
    return '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
  }

  function iconExpenses() {
    return '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
  }

  function iconChart() {
    return '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>';
  }

  function iconInvestimento() {
    return '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
  }

  function iconAjuda() {
    return '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
  }

  function iconSettings() {
    return '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>';
  }

  let resizeHandlerBound = false;
  let firebaseListenerBound = false;

  function removeMobileShell() {
    destroyMobileDashboardCharts();
    mobileChartObserver?.disconnect();
    mobileChartObserver = null;
    clearMobileDashboardSync();
    document.body.classList.remove('mobile-active', 'mobile-dashboard-active');
    document.getElementById('mobileHeader')?.remove();
    document.getElementById('mobileBottomNav')?.remove();
    document.getElementById('mobileFAB')?.remove();
    document.getElementById('mobilePageWrapper')?.remove();
    document.getElementById('mobileSheetOverlay')?.remove();
    document.getElementById('mobileToast')?.remove();
  }

  function refreshMobileShellAfterUserSystemUpdate() {
    if (!IS_MOBILE()) return;

    document.getElementById('mobileHeader')?.remove();
    document.getElementById('mobileBottomNav')?.remove();
    document.getElementById('mobileFAB')?.remove();
    document.getElementById('mobileSheetOverlay')?.remove();

    _mobDashSelectionInitialized = false;
    applyMobileState();
  }

  function patchDashboardUpdate() {
    if (typeof window.atualizarDashboard === 'function' && !window.atualizarDashboard._mobilePatchApplied) {
      const originalUpdate = window.atualizarDashboard;
      window.atualizarDashboard = function () {
        originalUpdate.apply(this, arguments);
        if (IS_MOBILE() && document.body.getAttribute('data-page') === 'dashboard') {
          hydrateMobileDashboardData({ force: true }).then(() => buildDashboard());
        }
      };
      window.atualizarDashboard._mobilePatchApplied = true;
    }
  }

  function setupDashboardMobile() {
    document.body.classList.add('mobile-dashboard-active');
    buildDashboard();
    hydrateMobileDashboardData().then(() => {
      if (IS_MOBILE() && document.body.getAttribute('data-page') === 'dashboard') {
        buildDashboard();
      }
    });

    setupMobileDashboardSync();

    patchDashboardUpdate();
    setTimeout(patchDashboardUpdate, 500);
    setTimeout(patchDashboardUpdate, 1500);

    if (!firebaseListenerBound) {
      firebaseListenerBound = true;
      window.addEventListener('firebase:initialized', () => {
        if (IS_MOBILE() && document.body.getAttribute('data-page') === 'dashboard') {
          setupMobileDashboardSync();
          patchDashboardUpdate();
        }
      });
    }
  }

  function applyMobileState() {
    if (!IS_MOBILE()) {
      removeMobileShell();
      return;
    }

    document.body.classList.add('mobile-active');
    injectHeader();
    injectBottomNav();
    injectFAB();

    const page = document.body.getAttribute('data-page') || '';
    if (page === 'dashboard') {
      setupDashboardMobile();
    } else {
      document.body.classList.remove('mobile-dashboard-active');
      document.getElementById('mobilePageWrapper')?.remove();
      window.IRANCASH?.applyResponsiveTableLabels?.(document);
    }
  }

  function init() {
    applyMobileState();

    if (!resizeHandlerBound) {
      resizeHandlerBound = true;
      let resizeTimer = null;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(applyMobileState, 150);
      });
      window.addEventListener('usersystem:updated', refreshMobileShellAfterUserSystemUpdate);
      window.addEventListener('laundry:changed', refreshMobileShellAfterUserSystemUpdate);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    let tries = 0;
    const check = setInterval(() => {
      if (window.UserSystem || tries++ > 20) {
        clearInterval(check);
        init();
      }
    }, 100);
  }

  window.MobileApp = { showToast, openSheet, closeSheet, openLaundrySheet };
})();
