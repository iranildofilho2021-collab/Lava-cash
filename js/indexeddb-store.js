/**
 * IndexedDB Store - Armazenamento com maior capacidade
 * Substitui localStorage com suporte a dados maiores (~50MB+)
 * @module IndexedDBStore
 */
(function(global) {
  'use strict';

  const DB_NAME = 'IranCashDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'dados';

  let db = null;
  let dbReady = null;

  /**
   * Inicializa a conexão com o IndexedDB
   * @returns {Promise<IDBDatabase>}
   */
  function initDB() {
    if (dbReady) return dbReady;

    dbReady = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn('[IndexedDB] Não suportado, usando localStorage como fallback');
        reject(new Error('IndexedDB não suportado'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error('[IndexedDB] Erro ao abrir:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        db = event.target.result;
        console.log('[IndexedDB] Conexão estabelecida');
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        
        // Cria object store se não existir
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('key', 'key', { unique: true });
          console.log('[IndexedDB] Object store criado');
        }
      };
    });

    return dbReady;
  }

  /**
   * Salva um item no IndexedDB
   * @param {string} key - Chave do item
   * @param {*} value - Valor a ser salvo (será serializado automaticamente)
   * @returns {Promise<boolean>}
   */
  async function setItem(key, value) {
    try {
      await initDB();
      
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const data = {
          key: key,
          value: value,
          updatedAt: new Date().toISOString()
        };

        const request = store.put(data);

        request.onsuccess = () => {
          resolve(true);
        };

        request.onerror = (event) => {
          console.error('[IndexedDB] Erro ao salvar:', key, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      // Fallback para localStorage
      console.warn('[IndexedDB] Fallback para localStorage:', key);
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.error('[Storage] Erro ao salvar:', e);
        return false;
      }
    }
  }

  /**
   * Recupera um item do IndexedDB
   * @param {string} key - Chave do item
   * @param {*} defaultValue - Valor padrão se não encontrar
   * @returns {Promise<*>}
   */
  async function getItem(key, defaultValue = null) {
    try {
      await initDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onsuccess = (event) => {
          const result = event.target.result;
          resolve(result ? result.value : defaultValue);
        };

        request.onerror = (event) => {
          console.error('[IndexedDB] Erro ao ler:', key, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      // Fallback para localStorage
      console.warn('[IndexedDB] Fallback para localStorage:', key);
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
      } catch (e) {
        return defaultValue;
      }
    }
  }

  /**
   * Remove um item do IndexedDB
   * @param {string} key - Chave do item
   * @returns {Promise<boolean>}
   */
  async function removeItem(key) {
    try {
      await initDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);

        request.onsuccess = () => {
          resolve(true);
        };

        request.onerror = (event) => {
          console.error('[IndexedDB] Erro ao remover:', key, event.target.error);
          reject(event.target.error);
        };
      });
    } catch (error) {
      localStorage.removeItem(key);
      return true;
    }
  }

  /**
   * Lista todas as chaves armazenadas
   * @returns {Promise<string[]>}
   */
  async function getAllKeys() {
    try {
      await initDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAllKeys();

        request.onsuccess = (event) => {
          resolve(event.target.result || []);
        };

        request.onerror = (event) => {
          reject(event.target.error);
        };
      });
    } catch (error) {
      // Fallback: retorna chaves do localStorage
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        keys.push(localStorage.key(i));
      }
      return keys;
    }
  }

  /**
   * Recupera todos os dados armazenados
   * @returns {Promise<Object>}
   */
  async function getAll() {
    try {
      await initDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = (event) => {
          const results = event.target.result || [];
          const data = {};
          results.forEach(item => {
            data[item.key] = item.value;
          });
          resolve(data);
        };

        request.onerror = (event) => {
          reject(event.target.error);
        };
      });
    } catch (error) {
      // Fallback para localStorage
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        try {
          data[key] = JSON.parse(localStorage.getItem(key));
        } catch (e) {
          data[key] = localStorage.getItem(key);
        }
      }
      return data;
    }
  }

  /**
   * Limpa todos os dados do IndexedDB
   * @returns {Promise<boolean>}
   */
  async function clear() {
    try {
      await initDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => {
          console.log('[IndexedDB] Dados limpos');
          resolve(true);
        };

        request.onerror = (event) => {
          reject(event.target.error);
        };
      });
    } catch (error) {
      localStorage.clear();
      return true;
    }
  }

  /**
   * Calcula o uso estimado de armazenamento
   * @returns {Promise<Object>}
   */
  async function getStorageUsage() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        return {
          used: estimate.usage || 0,
          quota: estimate.quota || 0,
          usedMB: ((estimate.usage || 0) / (1024 * 1024)).toFixed(2),
          quotaMB: ((estimate.quota || 0) / (1024 * 1024)).toFixed(2),
          percentage: estimate.quota ? ((estimate.usage / estimate.quota) * 100).toFixed(1) : '0'
        };
      }
      
      // Fallback: estima pelo tamanho dos dados
      const allData = await getAll();
      const size = new Blob([JSON.stringify(allData)]).size;
      return {
        used: size,
        quota: 50 * 1024 * 1024, // ~50MB estimado
        usedMB: (size / (1024 * 1024)).toFixed(2),
        quotaMB: '50.00',
        percentage: ((size / (50 * 1024 * 1024)) * 100).toFixed(1)
      };
    } catch (error) {
      return { used: 0, quota: 0, usedMB: '0', quotaMB: '50', percentage: '0' };
    }
  }

  /**
   * Migra dados do localStorage para IndexedDB
   * @returns {Promise<{migrated: number, errors: number}>}
   */
  async function migrateFromLocalStorage() {
    const KEYS_TO_MIGRATE = [
      'categorias',
      'despesas',
      'vendasResumo',
      'vendasResumoDia',
      'vendasResumoDia_chunks',
      'importConfig',
      'mappingCartao',
      'mappingPix',
      'irancash_theme',
      'investimentoInicial'
    ];

    let migrated = 0;
    let errors = 0;

    console.log('[IndexedDB] Iniciando migração do localStorage...');

    for (const key of KEYS_TO_MIGRATE) {
      try {
        const localValue = localStorage.getItem(key);
        if (localValue !== null) {
          // Verifica se já existe no IndexedDB
          const existingValue = await getItem(key);
          if (existingValue === null) {
            // Migra para IndexedDB
            let value;
            try {
              value = JSON.parse(localValue);
            } catch (e) {
              value = localValue;
            }
            await setItem(key, value);
            console.log('[IndexedDB] Migrado:', key);
            migrated++;
          }
        }
      } catch (error) {
        console.error('[IndexedDB] Erro ao migrar:', key, error);
        errors++;
      }
    }

    // Migra chunks de vendas
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('vendasResumoDia_chunk')) {
        try {
          const existingValue = await getItem(key);
          if (existingValue === null) {
            const value = JSON.parse(localStorage.getItem(key));
            await setItem(key, value);
            console.log('[IndexedDB] Migrado chunk:', key);
            migrated++;
          }
        } catch (error) {
          errors++;
        }
      }
    }

    console.log(`[IndexedDB] Migração concluída: ${migrated} itens migrados, ${errors} erros`);
    
    return { migrated, errors };
  }

  /**
   * Verifica se IndexedDB está disponível e funcionando
   * @returns {Promise<boolean>}
   */
  async function isAvailable() {
    try {
      await initDB();
      return true;
    } catch (error) {
      return false;
    }
  }

  // API Pública
  const IndexedDBStore = {
    init: initDB,
    setItem,
    getItem,
    removeItem,
    getAllKeys,
    getAll,
    clear,
    getStorageUsage,
    migrateFromLocalStorage,
    isAvailable,
    DB_NAME,
    STORE_NAME
  };

  // Expõe globalmente
  global.IndexedDBStore = IndexedDBStore;

  // Auto-inicialização e migração
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      await initDB();
      await migrateFromLocalStorage();
    });
  } else {
    initDB().then(() => migrateFromLocalStorage());
  }

})(window);
