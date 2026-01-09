/**
 * Utilitário de Limpeza Completa de Dados Locais e Remotos
 */
(function(global) {
  'use strict';

  // Limpeza Local (Navegador)
  async function clearLocalData() {
    console.group('🧹 Limpeza Local...');
    try {
      localStorage.clear();
      sessionStorage.clear();
      
      // Limpa Cookies
      document.cookie.split(";").forEach(c => { 
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
      });

      // Limpa IndexedDB
      if (window.indexedDB && window.indexedDB.databases) {
        const dbs = await window.indexedDB.databases();
        dbs.forEach(db => window.indexedDB.deleteDatabase(db.name));
      }
      
      console.log('✅ Dados locais removidos.');
    } catch (e) {
      console.error('Erro na limpeza local:', e);
    }
    console.groupEnd();
    return true;
  }

  // Limpeza Remota (Firebase)
  async function clearRemoteData() {
    console.group('🔥 Limpeza Remota (Firebase)...');
    try {
      if (window.FirebaseStore && window.FirebaseStore.isAvailable) {
        const isConnected = await window.FirebaseStore.isAvailable();
        if (isConnected) {
          await window.FirebaseStore.clear(); // Esta função já limpa a coleção 'data' no Firestore
          console.log('✅ Banco de dados remoto esvaziado.');
          return true;
        } else {
          console.warn('⚠️ Firebase não disponível para limpeza.');
          return false;
        }
      } else {
        console.warn('⚠️ Store não carregado.');
        return false;
      }
    } catch (e) {
      console.error('❌ Erro ao limpar Firebase:', e);
      return false;
    } finally {
      console.groupEnd();
    }
  }

  // Função Principal: Escolhe o modo
  async function clearApp(includeRemote = false) {
    const msg = document.createElement('div');
    msg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.95);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;text-align:center;';
    msg.innerHTML = `<h1 style="color:#0ea5e9;">Limpando...</h1>`;
    document.body.appendChild(msg);

    if (includeRemote) {
      msg.innerHTML += `<p>Apagando dados da nuvem...</p>`;
      await clearRemoteData();
    }

    msg.innerHTML += `<p>Apagando dados locais...</p>`;
    await clearLocalData();

    msg.innerHTML = `<h1 style="color:#10b981;">Concluído!</h1><p>Recarregando...</p>`;
    setTimeout(() => window.location.reload(), 1500);
  }

  // Expõe globalmente
  global.clearApp = clearApp;
  global.clearRemoteData = clearRemoteData;

})(window);
