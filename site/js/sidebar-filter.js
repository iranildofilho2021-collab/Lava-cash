/**
 * Sidebar Filter - Aplica permissões aos links do menu lateral
 */

(function() {
  'use strict';

  function filtrarSidebarPorPermissoes() {
    if (!window.UserSystem || typeof window.UserSystem.aplicarPermissoesSidebar !== 'function') {
      return;
    }

    window.UserSystem.aplicarPermissoesSidebar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', filtrarSidebarPorPermissoes);
  } else {
    filtrarSidebarPorPermissoes();
  }

  window.filtrarSidebarPorPermissoes = filtrarSidebarPorPermissoes;
})();
