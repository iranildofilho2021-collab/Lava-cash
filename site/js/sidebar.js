/**
 * sidebar.js - Inicialização do menu lateral (toggle + overlay)
 */
(function() {
  'use strict';

  function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    if (!sidebar) return;

    function openSidebar() {
      sidebar.classList.add('open');
      sidebarOverlay?.classList.add('active');
    }

    function closeSidebar() {
      sidebar.classList.remove('open');
      sidebarOverlay?.classList.remove('active');
    }

    function toggleSidebar() {
      sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    }

    sidebarToggle?.addEventListener('click', toggleSidebar);
    sidebarOverlay?.addEventListener('click', closeSidebar);

    // Close on nav link click (mobile)
    sidebar.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth < 768) closeSidebar();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebar);
  } else {
    initSidebar();
  }
})();
