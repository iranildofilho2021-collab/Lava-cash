/**
 * Navegação da Sidebar com transições suaves
 * @module SidebarNav
 */
(function(){
  'use strict';

  function initSidebarNav(){
    // Usa event delegation para lidar com links injetados dinamicamente
    document.body.addEventListener('click', (e) => {
      const link = e.target.closest('aside nav a.sidebar-link');
      if (link) handleLinkClick(e, link);
    });

    document.body.addEventListener('mousedown', (e) => {
      const link = e.target.closest('aside nav a.sidebar-link');
      if (link) handlePointerDown();
    });
    
    document.body.addEventListener('touchstart', (e) => {
      const link = e.target.closest('aside nav a.sidebar-link');
      if (link) handlePointerDown();
    }, { passive: true });
  }

  function handlePointerDown() {
    const asideEl = document.querySelector('aside.sidebar-collapsed');
    if (asideEl) asideEl.classList.add('no-collapse');
  }

  function handleLinkClick(e, link) {
    const href = link.getAttribute('href');
    
    if (!href || href.startsWith('#')) return;
    
    // Normalização de caminho para funcionar local e no GitHub Pages
    const currentPath = location.pathname.replace(/\/$/, '/index.html'); // Trata raiz como index.html
    const targetPath = href;
    
    // Verifica se já está na página (ignora query params por enquanto)
    if (currentPath.endsWith(targetPath)) return;
    
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
