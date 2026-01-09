/**
 * Utilitários para feedback visual de carregamento
 * Gerencia estados de botões e spinners
 */
(function(global) {
    'use strict';
  
    const LoadingUtils = {
      /**
       * Define o estado de carregamento de um botão
       * @param {HTMLElement} btn - O botão a ser manipulado
       * @param {boolean} isLoading - Se está carregando ou não
       * @param {string} [loadingText='Aguarde...'] - Texto a exibir durante carregamento
       * @param {string} [originalText] - Texto original (opcional, tenta ler do atributo data-original-text ou innerText)
       */
      setButtonLoading: function(btn, isLoading, loadingText = 'Salvo...') {
        if (!btn) return;
  
        if (isLoading) {
          // Salva texto original se não existir
          if (!btn.dataset.originalText) {
            btn.dataset.originalText = btn.innerHTML;
          }
          
          // Define largura fixa para evitar pulo de layout
          const width = btn.offsetWidth;
          btn.style.width = `${width}px`;
          btn.disabled = true;
          btn.classList.add('opacity-75', 'cursor-not-allowed');
          
          // Spinner SVG
          const spinner = `
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          `;
          
          btn.innerHTML = `${spinner} ${loadingText}`;
        } else {
          // Restaura estado original
          btn.disabled = false;
          btn.classList.remove('opacity-75', 'cursor-not-allowed');
          btn.style.width = ''; // Remove largura fixa
          
          if (btn.dataset.originalText) {
            btn.innerHTML = btn.dataset.originalText;
          }
        }
      },
  
      /**
       * Cria um overlay de carregamento na tela inteira
       * @param {boolean} show - Mostrar ou esconder
       * @param {string} [message='Processando...'] - Mensagem a exibir
       */
      toggleFullPageLoading: function(show, message = 'Processando...') {
        let overlay = document.getElementById('full-page-loading');
        
        if (show) {
          if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'full-page-loading';
            overlay.className = 'fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center backdrop-blur-sm transition-opacity duration-300 opacity-0';
            overlay.innerHTML = `
              <div class="bg-white p-6 rounded-lg shadow-xl flex flex-col items-center">
                <div class="animate-spin rounded-full h-10 w-10 border-4 border-sky-600 border-t-transparent mb-3"></div>
                <p class="text-gray-700 font-medium" id="full-page-loading-text">${message}</p>
              </div>
            `;
            document.body.appendChild(overlay);
            // Force reflow
            void overlay.offsetWidth;
            overlay.classList.remove('opacity-0');
          } else {
            // Atualiza mensagem se já existir
            const txt = document.getElementById('full-page-loading-text');
            if (txt) txt.textContent = message;
            overlay.classList.remove('opacity-0');
          }
        } else {
          if (overlay) {
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.remove(), 300);
          }
        }
      }
    };
  
    global.LoadingUtils = LoadingUtils;
  
  })(window);
