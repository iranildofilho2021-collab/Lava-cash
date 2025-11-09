// -------- Helpers --------
const PT_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function numBR(n){ return Number(n||0).toLocaleString('pt-BR', {minimumFractionDigits:2}); }
function fmtBR(n){ return 'R$ ' + numBR(n); }

function lerVendasResumo(){
  try { return JSON.parse(localStorage.getItem('vendasResumo')) || []; }
  catch(e){ console.warn('Erro lendo vendasResumo', e); return []; }
}

function carregarVendasResumoDia(){
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

// -------- Card "Fluxo financeiro" (últimos 6 meses) --------
let fluxoInstance = null;
function atualizarFluxoFinanceiro(){
  // Agora mostra o ano completo selecionado no topo (Janeiro..Dezembro)
  const anoSelecionado = (anoSelect && anoSelect.value) ? String(anoSelect.value) : String(new Date().getFullYear());
  const labels = [];
  const receitas = [];
  const gastos = [];
  const consolidados = [];

  for (let m = 0; m < 12; m++){
    labels.push(`${PT_MESES[m].slice(0,3)} ${String(anoSelecionado).slice(-2)}`);
    const r = receitaBrutaMes(String(anoSelecionado), m);
    const g = despesaMes(String(anoSelecionado), m);
    receitas.push(r);
    gastos.push(g);
    consolidados.push(r - g);
  }

  const el = document.getElementById('fluxoChart');
  if (!el) return;
  const ctx = el.getContext('2d');
  if (fluxoInstance) fluxoInstance.destroy();
  fluxoInstance = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        { type: 'bar', label: 'Receita', data: receitas, backgroundColor: '#10b981' },
        { type: 'bar', label: 'Gasto',   data: gastos,   backgroundColor: '#ef4444' },
        { type: 'line', label: 'Consolidado', data: consolidados, borderColor: '#7dd3fc', backgroundColor: 'rgba(125,211,252,0.18)', fill: true, tension: 0.3, pointRadius: 3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, ticks: { callback: function(val){ try{ return 'R$ ' + Number(val).toLocaleString('pt-BR', {minimumFractionDigits:2}); }catch(e){ return 'R$ ' + val; } } } } },
      plugins: { legend: { display: true } }
    }
  });
}
function lerDespesas(){
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
  for (const a of anosDisponiveis()){
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = a;
    anoSelect.appendChild(opt);
  }
  const atual = String(new Date().getFullYear());
  if ([...anoSelect.options].some(o => o.value === atual)) anoSelect.value = atual;
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

function montarCardsMeses(){
  const ano = anoSelect.value || String(new Date().getFullYear());
  cardsMeses.innerHTML = '';

  PT_MESES.forEach((nome, idx) => {
    const r = receitaBrutaMes(ano, idx);
    const d = despesaMes(ano, idx);

    const card = document.createElement('div');
    card.className = "month-pill bg-white rounded-xl shadow p-4 flex flex-col justify-between card-hover";
    card.setAttribute('role','button');
    card.setAttribute('tabindex','0');
    card.dataset.month = String(idx);
    card.dataset.year = String(ano);
    card.innerHTML = `
      <div class="text-gray-500 text-sm">${nome.slice(0,3)} ${String(ano).slice(-2)}</div>
      <div class="mt-2 space-y-1">
        <div class="flex items-center gap-2 text-sm">
          <span class="inline-flex items-center justify-center rounded-full bg-green-100 text-green-700 w-5 h-5" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5l7 7h-4v7h-6v-7H5l7-7z" fill="currentColor"/></svg>
          </span>
          <span class="text-gray-700">Receita</span>
          <span class="ml-auto font-semibold text-gray-900">${fmtBR(r)}</span>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <span class="inline-flex items-center justify-center rounded-full bg-red-100 text-red-600 w-5 h-5" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 19l-7-7h4V5h6v7h4l-7 7z" fill="currentColor"/></svg>
          </span>
          <span class="text-gray-700">Despesa</span>
          <span class="ml-auto font-semibold text-gray-900">${fmtBR(d)}</span>
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

// -------- Card "Até o momento" + Pizza --------
let pizzaInstance = null;
function atualizarResumoAtual(){
  // if user selected a month, show that; otherwise use current month
  const hoje = new Date();
  const ano = selectedYear || anoSelect.value || hoje.getFullYear();
  const mIdx = (selectedMonthIndex !== null && selectedMonthIndex !== undefined) ? Number(selectedMonthIndex) : hoje.getMonth();

  const rec = receitaBrutaMes(ano, mIdx);
  const des = despesaMes(ano, mIdx);
  const luc = rec - des;

  document.getElementById('tituloMesAtual').textContent = `${PT_MESES[mIdx].slice(0,3)} ${String(ano).slice(-2)}`;
  document.getElementById('valorReceitaAtual').textContent = fmtBR(rec);
  document.getElementById('valorDespesaAtual').textContent = fmtBR(des);
  document.getElementById('valorLucroAtual').textContent = fmtBR(luc);

  const ctx = document.getElementById('pizzaAtual').getContext('2d');
  if (pizzaInstance) pizzaInstance.destroy();
  pizzaInstance = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Receita', 'Despesa', 'Lucro'],
      datasets: [{
        data: [rec, des, Math.max(luc, 0)],
        backgroundColor: ['#10b981','#ef4444','#0ea5e9']
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });
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

  const ctx = document.getElementById('comparacaoChart').getContext('2d');
  if (compInstance) compInstance.destroy();
  compInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [ `${PT_MESES[mPrev].slice(0,3)} ${String(anoPrev).slice(-2)}`, `${PT_MESES[mAtual].slice(0,3)} ${String(anoAtual).slice(-2)}` ],
      datasets: [
          { label: 'Entrou (Receita)', data: [recPrev, recAtual], backgroundColor: '#10b981', barPercentage: 0.9, categoryPercentage: 0.95, barThickness: 48, maxBarThickness: 120 },
          { label: 'Saiu (Despesa)',  data: [desPrev, desAtual], backgroundColor: '#ef4444', barPercentage: 0.9, categoryPercentage: 0.95, barThickness: 48, maxBarThickness: 120 }
        ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 8, right: 8, top: 6, bottom: 6 } },
      scales: { 
        x: { grid: { display: false }, ticks: { autoSkip: false } },
        y: { beginAtZero: true, ticks: { callback: function(val){ try{ return 'R$ ' + Number(val).toLocaleString('pt-BR', {minimumFractionDigits:2}); }catch(e){ return 'R$ ' + val; } } } }
      },
      plugins: { legend: { display: true } }
    }
  });
}

// -------- Card "Despesas futuras" (mês selecionado) --------
function atualizarParaAcontecer(){
  const listaEl = document.getElementById('paraAcontecerList');
  const saldoEl = document.getElementById('paraAcontecerSaldo');
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

      lista.push({ descricao: d.descricao || d.categoria || 'Despesa', valor: Number(d.valor || 0), dia });
    } catch (e) { /* ignorar item mal formado */ }
  }

  // ordenar por dia (nulls no final)
  lista.sort((a,b)=>{ if (a.dia === null) return 1; if (b.dia === null) return -1; return a.dia - b.dia; });

  listaEl.innerHTML = '';
  if (lista.length === 0){
    listaEl.innerHTML = '<div class="text-sm text-gray-500">Nenhuma despesa pendente para o mês selecionado.</div>';
  } else {
    for (const it of lista){
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between text-sm';
      const left = document.createElement('div');
      left.className = 'flex items-center gap-2 text-gray-700';
      const dot = document.createElement('span'); dot.className = 'inline-block w-2 h-2 rounded-full mr-2 bg-red-500';
      left.appendChild(dot);
      const desc = document.createElement('div'); desc.textContent = it.descricao + (it.dia ? ` • dia ${it.dia}` : '');
      left.appendChild(desc);

      const val = document.createElement('div'); val.className = 'font-semibold text-red-600'; val.textContent = fmtBR(-Math.abs(it.valor));

      row.appendChild(left);
      row.appendChild(val);
      listaEl.appendChild(row);
    }
  }

  // soma total (mostrar negativo como na UI exemplo)
  const soma = lista.reduce((s,it)=> s + Number(it.valor || 0), 0);
  saldoEl.textContent = fmtBR(-Math.abs(soma));
  if (soma > 0) saldoEl.classList.add('text-red-600'); else saldoEl.classList.remove('text-red-600');
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

  const labels = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const ctx = ctxEl.getContext('2d');
  if (vendasDiaSemanaInstance) vendasDiaSemanaInstance.destroy();
  // Palette: uma cor por dia (Dom..Sáb)
  const weekColors = ['#0ea5e9','#3b82f6','#06b6d4','#7c3aed','#ef4444','#10b981','#f59e0b'];
  vendasDiaSemanaInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ 
        label: 'Receita Bruta (R$)', 
        data: totals, 
        backgroundColor: weekColors,
        borderColor: weekColors.map(c => '#ffffff'),
        borderWidth: 1,
        // aumentar espessura das barras horizontais para melhor visibilidade
        barPercentage: 0.9,
        categoryPercentage: 0.9
      }]
    },
    options: {
      indexAxis: 'y', // barras horizontais (lateral)
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { bottom: 28 } },
      scales: { 
        x: { beginAtZero: true, ticks: { callback: function(val){ try{ return 'R$ ' + Number(val).toLocaleString('pt-BR', {minimumFractionDigits:2}); }catch(e){ return 'R$ ' + val; } } } },
        y: { ticks: { autoSkip: false } }
      },
      plugins: { legend: { display: false } }
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
  try{
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
  try{
    if(!timeStr) return null;
    const s = String(timeStr).trim().replace('h',':');
    const m = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if(!m){
      const dt = new Date(s);
      if(dt && !isNaN(dt.getTime())){
        const hh = dt.getHours(), mm = dt.getMinutes(), ss = dt.getSeconds();
        const t = hh*3600 + mm*60 + ss;
        if(t===0) return 'Madrugada';
        if(t>=1 && t<=5*3600+59*60+59) return 'Madrugada';
        if(t>=6*3600 && t<=11*3600+59*60+59) return 'Manhã';
        if(t>=12*3600 && t<=17*3600+59*60+59) return 'Tarde';
        if(t>=18*3600 && t<=24*3600) return 'Noite';
        return 'Madrugada';
      }
      return null;
    }
    const hh = Number(m[1]||0), mm = Number(m[2]||0), ss = Number(m[3]||0);
    const t = hh*3600 + mm*60 + ss;
    if(t===0) return 'Madrugada';
    if(t>=1 && t<=5*3600+59*60+59) return 'Madrugada';
    if(t>=6*3600 && t<=11*3600+59*60+59) return 'Manhã';
    if(t>=12*3600 && t<=17*3600+59*60+59) return 'Tarde';
    if(t>=18*3600 && t<=24*3600) return 'Noite';
    return 'Madrugada';
  }catch(e){ return null; }
}

function getSomaPeriodoPorMesFromDetalhes(anoMes){
  const zero = { 'Madrugada':0, 'Manhã':0, 'Tarde':0, 'Noite':0 };
  if(!anoMes) return zero;
  try{
    const detalhes = carregarVendasDetalhadasFromLS();
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

function atualizarVendasPorPeriodo(){
  const container = document.getElementById('vendas-periodo-conteudo');
  if(!container) return;
  let canvas = document.getElementById('vendasPeriodoChart');
  if(!canvas){
    container.innerHTML = '';
    canvas = document.createElement('canvas');
    canvas.id = 'vendasPeriodoChart';
    canvas.height = 180;
    container.appendChild(canvas);
  }

  const hoje = new Date();
  const anoRef = selectedYear || String(hoje.getFullYear());
  const mRef = (selectedMonthIndex !== null && selectedMonthIndex !== undefined) ? Number(selectedMonthIndex) : hoje.getMonth();
  const anoMesStr = `${String(anoRef)}/${String(mRef+1).padStart(2,'0')}`;
  const sums = getSomaPeriodoPorMesFromDetalhes(anoMesStr);

  const labels = ['Madrugada','Manhã','Tarde','Noite'];
  const data = labels.map(l => Number(sums[l]||0));
  const colors = ['#6366f1','#0ea5e9','#10b981','#f97316'];

  const ctx = canvas.getContext('2d');
  if (vendasPeriodoInstance) vendasPeriodoInstance.destroy();
    vendasPeriodoInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Receita Bruta (R$)', data, backgroundColor: colors }] },
    options: { 
      responsive:true, 
      maintainAspectRatio: false,
      scales: { 
        y: { beginAtZero:true, ticks: { callback: function(val){ try{ return 'R$ ' + Number(val).toLocaleString('pt-BR', {minimumFractionDigits:2}); }catch(e){ return 'R$ ' + val; } } } }
      }, 
      plugins: { legend: { display:false } }
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

// -------- Boot --------
function refreshAll(){
  montarCardsMeses();
  atualizarResumoAtual();
  atualizarComparacao();
  atualizarFluxoFinanceiro();
  atualizarParaAcontecer();
  atualizarVendasPorDiaSemana();
  // atualizar também o gráfico de períodos (Madrugada/Manhã/Tarde/Noite)
  // para que a visualização esteja sincronizada com o mês selecionado
  if (typeof atualizarVendasPorPeriodo === 'function') atualizarVendasPorPeriodo();
  // update arrows in case size changed after mounting cards
  setTimeout(updateArrowState, 120);
  // depois de ajustar setas, alinhar eixos dos charts para mesma baseline
  setTimeout(alignChartBottomAxes, 160);
}

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
