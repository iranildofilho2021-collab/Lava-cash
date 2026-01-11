// Script para página de Investimento Inicial (Modernizado)
(function() {
  const STORAGE_KEY = 'investimentos_iniciais';
  let investimentos = [];
  const DEFAULT_PARTNERS = [
    { name: 'Iranildo Filho', share: 34, investment: 14 },
    { name: 'Elder de Medeiros', share: 33, investment: 43 },
    { name: 'Leonardo Hermes', share: 33, investment: 43 }
  ];
  let partnersCache = null;
  
  // Dependências
  const numBR = (typeof SharedUtils !== 'undefined') ? SharedUtils.numBR : (n => Number(n||0).toLocaleString('pt-BR', {minimumFractionDigits:2}));
  const fmtBR = (typeof SharedUtils !== 'undefined') ? SharedUtils.fmtBR : (n => 'R$ ' + numBR(n));
  const genId = (typeof SharedUtils !== 'undefined') ? SharedUtils.genId : (() => Date.now().toString(36) + Math.random().toString(36).substr(2));

  // Gráficos (Chart.js)
  let chartDistribuicao = null;
  let chartCronograma = null;

  // Init
  (async function init() {
    await carregarInvestimentosAsync();
    await ensurePartnersConfig();
    setupUI();
    renderAll();
  })();

  // --- Data Layer ---
  async function carregarInvestimentosAsync() {
    try {
      let dados = [];
      if (typeof FirebaseStore !== 'undefined' && await FirebaseStore.isAvailable()) {
        dados = await FirebaseStore.getItem(STORAGE_KEY, []);
      } else {
        const local = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        dados = Array.isArray(local) ? local : [];
      }

      // DATA CLEANUP / MIGRATION (Relaxed)
      const antes = dados.length;
      dados = dados.filter(i => {
         // Filtra registros que são claramente lixo (descrição como porcentagem isolada)
         if (!i.id) return false;
         // Remove apenas o lixo específico relatado, sem validar data estritamente para evitar perdas
         if (String(i.descricao).trim() === '34%' || String(i.categoria).trim() === '14%') return false;
         return true;
      });
      
      if (dados.length !== antes) {
         console.log(`[Investimento] Removidos ${antes - dados.length} registros inválidos.`);
         if (typeof FirebaseStore !== 'undefined' && await FirebaseStore.isAvailable()) {
            await FirebaseStore.setItem(STORAGE_KEY, dados);
         }
         localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
      }

      investimentos = dados;
      
    } catch(e) {
      console.warn('Erro load investimentos', e);
      investimentos = [];
    }
  }

  async function salvarInvestimentosAsync() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(investimentos));
      if (typeof FirebaseStore !== 'undefined' && await FirebaseStore.isAvailable()) {
        await FirebaseStore.setItem(STORAGE_KEY, investimentos);
      }
    } catch(e) {
      console.error('Erro save investimentos', e);
    }
  }

  async function ensurePartnersConfig() {
    if (partnersCache && partnersCache.length) return partnersCache;

    if (window.SettingsService && typeof window.SettingsService.getSettings === 'function') {
      try {
        const settings = await window.SettingsService.getSettings();
        if (settings && Array.isArray(settings.partners) && settings.partners.length) {
          partnersCache = settings.partners;
          return partnersCache;
        }
      } catch (err) {
        console.warn('[Investimento] Falha ao carregar configuracoes de socios', err);
      }
    }

    try {
      const raw = localStorage.getItem('global_settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.partners) && parsed.partners.length) {
          partnersCache = parsed.partners;
          return partnersCache;
        }
      }
    } catch (err) {
      console.warn('[Investimento] Falha ao ler socios em cache local', err);
    }

    partnersCache = DEFAULT_PARTNERS;
    return partnersCache;
  }

  // --- UI Setup ---
  function setupUI() {
    // Toggle Form
    const btnToggle = document.getElementById('btn-toggle-form');
    const btnClose = document.getElementById('btn-close-form');
    const btnCancel = document.getElementById('btn-cancelar-form');
    const form = document.getElementById('form-investimento');
    
    const toggleForm = (show) => {
      if(show) {
        form.classList.remove('max-h-0', 'opacity-0');
        form.classList.add('max-h-[1000px]', 'opacity-100');
        // Scroll to form
        setTimeout(() => form.scrollIntoView({behavior:'smooth', block:'center'}), 100);
      } else {
        form.classList.remove('max-h-[1000px]', 'opacity-100');
        form.classList.add('max-h-0', 'opacity-0');
        form.reset();
        delete form.dataset.editingId;
        document.getElementById('status-investimento').value = 'Realizado'; // default
        const cp = document.getElementById('container-parcelas');
        if(cp) cp.classList.add('hidden');
      }
    };

    if(btnToggle) btnToggle.addEventListener('click', () => toggleForm(true));
    if(btnClose) btnClose.addEventListener('click', () => toggleForm(false));
    if(btnCancel) btnCancel.addEventListener('click', () => toggleForm(false));

    // Status Change - Parcelado
    const statusSelect = document.getElementById('status-investimento');
    const containerParcelas = document.getElementById('container-parcelas');
    
    if(statusSelect && containerParcelas) {
      statusSelect.addEventListener('change', () => {
        if(statusSelect.value === 'Parcelado') {
          containerParcelas.classList.remove('hidden');
        } else {
          containerParcelas.classList.add('hidden');
        }
      });
    }

    // Live Calculations (Prestação e Rateio)
    const inputValor = document.getElementById('valor-investimento');
    const inputParcelas = document.getElementById('qtd-parcelas');
    const infoPrestacao = document.getElementById('info-prestacao');
    
    // Células da Tabela de Rateio
    const cellIranildo = document.getElementById('rateio-iranildo');
    const cellElder = document.getElementById('rateio-elder');
    const cellLeonardo = document.getElementById('rateio-leonardo');
    const cellTotalRateio = document.getElementById('rateio-total');

    function updateCalculations() {
        const valTotal = parseFloat(inputValor.value) || 0;
        const isParcelado = statusSelect.value === 'Parcelado';
        const numParcelas = parseInt(inputParcelas.value) || 1;
        
        let valBaseCalc = valTotal; // Para à vista, usa o total
        
        if (isParcelado && numParcelas > 0) {
            const valPrestacao = valTotal / numParcelas;
            valBaseCalc = valPrestacao; // Para parcelado, usa a prestação
            
            if (infoPrestacao) {
                infoPrestacao.textContent = `${numParcelas}x de ${fmtBR(valPrestacao)}`;
            }
        } else {
            if (infoPrestacao) infoPrestacao.textContent = '';
        }

        // Rateio Sócios (Investimento %)
        // Iranildo: 14%, Elder: 43%, Leonardo: 43%
        const partIranildo = valBaseCalc * 0.14;
        const partElder = valBaseCalc * 0.43;
        const partLeonardo = valBaseCalc * 0.43;
        const totalCalc = partIranildo + partElder + partLeonardo; // Deve bater com valBaseCalc (aprox)

        if(cellIranildo) cellIranildo.textContent = fmtBR(partIranildo);
        if(cellElder) cellElder.textContent = fmtBR(partElder);
        if(cellLeonardo) cellLeonardo.textContent = fmtBR(partLeonardo);
        if(cellTotalRateio) cellTotalRateio.textContent = fmtBR(totalCalc);
    }

    if (inputValor) inputValor.addEventListener('input', updateCalculations);
    if (inputParcelas) inputParcelas.addEventListener('input', updateCalculations);
    if (statusSelect) statusSelect.addEventListener('change', updateCalculations);

    // Form Submit
    if(form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const statusVal = document.getElementById('status-investimento').value;
        const parcelas = (statusVal === 'Parcelado') ? parseInt(document.getElementById('qtd-parcelas').value) : 1;
        const valorTotal = parseFloat(document.getElementById('valor-investimento').value);
        
        // Se for parcelado, divide o valor (ou mantém total e cria registros? Vamos criar registros individuais futuros)
        // Lógica simplificada: Cria 1 registro com status "Parcelado" e metadata, OU N registros.
        // Vamos manter simples: 1 registro com status "Parcelado" e campo "parcelas"
        
        const data = {
          id: form.dataset.editingId || genId(),
          categoria: document.getElementById('categoria-investimento').value,
          data: document.getElementById('data-investimento').value,
          valor: valorTotal,
          descricao: document.getElementById('descricao-investimento').value,
          status: statusVal,
          parcelas: parcelas,
          updatedAt: new Date().toISOString()
        };

        if(form.dataset.editingId) {
          const idx = investimentos.findIndex(i => i.id === form.dataset.editingId);
          if(idx >= 0) investimentos[idx] = { ...investimentos[idx], ...data };
          delete form.dataset.editingId;
        } else {
          investimentos.push(data);
        }

        await salvarInvestimentosAsync();
        toggleForm(false);
        renderAll();
        // Feedback visual simples
        const btn = document.getElementById('btn-toggle-form');
        if (btn) {
          const originalText = btn.innerHTML;
          btn.innerHTML = `<span class="text-green-200">Salvo!</span>`;
          setTimeout(() => btn.innerHTML = originalText, 2000);
        }
      });
    }

    // Filters
    const fCat = document.getElementById('filtro-categoria');
    const fStatus = document.getElementById('filtro-status');
    const fBusca = document.getElementById('busca-investimento');
    
    [fCat, fStatus, fBusca].forEach(el => {
      if(el) el.addEventListener('change', renderAll);
      if(el && el.tagName === 'INPUT') el.addEventListener('input', renderAll);
    });
    
    // PDF Export
    const btnPdf = document.getElementById('btn-export-pdf');
    if(btnPdf) {
      btnPdf.addEventListener('click', () => {
        window.print();
      });
    }
  }

  // --- Rendering ---
  function renderAll() {
    renderKPIs();
    renderCharts();
    renderTable();
  }

  function getFilteredData() {
    const cat = document.getElementById('filtro-categoria')?.value || 'Todas';
    const st = document.getElementById('filtro-status')?.value || 'Todos';
    const term = (document.getElementById('busca-investimento')?.value || '').toLowerCase();

    return investimentos.filter(i => {
      const matchCat = cat === 'Todas' || i.categoria === cat;
      
      // Se filtro for "Planejado", mostra itens futuros
      // Se filtro for "Realizado", mostra itens passados/realizados
      // Se filtro for "Todos", deve mostrar apenas o que já aconteceu (padrão)? Ou tudo?
      // User disse: "quando filtrar por planeja ai sim aparecera os outros mesmes que ainda não chegaram"
      // Isso implica que "Todos" ou padrão deve esconder futuros.
      
      const matchSt = st === 'Todos' || 
                      (st === 'Realizado' ? (i.status === 'Realizado' || i.status === 'Pago') : 
                       st === 'Planejado' ? (i.status === 'Planejado' || i.status === 'Parcelado') : 
                       i.status === st);
      
      const matchTerm = !term || i.descricao.toLowerCase().includes(term) || i.categoria.toLowerCase().includes(term);
      return matchCat && matchSt && matchTerm;
    });
  }

  function renderKPIs() {
    const total = investimentos.reduce((acc, i) => acc + (Number(i.valor)||0), 0);
    const realizados = investimentos.filter(i => i.status === 'Realizado' || i.status === 'Pago');
    const totalRealizado = realizados.reduce((acc, i) => acc + (Number(i.valor)||0), 0);
    
    // Total Investido
    const elTotal = document.getElementById('card-total-investido');
    if(elTotal) elTotal.textContent = fmtBR(total);

    // Execução
    const elExec = document.getElementById('card-execucao');
    if(elExec) {
      const pct = total > 0 ? (totalRealizado / total * 100).toFixed(1) : 0;
      elExec.textContent = `${pct}%`;
    }

    // Maior Categoria
    const byCat = {};
    investimentos.forEach(i => {
      byCat[i.categoria] = (byCat[i.categoria] || 0) + (Number(i.valor)||0);
    });
    let maxCat = '--', maxVal = 0;
    Object.entries(byCat).forEach(([k, v]) => {
      if(v > maxVal) { maxVal = v; maxCat = k; }
    });
    
    const elMaxCat = document.getElementById('card-maior-categoria');
    const elMaxCatVal = document.getElementById('card-maior-categoria-valor');
    if(elMaxCat) elMaxCat.textContent = maxCat;
    if(elMaxCatVal) {
      const pctMax = total > 0 ? (maxVal / total * 100).toFixed(1) : 0;
      elMaxCatVal.textContent = `${fmtBR(maxVal)} (${pctMax}%)`;
    }

    // Payback (Simulado - idealmente viria do dashboard)
    const elPayback = document.getElementById('card-payback');
    if(elPayback) {
      // Mock: Receita média mensal ~15k (exemplo) -> Lucro ~8k
      // Isso deveria vir de uma store compartilhada de métricas
      const lucroMensalEstimado = 8000; 
      const meses = total > 0 ? (total / lucroMensalEstimado).toFixed(1) : 0;
      elPayback.textContent = `${meses} Meses`;
    }
  }

  function renderCharts() {
    if(typeof Chart === 'undefined') return;

    // 1. Distribuição (Pie)
    const byCat = {};
    investimentos.forEach(i => {
      byCat[i.categoria] = (byCat[i.categoria] || 0) + (Number(i.valor)||0);
    });
    const labels = Object.keys(byCat);
    const data = Object.values(byCat);
    
    const ctxDist = document.getElementById('chart-distribuicao')?.getContext('2d');
    if(ctxDist) {
      if(chartDistribuicao) chartDistribuicao.destroy();
      chartDistribuicao = new Chart(ctxDist, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: [
              '#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'
            ],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } }
          }
        }
      });
    }

    // 2. Cronograma (Bar) - Agrupado por Mês (Projetado)
    const byMonth = {};
    
    investimentos.forEach(i => {
      if(!i.data) return;
      const valTotal = Number(i.valor)||0;
      
      if (i.status === 'Parcelado' && i.parcelas > 1) {
          const valParcela = valTotal / i.parcelas;
          const dataInicial = new Date(i.data);
          
          // Projeta as N parcelas
          for(let p = 0; p < i.parcelas; p++) {
              const d = new Date(dataInicial);
              d.setMonth(d.getMonth() + p); // Adiciona p meses
              
              const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
              byMonth[k] = (byMonth[k] || 0) + valParcela;
          }
      } else {
          // À vista / Único
          const d = new Date(i.data);
          const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
          byMonth[k] = (byMonth[k] || 0) + valTotal;
      }
    });
    
    const sortedMonths = Object.keys(byMonth).sort();
    const dataCron = sortedMonths.map(m => byMonth[m]);
    const labelsCron = sortedMonths.map(m => {
      const [y, mo] = m.split('-');
      const nomeMes = (typeof SharedUtils !== 'undefined' && SharedUtils.PT_MESES) ? SharedUtils.PT_MESES[Number(mo)-1] : mo;
      return `${nomeMes.substr(0,3)}/${y.substr(2)}`;
    });

    const ctxCron = document.getElementById('chart-cronograma')?.getContext('2d');
    if(ctxCron) {
      if(chartCronograma) chartCronograma.destroy();
      chartCronograma = new Chart(ctxCron, {
        type: 'bar',
        data: {
          labels: labelsCron,
          datasets: [{
            label: 'Desembolso Mensal',
            data: dataCron,
            backgroundColor: '#0ea5e9',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, grid: { color: '#f3f4f6' } },
            x: { grid: { display: false } }
          },
          plugins: {
            legend: { display: false },
            tooltip: { 
              callbacks: { 
                label: (ctx) => fmtBR(ctx.raw) 
              } 
            }
          }
        }
      });
    }
  }

  function renderTable() {
    const tbody = document.getElementById('tabelaInvestimentosBody');
    const counter = document.getElementById('contador-registros');
    if (!tbody) return;

    const catSelect = document.getElementById('filtro-categoria');
    if (catSelect && catSelect.options.length <= 1) {
      const cats = [...new Set(investimentos.map(i => i.categoria).filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
      cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        catSelect.appendChild(opt);
      });
    }

    const selectedCat = document.getElementById('filtro-categoria')?.value || 'Todas';
    const statusFilter = document.getElementById('filtro-status')?.value || 'Todos';
    const term = (document.getElementById('busca-investimento')?.value || '').toLowerCase();
    const partners = (partnersCache && partnersCache.length) ? partnersCache : DEFAULT_PARTNERS;

    const today = new Date();
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let expandedView = [];

    investimentos.forEach(item => {
      const matchCat = selectedCat === 'Todas' || item.categoria === selectedCat;
      const matchTerm = !term || String(item.descricao || '').toLowerCase().includes(term) ||
                        String(item.categoria || '').toLowerCase().includes(term);
      if (!matchCat || !matchTerm) return;

      const totalValue = Number(item.valor) || 0;
      const parcelas = Number(item.parcelas) || 1;
      const baseDate = item.data ? new Date(item.data) : null;

      if (item.status === 'Parcelado' && parcelas > 1) {
        for (let p = 0; p < parcelas; p++) {
          const parcelaDate = baseDate ? new Date(baseDate) : new Date();
          parcelaDate.setMonth(parcelaDate.getMonth() + p);
          const parcelaDateOnly = new Date(parcelaDate.getFullYear(), parcelaDate.getMonth(), parcelaDate.getDate());
          const rowStatus = parcelaDateOnly <= todayDateOnly ? 'Realizado' : 'Planejado';

          expandedView.push({
            ...item,
            displayData: parcelaDate.toISOString(),
            displayValor: totalValue / parcelas,
            status: rowStatus,
            isParcela: true,
            parcelaIndex: p + 1,
            totalParcelas: parcelas
          });
        }
      } else {
        const refDate = baseDate || new Date();
        const refOnly = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
        let rowStatus = item.status || 'Planejado';
        if ((rowStatus === 'Planejado' || rowStatus === 'Parcelado') && refOnly <= todayDateOnly) {
          rowStatus = 'Realizado';
        }
        expandedView.push({
          ...item,
          displayData: item.data,
          displayValor: totalValue,
          isParcela: false,
          status: rowStatus
        });
      }
    });

    if (statusFilter === 'Planejado') {
      expandedView = expandedView.filter(row => row.status === 'Planejado');
    } else {
      expandedView = expandedView.filter(row => row.status === 'Realizado' || row.status === 'Pago');
    }

    tbody.innerHTML = '';
    if (counter) counter.textContent = `Mostrando ${expandedView.length} registro(s)`;

    if (expandedView.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500">Nenhum registro encontrado.</td></tr>`;
      renderTotalRateioTable();
      return;
    }

    expandedView.sort((a, b) => new Date(b.displayData) - new Date(a.displayData));

    expandedView.forEach(item => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-50 transition-colors group border-b';

      const statusColor = (item.status === 'Realizado' || item.status === 'Pago')
        ? 'bg-green-100 text-green-800'
        : item.status === 'Planejado'
          ? 'bg-blue-100 text-blue-800'
          : 'bg-amber-100 text-amber-800';

      const displayDate = item.displayData ? new Date(item.displayData) : null;
      const dateLabel = (displayDate && !isNaN(displayDate.getTime())) ? displayDate.toLocaleDateString('pt-BR') : '--';
      const descSuffix = item.isParcela ? ` (${item.parcelaIndex}/${item.totalParcelas})` : '';

      tr.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-gray-600">${dateLabel}</td>
        <td class="px-6 py-4 font-medium text-gray-900">
            ${item.descricao}
            <span class="text-xs text-gray-500">${descSuffix}</span>
            <button class="ml-2 text-sky-600 text-xs hover:underline focus:outline-none" onclick="toggleRateio('${item.id}-${item.parcelaIndex || 0}')">
                Ver Rateio
            </button>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
           <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
             ${item.categoria}
           </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
           <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}">
             ${item.status}
           </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-right font-mono font-medium text-gray-700">${fmtBR(item.displayValor)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-center">
           <div class="flex items-center justify-center gap-2">
             ${(!item.isParcela || item.parcelaIndex === 1) ? `
             <button class="text-gray-400 hover:text-sky-600 btn-edit" data-id="${item.id}" title="Editar">
               <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
             </button>
             <button class="text-gray-400 hover:text-red-600 btn-delete" data-id="${item.id}" title="Excluir">
               <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
             </button>
             ` : '<span class="text-xs text-gray-400">Vinculado</span>'}
           </div>
        </td>
      `;
      tbody.appendChild(tr);

      const rateioRows = partners.slice(0, 3).map(partner => {
        const investPerc = Number(partner?.investment) || 0;
        const sharePerc = Number(partner?.share) || 0;
        const value = item.displayValor * (investPerc / 100);
        return `
                        <tr>
                            <td class="px-2 py-1">${partner?.name || 'Socio'}</td>
                            <td class="px-2 py-1 text-center text-gray-400">${sharePerc}%</td>
                            <td class="px-2 py-1 text-center font-bold text-sky-600">${investPerc}%</td>
                            <td class="px-2 py-1 text-right font-mono">${fmtBR(value)}</td>
                        </tr>`;
      }).join('');

      const trRateio = document.createElement('tr');
      trRateio.id = `rateio-${item.id}-${item.parcelaIndex || 0}`;
      trRateio.className = 'hidden bg-sky-50 animate-fade-in border-b';
      trRateio.innerHTML = `
        <td colspan="6" class="px-6 py-4">
            <div class="max-w-lg mx-auto bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                <h5 class="text-xs font-bold text-gray-500 uppercase mb-2 border-b pb-1">Detalhamento de Rateio</h5>
                <table class="w-full text-xs">
                    <thead class="bg-gray-50 text-gray-600">
                        <tr>
                            <th class="px-2 py-1 text-left">Socio</th>
                            <th class="px-2 py-1 text-center">Part. %</th>
                            <th class="px-2 py-1 text-center">Inv. %</th>
                            <th class="px-2 py-1 text-right">Valor (R$)</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        ${rateioRows}
                        <tr class="bg-gray-50 font-bold">
                            <td class="px-2 py-1" colspan="3">Total da Parcela/Investimento</td>
                            <td class="px-2 py-1 text-right font-mono text-gray-800">${fmtBR(item.displayValor)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </td>
      `;
      tbody.appendChild(trRateio);
    });

    tbody.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => editItem(btn.dataset.id));
    });
    tbody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteItem(btn.dataset.id));
    });

    window.toggleRateio = function(id) {
      const el = document.getElementById(`rateio-${id}`);
      if (el) el.classList.toggle('hidden');
    };

    renderTotalRateioTable();
  }

  function renderTotalRateioTable() {
    const today = new Date();
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let totalRealizado = 0;

    investimentos.forEach(item => {
      const valor = Number(item.valor) || 0;
      const parcelas = Number(item.parcelas) || 1;

      if (item.status === 'Parcelado' && parcelas > 1) {
        const valParcela = valor / parcelas;
        const dataInicial = item.data ? new Date(item.data) : new Date();
        for (let p = 0; p < parcelas; p++) {
          const parcelaDate = new Date(dataInicial);
          parcelaDate.setMonth(parcelaDate.getMonth() + p);
          const parcelaDateOnly = new Date(parcelaDate.getFullYear(), parcelaDate.getMonth(), parcelaDate.getDate());
          if (parcelaDateOnly <= todayDateOnly) {
            totalRealizado += valParcela;
          }
        }
      } else {
        const dataRef = item.data ? new Date(item.data) : new Date();
        const dataOnly = new Date(dataRef.getFullYear(), dataRef.getMonth(), dataRef.getDate());
        const isRealized = item.status === 'Realizado' || item.status === 'Pago';
        if (isRealized || dataOnly <= todayDateOnly) {
          totalRealizado += valor;
        }
      }
    });

    const applyPartners = (partnersList) => {
      const basePartners = (partnersList && partnersList.length) ? partnersList : DEFAULT_PARTNERS;
      const ids = ['iranildo', 'elder', 'leonardo'];

      ids.forEach((key, index) => {
        const partner = basePartners[index] || DEFAULT_PARTNERS[index];
        const investPerc = Number(partner?.investment) || 0;
        const sharePerc = Number(partner?.share) || 0;
        const value = totalRealizado * (investPerc / 100);
        const valEl = document.getElementById(`total-rateio-${key}`);
        if (valEl) {
          valEl.textContent = fmtBR(value);
          const row = valEl.closest('tr');
          if (row) {
            if (row.cells[0]) row.cells[0].textContent = partner?.name || 'Socio';
            if (row.cells[1]) row.cells[1].textContent = `${sharePerc}%`;
            if (row.cells[2]) row.cells[2].textContent = `${investPerc}%`;
          }
        }
      });

      const totalEl = document.getElementById('total-rateio-geral');
      if (totalEl) totalEl.textContent = fmtBR(totalRealizado);
    };

    ensurePartnersConfig()
      .then(applyPartners)
      .catch(() => applyPartners());
  }

  function editItem(id) {
    const item = investimentos.find(i => i.id === id);
    if(!item) return;
    
    const form = document.getElementById('form-investimento');
    form.dataset.editingId = id;
    
    document.getElementById('categoria-investimento').value = item.categoria;
    document.getElementById('data-investimento').value = item.data;
    document.getElementById('valor-investimento').value = item.valor;
    document.getElementById('descricao-investimento').value = item.descricao;
    document.getElementById('status-investimento').value = item.status || 'Realizado';
    
    // Open form
    const btnToggle = document.getElementById('btn-toggle-form');
    if(btnToggle) btnToggle.click();
  }

  async function deleteItem(id) {
    if(!confirm('Confirma a exclusão deste investimento?')) return;
    investimentos = investimentos.filter(i => i.id !== id);
    await salvarInvestimentosAsync();
    renderAll();
  }

  // Listener para storage
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      carregarInvestimentosAsync().then(renderAll);
    }
  });

})();
