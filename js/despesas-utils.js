(function(root){
  function genId() {
    return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,9);
  }

  function formatBR(valor) {
    const n = Number(valor);
    if (isNaN(n)) return String(valor);
    return `R$ ${n.toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
  }

  function criarSpanValorElement(id, valor) {
    const span = document.createElement('span');
    span.className = 'valor-text';
    span.dataset.id = id;
    span.textContent = formatBR(valor);
    span.setAttribute('aria-label', 'Valor da despesa');
    span.tabIndex = -1;
    return span;
  }

  function criarInputValorElement(id, rawValor) {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.min = '0';
    input.dataset.id = id;
    input.className = 'valor-edit w-28 rounded border px-2 py-1 text-right';
    const parsed = parseFloat(String(rawValor).replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    input.value = isNaN(parsed) ? '' : parsed.toFixed(2);
    input.setAttribute('aria-label', 'Editar valor da despesa');
    input.tabIndex = 0;
    return input;
  }

  const exports = {
    genId,
    formatBR,
    criarSpanValorElement,
    criarInputValorElement
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
    window.criarSpanValorElement = criarSpanValorElement;
    window.criarInputValorElement = criarInputValorElement;
  }
})(typeof window !== 'undefined' ? window : globalThis);
