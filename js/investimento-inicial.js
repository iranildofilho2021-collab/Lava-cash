// Script para página de Investimento Inicial
(function() {
  const STORAGE_KEY = 'investimentos_iniciais';
  
  let investimentos = [];

  const numBR = (typeof SharedUtils !== 'undefined') ? SharedUtils.numBR : (n => Number(n||0).toLocaleString('pt-BR', {minimumFractionDigits:2}));
  const fmtBR = (typeof SharedUtils !== 'undefined') ? SharedUtils.fmtBR : (n => 'R$ ' + numBR(n));
  const genId = (typeof SharedUtils !== 'undefined') ? SharedUtils.genId : (() => Date.now().toString(36) + Math.random().toString(36).substr(2));

  // Carregar investimentos do storage (Firebase > IndexedDB > localStorage)
  async function carregarInvestimentosAsync() {
    try {
      // Prioridade 1: Firebase
      if (typeof FirebaseStore !== 'undefined' && FirebaseStore.isAvailable) {
        try {
          const isAvailable = await FirebaseStore.isAvailable();
          if (isAvailable) {
            const dados = await FirebaseStore.getItem(STORAGE_KEY, []);
            if (dados && Array.isArray(dados) && dados.length > 0) {
              investimentos = dados;
              // Sincroniza com localStorage/IndexedDB
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
              } catch(e) {}
              if (typeof IndexedDBStore !== 'undefined' && IndexedDBStore.setItem) {
                try {
                  await IndexedDBStore.setItem(STORAGE_KEY, dados);
                } catch(e) {}
              }
              return investimentos;
            }
          }
        } catch(e) {
          console.warn('Erro ao carregar investimentos do Firebase:', e);
        }
      }
      
      // Prioridade 2: IndexedDB
      if (typeof IndexedDBStore !== 'undefined' && IndexedDBStore.getItem) {
        const dados = await IndexedDBStore.getItem(STORAGE_KEY);
        if (dados && Array.isArray(dados)) {
          investimentos = dados;
          return investimentos;
        }
      }
      
      // Prioridade 3: Fallback localStorage
      const dados = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      investimentos = Array.isArray(dados) ? dados : [];
      return investimentos;
    } catch(e) {
      console.warn('Erro ao carregar investimentos:', e);
      investimentos = [];
      return investimentos;
    }
  }

  function carregarInvestimentos() {
    try {
      const dados = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      investimentos = Array.isArray(dados) ? dados : [];
      return investimentos;
    } catch(e) {
      console.warn('Erro ao carregar investimentos:', e);
      investimentos = [];
      return investimentos;
    }
  }

  // Salvar investimentos no storage (Firebase > IndexedDB > localStorage)
  async function salvarInvestimentosAsync() {
    try {
      // Prioridade 1: Firebase
      if (typeof FirebaseStore !== 'undefined' && FirebaseStore.isAvailable) {
        try {
          const isAvailable = await FirebaseStore.isAvailable();
          if (isAvailable) {
            await FirebaseStore.setItem(STORAGE_KEY, investimentos);
            console.log('[Investimentos] Investimentos salvos no Firebase');
          }
        } catch(e) {
          console.warn('Erro ao salvar investimentos no Firebase:', e);
        }
      }
      
      // Prioridade 2: localStorage (backup local)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(investimentos));
      
      // Prioridade 3: IndexedDB (backup local)
      if (typeof IndexedDBStore !== 'undefined' && IndexedDBStore.setItem) {
        await IndexedDBStore.setItem(STORAGE_KEY, investimentos);
      }
    } catch(e) {
      console.error('Erro ao salvar investimentos:', e);
    }
  }

  async function salvarInvestimentos() {
    try {
      // Prioridade 1: Firebase
      if (typeof FirebaseStore !== 'undefined' && FirebaseStore.isAvailable) {
        try {
          const isAvailable = await FirebaseStore.isAvailable();
          if (isAvailable) {
            await FirebaseStore.setItem(STORAGE_KEY, investimentos);
            console.log('[Investimentos] Investimentos salvos no Firebase');
          }
        } catch(e) {
          console.warn('Erro ao salvar investimentos no Firebase:', e);
        }
      }
      
      // Prioridade 2: localStorage (backup local)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(investimentos));
      
      // Prioridade 3: Também salva no IndexedDB de forma assíncrona (backup local)
      if (typeof IndexedDBStore !== 'undefined' && IndexedDBStore.setItem) {
        IndexedDBStore.setItem(STORAGE_KEY, investimentos).catch(e => console.warn('Erro ao salvar no IndexedDB:', e));
      }
    } catch(e) {
      console.error('Erro ao salvar investimentos:', e);
    }
  }

  // Toggle do formulário
  const btnToggleForm = document.getElementById('btn-toggle-form');
  const formInvestimento = document.getElementById('form-investimento');
  const btnCancelarForm = document.getElementById('btn-cancelar-form');

  function abrirFormulario() {
    if (!formInvestimento) return;
    formInvestimento.classList.remove('max-h-0', 'opacity-0', '-translate-y-2');
    formInvestimento.classList.add('max-h-[1000px]', 'opacity-100', 'translate-y-0');
    formInvestimento.setAttribute('aria-hidden', 'false');
    if (btnToggleForm) {
      btnToggleForm.setAttribute('aria-expanded', 'true');
    }
    // Focar no primeiro campo
    const primeiroCampo = formInvestimento.querySelector('input, select, textarea');
    if (primeiroCampo) primeiroCampo.focus();
  }

  function fecharFormulario() {
    if (!formInvestimento) return;
    formInvestimento.classList.remove('max-h-[1000px]', 'opacity-100', 'translate-y-0');
    formInvestimento.classList.add('max-h-0', 'opacity-0', '-translate-y-2');
    formInvestimento.setAttribute('aria-hidden', 'true');
    if (btnToggleForm) {
      btnToggleForm.setAttribute('aria-expanded', 'false');
    }
    formInvestimento.reset();
    // Limpar erros de validação
    if (window.ValidationUtils) {
      window.ValidationUtils.clearFormErrors(formInvestimento);
    }
  }

  if (btnToggleForm) {
    btnToggleForm.addEventListener('click', abrirFormulario);
  }

  if (btnCancelarForm) {
    btnCancelarForm.addEventListener('click', fecharFormulario);
  }

  // Renderizar tabela
  function renderizarTabela() {
    const tbody = document.getElementById('tabelaInvestimentosBody');
    if (!tbody) return;

    if (investimentos.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="border border-gray-300 px-4 py-8 text-center text-gray-500">
            Nenhum investimento cadastrado ainda.
          </td>
        </tr>
      `;
      return;
    }

    // Ordenar por data (mais recente primeiro)
    const ordenados = [...investimentos].sort((a, b) => {
      const dataA = new Date(a.data || 0);
      const dataB = new Date(b.data || 0);
      return dataB - dataA;
    });

    tbody.innerHTML = ordenados.map(inv => {
      const dataFormatada = inv.data ? new Date(inv.data).toLocaleDateString('pt-BR') : '-';
      const statusClass = inv.status === 'Pago' ? 'bg-green-100 text-green-800' : 
                         inv.status === 'Parcelado' ? 'bg-yellow-100 text-yellow-800' : 
                         'bg-gray-100 text-gray-800';
      
      return `
        <tr class="hover:bg-gray-50">
          <td class="border border-gray-300 px-4 py-3">${inv.categoria || '-'}</td>
          <td class="border border-gray-300 px-4 py-3">${inv.descricao || '-'}</td>
          <td class="border border-gray-300 px-4 py-3 text-right font-mono">${fmtBR(inv.valor || 0)}</td>
          <td class="border border-gray-300 px-4 py-3 text-center">${dataFormatada}</td>
          <td class="border border-gray-300 px-4 py-3 text-center">${inv.formaPagamento || '-'}</td>
          <td class="border border-gray-300 px-4 py-3 text-center">
            <span class="px-2 py-1 rounded text-xs font-semibold ${statusClass}">
              ${inv.status || 'Em aberto'}
            </span>
          </td>
          <td class="border border-gray-300 px-4 py-3 text-center">
            <button 
              onclick="editarInvestimento('${inv.id}')" 
              class="text-sky-600 hover:text-sky-800 mr-2"
              title="Editar"
            >
              ✏️
            </button>
            <button 
              onclick="excluirInvestimento('${inv.id}')" 
              class="text-red-600 hover:text-red-800"
              title="Excluir"
            >
              🗑️
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Funções globais para editar e excluir
  window.editarInvestimento = function(id) {
    const inv = investimentos.find(i => i.id === id);
    if (!inv) return;

    // Preencher formulário
    document.getElementById('categoria-investimento').value = inv.categoria || '';
    document.getElementById('data-investimento').value = inv.data || '';
    document.getElementById('descricao-investimento').value = inv.descricao || '';
    document.getElementById('valor-investimento').value = inv.valor || '';
    document.getElementById('forma-pagamento').value = inv.formaPagamento || '';
    document.getElementById('justificativa-investimento').value = inv.justificativa || '';

    // Remover do array (será readicionado ao salvar)
    investimentos = investimentos.filter(i => i.id !== id);
    salvarInvestimentos();

    // Abrir formulário
    abrirFormulario();
  };

  window.excluirInvestimento = function(id) {
    if (!confirm('Tem certeza que deseja excluir este investimento?')) return;

    investimentos = investimentos.filter(i => i.id !== id);
    salvarInvestimentos();
    renderizarTabela();
  };

  // Handler do formulário
  if (formInvestimento) {
    formInvestimento.addEventListener('submit', function(e) {
      e.preventDefault();

      // Limpar erros anteriores
      if (window.ValidationUtils) {
        window.ValidationUtils.clearFormErrors(this);
      }

      // Obter valores
      const categoria = document.getElementById('categoria-investimento').value.trim();
      const data = document.getElementById('data-investimento').value;
      const descricao = document.getElementById('descricao-investimento').value.trim();
      const valor = parseFloat(document.getElementById('valor-investimento').value.replace(',', '.'));
      const formaPagamento = document.getElementById('forma-pagamento').value;
      const justificativa = document.getElementById('justificativa-investimento').value.trim();

      // Validações
      let isValid = true;
      const ValidationUtils = window.ValidationUtils;

      if (ValidationUtils) {
        if (!ValidationUtils.validateRequired(document.getElementById('categoria-investimento'), 'Categoria')) {
          isValid = false;
        }
        if (!ValidationUtils.validateRequired(document.getElementById('data-investimento'), 'Data')) {
          isValid = false;
        }
        if (!ValidationUtils.validateRequired(document.getElementById('descricao-investimento'), 'Descrição')) {
          isValid = false;
        }
        if (!ValidationUtils.validatePositiveNumber(document.getElementById('valor-investimento'), 'Valor', 0.01)) {
          isValid = false;
        }
        if (!ValidationUtils.validateRequired(document.getElementById('forma-pagamento'), 'Forma de Pagamento')) {
          isValid = false;
        }
      } else {
        // Fallback básico
        if (!categoria || !data || !descricao || !valor || valor <= 0 || !formaPagamento) {
          alert('Preencha todos os campos obrigatórios!');
          return;
        }
      }

      if (!isValid) return;

      // Determinar status baseado na forma de pagamento
      let status = 'Em aberto';
      if (formaPagamento === 'À vista') {
        status = 'Pago';
      } else if (formaPagamento === 'Parcelado' || formaPagamento === 'Financiado' || formaPagamento === 'Leasing') {
        status = 'Parcelado';
      }

      // Criar objeto de investimento
      const investimento = {
        id: genId(),
        categoria,
        data,
        descricao,
        valor,
        formaPagamento,
        justificativa,
        status,
        dataCadastro: new Date().toISOString()
      };

      // Adicionar ao array
      investimentos.push(investimento);
      salvarInvestimentos();

      // Limpar formulário e fechar
      formInvestimento.reset();
      fecharFormulario();

      // Atualizar tabela
      renderizarTabela();

      // Mensagem de sucesso
      if (window.LoadingUtils) {
        // Usar loading utils se disponível para feedback visual
      }
      console.log('Investimento cadastrado com sucesso!');
    });
  }

  // Inicializar
  carregarInvestimentos();
  renderizarTabela();

  // Atualizar quando dados mudarem (storage event de outras abas)
  window.addEventListener('storage', function(e) {
    if (e.key === STORAGE_KEY) {
      carregarInvestimentos();
      renderizarTabela();
    }
  });
})();

