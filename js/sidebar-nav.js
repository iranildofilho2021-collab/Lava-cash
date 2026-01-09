/**
 * Navegação da Sidebar com transições suaves
 * @module SidebarNav
 */
(function(){
  'use strict';

  function initSidebarNav(){
    const links = document.querySelectorAll('aside nav a.sidebar-link');
    if (!links || !links.length) return;

    links.forEach(link => {
      // Previne flicker de colapso/expansão ao clicar
      link.addEventListener('mousedown', handlePointerDown);
      link.addEventListener('touchstart', handlePointerDown, { passive: true });
      link.addEventListener('click', handleLinkClick);
      
      // Suporte a navegação por teclado
      link.addEventListener('keydown', handleKeyDown);
    });
  }

  function handlePointerDown() {
    const asideEl = document.querySelector('aside.sidebar-collapsed');
    if (asideEl) asideEl.classList.add('no-collapse');
  }

  function handleLinkClick(e) {
    const link = e.currentTarget;
    const href = link.getAttribute('href');
    
    if (!href || href.startsWith('#')) return;
    
    const current = location.pathname.split('/').pop() || 'index.html';
    if (current === href) return; // Já está na página
    
    e.preventDefault();
    
    // Remove classe no-collapse após delay
    const asideEl = document.querySelector('aside.sidebar-collapsed');
    if (asideEl) {
      setTimeout(() => asideEl.classList.remove('no-collapse'), 1200);
    }
    
    // Animação de saída
    const main = document.querySelector('main') || document.querySelector('.main-content');
    if (main) {
      main.classList.add('page-exit');
      main.setAttribute('aria-busy', 'true');
    }
    
    // Navega após animação
    setTimeout(() => {
      location.href = href;
    }, 260);
  }

  function handleKeyDown(e) {
    // Suporte a Enter e Espaço
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.currentTarget.click();
    }
  }

  // Inicialização
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarNav);
  } else {
    initSidebarNav();
  }
})();
