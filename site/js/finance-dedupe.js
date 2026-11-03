(function LavaCashFinanceDedupe(global) {
  'use strict';

  function normalizeChunk(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  function numberKey(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number.toFixed(2) : '0.00';
  }

  function getMachineKey(item) {
    return normalizeChunk(item?.maquininhaId || item?.maquinhaNome || item?.maquininhaNome || 'sem-maquininha');
  }

  function getImportCode(item) {
    return normalizeChunk(item?.codigoVenda || item?.nsu || item?.saleCode || item?.stoneId || item?.stoneID || '');
  }

  function getFinanceItemIdentity(item, kind) {
    if (!item || typeof item !== 'object') return '';
    const prefix = kind || 'mov';
    // O id e a identidade definitiva do registro. Assinaturas de importacao
    // sao apenas alternativas para dados antigos que ainda nao possuam id.
    // Isso evita descartar duas vendas legitimas que compartilhem codigo ou
    // outros atributos do arquivo de origem.
    if (item.id) return `${prefix}:id:${item.id}`;
    const machineKey = getMachineKey(item);
    const importSignature = normalizeChunk(item.importSignature);
    if (importSignature) return `${prefix}:import-signature:${machineKey}:${importSignature}`;

    const code = getImportCode(item);
    if (code) return `${prefix}:import-code:${machineKey}:${code}`;

    const businessSignature = normalizeChunk(item.importBusinessSignature);
    if (businessSignature) return `${prefix}:business-signature:${machineKey}:${businessSignature}`;

    return [
      prefix,
      normalizeChunk(item.data),
      normalizeChunk(item.horarioVenda),
      numberKey(item.valor),
      numberKey(item.valorLiquido),
      normalizeChunk(item.categoria),
      normalizeChunk(item.descricao)
    ].join(':fallback:');
  }

  function itemScore(item) {
    if (!item || typeof item !== 'object') return 0;
    return Object.keys(item).reduce((score, key) => {
      const value = item[key];
      return score + (value !== null && value !== undefined && value !== '' ? 1 : 0);
    }, 0);
  }

  // Vendas importadas costumavam manter a linha inteira do arquivo, duas
  // assinaturas extensas e textos de auditoria repetidos em cada registro.
  // Depois que a duplicidade foi validada, esses dados não participam dos
  // cálculos nem da interface. Mantemos somente os campos operacionais; o
  // resumo e as inconsistências continuam no histórico da importação.
  function compactReceita(item) {
    if (!item || typeof item !== 'object') return item;
    const imported = item.importadoStone === true;
    const code = item.codigoVenda || item.nsu || null;
    const compact = {
      id: item.id,
      data: item.data,
      horarioVenda: item.horarioVenda || null,
      descricao: item.descricao,
      categoria: item.categoria,
      pagamento: item.pagamento,
      valor: item.valor,
      valorLiquido: item.valorLiquido,
      bandeira: item.bandeira || null,
      codigoVenda: code,
      maquininhaId: item.maquininhaId || null,
      maquinhaNome: item.maquinhaNome || item.maquininhaNome || null,
      importBatchId: item.importBatchId || null,
      importadoStone: imported,
      obs: imported ? null : (item.obs || item.observacoes || null),
      criadoEm: item.criadoEm || item.createdAt || null,
      atualizadoEm: item.atualizadoEm || item.updatedAt || null
    };
    return Object.fromEntries(
      Object.entries(compact).filter(([, value]) => value !== null && value !== undefined && value !== '')
    );
  }

  function dedupeFinanceArray(data, kind) {
    const source = Array.isArray(data) ? data : [];
    const byIdentity = new Map();
    const order = [];
    let removed = 0;

    source.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const identity = getFinanceItemIdentity(item, kind);
      if (!identity) return;

      if (!byIdentity.has(identity)) {
        byIdentity.set(identity, item);
        order.push(identity);
      } else {
        removed += 1;
        const current = byIdentity.get(identity);
        if (itemScore(item) > itemScore(current)) {
          byIdentity.set(identity, item);
        }
      }
    });

    return {
      items: order.map(identity => byIdentity.get(identity)).filter(Boolean),
      removed
    };
  }

  function inferKindFromKey(key) {
    const text = String(key || '').toLowerCase();
    if (text.endsWith('_receitas') || text === 'receitas') return 'receita';
    if (text.endsWith('_despesas') || text === 'despesas') return 'despesa';
    return 'mov';
  }

  function normalizeFinanceArrayForKey(key, data) {
    const kind = inferKindFromKey(key);
    const normalized = dedupeFinanceArray(data, kind);
    if (kind === 'receita') {
      normalized.items = normalized.items.map(compactReceita);
    }
    return normalized;
  }

  function shouldKeepLocalStorageCopy(key) {
    // IndexedDB suporta listas grandes sem bloquear o carregamento da página.
    // Para receitas, manter a mesma lista também no localStorage apenas dobra
    // o trabalho de JSON.parse/JSON.stringify e costuma exceder a cota.
    return inferKindFromKey(key) !== 'receita';
  }

  global.LavaCashFinanceDedupe = {
    dedupeFinanceArray,
    compactReceita,
    getFinanceItemIdentity,
    inferKindFromKey,
    normalizeFinanceArrayForKey,
    shouldKeepLocalStorageCopy
  };
})(window);
