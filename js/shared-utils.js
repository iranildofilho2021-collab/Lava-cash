/**
 * Utilitários compartilhados entre todas as páginas
 * Centraliza funções de formatação e acesso a dados
 * @module SharedUtils
 */
(function(global) {
  'use strict';

  const PT_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  // ========== FORMATAÇÃO ==========

  /**
   * Formata número para padrão brasileiro
   * @param {number} n - Número a formatar
   * @returns {string} Número formatado
   */
  function numBR(n) {
    return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  /**
   * Formata valor como moeda brasileira
   * @param {number} n - Valor a formatar
   * @returns {string} Valor formatado como "R$ X.XXX,XX"
   */
  function fmtBR(n) {
    return 'R$ ' + numBR(n);
  }

  /**
   * Gera ID único
   * @returns {string} ID único
   */
  function genId() {
    return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  // ========== ACESSO A DADOS (com suporte a IndexedDB) ==========

  /**
   * Obtém item do storage (IndexedDB ou localStorage)
   * @param {string} key - Chave do item
   * @param {*} defaultValue - Valor padrão
   * @returns {Promise<*>} Valor armazenado
   */
  async function getStorageItem(key, defaultValue = null) {
    // Prioridade 1: Firebase
    if (global.FirebaseStore && global.FirebaseStore.isAvailable) {
      try {
        const isAvailable = await global.FirebaseStore.isAvailable();
        if (isAvailable) {
          const value = await global.FirebaseStore.getItem(key, null);
          if (value !== null) {
            // Sincroniza com localStorage/IndexedDB como backup
            try {
              localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {}
            if (global.IndexedDBStore) {
              try {
                await global.IndexedDBStore.setItem(key, value);
              } catch (e) {}
            }
            return value;
          }
        }
      } catch (err) {
        console.warn('[SharedUtils] Erro ao acessar Firebase, tentando IndexedDB:', key, err);
      }
    }
    
    // Prioridade 2: IndexedDB
    if (global.IndexedDBStore) {
      try {
        const value = await global.IndexedDBStore.getItem(key, null);
        if (value !== null) return value;
      } catch (err) {
        console.warn('[SharedUtils] Fallback localStorage para:', key);
      }
    }
    
    // Prioridade 3: localStorage (fallback)
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  /**
   * Salva item no storage (IndexedDB e localStorage)
   * @param {string} key - Chave do item
   * @param {*} value - Valor a salvar
   * @returns {Promise<boolean>}
   */
  async function setStorageItem(key, value) {
    let success = false;
    
    // Prioridade 1: Firebase (salva na nuvem primeiro)
    if (global.FirebaseStore && global.FirebaseStore.isAvailable) {
      try {
        const isAvailable = await global.FirebaseStore.isAvailable();
        if (isAvailable) {
          await global.FirebaseStore.setItem(key, value);
          success = true;
          console.log(`[SharedUtils] ${key} salvo no Firebase`);
        }
      } catch (err) {
        console.warn('[SharedUtils] Erro ao salvar no Firebase, tentando IndexedDB:', key, err);
      }
    }
    
    // Prioridade 2: IndexedDB (backup local)
    if (global.IndexedDBStore) {
      try {
        await global.IndexedDBStore.setItem(key, value);
        success = true;
      } catch (err) {
        console.warn('[SharedUtils] Erro IndexedDB:', key, err);
      }
    }
    
    // Prioridade 3: localStorage (backup local)
    try {
      localStorage.setItem(key, JSON.stringify(value));
      success = true;
    } catch (err) {
      console.warn('[SharedUtils] Erro localStorage:', key, err);
    }
    
    return success;
  }

  /**
   * Lê item do storage de forma síncrona (localStorage apenas)
   * Use apenas quando async não for possível
   * Nota: Para dados atualizados, use getStorageItem() async que busca do Firebase primeiro
   * @param {string} key - Chave
   * @param {*} defaultValue - Valor padrão
   * @returns {*} Valor
   */
  function getStorageItemSync(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }
  
  /**
   * Carrega dados do Firebase para localStorage (para uso síncrono)
   * Executa em background para sincronizar dados
   */
  async function sincronizarFirebaseParaLocal(key) {
    if (global.FirebaseStore && global.FirebaseStore.isAvailable) {
      try {
        const isAvailable = await global.FirebaseStore.isAvailable();
        if (isAvailable) {
          const value = await global.FirebaseStore.getItem(key, null);
          if (value !== null) {
            try {
              const currentLocal = localStorage.getItem(key);
              const newValueStr = JSON.stringify(value);
              
              // Só atualiza e notifica se houver mudança
              if (currentLocal !== newValueStr) {
                localStorage.setItem(key, newValueStr);
                
                // Dispara evento para UI reagir
                const eventName = `irancash:${key}:synced`;
                const event = new CustomEvent(eventName, { detail: { key, value } });
                window.dispatchEvent(event);
                
                return value;
              }
            } catch (e) {
              // Ignora erro de quota
            }
          }
        }
      } catch (err) {
        // Ignora erros silenciosamente
      }
    }
    return null;
  }

  // ========== LEITURA DE DADOS ESPECÍFICOS ==========

  /**
   * Lê vendas resumo (mensal)
   * Tenta sincronizar do Firebase em background
   * @returns {Array} Lista de vendas resumo
   */
  function lerVendasResumo() {
    // Sincroniza do Firebase em background (não bloqueia)
    sincronizarFirebaseParaLocal('vendasResumo').catch(() => {});
    return getStorageItemSync('vendasResumo', []);
  }

  /**
   * Lê vendas resumo (async - busca do Firebase primeiro)
   * @returns {Promise<Array>}
   */
  async function lerVendasResumoAsync() {
    const dados = await getStorageItem('vendasResumo', []);
    // Atualiza cache em memória se disponível
    if (window._vendasResumo_inMemory !== undefined) {
      window._vendasResumo_inMemory = Array.isArray(dados) ? dados.slice() : [];
    }
    return dados;
  }

  /**
   * Lê despesas
   * Tenta sincronizar do Firebase em background
   * @returns {Array} Lista de despesas
   */
  function lerDespesas() {
    // Sincroniza do Firebase em background
    sincronizarFirebaseParaLocal('despesas').catch(() => {});
    // Tenta usar DataStore se disponível
    if (global.IRANCASH && global.IRANCASH.DataStore) {
      return global.IRANCASH.DataStore.loadDespesas();
    }
    return getStorageItemSync('despesas', []);
  }

  /**
   * Lê despesas (async - busca do Firebase primeiro)
   * @returns {Promise<Array>}
   */
  async function lerDespesasAsync() {
    if (global.IRANCASH && global.IRANCASH.DataStore) {
      return await global.IRANCASH.DataStore.loadDespesasAsync();
    }
    return await getStorageItem('despesas', []);
  }

  /**
   * Salva despesas
   * @param {Array} despesas - Lista de despesas
   * @returns {boolean}
   */
  function salvarDespesas(despesas) {
    if (global.IRANCASH && global.IRANCASH.DataStore) {
      return global.IRANCASH.DataStore.saveDespesas(despesas);
    }
    try {
      localStorage.setItem('despesas', JSON.stringify(despesas));
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Carrega vendas resumo dia com suporte a formato compacto
   * @returns {Array}
   */
  function carregarVendasResumoDia() {
    try {
      const raw = getStorageItemSync('vendasResumoDia', []);
      if (!Array.isArray(raw) || raw.length === 0) {
        // Tenta carregar de chunks
        return carregarVendasResumoDiaChunks();
      }
      
      // Expande formato compacto se necessário
      const f0 = raw[0];
      if (f0 && (f0.a !== undefined || f0.b !== undefined)) {
        return raw.map(it => ({
          anoMesDia: it.a || it.date || '',
          anoMes: (it.a || '').slice(0, 7),
          receitaBruta: (it.b != null) ? (Number(it.b) / 100) : Number(it.receitaBruta || 0),
          mdr: (it.c != null) ? (Number(it.c) / 100) : Number(it.mdr || 0),
          receitaLiquida: (it.b != null && it.c != null) ? ((Number(it.b) - Number(it.c)) / 100) : Number(it.receitaLiquida || 0),
          source: it.s || '',
          tipoPagamento: it.p || ''
        }));
      }
      return raw;
    } catch (e) {
      console.warn('[SharedUtils] Erro lendo vendasResumoDia:', e);
      return [];
    }
  }

  /**
   * Carrega vendas de chunks
   * @returns {Array}
   */
  function carregarVendasResumoDiaChunks() {
    try {
      const chunksMeta = getStorageItemSync('vendasResumoDia_chunks', []);
      if (!Array.isArray(chunksMeta) || chunksMeta.length === 0) return [];
      
      const out = [];
      for (const k of chunksMeta) {
        try {
          const part = getStorageItemSync(k, []);
          if (Array.isArray(part)) out.push(...part);
        } catch (e) { /* ignore */ }
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  // ========== UTILITÁRIOS DE DATA ==========

  /**
   * Extrai ano de string "AAAA/MM"
   * @param {string} anoMes - String no formato "AAAA/MM"
   * @returns {string} Ano
   */
  function anoDe(anoMes) {
    return String(anoMes || '').split('/')[0] || '';
  }

  /**
   * Extrai índice do mês (0-11) de string "AAAA/MM"
   * @param {string} anoMes - String no formato "AAAA/MM"
   * @returns {number} Índice do mês (0-11) ou -1
   */
  function mesNumDe(anoMes) {
    const m = String(anoMes || '').split('/')[1];
    const n = Number(m);
    return (Number.isInteger(n) && n >= 1 && n <= 12) ? n - 1 : -1;
  }

  /**
   * Converte nome do mês para índice
   * @param {string} name - Nome do mês em português
   * @returns {number} Índice (0-11) ou -1
   */
  function monthNameToIndex(name) {
    if (!name) return -1;
    const cap = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    return PT_MESES.indexOf(cap);
  }

  /**
   * Retorna número de dias no mês
   * @param {number} year - Ano
   * @param {number} monthIndex - Índice do mês (0-11)
   * @returns {number} Número de dias
   */
  function daysInMonth(year, monthIndex) {
    return new Date(Number(year), monthIndex + 1, 0).getDate();
  }

  // ========== CÁLCULOS FINANCEIROS ==========

  /**
   * Calcula receita bruta de um mês
   * @param {string} ano - Ano
   * @param {number} mIdx - Índice do mês (0-11)
   * @returns {number} Receita bruta
   */
  function receitaBrutaMes(ano, mIdx) {
    const dados = lerVendasResumo();
    let total = 0;
    for (const v of dados) {
      if (!v.anoMes) continue;
      if (anoDe(v.anoMes) !== String(ano)) continue;
      const mi = mesNumDe(v.anoMes);
      if (mi === mIdx) total += Number(v.receitaBruta || 0);
    }
    return total;
  }

  /**
   * Calcula despesa de um mês
   * @param {string} ano - Ano
   * @param {number} mIdx - Índice do mês (0-11)
   * @returns {number} Total de despesas
   */
  function despesaMes(ano, mIdx) {
    const dados = lerDespesas();
    let total = 0;
    const nomeMes = PT_MESES[mIdx];
    for (const d of dados) {
      if (String(d.ano) !== String(ano)) continue;
      if (String(d.mes) !== String(nomeMes)) continue;
      total += Number(d.valor || 0);
    }
    return total;
  }

  /**
   * Retorna lista de anos disponíveis nos dados
   * @returns {string[]} Anos ordenados
   */
  function anosDisponiveis() {
    const anos = new Set();
    for (const v of lerVendasResumo()) {
      if (v.anoMes) anos.add(anoDe(v.anoMes));
    }
    for (const d of lerDespesas()) {
      if (d.ano) anos.add(String(d.ano));
    }
    const arr = Array.from(anos).filter(Boolean).sort((a, b) => Number(a) - Number(b));
    if (arr.length === 0) arr.push(String(new Date().getFullYear()));
    return arr;
  }

  /**
   * Encontra o último ano/mês com dados
   * @returns {{year: string, monthIndex: number}}
   */
  function ultimoAnoMesComDados() {
    try {
      const hoje = new Date();
      const curYear = String(hoje.getFullYear());
      
      const monthly = lerVendasResumo();
      if (Array.isArray(monthly) && monthly.length > 0) {
        const sorted = monthly.map(m => m.anoMes).filter(Boolean).sort();
        if (sorted.length > 0) {
          const last = sorted[sorted.length - 1];
          const parts = String(last).split('/');
          if (parts.length >= 2) {
            return { year: parts[0], monthIndex: Number(parts[1]) - 1 };
          }
        }
      }
      
      const daily = carregarVendasResumoDia();
      if (Array.isArray(daily) && daily.length > 0) {
        const meses = new Set();
        for (const d of daily) {
          if (d && d.anoMes) meses.add(d.anoMes);
        }
        const arr = Array.from(meses).sort();
        if (arr.length > 0) {
          const last = arr[arr.length - 1];
          const parts = String(last).split('/');
          if (parts.length >= 2) {
            return { year: parts[0], monthIndex: Number(parts[1]) - 1 };
          }
        }
      }
      
      // Fallback: mês anterior
      const prev = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      return { year: String(prev.getFullYear()), monthIndex: prev.getMonth() };
    } catch (e) {
      const hoje = new Date();
      const prev = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      return { year: String(prev.getFullYear()), monthIndex: prev.getMonth() };
    }
  }

  // ========== EXPORTAÇÃO ==========

  global.SharedUtils = {
    // Constantes
    PT_MESES,
    // Formatação
    numBR,
    fmtBR,
    genId,
    // Storage
    getStorageItem,
    setStorageItem,
    getStorageItemSync,
    // Dados
    lerVendasResumo,
    lerVendasResumoAsync,
    lerDespesas,
    lerDespesasAsync,
    salvarDespesas,
    carregarVendasResumoDia,
    // Datas
    anoDe,
    mesNumDe,
    monthNameToIndex,
    daysInMonth,
    // Cálculos
    receitaBrutaMes,
    despesaMes,
    anosDisponiveis,
    ultimoAnoMesComDados
  };

  // Aliases globais para compatibilidade
  global.numBR = numBR;
  global.fmtBR = fmtBR;
  global.genId = genId;
  global.PT_MESES = PT_MESES;

})(window);
