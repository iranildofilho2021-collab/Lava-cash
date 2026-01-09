(function(){
  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', href: 'index.html', icon: 'assets/dashboard-symbol.png', alt: 'Dashboard' },
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
<aside class="sidebar-collapsed bg-white shadow-lg flex flex-col lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:z-10" role="complementary" aria-label="Menu lateral">
  <div class="flex items-center gap-2 px-6 py-6 border-b">
    <img class="sidebar-logo" src="assets/irancash-logo.png" alt="IRANCASH logo" loading="lazy" decoding="async" />
    <span class="logo-text text-xl font-bold text-sky-600" aria-hidden="true">IRANCASH</span>
  </div>
  <nav class="flex-1 px-4 py-6 space-y-2" role="navigation" aria-label="Navegação principal">
    ${links}
  </nav>
  <div class="px-6 py-4 border-t space-y-3">
    <button class="theme-toggle-btn" type="button" data-theme-toggle aria-pressed="false" aria-label="Alternar tema escuro">
      <span data-theme-toggle-icon aria-hidden="true">🌙</span>
      <span data-theme-toggle-label>Modo escuro</span>
    </button>
    <div id="storageUsage" class="storage-indicator hidden" role="status" aria-live="polite">
      <span class="text-xs">Armazenamento:</span>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div class="bar-fill" style="width: 0%"></div></div>
      <span class="text-xs" data-storage-percent>0%</span>
    </div>
    <div class="text-xs text-gray-400">&copy; 2026 IRANCASH</div>
  </div>
</aside>`;
  }

  function mountSidebar() {
    let mountPoint = document.querySelector('[data-sidebar]');
    if (!mountPoint) {
      console.warn('[Layout] Elemento [data-sidebar] não encontrado. Tentando injetar automaticamente...');
      // Se não houver ponto de montagem, tenta criar um no início do body
      const aside = document.createElement('aside');
      aside.setAttribute('data-sidebar', '');
      document.body.insertBefore(aside, document.body.firstChild);
      mountPoint = aside; // Atualiza a referência
    }
    
    // Adiciona classe ao body para ajuste de layout
    document.body.classList.add('with-fixed-sidebar');
    
    const activePage = document.body.dataset.page || 'dashboard';
    mountPoint.outerHTML = renderSidebar(activePage);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountSidebar);
  } else {
    mountSidebar();
  }
})();
