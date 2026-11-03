/**
 * Inicialização do Firebase (Versão Modular)
 * Carrega SDK, configura e inicializa o Store
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";

import { firebaseConfig, appCheckConfig } from './firebase-config.js?v=20260903-owner-only-v1';
import { initStore } from './supabase-store.js?v=20261103-sync-correction-v1';

const IRANCASH_DEBUG = (typeof window !== 'undefined' && window.localStorage && localStorage.getItem('irancash_debug') === 'true');
const log = IRANCASH_DEBUG ? console.log.bind(console) : function() {};


async function initFirebase() {
  log('[FirebaseInit] Iniciando (Modular)...');

  try {
    // Validação básica da config
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
      throw new Error('Configuração do Firebase incompleta.');
    }

    // Inicializa App
    const app = initializeApp(firebaseConfig);
    window.LAVACASH_FIREBASE_APP = app;
    log('[FirebaseInit] App inicializado');

    // App Check opcional: ativar somente depois de cadastrar o reCAPTCHA v3 no
    // Firebase Console e preencher appCheckConfig.recaptchaV3SiteKey.
    if (appCheckConfig?.enabled && appCheckConfig?.recaptchaV3SiteKey) {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(appCheckConfig.recaptchaV3SiteKey),
        isTokenAutoRefreshEnabled: true
      });
      log('[FirebaseInit] App Check inicializado');
    }

    // Inicializa o banco Supabase usando a sessão do Firebase Auth
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

// Uma sessão visual antiga pode continuar no navegador mesmo depois de o
// token seguro expirar. Nas páginas internas, peça um novo login em vez de
// exibir dados vazios ou deixar um carregamento preso.
window.addEventListener('supabase:auth-required', () => {
  const route = String(window.location.pathname || '/').split('/').filter(Boolean).at(-1) || '';
  const appRoot = new URL('../', import.meta.url);
  if (window.location.pathname === appRoot.pathname || route === 'index.html') return;
  const target = new URL('index.html', appRoot);
  target.searchParams.set('sessao', 'expirada');
  target.searchParams.set('retorno', route);
  window.location.replace(target.toString());
});

// Inicia
initFirebase();
