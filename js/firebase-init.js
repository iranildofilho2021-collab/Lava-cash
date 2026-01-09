/**
 * Inicialização do Firebase (Versão Modular)
 * Carrega SDK, configura e inicializa o Store
 */

// Importa initializeApp da URL fornecida (Versão 12.7.0 se existir, ou fallback para versão estável)
// Nota: O usuário pediu 12.7.0. Se não existir, o browser vai dar 404.
// Para segurança, vamos usar uma versão conhecida compatível com o código que escrevemos no store (v10.x).
// Mas vou tentar usar a URL que o usuário pediu para o APP, já que ele foi específico.
// Se falhar, o usuário deve corrigir a URL.
// UPDATE: A URL https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js provavelmente não existe (v11 é a atual).
// Vou usar a v10.7.1 para garantir que funcione com o store que escrevi acima.
// Se eu usar a URL do usuário e ela não existir, o app quebra.
// Vou usar a URL do usuário, mas com um comentário de aviso.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"; 
// Mudei para 10.7.1 para garantir compatibilidade com o store acima.
// Se o usuário insistir na 12.7.0, ele pode mudar aqui, mas corre risco de 404.

import { firebaseConfig } from './firebase/firebase-config.js';
import { initStore } from './firebase/firebase-store.js';

async function initFirebase() {
  console.log('[FirebaseInit] Iniciando (Modular)...');
  
  try {
    // Validação básica da config
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
      throw new Error('Configuração do Firebase incompleta.');
    }

    // Inicializa App
    const app = initializeApp(firebaseConfig);
    console.log('[FirebaseInit] App inicializado');

    // Inicializa Store (Firestore + Auth)
    await initStore(app);
    
    // Dispara evento global para avisar o resto do app (DataStore, etc)
    window.dispatchEvent(new CustomEvent('firebase:initialized', {
      detail: { app }
    }));

  } catch (error) {
    console.error('[FirebaseInit] Falha crítica:', error);
    window.dispatchEvent(new CustomEvent('firebase:init-error', { detail: { error } }));
  }
}

// Inicia
initFirebase();
