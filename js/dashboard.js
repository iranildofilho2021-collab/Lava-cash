// -------- Helpers (usando SharedUtils) --------
const PT_MESES = (typeof SharedUtils !== 'undefined' && SharedUtils.PT_MESES) ? SharedUtils.PT_MESES : ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const numBR = (typeof SharedUtils !== 'undefined') ? SharedUtils.numBR : (n => Number(n||0).toLocaleString('pt-BR', {minimumFractionDigits:2}));
const fmtBR = (typeof SharedUtils !== 'undefined') ? SharedUtils.fmtBR : (n => 'R$ ' + numBR(n));

function lerVendasResumo(){
  if (typeof SharedUtils !== 'undefined' && SharedUtils.lerVendasResumo) {
    return SharedUtils.lerVendasResumo();
  }
  try { return JSON.parse(localStorage.getItem('vendasResumo')) || []; }
  catch(e){ console.warn('Erro lendo vendasResumo', e); return []; }
}

function carregarVendasResumoDia(){
  if (typeof SharedUtils !== 'undefined' && SharedUtils.carregarVendasResumoDia) {
    return SharedUtils.carregarVendasResumoDia();
  }
  try {
    // tentativa direta (formato canônico ou compacto)
    const raw = JSON.parse(localStorage.getItem('vendasResumoDia')) || [];
    if (Array.isArray(raw) && raw.length>0){
      // se for compacto (a,b,c), expandir para forma canônica
      try{ const f0 = raw[0]; if(f0 && (f0.a !== undefined || f0.b !== undefined)){
        return raw.map(it => ({ anoMesDia: it.a || it.date || '', anoMes: (it.a||'').slice(0,7), receitaBruta: (it.b!=null)?(Number(it.b)/100):Number(it.receitaBruta||0), mdr: (it.c!=null)?(Number(it.c)/100):Number(it.mdr||0), receitaLiquida: (it.b!=null && it.c!=null)?((Number(it.b)-Number(it.c))/100):Number(it.receitaLiquida||0), source: it.s||'', tipoPagamento: it.p||'' })); }
      }catch(e){}
      return raw;
    }

    // se não houver, tentar ler lista de chunks (chave: vendasResumoDia_chunks)
    try{
      const chunksMeta = JSON.parse(localStorage.getItem('vendasResumoDia_chunks')) || [];
      if (Array.isArray(chunksMeta) && chunksMeta.length>0){
        const out = [];
        for(const k of chunksMeta){
          try{ const part = JSON.parse(localStorage.getItem(k)) || []; if(Array.isArray(part)) out.push(...part); }catch(e){/*ignore*/}
        }
        if(out.length>0) return out;
      }
    }catch(e){ /* ignore */ }

    // fallback amplo: escanear todas as chaves do localStorage procurando por fragmentos relacionados
    const found = [];
    for(let i=0;i<localStorage.length;i++){
      try{
        const k = localStorage.key(i);
        if(!k) continue;
        const kl = k.toLowerCase();
        // procurar pelas variações mais prováveis da chave: 'vendasResumoDia' (lowercase => vendasresumodia)
        if(kl.includes('vendasresumodia') || kl.includes('vendas_resumo_dia') || kl.startsWith('vendasresumodia_chunk') || kl.startsWith('vendasresumodia_chunks') || kl.includes('vendasresumodia_chunk')){
          const val = JSON.parse(localStorage.getItem(k));
          if(Array.isArray(val) && val.length>0) found.push(...val);
        }
        // também aceitar variações sem underline
        if(kl.includes('vendasresumodia') && !kl.includes('vendasresumodia_chunks')){
          try{ const v = JSON.parse(localStorage.getItem(k)); if(Array.isArray(v) && v.length>0) found.push(...v); }catch(e){}
        }
      }catch(e){ /* ignore malformed entry */ }
    }
    if(found.length>0) {
      // expandir se estiver no formato compacto (a,b,c)
      try{
        const f0 = found[0];
        if(f0 && (f0.a !== undefined || f0.b !== undefined)){
          return found.map(it => ({ anoMesDia: it.a || it.date || '', anoMes: (it.a||'').slice(0,7), receitaBruta: (it.b!=null)?(Number(it.b)/100):Number(it.receitaBruta||0), mdr: (it.c!=null)?(Number(it.c)/100):Number(it.mdr||0), receitaLiquida: (it.b!=null && it.c!=null)?((Number(it.b)-Number(it.c))/100):Number(it.receitaLiquida||0), source: it.s||'', tipoPagamento: it.p||'' }));
        }
      }catch(e){}
      return found;
    }

    return [];
  }
  catch(e){ console.warn('Erro lendo vendasResumoDia', e); return []; }
}

// retorna o último ano/mes com dados, procurando primeiro em vendasResumo (mensal), depois em vendasResumoDia (diário)
function ultimoAnoMesComDados(){
  if (typeof SharedUtils !== 'undefined' && SharedUtils.ultimoAnoMesComDados) {
    return SharedUtils.ultimoAnoMesComDados();
  }
  try{
    const hoje = new Date(); const curYear = String(hoje.getFullYear());
    // Se o ano atual já possui dados para os 12 meses, preferir o mês atual
    try{
      const monthly = lerVendasResumo() || [];
      if(Array.isArray(monthly) && monthly.length>0){
        const mesesDoAno = new Set(monthly.filter(m=> String(m.anoMes||'').startsWith(curYear + '/')).map(m=> mesNumDe(m.anoMes))).size;
        if(mesesDoAno === 12) return { year: curYear, monthIndex: hoje.getMonth() };
      }
      const daily = carregarVendasResumoDia() || [];
      if(Array.isArray(daily) && daily.length>0){
        const mesesDoAnoD = new Set(daily.filter(d=> String(d.anoMes||'').startsWith(curYear + '/')).map(d=> mesNumDe(d.anoMes))).size;
        if(mesesDoAnoD === 12) return { year: curYear, monthIndex: hoje.getMonth() };
      }
    }catch(e){ /* ignore */ }

    // caso contrário, escolher o último mês com dados (comportamento anterior)
    const monthly = lerVendasResumo() || [];
    if(Array.isArray(monthly) && monthly.length>0){
      const sorted = monthly.map(m=>m.anoMes).filter(Boolean).sort();
      if(sorted.length>0){
        const last = sorted[sorted.length-1];
        const parts = String(last).split('/');
        if(parts.length>=2) return { year: parts[0], monthIndex: Number(parts[1]) - 1 };
      }
    }
    // fallback: olhar vendasResumoDia e escolher a maior anoMes
    const daily = carregarVendasResumoDia() || [];
    if(Array.isArray(daily) && daily.length>0){
      const meses = new Set();
      for(const d of daily){ if(d && d.anoMes) meses.add(d.anoMes); }
      const arr = Array.from(meses).sort();
      if(arr.length>0){ const last = arr[arr.length-1]; const parts = String(last).split('/'); if(parts.length>=2) return { year: parts[0], monthIndex: Number(parts[1]) - 1 }; }
    }
    // se nada encontrado, usar mês anterior ao atual
    const prev = new Date(hoje.getFullYear(), hoje.getMonth()-1, 1);
    return { year: String(prev.getFullYear()), monthIndex: prev.getMonth() };
  }catch(e){ const hoje = new Date(); const prev = new Date(hoje.getFullYear(), hoje.getMonth()-1, 1); return { year: String(prev.getFullYear()), monthIndex: prev.getMonth() }; }
}

// -------- Card "Fluxo financeiro" (ano completo) --------
let fluxoInstance = null;
function atualizarFluxoFinanceiro(){
  // Agora mostra o ano completo selecionado no topo (Janeiro..Dezembro)
  const anoSelecionado = (anoSelect && anoSelect.value) ? String(anoSelect.value) : String(new Date().getFullYear());
  const labels = [];
  const receitas = [];
  const gastos = [];
  const consolidados = [];

  for (let m = 0; m < 12; m++){
    labels.push(`${PT_MESES[m].slice(0,3)}`);
    const r = receitaBrutaMes(String(anoSelecionado), m);
    const g = despesaMes(String(anoSelecionado), m);
    receitas.push(r);
    gastos.push(g);
    consolidados.push(r - g);
  }

  // Calcular totais do ano
  const totalReceita = receitas.reduce((a, b) => a + b, 0);
  const totalDespesa = gastos.reduce((a, b) => a + b, 0);
  const saldoAnual = totalReceita - totalDespesa;
  const mesesComDados = receitas.filter(r => r > 0).length || 1;
  const mediaMensal = totalReceita / mesesComDados;

  // Atualizar resumo do ano
  const fluxoTotalReceitaEl = document.getElementById('fluxoTotalReceita');
  const fluxoTotalDespesaEl = document.getElementById('fluxoTotalDespesa');
  const fluxoSaldoAnualEl = document.getElementById('fluxoSaldoAnual');
  const fluxoMediaMensalEl = document.getElementById('fluxoMediaMensal');
  
  if (fluxoTotalReceitaEl) fluxoTotalReceitaEl.textContent = fmtBR(totalReceita);
  if (fluxoTotalDespesaEl) fluxoTotalDespesaEl.textContent = fmtBR(totalDespesa);
  if (fluxoSaldoAnualEl) {
    fluxoSaldoAnualEl.textContent = fmtBR(saldoAnual);
    fluxoSaldoAnualEl.className = 'text-lg font-bold ' + (saldoAnual >= 0 ? 'text-sky-600' : 'text-red-600');
  }
  if (fluxoMediaMensalEl) fluxoMediaMensalEl.textContent = fmtBR(mediaMensal);

  const el = document.getElementById('fluxoChart');
  if (!el) return;
  const ctx = el.getContext('2d');
  if (fluxoInstance) fluxoInstance.destroy();
  
  fluxoInstance = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        { type: 'bar', label: 'Receita', data: receitas, backgroundColor: 'rgba(16, 185, 129, 0.8)', borderRadius: 4 },
        { type: 'bar', label: 'Despesa', data: gastos, backgroundColor: 'rgba(239, 68, 68, 0.8)', borderRadius: 4 },
        { type: 'line', label: 'Saldo', data: consolidados, borderColor: '#0ea5e9', backgroundColor: 'rgba(14, 165, 233, 0.1)', fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: '#0ea5e9' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 5, bottom: 5, left: 0, right: 10 } },
      scales: { 
        y: { 
          beginAtZero: true, 
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { 
            font: { size: 9 },
            maxTicksLimit: 6,
            callback: function(val){ 
              try { return 'R$ ' + Number(val).toLocaleString('pt-BR', {minimumFractionDigits:0}); } 
              catch(e) { return 'R$ ' + val; } 
            } 
          } 
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 9 } }
        }
      },
      plugins: { 
        legend: { 
          display: true, 
          position: 'top',
          labels: { boxWidth: 10, padding: 6, font: { size: 9 } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.dataset.label + ': ' + fmtBR(context.raw);
            }
          }
        }
      }
    }
  });
}
function lerDespesas(){
  if (typeof SharedUtils !== 'undefined' && SharedUtils.lerDespesas) {
    return SharedUtils.lerDespesas();
  }
  try { return JSON.parse(localStorage.getItem('despesas')) || []; }
  catch(e){ console.warn('Erro lendo despesas', e); return []; }
}

function anoDe(anoMes){ return String(anoMes || '').split('/')[0] || ''; }
function mesNumDe(anoMes){
  const m = String(anoMes||'').split('/')[1];
  const n = Number(m);
  return (Number.isInteger(n) && n>=1 && n<=12) ? n-1 : null;
}

// Totais por mês
function receitaBrutaMes(ano, mIdx){
  if (typeof SharedUtils !== 'undefined' && SharedUtils.receitaBrutaMes) {
    return SharedUtils.receitaBrutaMes(ano, mIdx);
  }
  const dados = lerVendasResumo();
  let total = 0;
  for (const v of dados){
    if (!v.anoMes) continue;
    if (anoDe(v.anoMes) !== String(ano)) continue;
    const mi = mesNumDe(v.anoMes);
    if (mi === mIdx) total += Number(v.receitaBruta || 0);
  }
  return total;
}

// Sidebar navigation logic is in js/sidebar-nav.js
function despesaMes(ano, mIdx){
  if (typeof SharedUtils !== 'undefined' && SharedUtils.despesaMes) {
    return SharedUtils.despesaMes(ano, mIdx);
  }
  const dados = lerDespesas();
  let total = 0;
  const nomeMes = PT_MESES[mIdx];
  for (const d of dados){
    if (String(d.ano) !== String(ano)) continue;
    if (String(d.mes) !== String(nomeMes)) continue;
    total += Number(d.valor || 0);
  }
  return total;
}

function anosDisponiveis(){
  if (typeof SharedUtils !== 'undefined' && SharedUtils.anosDisponiveis) {
    return SharedUtils.anosDisponiveis();
  }
  const anos = new Set();
  for (const v of lerVendasResumo()){ if (v.anoMes) anos.add(anoDe(v.anoMes)); }
  for (const d of lerDespesas()){ if (d.ano) anos.add(String(d.ano)); }
  const arr = Array.from(anos).filter(Boolean).sort((a,b)=>Number(a)-Number(b));
  if (arr.length === 0) arr.push(String(new Date().getFullYear()));
  return arr;
}

// -------- UI: Ano + Cards --------
const anoSelect = document.getElementById('anoSelect');
const cardsMeses = document.getElementById('cardsMeses');

function montarAnoSelect(){
  anoSelect.innerHTML = '';
  const anos = anosDisponiveis();
  for (const a of anos){
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = a;
    anoSelect.appendChild(opt);
  }
  // Usa o último ano/mês com dados como padrão (não o ano atual)
  const ultimo = ultimoAnoMesComDados();
  if (ultimo && ultimo.year && [...anoSelect.options].some(o => o.value === String(ultimo.year))) {
    anoSelect.value = String(ultimo.year);
  } else if (anos.length > 0) {
    // Fallback: usa o último ano disponível
    anoSelect.value = anos[anos.length - 1];
  }
}

// selected month/year set by clicking a card. If null -> dashboard shows current month (or anoSelect value for year)
let selectedYear = null;
let selectedMonthIndex = null;

// define seleção inicial como o último mês com dados
(function definirSelecaoInicial(){
  try{
    const last = ultimoAnoMesComDados();
    if(last && last.year){ selectedYear = String(last.year); selectedMonthIndex = Number(last.monthIndex); }
  }catch(e){}
})();

function setSelectedMonth(year, mIdx){
  selectedYear = String(year);
  selectedMonthIndex = (mIdx === null || mIdx === undefined) ? null : Number(mIdx);
  // highlight card
  for (const c of Array.from(cardsMeses.children)){
    if (!c.dataset) continue;
    const cy = c.dataset.year;
    const cm = Number(c.dataset.month);
    if (selectedYear && cm === selectedMonthIndex && String(cy) === String(selectedYear)) c.classList.add('selected');
    else c.classList.remove('selected');
  }
  // refresh charts for new selection (não altera o fluxo financeiro que sempre mostra últimos 6 meses a partir do mês atual)
  atualizarResumoAtual();
  atualizarComparacao();
  atualizarParaAcontecer();
  atualizarTop5Despesas();
  // render synchronous attempt first (localStorage)
  atualizarVendasPorDiaSemana();
  atualizarVendasPorPeriodo();
  // se não houver dados no localStorage, tentar carregar do IndexedDB e re-renderizar quando pronto
  try{
    const maybe = carregarVendasResumoDia();
    if(!Array.isArray(maybe) || maybe.length===0){
      if (typeof carregarVendasResumoDiaAsync === 'function'){
        carregarVendasResumoDiaAsync().then(()=>{ try{ atualizarVendasPorDiaSemana(); atualizarVendasPorPeriodo(); setTimeout(alignChartBottomAxes, 80); }catch(e){} });
      }
    }
  }catch(e){}
}

// Calcula variação percentual entre dois valores
function calcularVariacao(atual, anterior) {
  if (anterior === 0) return atual > 0 ? 100 : 0;
  return ((atual - anterior) / anterior) * 100;
}

// Formata variação com seta e cor
function formatarVariacao(variacao) {
  const seta = variacao >= 0 ? '↑' : '↓';
  const cor = variacao >= 0 ? 'text-emerald-600' : 'text-red-500';
  const abs = Math.abs(variacao).toFixed(1);
  return `<span class="${cor} text-xs font-medium">${seta} ${abs}%</span>`;
}

function montarCardsMeses(){
  const ano = anoSelect.value || String(new Date().getFullYear());
  cardsMeses.innerHTML = '';

  PT_MESES.forEach((nome, idx) => {
    const r = receitaBrutaMes(ano, idx);
    const d = despesaMes(ano, idx);
    const saldo = r - d;
    const isPrejuizo = d > r && (r > 0 || d > 0);
    
    // Calcular mês anterior para variação
    const prevDate = new Date(Number(ano), idx, 1);
    prevDate.setMonth(prevDate.getMonth() - 1);
    const anoPrev = prevDate.getFullYear();
    const mPrev = prevDate.getMonth();
    const rPrev = receitaBrutaMes(anoPrev, mPrev);
    const dPrev = despesaMes(anoPrev, mPrev);
    
    // Variação da receita
    const varReceita = calcularVariacao(r, rPrev);
    const varReceitaHtml = (r > 0 || rPrev > 0) ? formatarVariacao(varReceita) : '';
    
    // Variação da despesa (invertida: aumento é ruim)
    const varDespesa = calcularVariacao(d, dPrev);
    const varDespesaHtml = (d > 0 || dPrev > 0) ? formatarVariacao(-varDespesa) : '';

    const card = document.createElement('div');
    card.className = "month-pill bg-white rounded-xl shadow p-4 flex flex-col justify-between card-hover" + (isPrejuizo ? ' prejuizo-card' : '');
    card.setAttribute('role','button');
    card.setAttribute('tabindex','0');
    card.dataset.month = String(idx);
    card.dataset.year = String(ano);
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-gray-500 text-sm">${nome.slice(0,3)} ${String(ano).slice(-2)}</span>
        ${isPrejuizo ? '<span class="badge-prejuizo" title="Despesas maiores que receitas">⚠️</span>' : ''}
      </div>
      <div class="mt-2 space-y-1">
        <div class="flex items-center gap-2 text-sm">
          <span class="inline-flex items-center justify-center rounded-full bg-green-100 text-green-700 w-5 h-5" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5l7 7h-4v7h-6v-7H5l7-7z" fill="currentColor"/></svg>
          </span>
          <span class="text-gray-700">Receita</span>
          <span class="ml-auto font-semibold text-gray-900">${fmtBR(r)}</span>
        </div>
        <div class="flex justify-end">${varReceitaHtml}</div>
        <div class="flex items-center gap-2 text-sm">
          <span class="inline-flex items-center justify-center rounded-full bg-red-100 text-red-600 w-5 h-5" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 19l-7-7h4V5h6v7h4l-7 7z" fill="currentColor"/></svg>
          </span>
          <span class="text-gray-700">Despesa</span>
          <span class="ml-auto font-semibold text-gray-900">${fmtBR(d)}</span>
        </div>
        <div class="flex justify-end">${varDespesaHtml}</div>
        <div class="flex items-center justify-between pt-2 border-t border-gray-100 mt-1">
          <span class="text-gray-600 text-xs">Saldo</span>
          <span class="font-bold text-sm ${saldo >= 0 ? 'text-sky-600' : 'text-red-600'}">${fmtBR(saldo)}</span>
        </div>
      </div>
    `;

    // click / keyboard support: set selection to this month
    card.addEventListener('click', ()=> setSelectedMonth(ano, idx));
    card.addEventListener('keydown', (e)=> { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedMonth(ano, idx); } });

    // if currently selected, mark
    if (selectedYear && selectedMonthIndex !== null && Number(selectedMonthIndex) === idx && String(selectedYear) === String(ano)){
      card.classList.add('selected');
    }

    cardsMeses.appendChild(card);
  });
}

// -------- Card "Até o momento" + Pizza Donut --------
let pizzaInstance = null;
function atualizarResumoAtual(){
  // if user selected a month, show that; otherwise use current month
  const hoje = new Date();
  const ano = selectedYear || anoSelect.value || hoje.getFullYear();
  const mIdx = (selectedMonthIndex !== null && selectedMonthIndex !== undefined) ? Number(selectedMonthIndex) : hoje.getMonth();

  const rec = receitaBrutaMes(ano, mIdx);
  const des = despesaMes(ano, mIdx);
  const luc = rec - des;
  const margem = rec > 0 ? ((luc / rec) * 100) : 0;

  document.getElementById('tituloMesAtual').textContent = `${PT_MESES[mIdx]} ${ano}`;
  document.getElementById('valorReceitaAtual').textContent = fmtBR(rec);
  document.getElementById('valorDespesaAtual').textContent = fmtBR(des);
  document.getElementById('valorLucroAtual').textContent = fmtBR(luc);
  
  // Atualizar badge de margem
  const margemValorEl = document.getElementById('margemValor');
  const margemBadgeEl = document.getElementById('margemBadge');
  if (margemValorEl) {
    margemValorEl.textContent = margem.toFixed(1) + '%';
  }
  if (margemBadgeEl) {
    if (margem >= 0) {
      margemBadgeEl.className = 'px-3 py-1 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-700';
    } else {
      margemBadgeEl.className = 'px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-700';
    }
  }

  const ctx = document.getElementById('pizzaAtual').getContext('2d');
  if (pizzaInstance) pizzaInstance.destroy();
  
  // Donut chart
  pizzaInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Receita', 'Despesa'],
      datasets: [{
        data: [rec, des],
        backgroundColor: ['#10b981', '#ef4444'],
        borderWidth: 0,
        cutout: '65%'
      }]
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      plugins: { 
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.label + ': ' + fmtBR(context.raw);
            }
          }
        }
      } 
    }
  });

  // Atualizar indicadores do mês
  atualizarIndicadoresMes(ano, mIdx, rec, des, luc);
}

// -------- Atualizar Indicadores do Mês --------
function atualizarIndicadoresMes(ano, mIdx, rec, des, luc) {
  // Calcular mês anterior para variações
  const prevDate = new Date(Number(ano), mIdx, 1);
  prevDate.setMonth(prevDate.getMonth() - 1);
  const anoPrev = prevDate.getFullYear();
  const mPrev = prevDate.getMonth();
  const recPrev = receitaBrutaMes(anoPrev, mPrev);
  const desPrev = despesaMes(anoPrev, mPrev);

  // Margem de Lucro
  const margem = rec > 0 ? (luc / rec * 100) : 0;
  const margemEl = document.getElementById('indicadorMargem');
  if (margemEl) {
    margemEl.textContent = margem.toFixed(1) + '%';
    margemEl.className = 'text-xl font-bold mt-1 ' + (margem >= 0 ? 'text-emerald-600' : 'text-red-600');
  }

  // Variação Receita
  const varReceita = calcularVariacao(rec, recPrev);
  const varReceitaEl = document.getElementById('indicadorVarReceita');
  if (varReceitaEl) {
    const seta = varReceita >= 0 ? '↑' : '↓';
    varReceitaEl.textContent = seta + ' ' + Math.abs(varReceita).toFixed(1) + '%';
    varReceitaEl.className = 'text-xl font-bold mt-1 ' + (varReceita >= 0 ? 'text-emerald-600' : 'text-red-600');
  }

  // Variação Despesa
  const varDespesa = calcularVariacao(des, desPrev);
  const varDespesaEl = document.getElementById('indicadorVarDespesa');
  if (varDespesaEl) {
    const seta = varDespesa >= 0 ? '↑' : '↓';
    varDespesaEl.textContent = seta + ' ' + Math.abs(varDespesa).toFixed(1) + '%';
    // Para despesa, aumento é ruim (vermelho), redução é bom (verde)
    varDespesaEl.className = 'text-xl font-bold mt-1 ' + (varDespesa <= 0 ? 'text-emerald-600' : 'text-red-600');
  }

  // Eficiência (Receita / Despesa)
  const eficiencia = des > 0 ? (rec / des * 100) : (rec > 0 ? 999 : 0);
  const eficienciaEl = document.getElementById('indicadorEficiencia');
  if (eficienciaEl) {
    eficienciaEl.textContent = eficiencia > 999 ? '∞' : eficiencia.toFixed(0) + '%';
    eficienciaEl.className = 'text-xl font-bold mt-1 ' + (eficiencia >= 100 ? 'text-purple-600' : 'text-amber-600');
  }
}

// -------- Card "Comparação" --------
let compInstance = null;
function atualizarComparacao(){
  // if user selected a month, compare that month with its previous month; otherwise use current month
  const hoje = new Date();
  const anoAtual = selectedYear || anoSelect.value || hoje.getFullYear();
  const mAtual = (selectedMonthIndex !== null && selectedMonthIndex !== undefined) ? Number(selectedMonthIndex) : hoje.getMonth();

  // mês anterior (ajusta ano se necessário)
  const prevDate = new Date(Number(anoAtual), mAtual, 1);
  prevDate.setMonth(prevDate.getMonth() - 1);
  const anoPrev = prevDate.getFullYear();
  const mPrev = prevDate.getMonth();

  const recAtual = receitaBrutaMes(anoAtual, mAtual);
  const desAtual = despesaMes(anoAtual, mAtual);
  const recPrev  = receitaBrutaMes(anoPrev, mPrev);
  const desPrev  = despesaMes(anoPrev, mPrev);

  // Calcular variações
  const varReceita = recPrev > 0 ? ((recAtual - recPrev) / recPrev * 100) : (recAtual > 0 ? 100 : 0);
  const varDespesa = desPrev > 0 ? ((desAtual - desPrev) / desPrev * 100) : (desAtual > 0 ? 100 : 0);

  // Atualizar indicadores de variação
  const varReceitaEl = document.getElementById('varReceitaComp');
  const varDespesaEl = document.getElementById('varDespesaComp');
  
  if (varReceitaEl) {
    const seta = varReceita >= 0 ? '↑' : '↓';
    varReceitaEl.textContent = `${seta} ${Math.abs(varReceita).toFixed(1)}%`;
    varReceitaEl.className = 'text-sm font-bold ' + (varReceita >= 0 ? 'text-emerald-600' : 'text-red-600');
    varReceitaEl.parentElement.className = 'rounded-lg p-2 text-center ' + (varReceita >= 0 ? 'bg-emerald-50' : 'bg-red-50');
  }
  
  if (varDespesaEl) {
    const seta = varDespesa >= 0 ? '↑' : '↓';
    varDespesaEl.textContent = `${seta} ${Math.abs(varDespesa).toFixed(1)}%`;
    // Para despesa: aumento é ruim (vermelho), redução é bom (verde)
    varDespesaEl.className = 'text-sm font-bold ' + (varDespesa <= 0 ? 'text-emerald-600' : 'text-red-600');
    varDespesaEl.parentElement.className = 'rounded-lg p-2 text-center ' + (varDespesa <= 0 ? 'bg-emerald-50' : 'bg-red-50');
  }

  const ctx = document.getElementById('comparacaoChart').getContext('2d');
  if (compInstance) compInstance.destroy();
  compInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [ `${PT_MESES[mPrev].slice(0,3)}/${String(anoPrev).slice(-2)}`, `${PT_MESES[mAtual].slice(0,3)}/${String(anoAtual).slice(-2)}` ],
      datasets: [
          { 
            label: 'Receita', 
            data: [recPrev, recAtual], 
            backgroundColor: ['rgba(16, 185, 129, 0.6)', 'rgba(16, 185, 129, 0.9)'],
            borderColor: ['#10b981', '#059669'],
            borderWidth: 2,
            borderRadius: 6,
            barPercentage: 0.7,
            categoryPercentage: 0.8
          },
          { 
            label: 'Despesa',  
            data: [desPrev, desAtual], 
            backgroundColor: ['rgba(239, 68, 68, 0.6)', 'rgba(239, 68, 68, 0.9)'],
            borderColor: ['#ef4444', '#dc2626'],
            borderWidth: 2,
            borderRadius: 6,
            barPercentage: 0.7,
            categoryPercentage: 0.8
          }
        ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 0, right: 5, top: 5, bottom: 0 } },
      scales: { 
        x: { 
          grid: { display: false }, 
          ticks: { font: { size: 10, weight: '500' } } 
        },
        y: { 
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { 
            font: { size: 9 },
            maxTicksLimit: 5,
            callback: function(val){ 
              try { return 'R$ ' + Number(val).toLocaleString('pt-BR', {minimumFractionDigits:0}); } 
              catch(e) { return 'R$ ' + val; } 
            } 
          } 
        }
      },
      plugins: { 
        legend: { 
          display: true, 
          position: 'bottom',
          labels: { boxWidth: 10, padding: 6, font: { size: 9 } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.dataset.label + ': ' + fmtBR(context.raw);
            }
          }
        }
      }
    }
  });
}

// -------- Card "Top 5 Despesas" (mês selecionado) --------
function atualizarTop5Despesas(){
  const containerEl = document.getElementById('top5DespesasContainer');
  if (!containerEl) return;

  const hoje = new Date();
  const anoRef = selectedYear || String(hoje.getFullYear());
  const mRef = (selectedMonthIndex !== null && selectedMonthIndex !== undefined) ? Number(selectedMonthIndex) : hoje.getMonth();

  const despesas = lerDespesas() || [];
  const despesasPorCategoria = {};

  for (const d of despesas){
    try {
      const anoD = String(d.ano);
      const mesD = String(d.mes);
      const mIdx = PT_MESES.indexOf(mesD);
      if (mIdx === -1) continue;
      if (String(anoRef) !== String(anoD)) continue;
      if (Number(mRef) !== Number(mIdx)) continue;

      // excluir taxas de vendas / MDR
      const cat = String(d.categoria || d.descricao || 'Outros');
      const catLower = cat.toLowerCase();
      if (catLower.includes('mdr') || catLower.includes('taxas de vendas')) continue;

      const valor = Number(d.valor || 0);
      if (!despesasPorCategoria[cat]) despesasPorCategoria[cat] = 0;
      despesasPorCategoria[cat] += valor;
    } catch (e) { /* ignorar item mal formado */ }
  }

  // Converter para array e ordenar por valor (maior primeiro)
  const ranking = Object.entries(despesasPorCategoria)
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);

  // Calcular total para percentual
  const totalDespesas = ranking.reduce((sum, item) => sum + item.valor, 0);

  // Cores para as barras
  const cores = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9'];

  if (ranking.length === 0) {
    containerEl.innerHTML = '<div class="text-sm text-gray-500 text-center py-4">Nenhuma despesa registrada para o mês.</div>';
    return;
  }

  let html = '<div class="space-y-3">';
  ranking.forEach((item, index) => {
    const pct = totalDespesas > 0 ? (item.valor / totalDespesas * 100) : 0;
    const cor = cores[index] || '#78716c';
    html += `
      <div class="top5-item">
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-medium text-gray-700 truncate flex-1" title="${item.categoria}">${item.categoria}</span>
          <span class="text-sm font-semibold text-gray-900 ml-2">${fmtBR(item.valor)}</span>
        </div>
        <div class="w-full bg-gray-100 rounded-full h-2">
          <div class="h-2 rounded-full transition-all duration-500" style="width: ${pct}%; background-color: ${cor};"></div>
        </div>
        <div class="text-xs text-gray-500 text-right mt-0.5">${pct.toFixed(1)}%</div>
      </div>
    `;
  });
  html += '</div>';

  // Total
  html += `
    <div class="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
      <span class="text-sm font-semibold text-gray-600">Total Top 5:</span>
      <span class="text-lg font-bold text-red-600">${fmtBR(totalDespesas)}</span>
    </div>
  `;

  containerEl.innerHTML = html;
}

// -------- Card "Despesas futuras" (mês selecionado) --------
function atualizarParaAcontecer(){
  const listaEl = document.getElementById('paraAcontecerList');
  const saldoEl = document.getElementById('paraAcontecerSaldo');
  const contadorEl = document.getElementById('contadorDespesas');
  if (!listaEl || !saldoEl) return;

  const hoje = new Date();
  // determinar mês/ano de referência: preferir seleção do card, senão mês atual
  const anoRef = selectedYear || String(hoje.getFullYear());
  const mRef = (selectedMonthIndex !== null && selectedMonthIndex !== undefined) ? Number(selectedMonthIndex) : hoje.getMonth();

  const despesas = lerDespesas() || [];
  const lista = [];

  for (const d of despesas){
    try {
      const anoD = String(d.ano);
      const mesD = String(d.mes);
      const mIdx = PT_MESES.indexOf(mesD);
      if (mIdx === -1) continue;
      // excluir taxas de vendas / MDR
      const cat = String(d.categoria || d.descricao || '').toLowerCase();
      if (cat.includes('mdr') || cat.includes('taxas de vendas')) continue;
      if (String(anoRef) !== String(anoD)) continue;
      if (Number(mRef) !== Number(mIdx)) continue;

      // se o mês selecionado for o mês atual, listar apenas despesas com dia >= hoje (ou sem dia definido)
      const dia = (d.dia === null || d.dia === undefined || d.dia === '') ? null : Number(d.dia);
      const isMesAtual = (Number(anoRef) === hoje.getFullYear() && Number(mRef) === hoje.getMonth());
      if (isMesAtual && dia !== null){
        if (dia < hoje.getDate()) continue; // já vencido no mês atual
      }

      lista.push({ descricao: d.descricao || d.categoria || 'Despesa', valor: Number(d.valor || 0), dia, categoria: d.categoria });
    } catch (e) { /* ignorar item mal formado */ }
  }

  // ordenar por dia (nulls no final)
  lista.sort((a,b)=>{ if (a.dia === null) return 1; if (b.dia === null) return -1; return a.dia - b.dia; });

  // Atualizar contador
  if (contadorEl) {
    contadorEl.textContent = lista.length;
    contadorEl.className = lista.length > 0 
      ? 'px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full'
      : 'px-2 py-1 bg-gray-100 text-gray-500 text-xs font-bold rounded-full';
  }

  listaEl.innerHTML = '';
  if (lista.length === 0){
    listaEl.innerHTML = `
      <div class="flex items-center justify-center py-3 text-gray-400">
        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span class="text-xs">Nenhuma despesa pendente</span>
      </div>
    `;
  } else {
    // Cores por categoria
    const coresCat = {
      'Aluguel': '#8b5cf6',
      'Energia': '#f59e0b', 
      'Água': '#0ea5e9',
      'Internet': '#6366f1',
      'Telefone': '#ec4899',
      'Contadora': '#14b8a6',
      'Suprimentos': '#f97316',
      'Manutenção': '#84cc16',
      'default': '#ef4444'
    };
    
    for (const it of lista){
      const cor = coresCat[it.categoria] || coresCat['default'];
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between py-1 px-1 rounded hover:bg-gray-50';
      row.innerHTML = `
        <div class="flex items-center gap-1.5 flex-1 min-w-0">
          <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background-color: ${cor}"></span>
          <span class="text-xs text-gray-700 truncate">${it.descricao}${it.dia ? ' • ' + it.dia : ''}</span>
        </div>
        <span class="text-xs font-semibold text-red-600 ml-1">${fmtBR(it.valor)}</span>
      `;
      listaEl.appendChild(row);
    }
  }

  // soma total
  const soma = lista.reduce((s,it)=> s + Number(it.valor || 0), 0);
  saldoEl.textContent = fmtBR(soma);
  saldoEl.className = 'text-base font-bold ' + (soma > 0 ? 'text-red-600' : 'text-gray-600');
}

// -------- Card "Vendas por Dia da Semana" --------
let vendasDiaSemanaInstance = null;
function parseVendaDate(v){
  // tenta várias chaves possíveis: data (ISO), date, createdAt, dia + anoMes
  try {
    if (!v) return null;
    if (v.data) return new Date(v.data);
    if (v.date) return new Date(v.date);
    if (v.createdAt) return new Date(v.createdAt);
    // se houver dia separado e anoMes (YYYY/MM) combinar
    if (v.dia != null && v.anoMes){
      const parts = String(v.anoMes).split('/');
      if(parts.length >= 2){
        const y = Number(parts[0]); const m = Number(parts[1]) - 1;
        const day = Number(v.dia);
        if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(day)) return new Date(y, m, day);
      }
    }
    // alguns registros podem ter ano, mes, dia separados
    if (v.ano && v.mes && v.dia){
      const y = Number(v.ano);
      const m = PT_MESES.indexOf(String(v.mes));
      const day = Number(v.dia);
      if (m !== -1) return new Date(y, m, day);
    }
  } catch(e){ return null; }
  return null;
}

function atualizarVendasPorDiaSemana(){
  const ctxEl = document.getElementById('vendasDiaSemanaChart');
  if (!ctxEl) return;

  const hoje = new Date();
  const anoRef = selectedYear || String(hoje.getFullYear());
  const mRef = (selectedMonthIndex !== null && selectedMonthIndex !== undefined) ? Number(selectedMonthIndex) : hoje.getMonth();

  // Usar vendasResumoDia como fonte — dessa forma o gráfico seguirá exatamente a tabela "Dia da semana" da página Receitas
  function getSomaSemanalPorMesFromResumoDia(anoMes){
    const zero = [0,0,0,0,0,0,0];
    if(!anoMes) return zero;
    try{
      const daily = carregarVendasResumoDia() || [];
      const out = [0,0,0,0,0,0,0];
      for(const d of daily){
        try{
          if(!d || !d.anoMesDia) continue;
          if(String(d.anoMes) !== String(anoMes)) continue;
          const parts = String(d.anoMesDia).split('/'); if(parts.length<3) continue;
          const y = Number(parts[0]); const m = Number(parts[1]) - 1; const day = Number(parts[2]);
          if(Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(day)) continue;
          const dt = new Date(y, m, day);
          const wd = dt.getDay();
          const v = Number(d.receitaBruta ?? d.valor ?? 0) || 0;
          out[wd] = (Number(out[wd]) || 0) + v;
        }catch(e){ /* ignore malformed daily */ }
      }
      return out;
    }catch(e){ return zero; }
  }

  const anoMesStr = `${String(anoRef)}/${String(mRef+1).padStart(2,'0')}`;
  const totals = getSomaSemanalPorMesFromResumoDia(anoMesStr);

  // Verifica se há vendas: se todos os totais forem zero, não há vendas
  const totalSum = totals.reduce((sum, v) => sum + (Number(v) || 0), 0);
  const hasVendas = totalSum > 0;

  const ctx = ctxEl.getContext('2d');
  if (vendasDiaSemanaInstance) {
    vendasDiaSemanaInstance.destroy();
    vendasDiaSemanaInstance = null;
  }

  // Se não houver vendas, limpa o canvas e não cria o gráfico
  if (!hasVendas) {
    const width = ctxEl.width || ctxEl.clientWidth || 400;
    const height = ctxEl.height || ctxEl.clientHeight || 200;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const labels = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  
  // Encontrar o melhor dia
  const maxVal = Math.max(...totals);
  const maxIdx = totals.indexOf(maxVal);
  
  // Cores distintas para cada dia da semana
  const coresDias = [
    'rgba(239, 68, 68, 0.8)',   // Dom - vermelho
    'rgba(59, 130, 246, 0.8)',  // Seg - azul
    'rgba(16, 185, 129, 0.8)',  // Ter - verde
    'rgba(245, 158, 11, 0.8)',  // Qua - amarelo/amber
    'rgba(139, 92, 246, 0.8)',  // Qui - roxo
    'rgba(236, 72, 153, 0.8)',  // Sex - rosa
    'rgba(20, 184, 166, 0.8)'   // Sáb - teal
  ];
  
  const borderDias = [
    '#dc2626',  // Dom
    '#2563eb',  // Seg
    '#059669',  // Ter
    '#d97706',  // Qua
    '#7c3aed',  // Qui
    '#db2777',  // Sex
    '#0d9488'   // Sáb
  ];
  
  // Destacar o melhor dia com cor mais vibrante
  const weekColors = coresDias.map((c, i) => i === maxIdx ? borderDias[i] : c);
  const borderColors = borderDias;

  vendasDiaSemanaInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ 
        label: 'Receita Bruta (R$)', 
        data: totals, 
        backgroundColor: weekColors,
        borderColor: borderColors,
        borderWidth: 2,
        borderRadius: 6,
        barPercentage: 0.8,
        categoryPercentage: 0.9
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { bottom: 10 } },
      scales: { 
        x: { 
          beginAtZero: true, 
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { 
            callback: function(val){ 
              try { return 'R$ ' + Number(val).toLocaleString('pt-BR', {minimumFractionDigits:0}); } 
              catch(e) { return 'R$ ' + val; } 
            },
            font: { size: 10 }
          } 
        },
        y: { 
          grid: { display: false },
          ticks: { autoSkip: false, font: { size: 11 } } 
        }
      },
      plugins: { 
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const pct = totalSum > 0 ? ((val / totalSum) * 100).toFixed(1) : 0;
              return `R$ ${val.toLocaleString('pt-BR', {minimumFractionDigits:2})} (${pct}%)`;
            },
            title: function(context) {
              const idx = context[0].dataIndex;
              return idx === maxIdx ? '⭐ ' + labels[idx] + ' (Melhor dia)' : labels[idx];
            }
          }
        }
      }
    }
  });
}

// -------- Card "Vendas por período do dia" --------
let vendasPeriodoInstance = null;

// --- minimal IndexedDB helpers (same contract as in receitas.html) ---
function idbOpen(){
  return new Promise((resolve,reject)=>{
    if(!window.indexedDB){ return reject(new Error('IndexedDB não suportado')); }
    const req = indexedDB.open('irancash_db', 1);
    req.onupgradeneeded = function(e){ try{ const db = e.target.result; if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv',{ keyPath: 'k' }); }catch(err){} };
    req.onsuccess = function(e){ resolve(e.target.result); };
    req.onerror = function(e){ reject(e.target.error || new Error('IndexedDB open error')); };
  });
}
function idbGet(k){
  try{
    return idbOpen().then(db => new Promise((res, rej)=>{
      try{
        const tx = db.transaction('kv','readonly');
        const store = tx.objectStore('kv');
        const req = store.get(String(k));
        req.onsuccess = function(ev){ try{ db.close(); }catch(e){} const out = ev.target.result; res(out? out.v : null); };
        req.onerror = function(ev){ try{ db.close(); }catch(e){} rej(ev.target.error || new Error('idb get failed')); };
      }catch(err){ try{ db.close(); }catch(e){} rej(err); }
    }));
  }catch(e){ return Promise.reject(e); }
}

// tentativa assíncrona de carregar vendasResumoDia a partir do IndexedDB e popular a memória/localStorage se possível
function carregarVendasResumoDiaAsync(){
  return Promise.resolve().then(async ()=>{
    try{
      if(!window.indexedDB) return [];
      const data = await idbGet('vendasResumoDia');
      if(!data) return [];
      const payload = data.data || data;
      if(!Array.isArray(payload)) return [];
      // expand compact format if needed (a,b,c)
      const expanded = payload.map(it => {
        try{ return { anoMesDia: it.a || it.date || '', anoMes: (it.a||'').slice(0,7), receitaBruta: (it.b!=null)?(Number(it.b)/100):Number(it.receitaBruta||0), mdr: (it.c!=null)?(Number(it.c)/100):Number(it.mdr||0), receitaLiquida: (it.b!=null && it.c!=null)?((Number(it.b)-Number(it.c))/100):Number(it.receitaLiquida||0), source: it.s||'', tipoPagamento: it.p||'' }; }catch(e){ return it; }
      });
      try{ window._vendasResumoDia_inMemory = expanded.slice(); }catch(e){}
      // also write a compact copy to localStorage to help sync loaders (best-effort)
      try{ localStorage.setItem('vendasResumoDia', JSON.stringify(payload)); localStorage.setItem('vendasResumoDia_last_update', String(Date.now())); }catch(e){}
      return expanded;
    }catch(e){ return []; }
  });
}

// tenta carregar vendasDetalhadas do localStorage suportando formatos compact/ultra/canônico
function carregarVendasDetalhadasFromLS(){
  // Tenta usar a função global do receitas.js se disponível (síncrona)
  // Isso garante consistência com o que o receitas.js vê
  if (typeof window.carregarVendasDetalhadas === 'function') {
      const globalData = window.carregarVendasDetalhadas();
      if (globalData && globalData.length > 0) return globalData;
  }
  
  try {
    // 1. Tentar ler chunks (formato fragmentado para grandes volumes)
    const chunksMeta = localStorage.getItem('vendasDetalhadas_chunks');
    if (chunksMeta) {
        try {
            const keys = JSON.parse(chunksMeta) || [];
            let out = [];
            for (const k of keys) {
                try { 
                    const part = JSON.parse(localStorage.getItem(k) || '[]'); 
                    if (Array.isArray(part)) out = out.concat(part); 
                } catch(e) {}
            }
            // Expandir formato compacto se necessário
            if (out.length > 0) {
                const first = out[0];
                // Formato objeto compacto {d, t, v...}
                if (first && (first.d !== undefined || first.v !== undefined)) {
                     return out.map(it => ({ 
                         date: it.d||'', 
                         time: it.t||'', 
                         dateMs: (it.ms!=null)?Number(it.ms):null, 
                         valorBruto: (it.v!=null)?(Number(it.v)/100):0, 
                         mdr: (it.m!=null)?(Number(it.m)/100):0, 
                         source: it.s||'', 
                         tipoPagamento: it.p||'', 
                         id: it.id||'' 
                     }));
                }
                // Formato array ultra-compacto [d, t, v...]
                if (Array.isArray(first)) {
                     return out.map(a => ({ 
                         date: a[0]||'', 
                         time: a[1]||'', 
                         dateMs: null, 
                         valorBruto: (a[2]!=null)?Number(a[2])/100:0, 
                         source: a[3]||'', 
                         tipoPagamento: a[4]||'', 
                         mdr: (a[5]!=null)?Number(a[5])/100:0, 
                         id: `${a[0]||''} ${a[1]||''}||${((a[2]!=null)?(Number(a[2])/100).toFixed(2):'0.00')}||${a[3]||''}||${a[4]||''}` 
                     }));
                }
            }
            return out;
        } catch(e) {}
    }

    // 2. Fallback para chave única (formato legado ou pequeno volume)
    const raw = JSON.parse(localStorage.getItem('vendasDetalhadas') || '[]') || [];
    if(!Array.isArray(raw)) return [];
    if(raw.length===0) return [];
    const first = raw[0];
    // compact object format: {d,t,ms,v,s,p,m,id}
    if(first && (first.d !== undefined || first.v !== undefined)){
      return raw.map(it => ({ date: it.d||'', time: it.t||'', dateMs: (it.ms!=null)?Number(it.ms):null, valorBruto: (it.v!=null)?(Number(it.v)/100):0, mdr: (it.m!=null)?(Number(it.m)/100):0, source: it.s||'', tipoPagamento: it.p||'', id: it.id||'' }));
    }
    // ultra-compact array format: [d,t,vCents,source,tipo,mdrCents]
    if(Array.isArray(first)){
      return raw.map(a => ({ date: a[0]||'', time: a[1]||'', dateMs: null, valorBruto: (a[2]!=null)?Number(a[2])/100:0, source: a[3]||'', tipoPagamento: a[4]||'', mdr: (a[5]!=null)?Number(a[5])/100:0, id: `${a[0]||''} ${a[1]||''}||${((a[2]!=null)?(Number(a[2])/100).toFixed(2):'0.00')}||${a[3]||''}||${a[4]||''}` }));
    }
    // assume canonical objects already
    return raw.map(it => it || {});
  }catch(e){ return []; }
}

function getPeriodoDoDiaLocal(timeStr){
  // Usa função compartilhada se disponível, senão usa lógica local (legado)
  if (typeof window.getPeriodoDoDia === 'function') {
    return window.getPeriodoDoDia(timeStr);
  }
  try{
    if(!timeStr) return null;
    const s = String(timeStr).trim().replace('h',':');
    const m = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if(!m){
      const dt = new Date(s);
      if(dt && !isNaN(dt.getTime())){
        const hh = dt.getHours(), mm = dt.getMinutes(), ss = dt.getSeconds();
        const t = hh*3600 + mm*60 + ss;
        if(t>=0 && t<=5*3600+59*60+59) return 'Madrugada';
        if(t>=6*3600 && t<=11*3600+59*60+59) return 'Manhã';
        if(t>=12*3600 && t<=17*3600+59*60+59) return 'Tarde';
        if(t>=18*3600 && t<=24*3600) return 'Noite';
        return 'Madrugada';
      }
      return null;
    }
    const hh = Number(m[1]||0), mm = Number(m[2]||0), ss = Number(m[3]||0);
    const t = hh*3600 + mm*60 + ss;
    if(t>=0 && t<=5*3600+59*60+59) return 'Madrugada';
    if(t>=6*3600 && t<=11*3600+59*60+59) return 'Manhã';
    if(t>=12*3600 && t<=17*3600+59*60+59) return 'Tarde';
    if(t>=18*3600 && t<=24*3600) return 'Noite';
    return 'Madrugada';
  }catch(e){ return null; }
}

function getSomaPeriodoPorMesFromDetalhes(anoMes, dadosDetalhados = null){
  const zero = { 'Madrugada':0, 'Manhã':0, 'Tarde':0, 'Noite':0 };
  if(!anoMes) return zero;
  try{
    const detalhes = dadosDetalhados || carregarVendasDetalhadasFromLS();
    const out = { ...zero };
    for(const tx of detalhes){
      if(!tx) continue;
      let d = null;
      if(tx.dateMs) d = new Date(Number(tx.dateMs)); else if(tx.date) d = new Date(tx.date);
      if(!d || isNaN(d.getTime())){
        try{ const parsed = new Date(String(tx.date||'')); if(parsed && !isNaN(parsed.getTime())) d = parsed; }catch(e){}
      }
      if(!d || isNaN(d.getTime())) continue;
      const ym = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;
      if(String(ym) !== String(anoMes)) continue;
      let timeStr = tx.time || '';
      if(!timeStr){ const hh = d.getHours(), mm = d.getMinutes(), ss = d.getSeconds(); timeStr = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; }
      if(timeStr === '00:00:00') timeStr = null;
      const periodo = getPeriodoDoDiaLocal(timeStr);
      const valor = Number(tx.valorBruto || tx.value || tx.valor || tx.receitaBruta || 0) || 0;
      if(periodo && (periodo in out)) out[periodo] = (Number(out[periodo])||0) + valor;
    }
    return out;
  }catch(e){ return zero; }
}

async function atualizarVendasPorPeriodo(){
  const container = document.getElementById('vendas-periodo-conteudo');
  if(!container) return;
  let canvas = document.getElementById('vendasPeriodoChart');
  if(!canvas){
    container.innerHTML = '<canvas id="vendasPeriodoChart" style="height: 200px;"></canvas>';
    canvas = document.getElementById('vendasPeriodoChart');
  }

  const hoje = new Date();
  const anoRef = selectedYear || String(hoje.getFullYear());
  const mRef = (selectedMonthIndex !== null && selectedMonthIndex !== undefined) ? Number(selectedMonthIndex) : hoje.getMonth();
  const anoMesStr = `${String(anoRef)}/${String(mRef+1).padStart(2,'0')}`;
  
  // Tentar carregar dados detalhados se estiverem vazios no LocalStorage
  let dadosDetalhados = null;
  try {
      // Prioridade: usar o adaptador do Firebase se disponível (ele sabe lidar com chunks e cache)
      if (typeof window.carregarVendasDetalhadasAsync === 'function') {
          dadosDetalhados = await window.carregarVendasDetalhadasAsync();
      } else {
          // Fallback: tentar ler do LocalStorage ou DataStore manualmente
          const fromLS = carregarVendasDetalhadasFromLS();
          if (!fromLS || fromLS.length === 0) {
              if (window.IRANCASH && window.IRANCASH.DataStore) {
                  // Nota: isso pode falhar se os dados estiverem em chunks (formato complexo)
                  // Por isso adicionamos js/receitas-firebase-adapter.js ao dashboard.html
                  const raw = await window.IRANCASH.DataStore.getItemAsync('vendasDetalhadas', []);
                  if (Array.isArray(raw) && raw.length > 0) {
                      try {
                          localStorage.setItem('vendasDetalhadas', JSON.stringify(raw));
                          dadosDetalhados = carregarVendasDetalhadasFromLS(); 
                      } catch(e) {}
                  }
              }
          } else {
              dadosDetalhados = fromLS;
          }
      }
  } catch(e) { console.warn('Erro ao tentar carregar vendas detalhadas async', e); }

  const sums = getSomaPeriodoPorMesFromDetalhes(anoMesStr, dadosDetalhados);

  const labels = ['Madrugada','Manhã','Tarde','Noite'];
  const icones = ['🌙','☀️','🌤️','🌃'];
  const data = labels.map(l => Number(sums[l]||0));
  const total = data.reduce((a,b) => a+b, 0);
  
  // Encontrar melhor período
  const maxVal = Math.max(...data);
  const maxIdx = data.indexOf(maxVal);
  
  // Cores base
  const baseColors = [
    'rgba(99, 102, 241, 0.7)',   // Madrugada - índigo
    'rgba(251, 191, 36, 0.7)',   // Manhã - amber
    'rgba(16, 185, 129, 0.7)',   // Tarde - emerald
    'rgba(99, 102, 241, 0.7)'    // Noite - índigo
  ];
  
  // Destaque para o melhor período
  const colors = data.map((v, i) => i === maxIdx && total > 0 ? '#10b981' : baseColors[i]);
  const borderColors = data.map((v, i) => i === maxIdx && total > 0 ? '#059669' : 'transparent');

  const ctx = canvas.getContext('2d');
  if (vendasPeriodoInstance) vendasPeriodoInstance.destroy();
  
  vendasPeriodoInstance = new Chart(ctx, {
    type: 'bar',
    data: { 
      labels: labels.map((l, i) => `${icones[i]} ${l}`), 
      datasets: [{ 
        label: 'Receita Bruta (R$)', 
        data, 
        backgroundColor: colors,
        borderColor: borderColors,
        borderWidth: 2,
        borderRadius: 6
      }] 
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false,
      scales: { 
        y: { 
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { 
            callback: function(val){ 
              try { return 'R$ ' + Number(val).toLocaleString('pt-BR', {minimumFractionDigits:0}); } 
              catch(e) { return 'R$ ' + val; } 
            },
            font: { size: 10 }
          } 
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 } }
        }
      }, 
      plugins: { 
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const val = ctx.raw;
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
              return `R$ ${val.toLocaleString('pt-BR', {minimumFractionDigits:2})} (${pct}%)`;
            },
            title: function(context) {
              const idx = context[0].dataIndex;
              return idx === maxIdx && total > 0 ? '⭐ ' + labels[idx] + ' (Melhor)' : labels[idx];
            }
          }
        }
      }
    }
  });
}

// Alinha os eixos X/Y inferiores dos dois charts para que ocupem exatamente a mesma linha
function alignChartBottomAxes(){
  try{
    if(!vendasPeriodoInstance || !vendasDiaSemanaInstance) return;
    // garantir que chartArea esteja disponível
    const pArea = vendasPeriodoInstance.chartArea || (vendasPeriodoInstance.scales && vendasPeriodoInstance.scales.y && { bottom: vendasPeriodoInstance.scales.y.bottom });
    const wArea = vendasDiaSemanaInstance.chartArea || (vendasDiaSemanaInstance.scales && vendasDiaSemanaInstance.scales.x && { bottom: vendasDiaSemanaInstance.scales.x.bottom });
    if(!pArea || !wArea) return;
    const pBottom = Number(pArea.bottom || 0);
    const wBottom = Number(wArea.bottom || 0);
    const diff = Math.round(pBottom - wBottom);
    if(diff === 0) return;
    // aplicar padding no que tiver bottom menor
    if(diff > 0){
      // periodo está mais baixo -> aumentar padding bottom do gráfico semanal
      vendasDiaSemanaInstance.options.layout = vendasDiaSemanaInstance.options.layout || {};
      vendasDiaSemanaInstance.options.layout.padding = vendasDiaSemanaInstance.options.layout.padding || {};
      const prev = Number(vendasDiaSemanaInstance.options.layout.padding.bottom || 0);
      vendasDiaSemanaInstance.options.layout.padding.bottom = prev + diff;
      vendasDiaSemanaInstance.update();
    } else {
      // semana está mais baixo -> aumentar padding bottom do gráfico de periodo
      vendasPeriodoInstance.options.layout = vendasPeriodoInstance.options.layout || {};
      vendasPeriodoInstance.options.layout.padding = vendasPeriodoInstance.options.layout.padding || {};
      const prev = Number(vendasPeriodoInstance.options.layout.padding.bottom || 0);
      vendasPeriodoInstance.options.layout.padding.bottom = prev + Math.abs(diff);
      vendasPeriodoInstance.update();
    }
  }catch(e){ /* swallow */ }
}

// -------- ANÁLISE 1: Projeção do Mês --------
function atualizarProjecaoMes() {
  const hoje = new Date();
  const ano = selectedYear || anoSelect.value || hoje.getFullYear();
  const mIdx = (selectedMonthIndex !== null && selectedMonthIndex !== undefined) ? Number(selectedMonthIndex) : hoje.getMonth();
  
  // Só calcular projeção se for o mês atual
  const isMesAtual = (Number(ano) === hoje.getFullYear() && Number(mIdx) === hoje.getMonth());
  
  const diasNoMes = new Date(ano, mIdx + 1, 0).getDate();
  const diaAtual = isMesAtual ? hoje.getDate() : diasNoMes;
  const diasRestantes = isMesAtual ? (diasNoMes - diaAtual) : 0;
  
  const recAtual = receitaBrutaMes(ano, mIdx);
  const desAtual = despesaMes(ano, mIdx);
  
  // Calcular média diária e projetar
  const mediaDiariaRec = diaAtual > 0 ? recAtual / diaAtual : 0;
  const mediaDiariaDesp = diaAtual > 0 ? desAtual / diaAtual : 0;
  
  const receitaProjetada = isMesAtual ? (mediaDiariaRec * diasNoMes) : recAtual;
  const despesaProjetada = isMesAtual ? (mediaDiariaDesp * diasNoMes) : desAtual;
  const saldoProjetado = receitaProjetada - despesaProjetada;
  
  // Atualizar DOM
  const diasRestantesEl = document.getElementById('diasRestantes');
  const receitaProjetadaEl = document.getElementById('receitaProjetada');
  const despesaProjetadaEl = document.getElementById('despesaProjetada');
  const saldoProjetadoEl = document.getElementById('saldoProjetado');
  
  if (diasRestantesEl) diasRestantesEl.textContent = isMesAtual ? `${diasRestantes} dias restantes` : 'Mês encerrado';
  if (receitaProjetadaEl) receitaProjetadaEl.textContent = fmtBR(receitaProjetada);
  if (despesaProjetadaEl) despesaProjetadaEl.textContent = fmtBR(despesaProjetada);
  if (saldoProjetadoEl) {
    saldoProjetadoEl.textContent = fmtBR(saldoProjetado);
    saldoProjetadoEl.className = 'text-base font-bold ' + (saldoProjetado >= 0 ? 'text-sky-600' : 'text-red-600');
  }
}

// -------- ANÁLISE 2: Meta de Receita --------
function carregarMeta() {
  try {
    const metas = JSON.parse(localStorage.getItem('metasReceita') || '{}');
    const ano = selectedYear || new Date().getFullYear();
    const mIdx = (selectedMonthIndex !== null && selectedMonthIndex !== undefined) ? Number(selectedMonthIndex) : new Date().getMonth();
    const chave = `${ano}-${mIdx}`;
    return Number(metas[chave] || 0);
  } catch(e) { return 0; }
}

function salvarMeta(valor) {
  try {
    const metas = JSON.parse(localStorage.getItem('metasReceita') || '{}');
    const ano = selectedYear || new Date().getFullYear();
    const mIdx = (selectedMonthIndex !== null && selectedMonthIndex !== undefined) ? Number(selectedMonthIndex) : new Date().getMonth();
    const chave = `${ano}-${mIdx}`;
    metas[chave] = valor;
    localStorage.setItem('metasReceita', JSON.stringify(metas));
  } catch(e) { console.warn('Erro salvando meta', e); }
}

function atualizarMeta() {
  const ano = selectedYear || new Date().getFullYear();
  const mIdx = (selectedMonthIndex !== null && selectedMonthIndex !== undefined) ? Number(selectedMonthIndex) : new Date().getMonth();
  
  const meta = carregarMeta();
  const recAtual = receitaBrutaMes(ano, mIdx);
  const percentual = meta > 0 ? Math.min((recAtual / meta) * 100, 150) : 0;
  
  const valorMetaEl = document.getElementById('valorMeta');
  const barraEl = document.getElementById('barraProgressoMeta');
  const percentualEl = document.getElementById('percentualMeta');
  const statusEl = document.getElementById('statusMeta');
  
  if (valorMetaEl) valorMetaEl.textContent = meta > 0 ? fmtBR(meta) : 'Não definida';
  if (barraEl) barraEl.style.width = `${Math.min(percentual, 100)}%`;
  if (percentualEl) {
    percentualEl.textContent = meta > 0 ? `${percentual.toFixed(1)}%` : '--';
    percentualEl.className = 'font-bold ' + (percentual >= 100 ? 'text-emerald-600' : percentual >= 70 ? 'text-amber-600' : 'text-red-600');
  }
  if (statusEl) {
    if (meta <= 0) {
      statusEl.textContent = 'Defina uma meta';
      statusEl.className = 'text-xs text-center py-1 px-2 rounded-full bg-gray-100 text-gray-600';
    } else if (percentual >= 100) {
      statusEl.textContent = '🎉 Meta atingida!';
      statusEl.className = 'text-xs text-center py-1 px-2 rounded-full bg-emerald-100 text-emerald-700';
    } else if (percentual >= 70) {
      statusEl.textContent = '💪 Quase lá!';
      statusEl.className = 'text-xs text-center py-1 px-2 rounded-full bg-amber-100 text-amber-700';
    } else {
      const falta = meta - recAtual;
      statusEl.textContent = `Faltam ${fmtBR(falta)}`;
      statusEl.className = 'text-xs text-center py-1 px-2 rounded-full bg-sky-100 text-sky-700';
    }
  }
}

// Botão editar meta
const btnEditarMeta = document.getElementById('btnEditarMeta');
if (btnEditarMeta) {
  btnEditarMeta.addEventListener('click', () => {
    const metaAtual = carregarMeta();
    const novaMetaStr = prompt('Digite a meta de receita para este mês:', metaAtual > 0 ? metaAtual.toString() : '');
    if (novaMetaStr !== null) {
      const novaMeta = parseFloat(novaMetaStr.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
      salvarMeta(novaMeta);
      atualizarMeta();
    }
  });
}

// -------- ANÁLISE 3: Comparativo Anual --------
function atualizarComparativoAnual() {
  const anoAtual = Number(selectedYear || anoSelect.value || new Date().getFullYear());
  const anoAnterior = anoAtual - 1;
  
  // Calcular receita total de cada ano
  let receitaAtual = 0;
  let receitaAnterior = 0;
  
  for (let m = 0; m < 12; m++) {
    receitaAtual += receitaBrutaMes(anoAtual, m);
    receitaAnterior += receitaBrutaMes(anoAnterior, m);
  }
  
  // Calcular crescimento
  const crescimento = receitaAnterior > 0 
    ? ((receitaAtual - receitaAnterior) / receitaAnterior * 100) 
    : (receitaAtual > 0 ? 100 : 0);
  
  // Atualizar DOM
  const comparativoAnosEl = document.getElementById('comparativoAnos');
  const receitaAtualEl = document.getElementById('receitaAnoAtual');
  const receitaAnteriorEl = document.getElementById('receitaAnoAnterior');
  const crescimentoEl = document.getElementById('crescimentoAnual');
  const statusEl = document.getElementById('statusCrescimento');
  
  if (comparativoAnosEl) comparativoAnosEl.textContent = `${anoAtual} vs ${anoAnterior}`;
  if (receitaAtualEl) receitaAtualEl.textContent = fmtBR(receitaAtual);
  if (receitaAnteriorEl) receitaAnteriorEl.textContent = fmtBR(receitaAnterior);
  
  if (crescimentoEl) {
    const seta = crescimento > 0 ? '↑' : crescimento < 0 ? '↓' : '';
    crescimentoEl.textContent = `${seta} ${Math.abs(crescimento).toFixed(1)}%`;
    crescimentoEl.className = 'text-base font-bold ' + 
      (crescimento > 0 ? 'text-emerald-600' : crescimento < 0 ? 'text-red-600' : 'text-gray-600');
  }
  
  if (statusEl) {
    if (receitaAnterior === 0 && receitaAtual === 0) {
      statusEl.textContent = 'Sem dados para comparar';
      statusEl.className = 'text-xs text-center py-1 px-2 rounded-full bg-gray-100 text-gray-600 mt-2';
    } else if (receitaAnterior === 0) {
      statusEl.textContent = '🆕 Primeiro ano com dados';
      statusEl.className = 'text-xs text-center py-1 px-2 rounded-full bg-sky-100 text-sky-700 mt-2';
    } else if (crescimento >= 20) {
      statusEl.textContent = '🚀 Crescimento excelente!';
      statusEl.className = 'text-xs text-center py-1 px-2 rounded-full bg-emerald-100 text-emerald-700 mt-2';
    } else if (crescimento >= 0) {
      statusEl.textContent = '📈 Ano positivo';
      statusEl.className = 'text-xs text-center py-1 px-2 rounded-full bg-emerald-100 text-emerald-700 mt-2';
    } else if (crescimento >= -10) {
      statusEl.textContent = '⚠️ Leve queda';
      statusEl.className = 'text-xs text-center py-1 px-2 rounded-full bg-amber-100 text-amber-700 mt-2';
    } else {
      statusEl.textContent = '📉 Atenção: queda significativa';
      statusEl.className = 'text-xs text-center py-1 px-2 rounded-full bg-red-100 text-red-700 mt-2';
    }
  }
}

// -------- ANÁLISE 4: Ranking de Meses --------
function atualizarRankingMeses() {
  const ano = selectedYear || anoSelect.value || new Date().getFullYear();
  
  const meses = [];
  for (let m = 0; m < 12; m++) {
    const rec = receitaBrutaMes(ano, m);
    const desp = despesaMes(ano, m);
    const lucro = rec - desp;
    if (rec > 0 || desp > 0) {
      meses.push({ mes: m, nome: PT_MESES[m], rec, desp, lucro });
    }
  }
  
  if (meses.length === 0) {
    // Sem dados
    ['rankMaiorReceita', 'rankMenorReceita', 'rankMaiorLucro', 'rankMaiorDespesa'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '--';
    });
    ['rankMaiorReceitaValor', 'rankMenorReceitaValor', 'rankMaiorLucroValor', 'rankMaiorDespesaValor'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = 'R$ 0,00';
    });
    return;
  }
  
  // Encontrar rankings
  const maiorReceita = meses.reduce((a, b) => a.rec > b.rec ? a : b);
  const menorReceita = meses.reduce((a, b) => a.rec < b.rec ? a : b);
  const maiorLucro = meses.reduce((a, b) => a.lucro > b.lucro ? a : b);
  const maiorDespesa = meses.reduce((a, b) => a.desp > b.desp ? a : b);
  
  // Atualizar DOM
  const updateRank = (idNome, idValor, item, valorKey) => {
    const nomeEl = document.getElementById(idNome);
    const valorEl = document.getElementById(idValor);
    if (nomeEl) nomeEl.textContent = item.nome;
    if (valorEl) valorEl.textContent = fmtBR(item[valorKey]);
  };
  
  updateRank('rankMaiorReceita', 'rankMaiorReceitaValor', maiorReceita, 'rec');
  updateRank('rankMenorReceita', 'rankMenorReceitaValor', menorReceita, 'rec');
  updateRank('rankMaiorLucro', 'rankMaiorLucroValor', maiorLucro, 'lucro');
  updateRank('rankMaiorDespesa', 'rankMaiorDespesaValor', maiorDespesa, 'desp');
}

// -------- Boot --------
function refreshAll(){
  montarCardsMeses();
  atualizarResumoAtual();
  atualizarComparacao();
  atualizarFluxoFinanceiro();
  atualizarParaAcontecer();
  atualizarTop5Despesas();
  atualizarVendasPorDiaSemana();
  // Novas análises
  atualizarProjecaoMes();
  atualizarMeta();
  atualizarComparativoAnual();
  atualizarRankingMeses();
  
  // Novos Gráficos (restaurados)
  atualizarNovosGraficos();

  // atualizar também o gráfico de períodos (Madrugada/Manhã/Tarde/Noite)
  // para que a visualização esteja sincronizada com o mês selecionado
  if (typeof atualizarVendasPorPeriodo === 'function') atualizarVendasPorPeriodo();
  // update arrows in case size changed after mounting cards
  setTimeout(updateArrowState, 120);
  // depois de ajustar setas, alinhar eixos dos charts para mesma baseline
  setTimeout(alignChartBottomAxes, 160);
  // Adicionar animações aos cards
  setTimeout(aplicarAnimacoesCards, 50);
}

// -------- NOVOS GRÁFICOS RESTAURADOS --------
let receitaAnualInstance = null;
let despesasPizzaInstance = null;
let lucroMensalInstance = null;
let margensInstance = null;

function atualizarNovosGraficos() {
  const ano = selectedYear || anoSelect.value || new Date().getFullYear();
  const mAtual = (selectedMonthIndex !== null && selectedMonthIndex !== undefined) ? Number(selectedMonthIndex) : new Date().getMonth();

  // Dados Anuais
  const labels = [];
  const receitas = [];
  const despesas = [];
  const lucros = [];
  const margens = [];

  for (let m = 0; m < 12; m++) {
    labels.push(PT_MESES[m].slice(0, 3));
    const r = receitaBrutaMes(ano, m);
    const d = despesaMes(ano, m);
    receitas.push(r);
    despesas.push(d);
    lucros.push(r - d);
    margens.push(r > 0 ? ((r - d) / r) * 100 : 0);
  }

  // 1. Receita vs Despesas (Barra Agrupada)
  const ctxRec = document.getElementById('receitaAnualChart');
  if (ctxRec) {
    if (receitaAnualInstance) receitaAnualInstance.destroy();
    receitaAnualInstance = new Chart(ctxRec.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Receita', data: receitas, backgroundColor: '#10b981', borderRadius: 4 },
          { label: 'Despesa', data: despesas, backgroundColor: '#ef4444', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // 2. Composição das Despesas (Pizza do Mês Selecionado)
  const ctxPizza = document.getElementById('despesasPizzaChart');
  if (ctxPizza) {
    // Calcular despesas por categoria do mês
    const despesasLista = lerDespesas() || [];
    const catMap = {};
    despesasLista.forEach(d => {
      if (String(d.ano) === String(ano) && PT_MESES.indexOf(d.mes) === mAtual) {
        catMap[d.categoria] = (catMap[d.categoria] || 0) + Number(d.valor || 0);
      }
    });
    
    // Se não tiver dados no mês, mostrar vazio
    const labelsPizza = Object.keys(catMap);
    const dataPizza = Object.values(catMap);

    if (despesasPizzaInstance) despesasPizzaInstance.destroy();
    despesasPizzaInstance = new Chart(ctxPizza.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: labelsPizza.length ? labelsPizza : ['Sem dados'],
        datasets: [{
          data: dataPizza.length ? dataPizza : [1],
          backgroundColor: dataPizza.length ? ['#ef4444', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#6366f1', '#ec4899'] : ['#e5e7eb']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { boxWidth: 10 } } }
      }
    });
  }

  // 3. Lucro Líquido Mensal (Linha)
  const ctxLucro = document.getElementById('lucroMensalChart');
  if (ctxLucro) {
    if (lucroMensalInstance) lucroMensalInstance.destroy();
    lucroMensalInstance = new Chart(ctxLucro.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Lucro Líquido',
          data: lucros,
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14, 165, 233, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: false,
            ticks: {
              callback: function(val){ return fmtBR(val); }
            }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context){
                return context.dataset.label + ': ' + fmtBR(context.raw);
              }
            }
          }
        }
      }
    });
  }

  // 4. Evolução das Margens (Linha)
  const ctxMargem = document.getElementById('margensChart');
  if (ctxMargem) {
    if (margensInstance) margensInstance.destroy();
    margensInstance = new Chart(ctxMargem.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Margem %',
          data: margens,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, max: 100 } }
      }
    });
  }
}

// -------- MODO COMPACTO (Único modo disponível) --------
const btnModoCompacto = document.getElementById('btnModoCompacto');
// Forçar modo compacto sempre ativo
document.body.classList.add('compact-mode');
localStorage.setItem('modoCompacto', 'true');

if (btnModoCompacto) {
  btnModoCompacto.classList.add('active');
  // Remover toggle, deixar apenas indicador visual ou remover botão do DOM se preferir
  // Aqui vamos manter como indicador fixo ou remover o listener de toggle
  btnModoCompacto.style.display = 'none'; // Ocultar botão pois é o único modo
}

// Remover lógica de Normal/Detalhado anterior
const btnModoNormal = document.getElementById('btnModoNormal');
const btnModoDetalhado = document.getElementById('btnModoDetalhado');
const dashboardContainer = document.querySelector('.dashboard-container');

if(btnModoNormal) btnModoNormal.style.display = 'none';
if(btnModoDetalhado) btnModoDetalhado.style.display = 'none';

if (dashboardContainer) {
  // Garantir classes limpas
  dashboardContainer.classList.remove('dashboard-detalhado');
  dashboardContainer.classList.remove('dashboard-compact'); // compact-mode está no body
}

// Re-renderizar charts para garantir tamanho correto
setTimeout(() => {
  Object.values(Chart.instances).forEach(chart => {
    try { chart.resize(); } catch(e) {}
  });
}, 100);
function aplicarAnimacoesCards() {
  // Adicionar classe de transição aos cards principais
  const cards = document.querySelectorAll('.bg-white.rounded-xl.shadow');
  cards.forEach((card, index) => {
    card.classList.add('transition-card');
    // Animação escalonada de entrada
    card.style.opacity = '0';
    card.style.transform = 'translateY(10px)';
    setTimeout(() => {
      card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, index * 50);
  });
}

// -------- EFEITO DE ATUALIZAÇÃO DE VALOR --------
function animarAtualizacaoValor(elemento) {
  if (!elemento) return;
  elemento.classList.add('value-updated');
  setTimeout(() => elemento.classList.remove('value-updated'), 500);
}

// Interceptar atualizações de valores para adicionar animação
const valoresObservados = [
  'valorReceitaAtual', 'valorDespesaAtual', 'valorLucroAtual',
  'receitaProjetada', 'despesaProjetada', 'saldoProjetado',
  'receitaAnoAtual', 'receitaAnoAnterior', 'crescimentoAnual'
];

// Observer para detectar mudanças de texto
if (typeof MutationObserver !== 'undefined') {
  valoresObservados.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const observer = new MutationObserver(() => {
        animarAtualizacaoValor(el);
      });
      observer.observe(el, { childList: true, characterData: true, subtree: true });
    }
  });
}

// -------- Eventos de Sincronização --------
window.addEventListener('irancash:vendasResumo:synced', () => {
  // Toast removido
  refreshAll();
});

window.addEventListener('irancash:despesas:synced', () => {
  // Toast removido
  refreshAll();
});

montarAnoSelect();
refreshAll();
// tentar carregar dados do IndexedDB em background e re-renderizar quando disponível
try{ if(typeof carregarVendasResumoDiaAsync === 'function'){ carregarVendasResumoDiaAsync().then(()=>{ try{ refreshAll(); }catch(e){} }); } }catch(e){}

// -------- Setas e scroll do carrossel de meses --------
const mesPrev = document.getElementById('mesPrev');
const mesNext = document.getElementById('mesNext');

function scrollMonths(delta){
  if (!cardsMeses) return;
  cardsMeses.scrollBy({ left: delta, behavior: 'smooth' });
  // after animation settle, update arrows
  setTimeout(updateArrowState, 350);
}

function updateArrowState(){
  if (!cardsMeses || !mesPrev || !mesNext) return;
  const atStart = cardsMeses.scrollLeft <= 5;
  const atEnd = (cardsMeses.scrollWidth - cardsMeses.clientWidth - cardsMeses.scrollLeft) <= 5;
  mesPrev.disabled = atStart;
  mesNext.disabled = atEnd;
  mesPrev.classList.toggle('opacity-50', atStart);
  mesNext.classList.toggle('opacity-50', atEnd);

  // mostrar/ocultar setas em telas maiores apenas se houver overflow
  const hasOverflow = cardsMeses.scrollWidth > cardsMeses.clientWidth + 5;
  if (hasOverflow){ mesPrev.classList.remove('hidden'); mesNext.classList.remove('hidden'); }
  else { mesPrev.classList.add('hidden'); mesNext.classList.add('hidden'); }
}

if (mesPrev) mesPrev.addEventListener('click', ()=>{
  if(!cardsMeses) return;
  // rolar para a esquerda por um "lote" (largura visível) — assim mostra os 6 meses anteriores
  const step = cardsMeses.clientWidth;
  const target = Math.max(0, cardsMeses.scrollLeft - step);
  cardsMeses.scrollTo({ left: target, behavior: 'smooth' });
  setTimeout(updateArrowState, 350);
});
if (mesNext) mesNext.addEventListener('click', ()=>{
  if(!cardsMeses) return;
  // rolar para a direita por um "lote" (largura visível) — assim mostra os próximos 6 meses
  const step = cardsMeses.clientWidth;
  const target = Math.min(cardsMeses.scrollWidth - cardsMeses.clientWidth, cardsMeses.scrollLeft + step);
  cardsMeses.scrollTo({ left: target, behavior: 'smooth' });
  setTimeout(updateArrowState, 350);
});
if (cardsMeses) cardsMeses.addEventListener('scroll', updateArrowState);
window.addEventListener('resize', updateArrowState);

// ligar atualização de UI ao refresh geral
anoSelect.addEventListener('change', () => { refreshAll(); setTimeout(updateArrowState, 120); });
window.addEventListener('storage', () => { refreshAll(); setTimeout(updateArrowState, 120); });

// inicializa estado das setas
setTimeout(updateArrowState, 200);

// -------- Esconder loading overlay após carregamento --------
function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 300);
  }
}

// Esconde overlay quando tudo estiver carregado
if (document.readyState === 'complete') {
  hideLoadingOverlay();
} else {
  window.addEventListener('load', hideLoadingOverlay);
}

// Também esconde após um timeout máximo de segurança
setTimeout(hideLoadingOverlay, 3000);

// -------- MELHORIA 4: Animação Count-Up --------
function animateCountUp(element, targetValue, duration = 600) {
  if (!element) return;
  
  const startValue = 0;
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function (ease-out)
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const currentValue = startValue + (targetValue - startValue) * easeOut;
    
    element.textContent = fmtBR(currentValue);
    element.classList.add('count-up');
    
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  requestAnimationFrame(update);
}

// -------- MELHORIA 5: Exportar Dashboard --------
function exportarDashboard() {
  // Criar modal de exportação
  const modal = document.createElement('div');
  modal.className = 'export-modal';
  modal.innerHTML = `
    <div class="export-modal-content">
      <h3 class="text-lg font-bold text-gray-800 mb-4">📤 Exportar Dashboard</h3>
      <p class="text-sm text-gray-600 mb-4">Escolha o formato de exportação:</p>
      <div class="space-y-3">
        <button id="exportPrint" class="w-full bg-sky-500 hover:bg-sky-600 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          Imprimir / Salvar PDF
        </button>
        <button id="exportCSV" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          Exportar CSV (Dados)
        </button>
        <button id="exportClose" class="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium transition-all">
          Cancelar
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('active'), 10);
  
  // Event listeners
  modal.querySelector('#exportPrint').addEventListener('click', () => {
    modal.classList.remove('active');
    setTimeout(() => {
      modal.remove();
      window.print();
    }, 300);
  });
  
  modal.querySelector('#exportCSV').addEventListener('click', () => {
    exportarCSV();
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 300);
  });
  
  modal.querySelector('#exportClose').addEventListener('click', () => {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 300);
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 300);
    }
  });
}

function exportarCSV() {
  const ano = selectedYear || anoSelect.value || new Date().getFullYear();
  let csv = 'Mês,Receita,Despesa,Saldo,Margem %\n';
  
  for (let m = 0; m < 12; m++) {
    const rec = receitaBrutaMes(ano, m);
    const des = despesaMes(ano, m);
    const saldo = rec - des;
    const margem = rec > 0 ? ((saldo / rec) * 100).toFixed(1) : '0.0';
    csv += `${PT_MESES[m]},${rec.toFixed(2)},${des.toFixed(2)},${saldo.toFixed(2)},${margem}\n`;
  }
  
  // Totais
  let totalRec = 0, totalDes = 0;
  for (let m = 0; m < 12; m++) {
    totalRec += receitaBrutaMes(ano, m);
    totalDes += despesaMes(ano, m);
  }
  const totalSaldo = totalRec - totalDes;
  const totalMargem = totalRec > 0 ? ((totalSaldo / totalRec) * 100).toFixed(1) : '0.0';
  csv += `TOTAL,${totalRec.toFixed(2)},${totalDes.toFixed(2)},${totalSaldo.toFixed(2)},${totalMargem}\n`;
  
  // Download
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `dashboard_${ano}.csv`;
  link.click();
}

// Botão de exportar
const btnExportar = document.getElementById('btnExportarDashboard');
if (btnExportar) {
  btnExportar.addEventListener('click', exportarDashboard);
}

// -------- MELHORIA 5: Comparação entre Anos --------
const chkCompararAno = document.getElementById('chkCompararAno');
const anoCompararSelect = document.getElementById('anoCompararSelect');

if (chkCompararAno && anoCompararSelect) {
  chkCompararAno.addEventListener('change', () => {
    anoCompararSelect.disabled = !chkCompararAno.checked;
    if (chkCompararAno.checked) {
      atualizarComparacaoAnual();
    } else {
      // Voltar ao normal
      atualizarFluxoFinanceiro();
    }
  });
  
  anoCompararSelect.addEventListener('change', () => {
    if (chkCompararAno.checked) {
      atualizarComparacaoAnual();
    }
  });
}

function atualizarComparacaoAnual() {
  if (!chkCompararAno || !chkCompararAno.checked) return;
  
  const anoAtual = anoSelect.value || String(new Date().getFullYear());
  const anoComparar = anoCompararSelect.value;
  
  const labels = [];
  const receitasAtual = [];
  const receitasComparar = [];

  for (let m = 0; m < 12; m++){
    labels.push(PT_MESES[m].slice(0,3));
    receitasAtual.push(receitaBrutaMes(anoAtual, m));
    receitasComparar.push(receitaBrutaMes(anoComparar, m));
  }

  const el = document.getElementById('fluxoChart');
  if (!el) return;
  const ctx = el.getContext('2d');
  if (fluxoInstance) fluxoInstance.destroy();
  fluxoInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { 
          label: `Receita ${anoAtual}`, 
          data: receitasAtual, 
          borderColor: '#10b981', 
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3
        },
        { 
          label: `Receita ${anoComparar}`, 
          data: receitasComparar, 
          borderColor: '#6366f1', 
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          fill: true,
          tension: 0.3,
          borderDash: [5, 5]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, ticks: { callback: (val) => 'R$ ' + (val/1000).toFixed(0) + 'k' } } },
      plugins: { legend: { display: true, position: 'top' } }
    }
  });
}

// -------- MODO DE VISUALIZAÇÃO: Normal/Detalhado (REMOVIDO) --------
// Código removido para manter apenas o modo compacto conforme solicitado.
// As referências a btnModoNormal e btnModoDetalhado foram tratadas acima.

// -------- MELHORIA 6: Touch Gestures para Swipe --------
let touchStartX = 0;
let touchEndX = 0;

if (cardsMeses) {
  cardsMeses.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  
  cardsMeses.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, { passive: true });
}

function handleSwipe() {
  const swipeThreshold = 50;
  const diff = touchStartX - touchEndX;
  
  if (Math.abs(diff) < swipeThreshold) return;
  
  if (diff > 0) {
    // Swipe left - próximo
    if (mesNext && !mesNext.disabled) mesNext.click();
  } else {
    // Swipe right - anterior
    if (mesPrev && !mesPrev.disabled) mesPrev.click();
  }
}

// -------- Skeleton Loading ao trocar de mês --------
function showSkeletonLoading() {
  const elements = [
    document.getElementById('valorReceitaAtual'),
    document.getElementById('valorDespesaAtual'),
    document.getElementById('valorLucroAtual')
  ];
  
  elements.forEach(el => {
    if (el) {
      el.classList.add('skeleton-value');
      el.textContent = '';
    }
  });
}

function hideSkeletonLoading() {
  const elements = [
    document.getElementById('valorReceitaAtual'),
    document.getElementById('valorDespesaAtual'),
    document.getElementById('valorLucroAtual')
  ];
  
  elements.forEach(el => {
    if (el) {
      el.classList.remove('skeleton-value');
    }
  });
}


