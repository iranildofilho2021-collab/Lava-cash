/**
 * Firebase Store - Armazenamento na nuvem usando Firestore (Versão Modular)
 * Substitui IndexedDB/localStorage com sincronização em tempo real
 */

import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  writeBatch, 
  serverTimestamp, 
  initializeFirestore,
  persistentLocalCache
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"; 

import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let db = null;
let auth = null;
let initialized = false;

/**
 * Inicializa o Store com as instâncias do Firebase
 * @param {Object} firebaseApp - Instância do App Firebase inicializado
 */
export async function initStore(firebaseApp) {
  if (initialized) return;

  try {
    auth = getAuth(firebaseApp);

    // Inicializa Firestore com persistência (nova API)
    // Evita o aviso de depreciação de enableIndexedDbPersistence
    try {
      db = initializeFirestore(firebaseApp, {
        localCache: persistentLocalCache()
      });
      console.log('[FirebaseStore] Persistência offline habilitada (LocalCache)');
    } catch (err) {
      // Fallback se já tiver sido inicializado ou erro
      if (err.code === 'failed-precondition' || err.message.includes('already exists')) {
         db = getFirestore(firebaseApp);
      } else {
         console.warn('[FirebaseStore] Erro ao configurar persistência:', err);
         db = getFirestore(firebaseApp);
      }
    }

    initialized = true;
    console.log('[FirebaseStore] Store inicializado com sucesso');
    
    // Expõe API global para compatibilidade com código legado
    exposeGlobalAPI();
    
    return true;
  } catch (error) {
    console.error('[FirebaseStore] Erro ao inicializar store:', error);
    initialized = false;
    throw error;
  }
}

// Helpers privados
const getCollectionRef = (colName) => collection(db, colName);
const getDocRef = (colName, docId) => doc(db, colName, docId);

// API Pública (Exportada e Global)
const FirebaseStore = {
  
  async setItem(key, value) {
    if (!initialized) throw new Error('FirebaseStore não inicializado');
    try {
      const docRef = getDocRef('data', key);
      const docData = {
        key: key,
        value: value,
        updatedBy: (auth && auth.currentUser) ? auth.currentUser.uid : 'anonymous',
        updatedAt: serverTimestamp()
      };
      await setDoc(docRef, docData, { merge: true });
      console.log(`[FirebaseStore] Item salvo: ${key}`);
      return true;
    } catch (error) {
      console.error(`[FirebaseStore] Erro ao salvar ${key}:`, error);
      // Fallback localStorage
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch(e) { return false; }
    }
  },

  async getItem(key, defaultValue = null) {
    if (!initialized) throw new Error('FirebaseStore não inicializado');
    try {
      const docRef = getDocRef('data', key);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log(`[FirebaseStore] Item carregado: ${key}`);
        return data.value !== undefined ? data.value : defaultValue;
      }
      // Fallback localStorage
      const local = localStorage.getItem(key);
      return local ? JSON.parse(local) : defaultValue;
    } catch (error) {
      console.error(`[FirebaseStore] Erro ao ler ${key}:`, error);
      return defaultValue;
    }
  },

  async removeItem(key) {
    if (!initialized) throw new Error('FirebaseStore não inicializado');
    try {
      const docRef = getDocRef('data', key);
      await deleteDoc(docRef);
      console.log(`[FirebaseStore] Item removido: ${key}`);
      try { localStorage.removeItem(key); } catch(e){}
      return true;
    } catch (error) {
      console.error(`[FirebaseStore] Erro ao remover ${key}:`, error);
      return false;
    }
  },

  async getAllKeys() {
    if (!initialized) throw new Error('FirebaseStore não inicializado');
    try {
      const querySnapshot = await getDocs(getCollectionRef('data'));
      return querySnapshot.docs.map(doc => doc.data().key || doc.id);
    } catch (error) {
      console.error('[FirebaseStore] Erro ao listar chaves:', error);
      return [];
    }
  },

  async getAll() {
    if (!initialized) throw new Error('FirebaseStore não inicializado');
    try {
      const querySnapshot = await getDocs(getCollectionRef('data'));
      const data = {};
      querySnapshot.forEach(doc => {
        const docData = doc.data();
        data[docData.key || doc.id] = docData.value;
      });
      return data;
    } catch (error) {
      console.error('[FirebaseStore] Erro ao carregar tudo:', error);
      return {};
    }
  },

  async clear() {
    if (!initialized) throw new Error('FirebaseStore não inicializado');
    try {
      const querySnapshot = await getDocs(getCollectionRef('data'));
      const batch = writeBatch(db);
      querySnapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log('[FirebaseStore] Todos os dados removidos');
      try { localStorage.clear(); } catch(e){}
      return true;
    } catch (error) {
      console.error('[FirebaseStore] Erro ao limpar:', error);
      return false;
    }
  },

  subscribe(key, callback) {
    if (!initialized) return () => {};
    try {
      const docRef = getDocRef('data', key);
      return onSnapshot(docRef, (doc) => {
        if (doc.exists()) {
          callback(doc.data().value);
        } else {
          callback(null);
        }
      }, (error) => {
        console.error(`[FirebaseStore] Erro na inscrição ${key}:`, error);
      });
    } catch (error) {
      console.error(`[FirebaseStore] Erro ao inscrever ${key}:`, error);
      return () => {};
    }
  },
  
  async migrateFromLocalStorage() {
     const KEYS_TO_MIGRATE = [
      'categorias', 'despesas', 'vendasResumo', 'vendasResumoDia',
      'importConfig', 'mappingCartao', 'mappingPix', 'irancash_theme', 'investimentoInicial'
    ];
    // vendasDetalhadas é removido daqui pois o receitas-firebase-adapter.js gerencia isso com chunking
    // para evitar o erro de limite de 1MB do Firestore
    let migrated = 0;
    try {
      for (const key of KEYS_TO_MIGRATE) {
        const localValue = localStorage.getItem(key);
        if (localValue) {
          try {
             const val = JSON.parse(localValue);
             const remoteVal = await this.getItem(key);
             if (!remoteVal || JSON.stringify(remoteVal) !== JSON.stringify(val)) {
               await this.setItem(key, val);
               migrated++;
             }
          } catch(e) {}
        }
      }
      console.log(`[FirebaseStore] Migração: ${migrated} itens`);
    } catch(e) {
      console.error('Erro migração:', e);
    }
    return { migrated };
  },

  isAvailable: async () => initialized,
  getDB: () => db,
  getAuth: () => auth,
  initialized: () => initialized
};

function exposeGlobalAPI() {
  window.FirebaseStore = FirebaseStore;
}
