/**
 * Componente de Status de Conexão e Sincronização
 */
(function() {
  'use strict';

  function createStatusIndicator() {
    const div = document.createElement('div');
    div.id = 'connection-status';
    div.className = 'fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm font-medium transition-all duration-300 transform translate-y-20 opacity-0';
    div.style.backgroundColor = 'var(--bg-card, #fff)';
    
    const dot = document.createElement('span');
    dot.className = 'w-2.5 h-2.5 rounded-full';
    
    const text = document.createElement('span');
    
    div.appendChild(dot);
    div.appendChild(text);
    document.body.appendChild(div);
    
    return { div, dot, text };
  }

  const { div, dot, text } = createStatusIndicator();
  let hideTimeout;

  function showStatus(status, message, autoHide = true) {
    clearTimeout(hideTimeout);
    
    div.classList.remove('translate-y-20', 'opacity-0');
    
    if (status === 'online') {
      dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
      text.className = 'text-emerald-700';
      text.textContent = message || 'Online';
      div.className = 'fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm font-medium bg-white border border-emerald-100';
    } else if (status === 'offline') {
      dot.className = 'w-2.5 h-2.5 rounded-full bg-gray-400';
      text.className = 'text-gray-600';
      text.textContent = message || 'Offline (Modo Local)';
      div.className = 'fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm font-medium bg-gray-100 border border-gray-200';
    } else if (status === 'syncing') {
      dot.className = 'w-2.5 h-2.5 rounded-full bg-sky-500 animate-spin';
      text.className = 'text-sky-700';
      text.textContent = message || 'Sincronizando...';
      div.className = 'fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm font-medium bg-white border border-sky-100';
    } else if (status === 'error') {
      dot.className = 'w-2.5 h-2.5 rounded-full bg-red-500';
      text.className = 'text-red-700';
      text.textContent = message || 'Erro de Conexão';
      div.className = 'fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm font-medium bg-white border border-red-100';
    }

    if (autoHide && status !== 'offline' && status !== 'error') {
      hideTimeout = setTimeout(() => {
        div.classList.add('translate-y-20', 'opacity-0');
      }, 3000);
    }
  }

  // Monitora estado da rede
  window.addEventListener('online', () => {
    showStatus('online', 'Conexão restaurada');
    // Tenta reconectar Firebase se necessário
    if (window.IRANCASH && window.IRANCASH.Firebase && window.IRANCASH.Firebase.db) {
      try { window.IRANCASH.Firebase.db.enableNetwork(); } catch(e){}
    }
  });
  
  window.addEventListener('offline', () => {
    showStatus('offline', 'Sem conexão');
    // Firebase gerencia offline automaticamente, mas podemos desabilitar rede explícita se quiser
    // try { window.IRANCASH.Firebase.db.disableNetwork(); } catch(e){}
  });

  // Monitora inicialização do Firebase
  window.addEventListener('firebase:initialized', () => {
    showStatus('online', 'Conectado ao Firebase');
  });

  // Monitora erros globais (opcional)
  window.addEventListener('error', (e) => {
    if (e.message && e.message.includes('Firebase')) {
      showStatus('error', 'Erro no Firebase');
    }
  });

  // Expor para uso manual
  window.ConnectionStatus = { show: showStatus };
  
  // Estado inicial
  if (navigator.onLine) {
    if (window.IRANCASH && window.IRANCASH.Firebase && window.IRANCASH.Firebase.ready) {
      showStatus('online', 'Online');
    }
  } else {
    showStatus('offline');
  }

})();
