/**
 * Auth Guard
 * Protege rotas e adapta a UI com base nas permissões
 * Deve ser incluído em TODAS as páginas protegidas (exceto login/signup)
 */
(function() {
    'use strict';

    // Aguarda carregamento do AuthService
    function checkAuth() {
        if (!window.AuthService) {
            // Se carregou antes do AuthService, espera um pouco
            setTimeout(checkAuth, 10);
            return;
        }

        const user = AuthService.getCurrentUser();
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';

        // 1. Redirecionar se não logado
        if (!user && !currentPage.includes('login') && !currentPage.includes('signup')) {
            window.location.href = 'login.html';
            return;
        }

        // 2. Bloquear acesso direto a páginas restritas (URL Manipulation)
        if (!AuthService.canAccessPage(currentPage)) {
            alert('Acesso negado: Você não tem permissão para acessar esta página.');
            window.location.href = 'index.html';
            return;
        }

        // 3. Adaptar UI
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => applyUIProtections(user));
        } else {
            applyUIProtections(user);
        }
    }

    function applyUIProtections(user) {
        if (!user) return;

        // A. Remover link "Configurações" do menu
        if (user.role !== 'developer') {
            const configLinks = document.querySelectorAll('a[href*="configuracoes"]');
            configLinks.forEach(el => {
                // Remove o elemento pai (li ou div) para limpar o menu
                const parent = el.closest('li') || el.closest('.sidebar-link'); 
                if (parent) parent.remove();
                else el.remove();
            });
        }

        // B. Role "Visualizador" - Remover botões de ação
        if (user.role === 'visualizador') {
            const elementsToHide = [
                '#btn-importar-vendas', // Receitas
                'a[href="despesas.html"]', // Dashboard shortcut
                'a[href="receitas.html"]', // Dashboard shortcut
                '#btn-novo-investimento', // Investimento
                '#btn-toggle-form', // Investimento e Despesas
                '.btn-add-despesa', // Despesas (genérico)
                'button[onclick*="adicionar"]', // Genérico
                'form button[type="submit"]', // Forms de edição
                '#form-nova-despesa', // Form container
                '.action-buttons' // Coluna de ações em tabelas
            ];

            // CSS Injection para garantir que esconda
            const style = document.createElement('style');
            style.innerHTML = `
                .role-visualizador-hide, 
                #btn-importar-vendas,
                #btn-toggle-import,
                #btn-novo-lancamento,
                #btn-save,
                #btn-toggle-form,
                .btn-edit,
                .btn-delete,
                #adicionarCategoria,
                button[type="submit"] { display: none !important; }
            `;
            document.head.appendChild(style);

            // Esconder elementos específicos por ID se existirem
            // Receitas
            const btnImport = document.getElementById('btn-toggle-import');
            if (btnImport) btnImport.remove();

            // Despesas e Investimentos (mesmo ID)
            const btnToggleForm = document.getElementById('btn-toggle-form'); 
            if (btnToggleForm) btnToggleForm.remove();
            
            // Formulários em geral (Desabilitar inputs)
            const inputs = document.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                // Não desabilitar busca e filtros
                if (!input.classList.contains('search-input') && 
                    !input.id.startsWith('filtro') && 
                    !input.id.startsWith('busca') &&
                    !input.id.startsWith('select-anos') &&
                    !input.id.startsWith('anoSelect') &&
                    !input.id.startsWith('mes') // Pagination buttons etc
                   ) { 
                    input.disabled = true;
                }
            });
        }
        
        // C. Exibir Perfil no Menu (Opcional)
        const profileContainer = document.querySelector('.sidebar-footer');
        if (profileContainer) {
            const userInfo = document.createElement('div');
            userInfo.className = 'px-4 py-2 mb-2 text-sm border-t border-gray-700/10 dark:border-gray-100/10';
            userInfo.innerHTML = `
                <p class="font-bold text-gray-700 dark:text-gray-200 truncate">${user.name}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 capitalize">${user.role}</p>
                <button onclick="AuthService.logout()" class="text-xs text-red-500 hover:text-red-600 mt-1 flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                    Sair
                </button>
            `;
            // Inserir antes do botão de tema
            profileContainer.insertBefore(userInfo, profileContainer.firstChild);
        }
    }

    checkAuth();

})();
