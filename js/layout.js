(function(){
  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: 'assets/dashboard-symbol.png', alt: 'Dashboard' },
    { id: 'receitas', label: 'Receitas', href: 'receitas.html', icon: 'assets/receitas-symbol.png', alt: 'Receitas' },
    { id: 'despesas', label: 'Despesas', href: 'despesas.html', icon: 'assets/despesas-symbol.png', alt: 'Despesas' },
    { id: 'analise-financeira', label: 'Análise Financeira', href: 'analise-financeira.html', icon: 'assets/analise-financeira-symbol.png', alt: 'Análise Financeira' },
    { id: 'investimento-inicial', label: 'Investimento Inicial', href: 'investimento-inicial.html', icon: 'assets/investimento-inicial-symbol.png', alt: 'Investimento Inicial' },
    { id: 'ajuda', label: 'Ajuda', href: 'ajuda.html', icon: 'assets/ajuda-icone.png', alt: 'Ajuda' },
    { id: 'configuracoes', label: 'Configurações', href: 'configuracoes.html', icon: 'assets/configuracao-symbol.png', alt: 'Configurações' }
  ];

  function renderSidebar(activePage) {
    const links = NAV_ITEMS.map(item => {
      // Correção de caminho para GitHub Pages ou subdiretórios
      // Compara apenas o nome do arquivo final
      const isActive = activePage === item.id;
      return `
      <a href="${item.href}" class="sidebar-link${isActive ? ' active' : ''}"${isActive ? ' aria-current="page"' : ''}>
        <img class="sidebar-icon-img" src="${item.icon}" alt="${item.alt}" loading="lazy" decoding="async" />
        <span>${item.label}</span>
      </a>`;
    }).join('');

    return `
    <!-- Overlay -->
    <div id="sidebar-overlay" class="sidebar-overlay" aria-hidden="true"></div>
    
    <!-- Hamburger Button -->
    <button id="sidebar-toggle" aria-label="Abrir menu" aria-expanded="false" aria-controls="app-sidebar">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
      </svg>
    </button>

    <!-- Sidebar Drawer -->
    <aside id="app-sidebar" class="sidebar-drawer" role="complementary" aria-label="Menu lateral">
      <div class="sidebar-header">
        <div class="flex items-center gap-2">
            <img class="sidebar-logo" style="width: 32px; height: 32px;" src="assets/irancash-logo.png" alt="IRANCASH logo" loading="lazy" decoding="async" />
            <span class="logo-text text-lg font-bold text-sky-600">IRANCASH</span>
        </div>
      </div>
      
      <nav role="navigation" aria-label="Navegação principal">
        ${links}
      </nav>
      
      <div class="sidebar-footer">
        <button class="theme-toggle-btn w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors" type="button" data-theme-toggle aria-pressed="false" aria-label="Alternar tema escuro">
          <span data-theme-toggle-icon aria-hidden="true">🌙</span>
          <span data-theme-toggle-label>Modo escuro</span>
        </button>
        <!-- Armazenamento removido conforme solicitado -->
        <div class="text-xs text-gray-400 mt-4 text-center">&copy; 2026 IRANCASH</div>
      </div>
    </aside>`;
  }

  function mountSidebar() {
    // Procura por elemento data-sidebar ou cria
    let mountPoint = document.querySelector('[data-sidebar]');
    
    // Se não existir, criamos um container DIV para injetar o menu completo
    if (!mountPoint) {
      console.warn('[Layout] Elemento [data-sidebar] não encontrado. Injetando container...');
      const container = document.createElement('div');
      container.setAttribute('data-sidebar-container', '');
      document.body.insertBefore(container, document.body.firstChild);
      mountPoint = container;
    } else {
        // Se existir (é um <aside>), transformamos em div para conter o html completo (overlay + button + aside)
        // Ou simplesmente substituímos o outerHTML dele pelo novo HTML
        const container = document.createElement('div');
        container.setAttribute('data-sidebar-container', '');
        mountPoint.replaceWith(container);
        mountPoint = container;
    }
    
    // Remove classe antiga se existir
    document.body.classList.remove('with-fixed-sidebar');
    
    const activePage = document.body.dataset.page || 'dashboard';
    mountPoint.innerHTML = renderSidebar(activePage);
    
    // Dispara evento customizado avisando que o menu foi montado
    document.dispatchEvent(new CustomEvent('sidebar:mounted'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountSidebar);
  } else {
    mountSidebar();
  }
})();
