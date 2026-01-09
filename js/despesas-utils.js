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

  const exports = {
    genId,
    formatBR,
    parseBR,
    formatDateBR,
    criarSpanValorElement,
    criarInputValorElement,
    calcularTotal,
    agruparPorCategoria,
    filtrarPorPeriodo
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
