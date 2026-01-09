/**
 * Utilitários de Interface do Usuário (UI)
 * Centraliza notificações (Toasts), Loading States e Tratamento de Erros.
 * @module UiUtils
 */
(function(global) {
  'use strict';

  // ========== TOAST NOTIFICATIONS ==========
  
  function createToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none';
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Mostra uma notificação Toast
   * @param {string} message - Mensagem a exibir
   * @param {string} type - 'success', 'error', 'info', 'warning'
   * @param {number} duration - Duração em ms (default: 3000)
   */
  function showToast(message, type = 'info', duration = 3000) {
    const container = createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto transform transition-all duration-300 ease-in-out translate-x-full opacity-0 flex items-center p-4 rounded-lg shadow-lg border-l-4 bg-white min-w-[300px]';
    
    // Configurar cores e ícones baseados no tipo
    let iconSvg = '';
    let borderColor = '';
    
    switch(type) {
      case 'success':
        borderColor = 'border-emerald-500';
        iconSvg = '<svg class="w-6 h-6 text-emerald-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
        break;
      case 'error':
        borderColor = 'border-red-500';
        iconSvg = '<svg class="w-6 h-6 text-red-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
        break;
      case 'warning':
        borderColor = 'border-amber-500';
        iconSvg = '<svg class="w-6 h-6 text-amber-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>';
        break;
      default: // info
        borderColor = 'border-sky-500';
        iconSvg = '<svg class="w-6 h-6 text-sky-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    }
    
    toast.classList.add(borderColor);
    
    toast.innerHTML = `
      ${iconSvg}
      <div class="flex-1">
        <p class="text-sm font-medium text-gray-800">${message}</p>
      </div>
      <button class="ml-3 text-gray-400 hover:text-gray-600 focus:outline-none" onclick="this.parentElement.remove()">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
      </button>
    `;
    
    container.appendChild(toast);
    
    // Animação de entrada
    requestAnimationFrame(() => {
      toast.classList.remove('translate-x-full', 'opacity-0');
    });
    
    // Auto remoção
    if (duration > 0) {
      setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
  }

  // ========== LOADING STATES ==========

  /**
   * Controla o overlay de carregamento global
   * @param {boolean} show - Mostrar ou esconder
   * @param {string} text - Texto opcional
   */
  function toggleLoadingOverlay(show, text = 'Carregando...') {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
      // Se não existir, cria um básico (embora deva existir no HTML)
      overlay = document.createElement('div');
      overlay.id = 'loadingOverlay';
      overlay.className = 'fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center transition-opacity duration-300';
      overlay.innerHTML = `
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mb-4"></div>
        <div class="loading-text text-gray-600 font-medium">${text}</div>
      `;
      document.body.appendChild(overlay);
    }

    const textEl = overlay.querySelector('.loading-text');
    if (textEl) textEl.textContent = text;

    if (show) {
      overlay.style.display = 'flex';
      // Forçar reflow
      overlay.offsetHeight;
      overlay.classList.add('opacity-100');
      overlay.classList.remove('opacity-0', 'pointer-events-none');
    } else {
      overlay.classList.add('opacity-0', 'pointer-events-none');
      overlay.classList.remove('opacity-100');
      setTimeout(() => {
        if (overlay.classList.contains('opacity-0')) {
          overlay.style.display = 'none';
        }
      }, 300);
    }
  }

  /**
   * Adiciona estado de loading a um botão
   * @param {HTMLElement} btn - Botão
   * @param {boolean} isLoading - Estado
   * @param {string} loadingText - Texto durante loading (opcional)
   */
  function setButtonLoading(btn, isLoading, loadingText = null) {
    if (!btn) return;
    
    if (isLoading) {
      if (!btn.dataset.originalHtml) {
        btn.dataset.originalHtml = btn.innerHTML;
      }
      const text = loadingText || 'Aguarde...';
      btn.disabled = true;
      btn.classList.add('cursor-not-allowed', 'opacity-75');
      btn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-current inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        ${text}
      `;
    } else {
      btn.disabled = false;
      btn.classList.remove('cursor-not-allowed', 'opacity-75');
      if (btn.dataset.originalHtml) {
        btn.innerHTML = btn.dataset.originalHtml;
      }
    }
  }

  // ========== ERROR HANDLING ==========

  /**
   * Trata erros de forma centralizada
   * @param {Error|string} error - Erro ocorrido
   * @param {string} context - Contexto onde ocorreu (ex: "Carregar despesas")
   * @param {boolean} showUser - Se deve mostrar toast ao usuário
   */
  function handleError(error, context = '', showUser = true) {
    const msg = error.message || String(error);
    console.error(`[${context}] Erro:`, error);
    
    if (showUser) {
      showToast(`Erro em ${context}: ${msg}`, 'error');
    }
  }

  // ========== EXPORT ==========

  global.UiUtils = {
    showToast,
    toggleLoadingOverlay,
    setButtonLoading,
    handleError
  };

})(window);
