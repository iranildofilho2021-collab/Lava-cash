/**
 * Configuração do Firebase
 * Exporta as credenciais para inicialização
 */
export const firebaseConfig = {
  apiKey: "AIzaSyDNL8X9tFkl384tMaw32OyhBY0lK-nercw",
  authDomain: "lavacash-financeiro.firebaseapp.com",
  projectId: "lavacash-financeiro",
  storageBucket: "lavacash-financeiro.firebasestorage.app",
  messagingSenderId: "100539703352",
  appId: "1:100539703352:web:a3b4d67174e5d0d36146cd"
};

const runtimeAppCheckSiteKey = typeof window !== 'undefined'
  ? String(window.LAVACASH_APP_CHECK_SITE_KEY || '').trim()
  : '';

export const appCheckConfig = {
  enabled: Boolean(runtimeAppCheckSiteKey),
  recaptchaV3SiteKey: runtimeAppCheckSiteKey
};
