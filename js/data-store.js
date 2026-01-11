/**
 * DataStore centraliza dados compartilhados entre as páginas (categorias de despesas, etc)
 * Usa IndexedDB para maior capacidade de armazenamento (~50MB+)
 * Inclui proteções de segurança e validação de dados
 * @module DataStore
 */
(function initDataStore(global) {
  'use strict';
  
  if (!global) return;

  // ========== CONSTANTES ==========
  const CATEGORY_KEY = 'categorias';
  const DESPESAS_KEY = 'despesas';
  const MAX_CATEGORY_LENGTH = 50;
  const MAX_CATEGORIES = 100;
  
  const DEFAULT_CATEGORIES = Object.freeze([
    'Conta de Agua',
    'Energia',
    'Suprimentos',
    'Aluguel',
    'Royalties',
    'Seguro',
    'Contadora',
    'DAS-Impostos',
    'Emprestimo',
    'Salario',
    'INSS',
    'VmPay'
  ]);

  // Cache local para acesso síncrono
  let categoriesCache = null;
  let despesasCache = null;

  // ========== UTILITÁRIOS DE SEGURANÇA ==========
  
  /**
   * Sanitiza string para prevenir XSS
   */
  function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/<[^>]*>/g, '') // Remove tags HTML
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .trim()
      .slice(0, MAX_CATEGORY_LENGTH);
  }

  /**
   * Valida estrutura de despesa
   */
  function validateDespesa(despesa) {
    if (!despesa || typeof despesa !== 'object') return false;
    
    const requiredFields = ['ano', 'mes', 'categoria', 'valor'];
    for (const field of requiredFields) {
      if (!(field in despesa)) return false;
    }
    
    if (typeof despesa.valor !== 'number' || isNaN(despesa.valor)) return false;
    if (despesa.valor < 0) return false;
    
    return true;
  }

  // ========== ACESSO AO STORAGE (Firebase > IndexedDB > localStorage) ==========

  /**
   * Obtém item do storage (async)
   * Prioridade: Firebase > IndexedDB > localStorage
   */
  async function getItemAsync(key, defaultValue = null) {
    // Prioridade 1: Firebase
    if (global.FirebaseStore && global.FirebaseStore.isAvailable) {
      try {
        const isAvailable = await global.FirebaseStore.isAvailable();
        if (isAvailable) {
          return await global.FirebaseStore.getItem(key, defaultValue);
        }
      } catch (err) {
        console.warn('[DataStore] Erro ao acessar Firebase, tentando IndexedDB:', err);
      }
    }

    // Prioridade 2: IndexedDB
    if (global.IndexedDBStore) {
      try {
        return await global.IndexedDBStore.getItem(key, defaultValue);
      } catch (err) {
        console.warn('[DataStore] Erro ao acessar IndexedDB, tentando localStorage:', err);
      }
    }

    // Prioridade 3: localStorage (fallback)
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (err) {
      return defaultValue;
    }
  }

  /**
   * Salva item no storage (async)
   * Salva em Firebase primeiro, depois IndexedDB/localStorage como backup
   */
  async function setItemAsync(key, value) {
    let success = false;

    // Prioridade 1: Firebase
    if (global.FirebaseStore && global.FirebaseStore.isAvailable) {
      try {
        const isAvailable = await global.FirebaseStore.isAvailable();
        if (isAvailable) {
          success = await global.FirebaseStore.setItem(key, value);
          if (success) {
            // Salva também no IndexedDB/localStorage como backup local
            if (global.IndexedDBStore) {
              try {
                await global.IndexedDBStore.setItem(key, value);
              } catch (e) {
                // Ignora erro
              }
            }
            try {
              localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
              // Ignora erro
            }
            return true;
          }
        }
      } catch (err) {
        console.warn('[DataStore] Erro ao salvar no Firebase, tentando IndexedDB:', err);
      }
    }

    // Prioridade 2: IndexedDB
    if (global.IndexedDBStore) {
      try {
        success = await global.IndexedDBStore.setItem(key, value);
        if (success) {
          // Backup no localStorage
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch (e) {
            // Ignora erro
          }
          return true;
        }
      } catch (err) {
        console.warn('[DataStore] Erro ao salvar no IndexedDB, tentando localStorage:', err);
      }
    }

    // Prioridade 3: localStorage (fallback)
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('[DataStore] Erro ao salvar:', err);
      return false;
    }
  }

  /**
   * Acesso síncrono ao localStorage (para compatibilidade)
   */
  function safeGetItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      console.warn('[DataStore] Falha ao ler localStorage:', err);
      return null;
    }
  }

  function safeSetItem(key, value) {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, stringValue);
      return true;
    } catch (err) {
      console.warn('[DataStore] Falha ao salvar no localStorage:', err);
      return false;
    }
  }

  function safeParseJSON(str, defaultValue = null) {
    try {
      return str ? JSON.parse(str) : defaultValue;
    } catch (err) {
      console.warn('[DataStore] Falha ao parsear JSON:', err);
      return defaultValue;
    }
  }

  // ========== CATEGORIAS ==========

  function normalizeCategories(list) {
    if (!Array.isArray(list)) return DEFAULT_CATEGORIES.slice();
    
    const seen = new Set();
    const normalized = [];
    
    for (const value of list) {
      if (typeof value !== 'string') continue;
      
      const sanitized = sanitizeString(value);
      if (!sanitized) continue;
      
      const lowerKey = sanitized.toLowerCase();
      if (seen.has(lowerKey)) continue;
      
      seen.add(lowerKey);
      normalized.push(sanitized);
      
      if (normalized.length >= MAX_CATEGORIES) break;
    }
    
    return normalized.length > 0 ? normalized : DEFAULT_CATEGORIES.slice();
  }

  /**
   * Carrega categorias (síncrono - usa cache ou localStorage)
   */
  function loadCategories() {
    if (categoriesCache) return categoriesCache.slice();
    
    const raw = safeGetItem(CATEGORY_KEY);
    const stored = safeParseJSON(raw, []);
    const normalized = normalizeCategories(stored);
    
    categoriesCache = normalized;
    
    if (!stored || stored.length !== normalized.length || 
        stored.some((v, i) => v !== normalized[i])) {
      safeSetItem(CATEGORY_KEY, JSON.stringify(normalized));
    }
    
    return normalized.slice();
  }

  /**
   * Carrega categorias (async - usa IndexedDB)
   */
  async function loadCategoriesAsync() {
    const stored = await getItemAsync(CATEGORY_KEY, []);
    const normalized = normalizeCategories(stored);
    categoriesCache = normalized;
    // Atualiza cache síncrono (localStorage) para scripts legados
    safeSetItem(CATEGORY_KEY, JSON.stringify(normalized));
    return normalized.slice();
  }

  /**
   * Salva categorias (síncrono para compatibilidade)
   */
  function saveCategories(categories) {
    const normalized = normalizeCategories(categories);
    categoriesCache = normalized;
    
    const success = safeSetItem(CATEGORY_KEY, JSON.stringify(normalized));
    
    // Salva também no IndexedDB em background
    if (global.IndexedDBStore) {
      global.IndexedDBStore.setItem(CATEGORY_KEY, normalized).catch(err => {
        console.warn('[DataStore] Erro ao salvar categorias no IndexedDB:', err);
      });
    }
    
    if (success) {
      try {
        global.dispatchEvent(new CustomEvent('irancash:categorias:update', { 
          detail: normalized.slice() 
        }));
      } catch (err) {
        console.warn('[DataStore] Falha ao despachar evento:', err);
      }
    }
    
    return normalized.slice();
  }

  /**
   * Salva categorias (async)
   */
  async function saveCategoriesAsync(categories) {
    const normalized = normalizeCategories(categories);
    categoriesCache = normalized;
    
    await setItemAsync(CATEGORY_KEY, normalized);
    safeSetItem(CATEGORY_KEY, JSON.stringify(normalized)); // Backup no localStorage
    
    try {
      global.dispatchEvent(new CustomEvent('irancash:categorias:update', { 
        detail: normalized.slice() 
      }));
    } catch (err) {
      console.warn('[DataStore] Falha ao despachar evento:', err);
    }
    
    return normalized.slice();
  }

  function subscribeCategories(handler) {
    if (typeof handler !== 'function') return () => {};
    
    const customHandler = (event) => {
      handler((event && event.detail) ? event.detail.slice() : loadCategories());
    };
    
    const storageHandler = (event) => {
      if (event && event.key === CATEGORY_KEY) {
        categoriesCache = null; // Invalida cache
        handler(loadCategories());
      }
    };
    
    global.addEventListener('irancash:categorias:update', customHandler);
    global.addEventListener('storage', storageHandler);
    
    return () => {
      global.removeEventListener('irancash:categorias:update', customHandler);
      global.removeEventListener('storage', storageHandler);
    };
  }

  // ========== DESPESAS ==========

  /**
   * Remove despesas duplicadas baseando-se em ano, mês, categoria e valor
   */
  function dedupDespesas(despesas) {
    if (!Array.isArray(despesas)) return [];
    const seen = new Map();
    const result = [];
    for (const d of despesas) {
      // Usa ID se existir, senão cria chave única
      const key = d.id || `${d.ano}-${d.mes}-${d.categoria}-${d.valor}-${d.descricao || ''}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        result.push(d);
      }
    }
    return result;
  }

  /**
   * Carrega despesas (síncrono)
   */
  function loadDespesas() {
    if (despesasCache) return despesasCache.slice();
    
    const raw = safeGetItem(DESPESAS_KEY);
    const despesas = safeParseJSON(raw, []);
    
    if (!Array.isArray(despesas)) return [];
    
    const valid = dedupDespesas(despesas.filter(validateDespesa));
    despesasCache = valid;
    return valid;
  }

  /**
   * Carrega despesas (async - usa IndexedDB)
   */
  async function loadDespesasAsync() {
    const despesas = await getItemAsync(DESPESAS_KEY, []);
    
    if (!Array.isArray(despesas)) return [];
    
    const valid = dedupDespesas(despesas.filter(validateDespesa));
    despesasCache = valid;
    // Atualiza cache síncrono (localStorage) para scripts legados (dashboard.js)
    safeSetItem(DESPESAS_KEY, JSON.stringify(valid));
    return valid;
  }

  /**
   * Salva despesas (síncrono)
   */
  function saveDespesas(despesas) {
    if (!Array.isArray(despesas)) {
      console.error('[DataStore] Despesas deve ser um array');
      return false;
    }
    
    const validDespesas = despesas.filter(validateDespesa);
    despesasCache = validDespesas;
    
    const success = safeSetItem(DESPESAS_KEY, JSON.stringify(validDespesas));
    
    // Salva também no IndexedDB em background
    if (global.IndexedDBStore) {
      global.IndexedDBStore.setItem(DESPESAS_KEY, validDespesas).catch(err => {
        console.warn('[DataStore] Erro ao salvar despesas no IndexedDB:', err);
      });
    }
    
    if (success) {
      try {
        global.dispatchEvent(new CustomEvent('irancash:despesas:updated', {
          detail: { count: validDespesas.length }
        }));
      } catch (err) {
        console.warn('[DataStore] Falha ao despachar evento:', err);
      }
    }
    
    return success;
  }

  /**
   * Salva despesas (async)
   */
  async function saveDespesasAsync(despesas) {
    if (!Array.isArray(despesas)) {
      console.error('[DataStore] Despesas deve ser um array');
      return false;
    }
    
    const validDespesas = despesas.filter(validateDespesa);
    despesasCache = validDespesas;
    
    await setItemAsync(DESPESAS_KEY, validDespesas);
    safeSetItem(DESPESAS_KEY, JSON.stringify(validDespesas)); // Backup
    
    try {
      global.dispatchEvent(new CustomEvent('irancash:despesas:updated', {
        detail: { count: validDespesas.length }
      }));
    } catch (err) {
      console.warn('[DataStore] Falha ao despachar evento:', err);
    }
    
    return true;
  }

  function addDespesa(despesa) {
    if (!validateDespesa(despesa)) {
      console.error('[DataStore] Despesa inválida');
      return false;
    }
    
    if (despesa.descricao) {
      despesa.descricao = sanitizeString(despesa.descricao);
    }
    if (despesa.categoria) {
      despesa.categoria = sanitizeString(despesa.categoria);
    }
    
    if (!despesa.id) {
      despesa.id = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    }
    
    const despesas = loadDespesas();
    despesas.push(despesa);
    
    return saveDespesas(despesas);
  }

  async function addDespesaAsync(despesa) {
    if (!validateDespesa(despesa)) {
      console.error('[DataStore] Despesa inválida');
      return false;
    }
    
    if (despesa.descricao) {
      despesa.descricao = sanitizeString(despesa.descricao);
    }
    if (despesa.categoria) {
      despesa.categoria = sanitizeString(despesa.categoria);
    }
    
    if (!despesa.id) {
      despesa.id = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    }
    
    const despesas = await loadDespesasAsync();
    despesas.push(despesa);
    
    return await saveDespesasAsync(despesas);
  }

  function removeDespesa(id) {
    if (!id) return false;
    
    const despesas = loadDespesas();
    const filtered = despesas.filter(d => d.id !== id);
    
    if (filtered.length === despesas.length) {
      return false;
    }
    
    return saveDespesas(filtered);
  }

  async function removeDespesaAsync(id) {
    if (!id) return false;
    
    const despesas = await loadDespesasAsync();
    const filtered = despesas.filter(d => d.id !== id);
    
    if (filtered.length === despesas.length) {
      return false;
    }
    
    return await saveDespesasAsync(filtered);
  }

  // ========== INICIALIZAÇÃO ==========

  function ensureDefaults() {
    const raw = safeGetItem(CATEGORY_KEY);
    if (!raw) {
      saveCategories(DEFAULT_CATEGORIES.slice());
    }
  }

  /**
   * Inicializa o DataStore carregando dados (Firebase > IndexedDB > localStorage)
   * Esta função é chamada automaticamente quando o Firebase está pronto
   */
  async function initAsync() {
    try {
      // Aguarda Firebase estar disponível (pode levar alguns segundos)
      let attempts = 0;
      const maxAttempts = 50; // 5 segundos
      while (attempts < maxAttempts) {
        if (global.FirebaseStore && global.FirebaseStore.isAvailable) {
          try {
            const isAvailable = await global.FirebaseStore.isAvailable();
            if (isAvailable) {
              // Migra dados locais para Firebase na primeira vez (executa uma vez)
              if (!global._firebaseMigrated) {
                const migrationResult = await global.FirebaseStore.migrateFromLocalStorage();
                console.log('[DataStore] Migração para Firebase:', migrationResult.migrated, 'itens migrados');
                global._firebaseMigrated = true;
              }
              
              // Carrega dados do Firebase
              await loadCategoriesAsync();
              await loadDespesasAsync();

              // Carrega também dados de vendas para o dashboard
              const vendasResumo = await getItemAsync('vendasResumo', []);
              if (Array.isArray(vendasResumo)) safeSetItem('vendasResumo', JSON.stringify(vendasResumo));

              const vendasResumoDia = await getItemAsync('vendasResumoDia', []);
              if (Array.isArray(vendasResumoDia)) safeSetItem('vendasResumoDia', JSON.stringify(vendasResumoDia));

              // Carrega vendasDetalhadas (importante para gráficos por período)
              const vendasDetalhadas = await getItemAsync('vendasDetalhadas', []);
              if (Array.isArray(vendasDetalhadas)) safeSetItem('vendasDetalhadas', JSON.stringify(vendasDetalhadas));

              console.log('[DataStore] Inicializado com Firebase - Todos os dados estão na nuvem! ☁️');
              return;
            }
          } catch (firebaseErr) {
            console.warn('[DataStore] Erro ao inicializar Firebase, tentando IndexedDB:', firebaseErr);
            break; // Sai do loop e tenta fallback
          }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      // Fallback para IndexedDB
      if (global.IndexedDBStore) {
        await global.IndexedDBStore.init();
        await loadCategoriesAsync();
        await loadDespesasAsync();
        console.log('[DataStore] Inicializado com IndexedDB (local)');
        return;
      }

      // Fallback para localStorage
      console.warn('[DataStore] Fallback para localStorage');
      ensureDefaults();
    } catch (err) {
      console.warn('[DataStore] Erro na inicialização:', err);
      ensureDefaults();
    }
  }
  
  // Auto-inicializa quando Firebase estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Aguarda Firebase estar pronto
      global.addEventListener('firebase:initialized', () => {
        initAsync();
      });
      // Se Firebase já estiver inicializado, inicializa imediatamente
      setTimeout(() => {
        if (global.FirebaseStore && global.FirebaseStore.initialized && global.FirebaseStore.initialized()) {
          initAsync();
        }
      }, 2000);
    });
  } else {
    // DOM já está pronto
    global.addEventListener('firebase:initialized', () => {
      initAsync();
    });
    setTimeout(() => {
      if (global.FirebaseStore && global.FirebaseStore.initialized && global.FirebaseStore.initialized()) {
        initAsync();
      }
    }, 2000);
  }

  /**
   * Limpa despesas duplicadas do armazenamento
   * @returns {number} Número de duplicatas removidas
   */
  function limparDespesasDuplicadas() {
    const raw = safeGetItem(DESPESAS_KEY);
    const despesas = safeParseJSON(raw, []);
    if (!Array.isArray(despesas)) return 0;
    
    const antes = despesas.length;
    const limpas = dedupDespesas(despesas.filter(validateDespesa));
    const removidas = antes - limpas.length;
    
    if (removidas > 0) {
      despesasCache = limpas;
      safeSetItem(DESPESAS_KEY, JSON.stringify(limpas));
      // Também atualiza IndexedDB
      if (typeof IndexedDBStore !== 'undefined' && IndexedDBStore.setItem) {
        IndexedDBStore.setItem(DESPESAS_KEY, limpas).catch(e => console.warn('Erro ao salvar no IndexedDB:', e));
      }
      console.log(`[DataStore] ${removidas} despesa(s) duplicada(s) removida(s)`);
    }
    return removidas;
  }

  ensureDefaults();

  // ========== EXPORTAÇÃO ==========

  global.IRANCASH = global.IRANCASH || {};
  global.IRANCASH.DataStore = {
    // Constantes
    CATEGORY_KEY,
    DESPESAS_KEY,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES.slice(),
    // Categorias (sync)
    loadCategories,
    saveCategories,
    subscribeCategories,
    // Categorias (async)
    loadCategoriesAsync,
    saveCategoriesAsync,
    // Despesas (sync)
    loadDespesas,
    saveDespesas,
    addDespesa,
    removeDespesa,
    // Despesas (async)
    loadDespesasAsync,
    saveDespesasAsync,
    addDespesaAsync,
    removeDespesaAsync,
    // Utilitários
    sanitizeString,
    validateDespesa,
    limparDespesasDuplicadas,
    // Storage direto
    getItemAsync,
    setItemAsync,
    // Inicialização
    initAsync
  };
  
})(window);
