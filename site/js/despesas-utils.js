/**
 * Utilitários para manipulação de despesas
 * @module DespesasUtils
 */
(function(root){
  'use strict';

  /**
   * Gera um ID único para despesas
   * @returns {string} ID único no formato timestamp_random
   */
  function genId() {
    return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  /**
   * Formata valor numérico para moeda brasileira
   * @param {number|string} valor - Valor a formatar
   * @returns {string} Valor formatado como "R$ X.XXX,XX"
   */
  function formatBR(valor) {
    const n = Number(valor);
    if (isNaN(n)) return 'R$ 0,00';
    return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /**
   * Parse de valor em formato brasileiro para número
   * @param {string} valor - Valor em formato brasileiro (ex: "1.234,56" ou "R$ 1.234,56")
   * @returns {number} Valor numérico
   */
  function parseBR(valor) {
    if (typeof valor === 'number') return valor;
    const cleaned = String(valor)
      .replace(/R\$\s?/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Formata data para exibição no formato brasileiro
   * @param {string|Date} data - Data a formatar
   * @returns {string} Data formatada como "DD/MM/AAAA"
   */
  function formatDateBR(data) {
    if (!data) return '';
    const d = data instanceof Date ? data : new Date(data);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  /**
   * Cria elemento span para exibição de valor
   * @param {string} id - ID da despesa
   * @param {number|string} valor - Valor a exibir
   * @returns {HTMLSpanElement} Elemento span formatado
   */
  function criarSpanValorElement(id, valor) {
    const span = document.createElement('span');
    span.className = 'valor-text';
    span.dataset.id = id;
    span.textContent = formatBR(valor);
    span.setAttribute('aria-label', `Valor: ${formatBR(valor)}`);
    span.tabIndex = -1;
    return span;
  }

  /**
   * Cria elemento input para edição de valor
   * @param {string} id - ID da despesa
   * @param {number|string} rawValor - Valor atual
   * @returns {HTMLInputElement} Elemento input para edição
   */
  function criarInputValorElement(id, rawValor) {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.min = '0';
    input.dataset.id = id;
    input.className = 'valor-edit w-28 rounded border px-2 py-1 text-right focus:ring-2 focus:ring-blue-500';
    const parsed = parseBR(rawValor);
    input.value = parsed.toFixed(2);
    input.setAttribute('aria-label', 'Editar valor da despesa');
    input.setAttribute('inputmode', 'decimal');
    input.tabIndex = 0;
    return input;
  }

  /**
   * Calcula o total de uma lista de despesas
   * @param {Array} despesas - Array de objetos despesa com propriedade valor
   * @returns {number} Total somado
   */
  function calcularTotal(despesas) {
    if (!Array.isArray(despesas)) return 0;
    return despesas.reduce((sum, d) => sum + (parseBR(d.valor) || 0), 0);
  }

  /**
   * Agrupa despesas por categoria
   * @param {Array} despesas - Array de despesas
   * @returns {Object} Objeto com categorias como chaves e arrays de despesas como valores
   */
  function agruparPorCategoria(despesas) {
    if (!Array.isArray(despesas)) return {};
    return despesas.reduce((acc, d) => {
      const cat = d.categoria || 'Sem categoria';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(d);
      return acc;
    }, {});
  }

  /**
   * Filtra despesas por período
   * @param {Array} despesas - Array de despesas
   * @param {Date|string} inicio - Data inicial
   * @param {Date|string} fim - Data final
   * @returns {Array} Despesas filtradas
   */
  function filtrarPorPeriodo(despesas, inicio, fim) {
    if (!Array.isArray(despesas)) return [];
    const dataInicio = new Date(inicio);
    const dataFim = new Date(fim);
    dataFim.setHours(23, 59, 59, 999);

    return despesas.filter(d => {
      if (!d.data) return false;
      const dataDespesa = new Date(d.data);
      return dataDespesa >= dataInicio && dataDespesa <= dataFim;
    });
  }

  const MESES_ABREVIADOS = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
  ];

  function getCompetenciaDespesa(despesa) {
    const competencia = String(despesa?.competencia || '').trim();
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) {
      return competencia;
    }

    const data = String(despesa?.data || '').trim();
    const match = data.match(/^(\d{4})-(0[1-9]|1[0-2])/);
    return match ? `${match[1]}-${match[2]}` : 'sem-competencia';
  }

  function formatarCompetenciaCurta(competencia) {
    const match = String(competencia || '').match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (!match) return 'Sem competencia';
    return `${MESES_ABREVIADOS[Number(match[2]) - 1]}/${match[1]}`;
  }

  const FORMAS_PAGAMENTO_MDR = {
    pix: 'PIX',
    cartao_credito: 'Crédito',
    cartao_debito: 'Débito'
  };

  function normalizarTextoMdr(valor) {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function inferirFormaPagamentoMdr(despesa) {
    const textoImportado = normalizarTextoMdr([
      despesa?.formaPagamentoImportada,
      despesa?.formaPagamento,
      despesa?.paymentRaw,
      despesa?.produto,
      despesa?.bandeira,
      despesa?.descricao,
      despesa?.obs
    ].filter(Boolean).join(' '));

    if (
      textoImportado.includes('pix')
      || textoImportado.includes('qrcode')
      || textoImportado.includes('qr code')
      || textoImportado.includes('bank_transfer')
      || textoImportado.includes('account_money')
    ) return 'pix';

    if (textoImportado.includes('credito') || textoImportado.includes('credit')) {
      return 'cartao_credito';
    }

    if (textoImportado.includes('debito') || textoImportado.includes('debit')) {
      return 'cartao_debito';
    }

    const pagamento = normalizarTextoMdr(despesa?.pagamento).replace(/[^a-z0-9]+/g, '_');
    if (pagamento === 'pix') return 'pix';
    if (pagamento === 'cartao_credito' || pagamento === 'credito' || pagamento === 'credit') {
      return 'cartao_credito';
    }
    return 'cartao_debito';
  }

  function formatarFormaPagamentoMdr(formaPagamento) {
    return FORMAS_PAGAMENTO_MDR[formaPagamento] || FORMAS_PAGAMENTO_MDR.cartao_debito;
  }

  function agruparMdrPorMesParaExibicao(despesas) {
    if (!Array.isArray(despesas)) return [];

    const despesasComuns = [];
    const gruposMdr = new Map();

    despesas.forEach(despesa => {
      if (normalizarCategoriaDespesaId(despesa?.categoria) !== 'mdr') {
        despesasComuns.push(despesa);
        return;
      }

      const competencia = getCompetenciaDespesa(despesa);
      const formaPagamento = inferirFormaPagamentoMdr(despesa);
      const grupoId = `${competencia}-${formaPagamento}`;
      let grupo = gruposMdr.get(grupoId);
      if (!grupo) {
        const competenciaValida = competencia !== 'sem-competencia';
        grupo = {
          id: `mdr-resumo-${competencia}-${formaPagamento}`,
          data: competenciaValida ? `${competencia}-01` : '',
          competencia,
          descricao: `Taxas MDR ${formatarFormaPagamentoMdr(formaPagamento)} - ${formatarCompetenciaCurta(competencia)}`,
          categoria: 'mdr',
          pagamento: formaPagamento,
          tipoDespesa: 'eventual',
          valor: 0,
          resumoMdr: true,
          formaPagamentoMdr: formaPagamento,
          quantidadeLancamentos: 0,
          primeiraData: '',
          ultimaData: ''
        };
        gruposMdr.set(grupoId, grupo);
      }

      const data = String(despesa?.data || '');
      const primeiraData = String(despesa?.primeiraData || data);
      const ultimaData = String(despesa?.ultimaData || data);
      const quantidadeLancamentos = Math.max(1, Number(despesa?.quantidadeLancamentos) || 1);
      grupo.valor += Number(despesa?.valor || 0);
      grupo.quantidadeLancamentos += quantidadeLancamentos;
      if (primeiraData && (!grupo.primeiraData || primeiraData < grupo.primeiraData)) grupo.primeiraData = primeiraData;
      if (ultimaData && (!grupo.ultimaData || ultimaData > grupo.ultimaData)) grupo.ultimaData = ultimaData;
    });

    return despesasComuns.concat(Array.from(gruposMdr.values()));
  }

  function compactarMdrMensalParaPersistencia(despesas) {
    const agora = new Date().toISOString();
    return agruparMdrPorMesParaExibicao(despesas).map(despesa => {
      if (!despesa?.resumoMdr) return despesa;
      return {
        ...despesa,
        resumoMdrPersistido: true,
        importadoStone: true,
        origemResumo: 'mdr-mensal-v1',
        obs: `${despesa.quantidadeLancamentos} taxas MDR agrupadas em ${despesa.competencia}.`,
        criadoEm: despesa.criadoEm || agora,
        atualizadoEm: agora
      };
    });
  }

  const CATEGORIAS_STORAGE_KEY_BASE = 'categorias_despesa';
  const CATEGORIA_MDR_PADRAO = {
    id: 'mdr',
    nome: 'Taxas MDR',
    descricao: 'Taxas de adquirencia e descontos das vendas por cartao'
  };
  const DEFAULT_CATEGORIAS = [
    { id: 'aluguel', nome: 'Aluguel', descricao: 'Custos fixos de locacao' },
    { id: 'energia', nome: 'Energia', descricao: 'Contas de luz e energia eletrica' },
    { id: 'agua', nome: 'Agua', descricao: 'Consumo de agua e esgoto' },
    { id: 'funcionarios', nome: 'Funcionarios', descricao: 'Salarios, beneficios e encargos' },
    { id: 'insumos', nome: 'Insumos', descricao: 'Produtos de limpeza e materiais operacionais' },
    { id: 'manutencao', nome: 'Manutencao', descricao: 'Reparos e manutencao de equipamentos' },
    { id: 'impostos', nome: 'Impostos', descricao: 'Tributos e obrigacoes fiscais' },
    CATEGORIA_MDR_PADRAO,
    { id: 'outros', nome: 'Outros', descricao: 'Despesas diversas' }
  ];

  function canUseStorage() {
    return typeof localStorage !== 'undefined';
  }

  function getCurrentLaundryIdFallback() {
    try {
      if (root.LaundryService && typeof root.LaundryService.getCurrentLaundryId === 'function') {
        const id = root.LaundryService.getCurrentLaundryId();
        if (id) return String(id);
      }
    } catch (e) {}

    try {
      if (root.UserSystem && typeof root.UserSystem.getLavanderiaSelecionada === 'function') {
        const lav = root.UserSystem.getLavanderiaSelecionada();
        if (lav && lav.id) return String(lav.id);
      }
    } catch (e) {}

    try {
      const stored = localStorage.getItem('lavanderiaSelecionada');
      if (stored) return String(stored);
    } catch (e) {}

    return '';
  }

  function getStorageKey(baseKey) {
    const key = String(baseKey || '');
    if (!key) return key;

    try {
      if (root.LaundryService && typeof root.LaundryService.getLaundryKey === 'function') {
        const scoped = root.LaundryService.getLaundryKey(key);
        if (scoped) return scoped;
      }
    } catch (e) {}

    const lavId = getCurrentLaundryIdFallback();
    if (lavId && key.startsWith(`${lavId}_`)) return key;
    return lavId ? `${lavId}_${key}` : key;
  }

  function getAllLaundryIdsFallback() {
    try {
      if (root.UserSystem && typeof root.UserSystem.getLavanderias === 'function') {
        const lavanderias = root.UserSystem.getLavanderias();
        if (Array.isArray(lavanderias) && lavanderias.length) {
          const ids = lavanderias.map(l => l && l.id).filter(Boolean).map(String);
          if (ids.length) return ids;
        }
      }
    } catch (e) {}

    const current = getCurrentLaundryIdFallback();
    return current ? [current] : [];
  }

  function migrateLegacyStorageKeyOnce() {
    if (root._irancashCategoriasDespesaTenantMigrated) return;
    root._irancashCategoriasDespesaTenantMigrated = true;

    if (!canUseStorage()) return;

    try {
      const legacy = localStorage.getItem(CATEGORIAS_STORAGE_KEY_BASE);
      if (!legacy) return;

      const lavIds = getAllLaundryIdsFallback();
      if (!lavIds.length) return;

      lavIds.forEach(lavId => {
        const scopedKey = `${lavId}_${CATEGORIAS_STORAGE_KEY_BASE}`;
        if (!localStorage.getItem(scopedKey)) {
          localStorage.setItem(scopedKey, legacy);
        }
      });

      localStorage.removeItem(CATEGORIAS_STORAGE_KEY_BASE);
    } catch (e) {}
  }

  function slugifyCategoria(valor) {
    const texto = String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    return texto || `categoria_${Date.now()}`;
  }

  function normalizarCategoriaDespesaId(categoriaId) {
    const texto = String(categoriaId || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!texto) return '';

    if (texto === 'mdr' || texto === 'taxas' || texto === 'taxa' || texto === 'taxa_mdr' || texto === 'taxas_mdr') {
      return 'mdr';
    }

    return texto;
  }

  function normalizarCategoriasDespesa(categorias) {
    const origem = Array.isArray(categorias) && categorias.length ? categorias : DEFAULT_CATEGORIAS;
    const ids = new Set();

    const normalizadas = origem.reduce((acc, categoria, index) => {
      const nome = String(categoria?.nome || categoria?.label || categoria?.id || '').trim();
      if (!nome) return acc;

      const baseId = normalizarCategoriaDespesaId(categoria?.id || nome) || slugifyCategoria(categoria?.id || nome);

      if (baseId === 'mdr') {
        if (ids.has('mdr')) {
          return acc;
        }

        ids.add('mdr');
        acc.push({ ...CATEGORIA_MDR_PADRAO });
        return acc;
      }

      let finalId = baseId || `categoria_${index + 1}`;
      let suffix = 2;

      while (ids.has(finalId)) {
        finalId = `${baseId}_${suffix++}`;
      }

      ids.add(finalId);
      acc.push({
        id: finalId,
        nome,
        descricao: String(categoria?.descricao || '').trim()
      });
      return acc;
    }, []);

    return normalizadas.length ? normalizadas : DEFAULT_CATEGORIAS.map(item => ({ ...item }));
  }

  function scheduleFirebaseSave(key, value) {
    if (!key || !root.FirebaseStore || typeof root.FirebaseStore.isAvailable !== 'function') return;
    root.FirebaseStore.isAvailable()
      .then(available => {
        if (available && typeof root.FirebaseStore.setItem === 'function') {
          return root.FirebaseStore.setItem(key, value);
        }
        return false;
      })
      .catch(error => {
        console.warn('[DespesasUtils] Erro ao sincronizar categorias no Firebase:', error);
      });
  }

  function getCategoriasDespesa() {
    if (!canUseStorage()) {
      return DEFAULT_CATEGORIAS.map(item => ({ ...item }));
    }

    migrateLegacyStorageKeyOnce();
    const storageKey = getStorageKey(CATEGORIAS_STORAGE_KEY_BASE);

    let categorias = [];
    try {
      categorias = JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch (error) {
      categorias = [];
    }

    const normalizadas = normalizarCategoriasDespesa(categorias);

    if (JSON.stringify(categorias) !== JSON.stringify(normalizadas)) {
      localStorage.setItem(storageKey, JSON.stringify(normalizadas));
      scheduleFirebaseSave(storageKey, normalizadas);
    }

    return normalizadas;
  }

  function saveCategoriasDespesa(categorias) {
    const normalizadas = normalizarCategoriasDespesa(categorias);
    if (canUseStorage()) {
      migrateLegacyStorageKeyOnce();
      const storageKey = getStorageKey(CATEGORIAS_STORAGE_KEY_BASE);
      localStorage.setItem(storageKey, JSON.stringify(normalizadas));
      scheduleFirebaseSave(storageKey, normalizadas);
    }
    return normalizadas;
  }

  function upsertCategoriaDespesa(categoria) {
    const nome = String(categoria?.nome || '').trim();
    if (!nome) {
      throw new Error('Categoria e obrigatoria.');
    }

    const categorias = getCategoriasDespesa();
    const categoriaId = categoria?.id ? normalizarCategoriaDespesaId(categoria.id) : '';
    const nomeNormalizado = categoriaId === 'mdr' ? CATEGORIA_MDR_PADRAO.nome : nome;
    const descricaoNormalizada = categoriaId === 'mdr'
      ? CATEGORIA_MDR_PADRAO.descricao
      : String(categoria?.descricao || '').trim();
    const index = categorias.findIndex(item => item.id === categoriaId);

    if (index >= 0) {
      categorias[index] = {
        ...categorias[index],
        nome: nomeNormalizado,
        descricao: descricaoNormalizada
      };
      return saveCategoriasDespesa(categorias);
    }

    const baseId = normalizarCategoriaDespesaId(nome) || slugifyCategoria(nome);
    let finalId = baseId;
    let suffix = 2;

    while (categorias.some(item => item.id === finalId)) {
      finalId = `${baseId}_${suffix++}`;
    }

    categorias.push({
      id: finalId,
      nome: finalId === 'mdr' ? CATEGORIA_MDR_PADRAO.nome : nome,
      descricao: finalId === 'mdr' ? CATEGORIA_MDR_PADRAO.descricao : String(categoria?.descricao || '').trim()
    });

    return saveCategoriasDespesa(categorias);
  }

  function getCategoriaDespesaLabel(categoriaId) {
    if (!categoriaId) return 'Sem categoria';
    const categoriaNormalizada = normalizarCategoriaDespesaId(categoriaId) || categoriaId;
    const categoria = getCategoriasDespesa().find(item => item.id === categoriaNormalizada);
    return categoria ? categoria.nome : categoriaNormalizada;
  }

  function excluirCategoriaDespesa(categoriaId) {
    const idNormalizado = normalizarCategoriaDespesaId(String(categoriaId || ''));
    if (!idNormalizado) throw new Error('ID da categoria invalido.');
    const categorias = getCategoriasDespesa();
    const novas = categorias.filter(item => item.id !== idNormalizado);
    if (novas.length === categorias.length) throw new Error('Categoria nao encontrada.');
    return saveCategoriasDespesa(novas);
  }

  const exports = {
    genId,
    formatBR,
    parseBR,
    formatDateBR,
    criarSpanValorElement,
    criarInputValorElement,
    calcularTotal,
    agruparPorCategoria,
    filtrarPorPeriodo,
    getCompetenciaDespesa,
    formatarCompetenciaCurta,
    inferirFormaPagamentoMdr,
    formatarFormaPagamentoMdr,
    agruparMdrPorMesParaExibicao,
    compactarMdrMensalParaPersistencia,
    getCategoriasDespesa,
    saveCategoriasDespesa,
    upsertCategoriaDespesa,
    excluirCategoriaDespesa,
    getCategoriaDespesaLabel,
    normalizarCategoriasDespesa,
    normalizarCategoriaDespesaId
  };

  // Expose for CommonJS (tests) and browser
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = exports;
  }
  if (typeof window !== 'undefined') {
    window.despesasUtils = exports;
    // also assign globals for backward compatibility
    window.genId = genId;
    window.formatBR = formatBR;
    window.parseBR = parseBR;
    window.formatDateBR = formatDateBR;
    window.criarSpanValorElement = criarSpanValorElement;
    window.criarInputValorElement = criarInputValorElement;
    window.calcularTotal = calcularTotal;
    window.agruparPorCategoria = agruparPorCategoria;
    window.filtrarPorPeriodo = filtrarPorPeriodo;
  }
})(typeof window !== 'undefined' ? window : globalThis);
