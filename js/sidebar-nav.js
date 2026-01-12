/**
 * Navegação da Sidebar com transições suaves
 * @module SidebarNav
 */
(function(){
  'use strict';

  function initSidebarNav() {
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const body = document.body;
    
    // Recupera estado salvo
    const savedState = localStorage.getItem('sidebarOpen');
    const isDesktop = window.innerWidth > 1024;
    
    // Aplica estado inicial
    if (savedState === 'true' && sidebar) {
        openMenu(false); // false = sem animação inicial se possível, mas aqui usamos classe
    } else if (savedState === 'false' && sidebar) {
        closeMenu(false);
    }
    
    // Event Listeners
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu();
        });
    }
    
    if (overlay) {
        overlay.addEventListener('click', () => closeMenu());
    }
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
    });

    // Link Click Delegation
    document.body.addEventListener('click', (e) => {
      const link = e.target.closest('.sidebar-link');
      if (link) {
          handleLinkClick(e, link);
          // Fecha menu em mobile/tablet ao navegar
          if (window.innerWidth <= 1024) {
              closeMenu();
          }
      }
    });

    function toggleMenu() {
        const isOpen = sidebar.classList.contains('is-open');
        if (isOpen) closeMenu();
        else openMenu();
    }

    function openMenu(animate = true) {
        if (!sidebar) return;
        sidebar.classList.add('is-open');
        if (overlay) overlay.classList.add('is-visible');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
        
        // Push effect on desktop only
        if (window.innerWidth > 1024) {
            body.classList.add('sidebar-open');
        }
        
        localStorage.setItem('sidebarOpen', 'true');
    }

    function closeMenu(animate = true) {
        if (!sidebar) return;
        sidebar.classList.remove('is-open');
        if (overlay) overlay.classList.remove('is-visible');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
        
        if (window.innerWidth > 1024) {
            body.classList.remove('sidebar-open');
        }
        
        localStorage.setItem('sidebarOpen', 'false');
    }
  }

  function handleLinkClick(e, link) {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    
    const currentPath = location.pathname.replace(/\/$/, '/dashboard.html');
    const targetPath = href;
    
    if (currentPath.endsWith(targetPath)) {
        e.preventDefault();
        return;
    }
    
    // Navegação simples sem animações complexas de saída para garantir rapidez
    // O navegador lidará com a carga da nova página
  }

  // Inicializa quando o DOM estiver pronto ou quando o evento customizado disparar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Aguarda um pouco para garantir que o layout.js tenha rodado
        setTimeout(initSidebarNav, 50); 
    });
  } else {
    // Tenta inicializar imediatamente
    initSidebarNav();
  }
  
  // Escuta evento de montagem do layout para reinicializar listeners se necessário
  document.addEventListener('sidebar:mounted', initSidebarNav);
})();
