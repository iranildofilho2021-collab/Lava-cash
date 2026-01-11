// Script para página de Análise Financeira (DRE) - Versão Completa
(function() {
  'use strict';

  // ========== CONSTANTES ==========
  const PT_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const PT_MESES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  
  // Classificação de despesas para DRE - Detalhada
  const CLASSIFICACAO_DESPESAS = {
    // Custo dos Serviços Prestados (custos diretos da operação) - apenas Suprimentos/Insumos
    'CSP': ['Suprimentos'],
    
    // Despesas Administrativas - Subdivididas
    'ALUGUEL': ['Aluguel'],                            // Aluguel
    'ENERGIA': ['Energia'],                            // Energia Elétrica
    'AGUA': ['Conta de Agua', 'Conta de Água'],        // Água
    'CONTADORA': ['Contadora', 'Contador'],            // Contadora
    'SEGUROS': ['Seguro', 'Seguros'],                  // Seguros
    'VMPAY': ['VmPay Pagamentos'],                     // Sistema/Software (apenas uma variante para evitar duplicação)
    'ROYALTIES': ['Royalties', 'Franquia'],            // Royalties/Franquia
    
    // Despesas com Pessoal
    'PESSOAL': ['Salario', 'Salário', 'INSS'],
    
    // Despesas Financeiras
    'FINANCEIRAS': ['Emprestimo', 'Empréstimo', 'Juros'],
    
    // Tributos
    'TRIBUTOS': ['DAS-Impostos', 'DAS', 'Impostos'],
    
    // Outras Despesas
    'OUTRAS': ['Outros', 'Outras', 'Diversos']
  };

  // Cores para gráficos
  const CORES_CATEGORIAS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#78716c',
    '#64748b'
  ];

  // ========== UTILITÁRIOS ==========
  const numBR = (n) => Number(n||0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
  const fmtBR = (n) => 'R$ ' + numBR(n);
  const pctBR = (n) => numBR(n) + '%';

  function anoDe(anoMes) {
    if (!anoMes) return '';
    const parts = String(anoMes).split('/');
    return parts[0] || '';
  }

  function mesNumDe(anoMes) {
    if (!anoMes) return -1;
    const parts = String(anoMes).split('/');
    return parts[1] ? Number(parts[1]) - 1 : -1;
  }

  // ========== FUNÇÕES DE LEITURA DE DADOS ==========
  function lerVendasResumo() {
    if (typeof SharedUtils !== 'undefined' && SharedUtils.lerVendasResumo) {
      return SharedUtils.lerVendasResumo();
    }
    try {
      return JSON.parse(localStorage.getItem('vendasResumo')) || [];
    } catch(e) {
      console.warn('Erro lendo vendasResumo', e);
      return [];
    }
  }

  function lerDespesas() {
    if (typeof SharedUtils !== 'undefined' && SharedUtils.lerDespesas) {
      return SharedUtils.lerDespesas();
    }
    try {
      return JSON.parse(localStorage.getItem('despesas')) || [];
    } catch(e) {
      console.warn('Erro lendo despesas', e);
      return [];
    }
  }

  function carregarVendasResumoDia() {
    if (typeof SharedUtils !== 'undefined' && SharedUtils.carregarVendasResumoDia) {
      return SharedUtils.carregarVendasResumoDia();
    }
    try {
      const raw = JSON.parse(localStorage.getItem('vendasResumoDia')) || [];
      if (Array.isArray(raw) && raw.length > 0) {
        const f0 = raw[0];
        if(f0 && (f0.a !== undefined || f0.b !== undefined)) {
          return raw.map(it => ({
            anoMesDia: it.a || it.date || '',
            anoMes: (it.a||'').slice(0,7),
            receitaBruta: (it.b!=null)?(Number(it.b)/100):Number(it.receitaBruta||0),
            mdr: (it.c!=null)?(Number(it.c)/100):Number(it.mdr||0),
            receitaLiquida: (it.b!=null && it.c!=null)?((Number(it.b)-Number(it.c))/100):Number(it.receitaLiquida||0),
            source: it.s||'',
            tipoPagamento: it.p||''
          }));
        }
        return raw;
      }
      return [];
    } catch(e) {
      console.warn('Erro lendo vendasResumoDia', e);
      return [];
    }
  }

  // ========== FUNÇÕES DE CÁLCULO ==========
  
  // Receita bruta por mês
  function receitaBrutaMes(ano, mIdx) {
    const dados = lerVendasResumo();
    let total = 0;
    for (const v of dados) {
      if (!v.anoMes) continue;
      if (anoDe(v.anoMes) !== String(ano)) continue;
      if (mesNumDe(v.anoMes) === mIdx) {
        total += Number(v.receitaBruta || 0);
      }
    }
    return total;
  }

  // Receita bruta anual
  function receitaBrutaAnual(ano) {
    let total = 0;
    for (let m = 0; m < 12; m++) {
      total += receitaBrutaMes(ano, m);
    }
    return total;
  }

  // MDR (taxas de cartão) por mês
  function mdrMes(ano, mIdx) {
    const daily = carregarVendasResumoDia();
    let total = 0;
    for (const d of daily) {
      if (!d || !d.anoMes) continue;
      if (anoDe(d.anoMes) !== String(ano)) continue;
      if (mesNumDe(d.anoMes) === mIdx) {
        total += Number(d.mdr || 0);
      }
    }
    return total;
  }

  // MDR anual
  function mdrAnual(ano) {
    let total = 0;
    for (let m = 0; m < 12; m++) {
      total += mdrMes(ano, m);
    }
    return total;
  }

  // Despesas por categoria e mês
  function despesaCategoriaMes(ano, mIdx, categoria) {
    const dados = lerDespesas();
    const nomeMes = PT_MESES[mIdx];
    let total = 0;
    for (const d of dados) {
      if (String(d.ano) !== String(ano)) continue;
      if (String(d.mes) !== nomeMes) continue;
      if (String(d.categoria || '').toLowerCase() === String(categoria).toLowerCase()) {
        total += Number(d.valor || 0);
      }
    }
    return total;
  }

  // Despesas totais por mês
  function despesaMes(ano, mIdx) {
    const dados = lerDespesas();
    const nomeMes = PT_MESES[mIdx];
    let total = 0;
    for (const d of dados) {
      if (String(d.ano) !== String(ano)) continue;
      if (String(d.mes) !== nomeMes) continue;
      total += Number(d.valor || 0);
    }
    return total;
  }

  // Despesas anual
  function despesaAnual(ano) {
    let total = 0;
    for (let m = 0; m < 12; m++) {
      total += despesaMes(ano, m);
    }
    return total;
  }

  // Obter todas as categorias de despesas do ano
  function obterCategoriasDoAno(ano) {
    const dados = lerDespesas();
    const categorias = new Set();
    for (const d of dados) {
      if (String(d.ano) !== String(ano)) continue;
      if (d.categoria) categorias.add(d.categoria);
    }
    return Array.from(categorias).sort();
  }

  // Despesas por tipo de classificação
  function despesaClassificacaoMes(ano, mIdx, classificacao) {
    const categorias = CLASSIFICACAO_DESPESAS[classificacao] || [];
    let total = 0;
    for (const cat of categorias) {
      total += despesaCategoriaMes(ano, mIdx, cat);
    }
    return total;
  }

  // Despesas fixas (Aluguel, Contadora, etc)
  function despesasFixasMes(ano, mIdx) {
    const dados = lerDespesas();
    const nomeMes = PT_MESES[mIdx];
    let total = 0;
    for (const d of dados) {
      if (String(d.ano) !== String(ano)) continue;
      if (String(d.mes) !== nomeMes) continue;
      if (d.tipo === 'Fixo') total += Number(d.valor || 0);
    }
    return total;
  }

  // Despesas variáveis
  function despesasVariaveisMes(ano, mIdx) {
    const dados = lerDespesas();
    const nomeMes = PT_MESES[mIdx];
    let total = 0;
    for (const d of dados) {
      if (String(d.ano) !== String(ano)) continue;
      if (String(d.mes) !== nomeMes) continue;
      if (d.tipo !== 'Fixo') total += Number(d.valor || 0);
    }
    return total;
  }

  // ========== CÁLCULO DO DRE COMPLETO ==========
  function calcularDREMes(ano, mIdx) {
    const receitaBruta = receitaBrutaMes(ano, mIdx);
    const mdr = mdrMes(ano, mIdx);
    const receitaLiquida = receitaBruta - mdr;
    
    // CSP - Custo dos Serviços Prestados (apenas Suprimentos)
    const csp = despesaClassificacaoMes(ano, mIdx, 'CSP');
    const lucroBruto = receitaLiquida - csp;
    
    // Despesas Administrativas - Detalhadas (inclui Energia, Água, VmPay e Royalties)
    const despAluguel = despesaClassificacaoMes(ano, mIdx, 'ALUGUEL');           // Aluguel
    const despEnergia = despesaClassificacaoMes(ano, mIdx, 'ENERGIA');           // Energia
    const despAgua = despesaClassificacaoMes(ano, mIdx, 'AGUA');                 // Água
    const despContadora = despesaClassificacaoMes(ano, mIdx, 'CONTADORA');       // Contadora
    const despSeguros = despesaClassificacaoMes(ano, mIdx, 'SEGUROS');           // Seguros
    const despVmPay = despesaClassificacaoMes(ano, mIdx, 'VMPAY');               // Sistema/Software
    const despRoyalties = despesaClassificacaoMes(ano, mIdx, 'ROYALTIES');       // Royalties/Franquia
    const despAdmin = despAluguel + despEnergia + despAgua + despContadora + despSeguros + despVmPay + despRoyalties; // Total Administrativas
    
    // Outras despesas operacionais
    const despPessoal = despesaClassificacaoMes(ano, mIdx, 'PESSOAL');
    const despFinanceiras = despesaClassificacaoMes(ano, mIdx, 'FINANCEIRAS');
    const despOutras = despesaClassificacaoMes(ano, mIdx, 'OUTRAS');
    
    // Despesas Operacionais (inclui Administrativas com VmPay e Royalties)
    const despesasOperacionais = despAdmin + despPessoal + despFinanceiras + despOutras;
    
    // Tributos (DAS do Simples Nacional)
    const despTributos = despesaClassificacaoMes(ano, mIdx, 'TRIBUTOS');
    
    // Lucro Operacional = Lucro Bruto - Despesas Operacionais
    const lucroOperacional = lucroBruto - despesasOperacionais;
    
    // Lucro Líquido = Lucro Operacional - Tributos
    const lucroLiquido = lucroOperacional - despTributos;

    return {
      receitaBruta,
      mdr,
      receitaLiquida,
      csp,
      lucroBruto,
      // Administrativas detalhadas
      despAluguel,
      despEnergia,
      despAgua,
      despContadora,
      despSeguros,
      despVmPay,
      despRoyalties,
      despAdmin,
      // Outras categorias
      despPessoal,
      despFinanceiras,
      despOutras,
      despesasOperacionais,
      despTributos,
      lucroOperacional,
      lucroLiquido
    };
  }

  function calcularDREAnual(ano) {
    let totais = {
      receitaBruta: 0, mdr: 0, receitaLiquida: 0, csp: 0, lucroBruto: 0,
      despAluguel: 0, despEnergia: 0, despAgua: 0, despContadora: 0, despSeguros: 0, despAdmin: 0,
      despVmPay: 0, despPessoal: 0, despFinanceiras: 0, despTributos: 0, despRoyalties: 0, despOutras: 0,
      despesasOperacionais: 0, lucroOperacional: 0, lucroLiquido: 0
    };
    
    const meses = [];
    for (let m = 0; m < 12; m++) {
      const dreMes = calcularDREMes(ano, m);
      meses.push(dreMes);
      for (const key of Object.keys(totais)) {
        totais[key] += dreMes[key];
      }
    }
    
    return { meses, totais };
  }

  // ========== RENDERIZAÇÃO ==========
  
  // Renderizar DRE Resumido
  function renderizarDREResumido(ano) {
    const dre = calcularDREAnual(ano);
    const t = dre.totais;
    const tbody = document.getElementById('dreTableBody');
    if (!tbody) return;

    const totalDespesas = t.csp + t.despesasOperacionais + t.despTributos;
    
    // Calcula percentuais em relação à receita bruta
    const pct = (val) => t.receitaBruta > 0 ? (val / t.receitaBruta * 100) : 0;

    const linhas = [
      { label: '(+) Receita Bruta de Vendas', valor: t.receitaBruta, pct: 100, class: 'font-semibold' },
      { label: '(-) Deduções (Taxas MDR/Cartão)', valor: -t.mdr, pct: -pct(t.mdr), class: 'text-gray-600 text-sm' },
      { label: '(=) Receita Líquida', valor: t.receitaLiquida, pct: pct(t.receitaLiquida), class: 'font-semibold bg-gray-50' },
      { label: '', valor: null, pct: null, class: 'h-2' }, // Espaçador
      { label: '(-) Custo dos Serviços Prestados (CSP)', valor: -t.csp, pct: -pct(t.csp), class: 'text-gray-600 text-sm' },
      { label: '    • Suprimentos (Insumos: sabão, amaciante, etc.)', valor: null, pct: null, class: 'text-gray-400 text-xs pl-4', isSubitem: true },
      { label: '(=) Lucro Bruto', valor: t.lucroBruto, pct: pct(t.lucroBruto), class: 'font-semibold bg-emerald-50 text-emerald-700' },
      { label: '', valor: null, pct: null, class: 'h-2' }, // Espaçador
      { label: '(-) Despesas Operacionais:', valor: -t.despesasOperacionais, pct: -pct(t.despesasOperacionais), class: 'font-medium text-gray-700' },
      { label: '    • Administrativas:', valor: -t.despAdmin, pct: -pct(t.despAdmin), class: 'text-gray-600 text-sm pl-4 font-medium' },
      { label: '        ◦ Aluguel', valor: -t.despAluguel, pct: -pct(t.despAluguel), class: 'text-gray-500 text-xs pl-8' },
      { label: '        ◦ Energia', valor: -t.despEnergia, pct: -pct(t.despEnergia), class: 'text-gray-500 text-xs pl-8' },
      { label: '        ◦ Água', valor: -t.despAgua, pct: -pct(t.despAgua), class: 'text-gray-500 text-xs pl-8' },
      { label: '        ◦ Contadora', valor: -t.despContadora, pct: -pct(t.despContadora), class: 'text-gray-500 text-xs pl-8' },
      { label: '        ◦ Seguros', valor: -t.despSeguros, pct: -pct(t.despSeguros), class: 'text-gray-500 text-xs pl-8' },
      { label: '        ◦ VmPay Pagamentos', valor: -t.despVmPay, pct: -pct(t.despVmPay), class: 'text-indigo-600 text-xs pl-8 font-medium' },
      { label: '        ◦ Royalties/Franquia', valor: -t.despRoyalties, pct: -pct(t.despRoyalties), class: 'text-amber-600 text-xs pl-8 font-medium' },
      { label: '    • Pessoal (Salários, INSS)', valor: -t.despPessoal, pct: -pct(t.despPessoal), class: 'text-gray-500 text-sm pl-4' },
      { label: '    • Financeiras (Empréstimos)', valor: -t.despFinanceiras, pct: -pct(t.despFinanceiras), class: 'text-gray-500 text-sm pl-4' },
      { label: '    • Outras Despesas', valor: -t.despOutras, pct: -pct(t.despOutras), class: 'text-gray-500 text-sm pl-4' },
      { label: '(=) Lucro Operacional', valor: t.lucroOperacional, pct: pct(t.lucroOperacional), class: 'font-semibold bg-gray-50' },
      { label: '', valor: null, pct: null, class: 'h-2' }, // Espaçador
      { label: '(-) Tributos (DAS Simples Nacional)', valor: -t.despTributos, pct: -pct(t.despTributos), class: 'text-gray-600 text-sm' },
      { label: '(=) LUCRO LÍQUIDO', valor: t.lucroLiquido, pct: pct(t.lucroLiquido), class: 'font-bold text-lg bg-sky-100 text-sky-800' }
    ];

    tbody.innerHTML = linhas.map(linha => {
      if (linha.valor === null && linha.label === '') {
        return `<tr><td colspan="3" class="${linha.class}"></td></tr>`;
      }
      if (linha.isSubitem || linha.valor === null) {
        return `<tr class="${linha.class}"><td class="border-0 px-4 py-1" colspan="3">${linha.label}</td></tr>`;
      }
      const valorClass = linha.valor < 0 ? 'text-red-600' : (linha.valor > 0 ? 'text-emerald-600' : '');
      return `
        <tr class="${linha.class}">
          <td class="border border-gray-300 px-4 py-3">${linha.label}</td>
          <td class="border border-gray-300 px-4 py-3 text-right font-mono ${valorClass}">${fmtBR(linha.valor)}</td>
          <td class="border border-gray-300 px-4 py-3 text-right text-sm ${linha.pct < 0 ? 'text-red-500' : 'text-gray-500'}">${pctBR(linha.pct)}</td>
        </tr>
      `;
    }).join('');

    // Atualizar período
    const periodoEl = document.getElementById('periodoResumido');
    if (periodoEl) periodoEl.textContent = `Ano: ${ano}`;
  }

  // Renderizar DRE Detalhado por Mês
  function renderizarDREDetalhado(ano) {
    const dre = calcularDREAnual(ano);
    const tbody = document.getElementById('dreDetalhadoBody');
    if (!tbody) return;

    const criarLinha = (label, valores, total, classe = '', isNegativo = false) => {
      const sinal = isNegativo ? -1 : 1;
      let html = `<tr class="${classe}">`;
      html += `<td class="border border-gray-300 px-3 py-2 font-medium bg-white">${label}</td>`;
      for (let m = 0; m < 12; m++) {
        const val = valores[m] * sinal;
        const colorClass = val < 0 ? 'text-red-600' : (val > 0 && !isNegativo ? 'text-emerald-600' : '');
        html += `<td class="border border-gray-300 px-3 py-2 text-right font-mono text-xs ${colorClass}">${numBR(val)}</td>`;
      }
      const totalVal = total * sinal;
      const totalColor = totalVal < 0 ? 'text-red-700' : 'text-emerald-700';
      html += `<td class="border border-gray-300 px-3 py-2 text-right font-mono font-semibold bg-sky-50 ${totalColor}">${numBR(totalVal)}</td>`;
      html += '</tr>';
      return html;
    };

    const linhas = [
      { label: 'Receita Bruta', key: 'receitaBruta', classe: 'bg-gray-50 font-semibold' },
      { label: '(-) Taxas MDR', key: 'mdr', classe: 'text-gray-600 text-sm', neg: true },
      { label: 'Receita Líquida', key: 'receitaLiquida', classe: 'bg-emerald-50 font-semibold' },
      { label: '(-) CSP (Suprimentos)', key: 'csp', classe: 'text-gray-600 text-sm', neg: true },
      { label: 'Lucro Bruto', key: 'lucroBruto', classe: 'bg-emerald-50 font-semibold' },
      { label: '(-) Aluguel', key: 'despAluguel', classe: 'text-gray-500 text-xs', neg: true },
      { label: '(-) Energia', key: 'despEnergia', classe: 'text-gray-500 text-xs', neg: true },
      { label: '(-) Água', key: 'despAgua', classe: 'text-gray-500 text-xs', neg: true },
      { label: '(-) Contadora', key: 'despContadora', classe: 'text-gray-500 text-xs', neg: true },
      { label: '(-) Seguros', key: 'despSeguros', classe: 'text-gray-500 text-xs', neg: true },
      { label: '(-) VmPay Pagamentos', key: 'despVmPay', classe: 'text-indigo-600 text-xs font-medium', neg: true },
      { label: '(-) Royalties', key: 'despRoyalties', classe: 'text-amber-600 text-xs font-medium', neg: true },
      { label: '(-) Pessoal', key: 'despPessoal', classe: 'text-gray-500 text-xs', neg: true },
      { label: '(-) Financeiras', key: 'despFinanceiras', classe: 'text-gray-500 text-xs', neg: true },
      { label: '(-) Outras Desp.', key: 'despOutras', classe: 'text-gray-500 text-xs', neg: true },
      { label: 'Lucro Operacional', key: 'lucroOperacional', classe: 'bg-gray-50 font-semibold' },
      { label: '(-) Tributos (DAS)', key: 'despTributos', classe: 'text-gray-600 text-sm', neg: true },
      { label: 'LUCRO LÍQUIDO', key: 'lucroLiquido', classe: 'bg-sky-100 font-bold text-sky-800' }
    ];

    tbody.innerHTML = linhas.map(l => {
      const valores = dre.meses.map(m => m[l.key]);
      return criarLinha(l.label, valores, dre.totais[l.key], l.classe, l.neg);
    }).join('');
  }

  // Renderizar Despesas por Categoria
  function renderizarDespesasCategoria(ano) {
    const categorias = obterCategoriasDoAno(ano);
    const tbody = document.getElementById('despesasCategoriaBody');
    if (!tbody) return;

    const totalGeral = despesaAnual(ano);
    let html = '';

    for (const cat of categorias) {
      let totalCat = 0;
      html += '<tr class="hover:bg-gray-50">';
      html += `<td class="border border-gray-300 px-3 py-2 font-medium">${cat}</td>`;
      
      for (let m = 0; m < 12; m++) {
        const val = despesaCategoriaMes(ano, m, cat);
        totalCat += val;
        html += `<td class="border border-gray-300 px-3 py-2 text-right font-mono text-xs">${val > 0 ? numBR(val) : '-'}</td>`;
      }
      
      const pct = totalGeral > 0 ? (totalCat / totalGeral * 100) : 0;
      html += `<td class="border border-gray-300 px-3 py-2 text-right font-mono font-semibold bg-red-50 text-red-700">${numBR(totalCat)}</td>`;
      html += `<td class="border border-gray-300 px-3 py-2 text-right font-mono text-sm text-gray-600">${pctBR(pct)}</td>`;
      html += '</tr>';
    }

    // Linha de Total
    html += '<tr class="bg-gray-100 font-bold">';
    html += '<td class="border border-gray-300 px-3 py-2">TOTAL DESPESAS</td>';
    for (let m = 0; m < 12; m++) {
      const val = despesaMes(ano, m);
      html += `<td class="border border-gray-300 px-3 py-2 text-right font-mono">${numBR(val)}</td>`;
    }
    html += `<td class="border border-gray-300 px-3 py-2 text-right font-mono bg-red-100 text-red-800">${numBR(totalGeral)}</td>`;
    html += `<td class="border border-gray-300 px-3 py-2 text-right font-mono">100%</td>`;
    html += '</tr>';

    tbody.innerHTML = html;
  }

  // Atualizar Indicadores
  function atualizarIndicadores(ano) {
    const dre = calcularDREAnual(ano);
    const t = dre.totais;

    // Indicadores principais
    const receitaEl = document.getElementById('indicadorReceitaBruta');
    const lucroEl = document.getElementById('indicadorLucroLiquido');
    const margemBrutaEl = document.getElementById('indicadorMargemBruta');
    const margemLiquidaEl = document.getElementById('indicadorMargemLiquida');

    if (receitaEl) receitaEl.textContent = fmtBR(t.receitaBruta);
    if (lucroEl) {
      lucroEl.textContent = fmtBR(t.lucroLiquido);
      lucroEl.className = `text-2xl font-bold mt-1 ${t.lucroLiquido >= 0 ? 'text-sky-600' : 'text-red-600'}`;
    }

    const margemBruta = t.receitaBruta > 0 ? (t.lucroBruto / t.receitaBruta * 100) : 0;
    const margemLiquida = t.receitaBruta > 0 ? (t.lucroLiquido / t.receitaBruta * 100) : 0;

    if (margemBrutaEl) margemBrutaEl.textContent = pctBR(margemBruta);
    if (margemLiquidaEl) {
      margemLiquidaEl.textContent = pctBR(margemLiquida);
      margemLiquidaEl.className = `text-2xl font-bold mt-1 ${margemLiquida >= 0 ? 'text-purple-600' : 'text-red-600'}`;
    }

    // Ponto de Equilíbrio
    let despFixas = 0;
    let despVariaveis = 0;
    for (let m = 0; m < 12; m++) {
      despFixas += despesasFixasMes(ano, m);
      despVariaveis += despesasVariaveisMes(ano, m);
    }

    const despFixasEl = document.getElementById('despesasFixasTotal');
    const despVariaveisEl = document.getElementById('despesasVariaveisTotal');
    const pontoEqEl = document.getElementById('pontoEquilibrio');

    if (despFixasEl) despFixasEl.textContent = fmtBR(despFixas);
    if (despVariaveisEl) despVariaveisEl.textContent = fmtBR(despVariaveis);

    // Ponto de equilíbrio = Custos Fixos / (1 - (Custos Variáveis / Receita))
    const margemContribuicao = t.receitaBruta > 0 ? 1 - (despVariaveis / t.receitaBruta) : 0;
    const pontoEquilibrio = margemContribuicao > 0 ? despFixas / margemContribuicao : 0;
    
    // User requested to consider variable expenses in the sum? 
    // "não deveria somar as daspesas variaveis tbm não ?"
    // Assuming user wants to see the total expenses (fixed + variable) somewhere or implies the break-even needs to cover everything.
    // The standard break-even formula covers fixed costs based on the contribution margin (which already accounts for variable costs).
    // If the user meant "Total Costs Break-even" (Revenue needed to cover Total Costs at current level):
    // Revenue = Total Costs = Fixed + Variable.
    // This is satisfied when Profit = 0. That IS the Break-even point calculated above.
    // However, if the user sees "Despesas Fixas" and "Despesas Variáveis" displayed separately, and thinks "Ponto de Equilíbrio" is just a sum, they might be confused.
    // I'll stick to the correct formula but maybe the user wants to see "Total Despesas" displayed?
    // Let's assume the user was questioning if the break-even *value* includes variable expenses. It implicitly does because it's the revenue needed to cover BOTH.
    // But maybe they want the *calculation* to be `(Fixed + Variable)`. That would be wrong for the formula `Fixed / Margin`.
    // BUT, if Margin is 1 (no variable costs), then Break-even = Fixed.
    // If they want `(Fixed + Variable) / Margin`, that's definitely wrong.
    // Perhaps they simply want to see the SUM of expenses (Fixed + Variable) displayed in the card?
    // The card currently shows "Ponto de Equilíbrio" (Revenue target).
    // Let's leave it as is for now as it is mathematically correct, unless they want the break-even to be *calculated* as `(Fixed + Variable) / ...` which would be double counting.
    // Wait, if I read the prompt again: "o Ponto de Equilíbrio na parte de baixo da pagina - não deveria somar as daspesas variaveis tbm não ? ou esta bom assim".
    // He asks if it should sum variable expenses too.
    // Maybe he wants the "Despesas Fixas" box to be "Despesas Totais"?
    // No, there are 3 boxes: Fixed, Variable, Break-even.
    // I'll assume the calculation is fine and he is just asking. I will ensure the `despVariaveis` includes CSP as well, which are variable.
    
    // Important: `despesasVariaveisMes` currently filters by `d.tipo !== 'Fixo'`.
    // We should ensure CSP items are considered variable.
    // The `despesasVariaveisMes` function iterates all expenses. If `tipo` is not 'Fixo', it sums it.
    // This should include CSP if they are not marked as Fixo.
    
    if (pontoEqEl) pontoEqEl.textContent = fmtBR(pontoEquilibrio);
  }

  // ========== GRÁFICOS ==========
  let chartInstances = {};

  function destroyChart(name) {
    if (chartInstances[name]) {
      chartInstances[name].destroy();
      chartInstances[name] = null;
    }
  }

  // Gráfico Receita vs Despesas (Barras Agrupadas)
  function renderizarGraficoReceitaDespesas(ano) {
    const ctx = document.getElementById('receitaAnualChart');
    if (!ctx) return;

    destroyChart('receitaAnual');

    const receitas = PT_MESES.map((_, idx) => receitaBrutaMes(ano, idx));
    const despesas = PT_MESES.map((_, idx) => despesaMes(ano, idx));

    chartInstances['receitaAnual'] = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: PT_MESES_CURTO,
        datasets: [
          {
            label: 'Receita',
            data: receitas,
            backgroundColor: '#10b981',
            borderRadius: 4
          },
          {
            label: 'Despesas',
            data: despesas,
            backgroundColor: '#ef4444',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (val) => 'R$ ' + (val/1000).toFixed(0) + 'k' }
          }
        },
        plugins: {
          legend: { display: true, position: 'top' },
          tooltip: {
            callbacks: { label: (ctx) => ctx.dataset.label + ': ' + fmtBR(ctx.parsed.y) }
          }
        }
      }
    });
  }

  // Gráfico Pizza - Despesas por Categoria
  function renderizarGraficoPizzaDespesas(ano) {
    const ctx = document.getElementById('despesasPizzaChart');
    if (!ctx) return;

    destroyChart('despesasPizza');

    const categorias = obterCategoriasDoAno(ano);
    const valores = categorias.map(cat => {
      let total = 0;
      for (let m = 0; m < 12; m++) {
        total += despesaCategoriaMes(ano, m, cat);
      }
      return total;
    }).filter(v => v > 0);

    const labels = categorias.filter((_, i) => {
      let total = 0;
      for (let m = 0; m < 12; m++) {
        total += despesaCategoriaMes(ano, m, categorias[i]);
      }
      return total > 0;
    });

    chartInstances['despesasPizza'] = new Chart(ctx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: valores,
          backgroundColor: CORES_CATEGORIAS.slice(0, labels.length),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'right', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? (ctx.parsed / total * 100).toFixed(1) : 0;
                return ctx.label + ': ' + fmtBR(ctx.parsed) + ' (' + pct + '%)';
              }
            }
          }
        }
      }
    });
  }

  // Gráfico Lucro Mensal
  function renderizarGraficoLucro(ano) {
    const ctx = document.getElementById('lucroMensalChart');
    if (!ctx) return;

    destroyChart('lucroMensal');

    const dre = calcularDREAnual(ano);
    const lucros = dre.meses.map(m => m.lucroLiquido);

    chartInstances['lucroMensal'] = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: PT_MESES_CURTO,
        datasets: [{
          label: 'Lucro Líquido',
          data: lucros,
          backgroundColor: lucros.map(v => v >= 0 ? '#0ea5e9' : '#ef4444'),
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            ticks: { callback: (val) => 'R$ ' + (val/1000).toFixed(1) + 'k' }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => 'Lucro: ' + fmtBR(ctx.parsed.y) }
          }
        }
      }
    });
  }

  // Gráfico Evolução das Margens
  function renderizarGraficoMargens(ano) {
    const ctx = document.getElementById('margensChart');
    if (!ctx) return;

    destroyChart('margens');

    const dre = calcularDREAnual(ano);
    const margensBrutas = dre.meses.map(m => m.receitaBruta > 0 ? (m.lucroBruto / m.receitaBruta * 100) : 0);
    const margensLiquidas = dre.meses.map(m => m.receitaBruta > 0 ? (m.lucroLiquido / m.receitaBruta * 100) : 0);

    chartInstances['margens'] = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels: PT_MESES_CURTO,
        datasets: [
          {
            label: 'Margem Bruta',
            data: margensBrutas,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            fill: true,
            tension: 0.3
          },
          {
            label: 'Margem Líquida',
            data: margensLiquidas,
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            fill: true,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            ticks: { callback: (val) => val.toFixed(0) + '%' }
          }
        },
        plugins: {
          legend: { display: true, position: 'top' },
          tooltip: {
            callbacks: { label: (ctx) => ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%' }
          }
        }
      }
    });
  }

  // Gráfico Comparativo Completo
  function renderizarGraficoComparativo(ano) {
    const ctx = document.getElementById('comparativoChart');
    if (!ctx) return;

    destroyChart('comparativo');

    const dre = calcularDREAnual(ano);
    const receitas = dre.meses.map(m => m.receitaBruta);
    const despesas = dre.meses.map(m => m.csp + m.despesasOperacionais + m.despTributos + m.mdr);
    const lucros = dre.meses.map(m => m.lucroLiquido);

    chartInstances['comparativo'] = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels: PT_MESES_CURTO,
        datasets: [
          {
            label: 'Receita Bruta',
            data: receitas,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: false,
            tension: 0.3,
            borderWidth: 3
          },
          {
            label: 'Total Despesas',
            data: despesas,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            fill: false,
            tension: 0.3,
            borderWidth: 2
          },
          {
            label: 'Lucro Líquido',
            data: lucros,
            borderColor: '#0ea5e9',
            backgroundColor: 'rgba(14, 165, 233, 0.2)',
            fill: true,
            tension: 0.3,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: {
            ticks: { callback: (val) => 'R$ ' + (val/1000).toFixed(0) + 'k' }
          }
        },
        plugins: {
          legend: { display: true, position: 'top' },
          tooltip: {
            callbacks: { label: (ctx) => ctx.dataset.label + ': ' + fmtBR(ctx.parsed.y) }
          }
        }
      }
    });
  }

  // ========== EXPORTAR DRE ==========
  function exportarDRE(ano) {
    const dre = calcularDREAnual(ano);
    const t = dre.totais;

    let csv = 'Demonstração do Resultado do Exercício (DRE) - ' + ano + '\n\n';
    csv += 'RESUMO ANUAL\n';
    csv += 'Descrição;Valor\n';
    csv += 'Receita Bruta;' + numBR(t.receitaBruta) + '\n';
    csv += 'Deduções (MDR);' + numBR(-t.mdr) + '\n';
    csv += 'Receita Líquida;' + numBR(t.receitaLiquida) + '\n';
    csv += 'CSP;' + numBR(-t.csp) + '\n';
    csv += 'Lucro Bruto;' + numBR(t.lucroBruto) + '\n';
    csv += 'Despesas Operacionais;' + numBR(-t.despesasOperacionais) + '\n';
    csv += 'Lucro Operacional;' + numBR(t.lucroOperacional) + '\n';
    csv += 'Tributos (DAS);' + numBR(-t.despTributos) + '\n';
    csv += 'LUCRO LÍQUIDO;' + numBR(t.lucroLiquido) + '\n\n';

    csv += 'DETALHAMENTO MENSAL\n';
    csv += 'Descrição;' + PT_MESES_CURTO.join(';') + ';TOTAL\n';
    
    const linhas = ['receitaBruta', 'mdr', 'receitaLiquida', 'csp', 'lucroBruto', 'despAdmin', 'despPessoal', 'despFinanceiras', 'despOutras', 'lucroOperacional', 'despTributos', 'lucroLiquido'];
    const labels = ['Receita Bruta', 'MDR', 'Receita Líquida', 'CSP', 'Lucro Bruto', 'Desp Admin', 'Desp Pessoal', 'Desp Financ', 'Outras Desp', 'Lucro Oper', 'Tributos', 'Lucro Líquido'];
    
    linhas.forEach((key, i) => {
      csv += labels[i] + ';';
      csv += dre.meses.map(m => numBR(m[key])).join(';');
      csv += ';' + numBR(t[key]) + '\n';
    });

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `DRE_${ano}.csv`;
    link.click();
  }

  // ========== ATUALIZAR TUDO ==========
  function atualizarTudo() {
    const anoSelect = document.getElementById('anoSelectDre');
    if (!anoSelect) return;
    
    // Popular anos disponíveis
    const anos = new Set();
    lerVendasResumo().forEach(v => { if (v.anoMes) anos.add(anoDe(v.anoMes)); });
    lerDespesas().forEach(d => { if (d.ano) anos.add(String(d.ano)); });
    
    // Adiciona ano atual se não houver dados
    const anoAtual = String(new Date().getFullYear());
    if (anos.size === 0) anos.add(anoAtual);
    
    const anosArray = Array.from(anos).filter(Boolean).sort((a,b) => Number(a) - Number(b));
    
    const valorAtual = anoSelect.value;
    anoSelect.innerHTML = anosArray.map(a => `<option value="${a}">${a}</option>`).join('');
    
    if (valorAtual && anosArray.includes(valorAtual)) {
      anoSelect.value = valorAtual;
    } else {
      anoSelect.value = anosArray[anosArray.length - 1];
    }
    
    const anoSelecionado = anoSelect.value;
    
    // Renderizar tudo
    renderizarDREResumido(anoSelecionado);
    renderizarDREDetalhado(anoSelecionado);
    renderizarDespesasCategoria(anoSelecionado);
    atualizarIndicadores(anoSelecionado);
    
    // Gráficos (aguarda Chart.js carregar)
    if (typeof Chart !== 'undefined') {
      renderizarGraficoReceitaDespesas(anoSelecionado);
      renderizarGraficoPizzaDespesas(anoSelecionado);
      renderizarGraficoLucro(anoSelecionado);
      renderizarGraficoMargens(anoSelecionado);
      renderizarGraficoComparativo(anoSelecionado);
    }
  }

  // ========== EVENT LISTENERS ==========
  function init() {
    // Limpar despesas duplicadas automaticamente
    if (window.IRANCASH && window.IRANCASH.DataStore && window.IRANCASH.DataStore.limparDespesasDuplicadas) {
      const removidas = window.IRANCASH.DataStore.limparDespesasDuplicadas();
      if (removidas > 0) {
        console.log(`[Análise Financeira] ${removidas} despesa(s) duplicada(s) foram removidas automaticamente.`);
      }
    }

    const anoSelect = document.getElementById('anoSelectDre');
    if (anoSelect) {
      anoSelect.addEventListener('change', atualizarTudo);
    }

    const btnExportar = document.getElementById('btnExportarDRE');
    if (btnExportar) {
      btnExportar.addEventListener('click', () => {
        const ano = document.getElementById('anoSelectDre')?.value || new Date().getFullYear();
        exportarDRE(ano);
      });
    }

    const btnToggle = document.getElementById('toggleDreDetalhado');
    const container = document.getElementById('dreDetalhadoContainer');
    if (btnToggle && container) {
      btnToggle.addEventListener('click', () => {
        container.classList.toggle('hidden');
      });
    }

    // Atualizar quando dados mudarem
    window.addEventListener('storage', atualizarTudo);

    // Inicializar
    atualizarTudo();
  }

  // Inicializar quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

