/**
 * Ajuda.js (Simplificado)
 * Apenas Primeiros Passos e Conceitos Básicos
 */

(function() {
  'use strict';

  // --- Dados de FAQ (Apenas Primeiros Passos) ---
  const FAQ_DATA = [
    {
      id: 1,
      question: 'O que é o Dashboard?',
      answer: `
        <p>O Dashboard é a sua tela inicial. Ele mostra um resumo da saúde financeira da sua lavanderia: quanto entrou (Receitas), quanto saiu (Despesas) e o saldo final, além de gráficos comparativos mês a mês.</p>
      `
    },
    {
      id: 2,
      question: 'O sistema funciona sem internet?',
      answer: `
        <p><strong>Sim!</strong> O LavaJá funciona offline. Você pode consultar e lançar dados sem internet. Assim que a conexão voltar, o sistema sincronizará tudo automaticamente com a nuvem.</p>
      `
    },
    {
      id: 3,
      question: 'Como faço login?',
      answer: `
        <p>Use seu e-mail e senha cadastrados na tela de login. Se esquecer a senha, utilize a opção "Esqueceu a senha?" para recuperá-la via e-mail.</p>
      `
    },
    {
      id: 4,
      question: 'O que são Receitas e Despesas?',
      answer: `
        <p><strong>Receitas:</strong> Todo o dinheiro que entra na sua lavanderia (vendas, serviços).</p>
        <p><strong>Despesas:</strong> Todo o dinheiro que sai (contas, fornecedores, manutenção).</p>
      `
    }
  ];

  // --- Elementos DOM ---
  const faqContainer = document.getElementById('faq-container');
  const feedbackButtons = document.querySelectorAll('.feedback-btn');
  const feedbackResponse = document.getElementById('feedback-response');

  // --- Inicialização ---
  function init() {
    renderFAQs();
    setupEventListeners();
  }

  // --- Event Listeners ---
  function setupEventListeners() {
    // Feedback Buttons
    feedbackButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        // UI Update
        document.getElementById('feedback-buttons').classList.add('hidden');
        feedbackResponse.classList.remove('hidden');
      });
    });
  }

  // --- Renderização ---
  function renderFAQs() {
    if(!faqContainer) return;
    faqContainer.innerHTML = '';

    FAQ_DATA.forEach(item => {
      const card = document.createElement('div');
      card.className = 'bg-white rounded-lg border border-gray-100 overflow-hidden transition-all';
      
      card.innerHTML = `
        <button class="w-full px-5 py-3 text-left flex justify-between items-center focus:outline-none focus:bg-gray-50 hover:bg-gray-50 transition-colors rounded-lg group" aria-expanded="false">
          <span class="font-medium text-gray-700 group-hover:text-sky-700">${item.question}</span>
          <svg class="w-5 h-5 text-gray-400 transform transition-transform duration-300 accordion-icon group-hover:text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>
        <div class="accordion-content bg-white pl-5 pr-5">
          <div class="py-3 text-gray-600 prose prose-sm max-w-none border-t border-gray-100 mt-1">
            ${item.answer}
          </div>
        </div>
      `;

      // Accordion Logic
      const btn = card.querySelector('button');
      const content = card.querySelector('.accordion-content');
      const icon = card.querySelector('.accordion-icon');

      btn.addEventListener('click', () => {
        const isOpen = content.classList.contains('open');
        
        // Fecha outros abertos (opcional, para manter limpo)
        const currentOpen = faqContainer.querySelector('.accordion-content.open');
        if(currentOpen && currentOpen !== content) {
           currentOpen.classList.remove('open');
           currentOpen.style.maxHeight = null;
           currentOpen.parentElement.querySelector('.accordion-icon').classList.remove('rotate-180');
        }

        if (isOpen) {
          content.classList.remove('open');
          content.style.maxHeight = null;
          icon.classList.remove('rotate-180');
          btn.setAttribute('aria-expanded', 'false');
        } else {
          content.classList.add('open');
          content.style.maxHeight = content.scrollHeight + "px";
          icon.classList.add('rotate-180');
          btn.setAttribute('aria-expanded', 'true');
        }
      });

      faqContainer.appendChild(card);
    });
  }

  // Run
  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
