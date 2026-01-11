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
   * Lê vendas detalhadas (async - busca do Firebase primeiro, suporta chunks)
   * @returns {Promise<Array>} Lista de vendas detalhadas expandida
   */
  async function lerVendasDetalhadasAsync() {
    // 1. Tentar cache em memória
    if(global._vendasDetalhadas_inMemory && Array.isArray(global._vendasDetalhadas_inMemory)) {
      return global._vendasDetalhadas_inMemory.slice();
    }
    
    // 2. Tentar ler do Firebase (fonte da verdade)
    if (global.FirebaseStore && await global.FirebaseStore.isAvailable()) {
      try {
        const remoteData = await global.FirebaseStore.getItem('vendasDetalhadas');
        
        if (remoteData) {
          // Caso 1: Dados salvos em chunks (formato novo)
          if (remoteData.format === 'chunked') {
            let fullData = [];
            
            // Carregar chunks em paralelo
            const promises = [];
            for (let i = 0; i < remoteData.chunkCount; i++) {
               promises.push(global.FirebaseStore.getItem(`vendasDetalhadas_chunk_${i}`));
            }
            
            const chunks = await Promise.all(promises);
            
            // Montar array completo
            chunks.forEach(chunk => {
              if (chunk && Array.isArray(chunk.data)) {
                fullData = fullData.concat(chunk.data);
              }
            });
            
            // Expandir formato compacto
            const expanded = fullData.map(it => ({ 
              date: it.d || '', 
              time: it.t || '', 
              dateMs: (it.ms != null)?Number(it.ms):null, 
              valorBruto: (it.v!=null)?(Number(it.v)/100):0, 
              mdr: (it.m!=null)?(Number(it.m)/100):0, 
              source: it.s||'', 
              tipoPagamento: it.p||'', 
              id: it.id||'' 
            }));
            
            // Atualizar cache em memória
            global._vendasDetalhadas_inMemory = expanded;
            return expanded;
          }
          
          // Caso 2: Dados salvos em formato compacto único (formato anterior)
          if (remoteData.format === 'compact' && Array.isArray(remoteData.data)) {
             const expanded = remoteData.data.map(it => ({ 
              date: it.d || '', 
              time: it.t || '', 
              dateMs: (it.ms != null)?Number(it.ms):null, 
              valorBruto: (it.v!=null)?(Number(it.v)/100):0, 
              mdr: (it.m!=null)?(Number(it.m)/100):0, 
              source: it.s||'', 
              tipoPagamento: it.p||'', 
              id: it.id||'' 
            }));
            global._vendasDetalhadas_inMemory = expanded;
            return expanded;
          }
        }
      } catch(e) {
        console.warn('[SharedUtils] Erro ao carregar detalhadas do Firebase:', e);
      }
    }
    
    // 3. Fallback para IndexedDB se disponível
    if (global.IndexedDBStore) {
        try {
            const idbData = await global.IndexedDBStore.getItem('vendasDetalhadas');
            if (idbData && idbData.format === 'compact' && Array.isArray(idbData.data)) {
                const expanded = idbData.data.map(it => ({ 
                  date: it.d || '', 
                  time: it.t || '', 
                  dateMs: (it.ms != null)?Number(it.ms):null, 
                  valorBruto: (it.v!=null)?(Number(it.v)/100):0, 
                  mdr: (it.m!=null)?(Number(it.m)/100):0, 
                  source: it.s||'', 
                  tipoPagamento: it.p||'', 
                  id: it.id||'' 
                }));
                global._vendasDetalhadas_inMemory = expanded;
                return expanded;
            }
        } catch(e) {}
    }

    // 4. Fallback final para localStorage
    // Nota: localStorage pode não ter o dado completo se for grande
    return [];
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

  // ========== MAPEAMENTO DE IMPORTAÇÃO ==========

  function loadMapping(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; }
  }

  function saveMapping(key, map) {
    try { localStorage.setItem(key, JSON.stringify(map)); } catch (e) {}
  }

  function applyMappingIndex(headers, mappingValue, fallbackIndex) {
    if (!mappingValue) return fallbackIndex;
    if (String(mappingValue).startsWith('__idx__')) {
      const n = Number(String(mappingValue).replace('__idx__', ''));
      return Number.isFinite(n) ? n : fallbackIndex;
    }
    // try find header name
    const idx = headers.indexOf(String(mappingValue));
    return idx >= 0 ? idx : fallbackIndex;
  }

  function normalizeForMatch(s) {
    if (!s) return '';
    try { return String(s).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''); } catch (e) { return String(s).toLowerCase(); }
  }

  function autoMapHeaders(headers, defaults) {
    const map = {};
    const norm = headers.map(h => normalizeForMatch(h || ''));

    function findByWords(words) {
      for (let i = 0; i < norm.length; i++) {
        const h = norm[i];
        for (const w of words) {
          if (w && h.includes(w)) return headers[i];
        }
      }
      return null;
    }
    // heuristics per key
    defaults.forEach(d => {
      const k = d.key;
      let found = null;
      if (k === 'date') {
        found = findByWords(['data', 'date', 'emissao', 'emissão', 'timestamp', 'dia']);
      } else if (k === 'time') {
        found = findByWords(['hora', 'time', 'horario']);
      } else if (k === 'status') {
        found = findByWords(['status', 'situacao', 'situação', 'estado', 'estado da']);
      } else if (k === 'valorBruto') {
        found = findByWords(['valor da venda atualizado', 'valor da venda original', 'valor da venda', 'valor atualizado', 'valor original', 'valor bruto', 'valor', 'amount', 'valorvenda']);
      } else if (k === 'modalidade') {
        found = findByWords(['modalidade', 'tipo', 'tipo de pagamento', 'forma']);
      } else if (k === 'valorMdr' || k === 'mdr') {
        found = findByWords(['mdr', 'taxa mdr', 'taxa mdr', 'taxa', 'taxa mdr']);
      } else if (k === 'valorLiquido') {
        found = findByWords(['valor liquido', 'valor líquido', 'liquido', 'liquidado', 'liquido', 'liquid']);
      }
      // fallback: try to find words from key name
      if (!found) { found = findByWords([normalizeForMatch(k)]); }
      // if still not found, try to guess by index common patterns (e.g., valorBruto prefer column 4 etc.) -- use header index if present
      if (!found) {
        // no header match, try numeric fallback: look for header containing 'valor' for valor fields
        if (k === 'valorBruto' || k === 'valorLiquido' || k === 'valorMdr') {
          found = findByWords(['valor']);
        }
      }
      if (found) { map[k] = found; }
    });
    // special case: if time wasn't found but date was found (common when date and time are in same cell), map time to the same header as date
    if (!map.time && map.date) { map.time = map.date; }
    return map;
  }

  function renderMappingUI(panelId, fieldsContainerId, headers, storageKey, defaults) {
    const panel = document.getElementById(panelId);
    const container = document.getElementById(fieldsContainerId);
    if (!panel || !container) return;
    container.innerHTML = '';
    const mapping = loadMapping(storageKey) || {};
    // if saved mapping only contains headerRow (from import config) treat it as empty so auto-detect runs
    const userMappingKeys = Object.keys(mapping).filter(k => k !== 'headerRow');
    const auto = (userMappingKeys.length === 0) ? autoMapHeaders(headers, defaults) : {};
    const options = [''].concat(headers);
    // also offer numeric index options up to headers length-1
    for (const f of defaults) {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2';
      const label = document.createElement('div'); label.className = 'w-36 text-xs text-gray-600'; label.textContent = f.label;
      const sel = document.createElement('select'); sel.className = 'map-select rounded border px-2 py-1 text-sm flex-1';
      // option for automatic index by header name
      sel.innerHTML = options.map(o => `<option value="${o}">${o || '(nenhum)'}</option>`).join('') +
        Array.from({ length: Math.max(0, Math.min(30, headers.length + 5)) }).map((_, i) => `<option value="__idx__${i}">Índice ${i}</option>`).join('');
      // set current value from mapping, auto-detect or default
      const current = (mapping[f.key] || auto[f.key] || f.default);
      if (current !== undefined && current !== null) { sel.value = current; }
      row.appendChild(label); row.appendChild(sel);
      container.appendChild(row);
    }
    // show panel
    panel.classList.remove('hidden');
  }

  function detectHeaderRow(json) {
    if (!Array.isArray(json) || json.length === 0) return 0;
    // Heuristic: header usually contains string keys like 'Data', 'Valor', 'Status'
    // We scan first 10 rows
    const keywords = ['data', 'date', 'valor', 'amount', 'status', 'tipo', 'modalidade', 'bandeira', 'receita', 'venda'];
    let best = { idx: 0, score: 0 };
    for (let i = 0; i < Math.min(10, json.length); i++) {
      const row = json[i];
      if (!Array.isArray(row)) continue;
      let score = 0;
      row.forEach(cell => {
        if (typeof cell === 'string') {
          const s = cell.toLowerCase();
          if (keywords.some(k => s.includes(k))) score++;
        }
      });
      if (score > best.score) best = { idx: i, score };
    }
    return best.idx;
  }

  function getHeadersFromJson(json, overrideHeaderRow) {
    const hr = (typeof overrideHeaderRow === 'number' && !isNaN(overrideHeaderRow)) ? overrideHeaderRow : detectHeaderRow(json);
    const headerRow = json[hr] || [];
    return headerRow.map(h => h == null ? '' : String(h).trim());
  }

  // ========== CONFIGURAÇÃO DE PERÍODOS ==========

  const DEFAULT_PERIODOS = {
    'Madrugada': { start: '00:00', end: '05:59' },
    'Manhã': { start: '06:00', end: '11:59' },
    'Tarde': { start: '12:00', end: '17:59' },
    'Noite': { start: '18:00', end: '23:59' }
  };

  function getPeriodosConfig() {
    return getStorageItemSync('config_periodos', DEFAULT_PERIODOS);
  }

  function savePeriodosConfig(config) {
    setStorageItem('config_periodos', config);
  }

  /**
   * Converte horário "HH:MM" para segundos
   */
  function timeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    const h = Number(parts[0] || 0);
    const m = Number(parts[1] || 0);
    const s = Number(parts[2] || 0);
    return (h * 3600) + (m * 60) + s;
  }

  /**
   * Determina o período do dia baseado na configuração
   * @param {string|null} timeStr - Horário no formato HH:MM ou HH:MM:SS
   * @returns {string|null} Nome do período ou null
   */
  function getPeriodoDoDia(timeStr) {
    try {
      if (!timeStr) return null;
      
      // Normaliza timeStr (remove 'h', extrai HH:MM:SS)
      const m = String(timeStr).trim().replace('h', ':').match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
      let t = 0;
      
      if (!m) {
        // Fallback para tentar extrair de Date string
        const dt = new Date(String(timeStr));
        if (dt && !isNaN(dt.getTime())) {
          const hh = dt.getHours(), mm = dt.getMinutes(), ss = dt.getSeconds();
          t = (hh * 3600) + (mm * 60) + ss;
        } else {
          return null;
        }
      } else {
        const hh = Number(m[1] || 0);
        const mm = Number(m[2] || 0);
        const ss = Number(m[3] || 0);
        t = (hh * 3600) + (mm * 60) + ss;
      }

      const config = getPeriodosConfig();
      
      for (const [nome, range] of Object.entries(config)) {
        const start = timeToSeconds(range.start);
        // Ajusta fim para incluir segundos (ex: 05:59 -> 05:59:59)
        const endParts = range.end.split(':');
        const endH = Number(endParts[0]);
        const endM = Number(endParts[1]);
        const endS = 59; // Sempre assume final do minuto
        const end = (endH * 3600) + (endM * 60) + endS;

        if (t >= start && t <= end) {
          return nome;
        }
      }
      
      return 'Madrugada'; // Default fallback se nenhum bater (ex: 24:00 ou config buraco)
    } catch (e) {
      return null;
    }
  }

  // ========== EXPORTAÇÃO ==========

  global.SharedUtils = {
    // ... (existentes)
    PT_MESES,
    numBR,
    fmtBR,
    genId,
    getStorageItem,
    setStorageItem,
    getStorageItemSync,
    lerVendasResumo,
    lerVendasResumoAsync,
    lerVendasDetalhadasAsync, // Novo
    lerDespesas,
    lerDespesasAsync,
    salvarDespesas,
    carregarVendasResumoDia,
    anoDe,
    mesNumDe,
    monthNameToIndex,
    daysInMonth,
    receitaBrutaMes,
    despesaMes,
    anosDisponiveis,
    ultimoAnoMesComDados,
    
    // Novos (Mapping)
    loadMapping,
    saveMapping,
    applyMappingIndex,
    renderMappingUI,
    detectHeaderRow,
    getHeadersFromJson,
    
    // Novos (Periodos)
    getPeriodosConfig,
    savePeriodosConfig,
    getPeriodoDoDia
  };

  // Aliases globais para compatibilidade com código existente em receitas.js
  global.loadMapping = loadMapping;
  global.saveMapping = saveMapping;
  global.applyMappingIndex = applyMappingIndex;
  global.renderMappingUI = renderMappingUI;
  global.detectHeaderRow = detectHeaderRow;
  global.getHeadersFromJson = getHeadersFromJson;
  global.getPeriodoDoDia = getPeriodoDoDia; // Substitui o local
  global.getPeriodoDoDiaLocal = getPeriodoDoDia; // Alias para dashboard

})(window);
