// Script extraído de despesas.html
// Gerencia dados de despesas, UI e persistência (localStorage)

let despesas = [];
try {
  despesas = JSON.parse(localStorage.getItem('despesas')) || [];
} catch (e) {
  console.warn('Falha ao ler despesas do localStorage:', e);
  despesas = [];
}

// Normaliza despesas existentes: garante que cada item tenha um id e o campo dia
despesas = despesas.map(d => {
  if (!d.id) d.id = genId();
  if (!('dia' in d)) d.dia = null;
  return d;
});
// persiste IDs adicionados, se houver
saveDespesas();

// utilitário simples de asserção para testes
function _assert(condition, msg) {
  if (!condition) throw new Error('ASSERT: ' + msg);
}

function saveDespesas() {
  try {
    localStorage.setItem('despesas', JSON.stringify(despesas));
    try { localStorage.setItem('despesas_last_update', String(Date.now())); } catch(e) { }
  } catch (e) {
    console.error('[Despesas] erro ao salvar despesas no localStorage:', e);
  }
}

function bloquearTodosEdits() {
  // converte qualquer input aberto de volta para span formatado
  document.querySelectorAll('.valor-edit').forEach(i => {
    const v = parseFloat(i.value);
    const span = document.createElement('span');
    span.className = 'valor-text';
    span.dataset.id = i.dataset.id;
    span.textContent = isNaN(v) ? i.value : `R$ ${v.toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
    i.replaceWith(span);
  });
  document.querySelectorAll('.btn-ok').forEach(b => b.classList.add('hidden'));
}

// utilitários para dia/mês
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function monthNameToIndex(name) {
  if (!name) return -1;
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  return MONTHS_PT.indexOf(cap);
}
function daysInMonth(year, monthIndex) {
  return new Date(Number(year), monthIndex + 1, 0).getDate();
}

function atualizarDiasDisponiveis() {
  const diaSelect = document.getElementById('dia-despesa');
  if (!diaSelect) return;
  const tipo = (document.getElementById('tipo-despesa') && document.getElementById('tipo-despesa').value) || 'Variável';
  const ano = (document.getElementById('ano-despesa') && document.getElementById('ano-despesa').value) || new Date().getFullYear();
  let mes = (document.getElementById('mes-despesa') && document.getElementById('mes-despesa').value) || '';
  // se o tipo for Fixo e o select de mês estiver oculto, usamos o mês atual apenas para popular dias
  if (!mes) mes = new Date().toLocaleString('pt-BR', {month: 'long'});
  const monthIdx = monthNameToIndex(mes);
  const total = monthIdx >= 0 ? daysInMonth(ano, monthIdx) : 31;
  const prev = parseInt(diaSelect.value, 10) || null;
  diaSelect.innerHTML = '';
  for (let i = 1; i <= total; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = String(i);
    diaSelect.appendChild(opt);
  }
  if (prev && prev <= total) diaSelect.value = String(prev);
  else {
    // tenta ajustar para dia atual ou 1
    const hoje = new Date().getDate();
    diaSelect.value = String(Math.min(hoje, total));
  }
}

function ultimoMesDespesasComDados(){
  try{
    if(!Array.isArray(despesas) || despesas.length===0) return null;
    let best = null; // { ano: '2025', mesIndex: 9 }
    for(const d of despesas){
      try{
        const ano = String(d.ano || '').trim();
        const mes = String(d.mes || '').trim();
        if(!ano || !mes) continue;
        const mIdx = MONTHS_PT.indexOf(mes.charAt(0).toUpperCase() + mes.slice(1));
        if(mIdx === -1) continue;
        const cand = { ano: ano, mesIndex: mIdx };
        if(!best) { best = cand; continue; }
        if(Number(cand.ano) > Number(best.ano)) { best = cand; continue; }
        if(Number(cand.ano) === Number(best.ano) && cand.mesIndex > best.mesIndex) { best = cand; }
      }catch(e){ /* ignore malformed */ }
    }
    return best;
  }catch(e){ return null; }
}

// Modal de confirmação para criação de despesas fixas - lógica JS
let _confirmFixoCallback = null;
function openConfirmFixoModal(count, monthsList, onConfirm) {
  const modal = document.getElementById('confirm-fixo-modal');
  const body = document.getElementById('confirm-fixo-body');
  const panel = document.getElementById('confirm-fixo-panel');
  if (!modal || !body) { if (onConfirm) onConfirm(); return; }
  body.textContent = `Serão criados ${count} lançamento(s) (${monthsList.join(', ')}). Deseja continuar?`;
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.add('opacity-100');
    if (panel) panel.classList.remove('scale-95'); panel && panel.classList.add('scale-100');
  }, 20);
  _confirmFixoCallback = onConfirm;
}
function closeConfirmFixoModal() {
  const modal = document.getElementById('confirm-fixo-modal');
  const panel = document.getElementById('confirm-fixo-panel');
  if (!modal) return;
  modal.classList.remove('opacity-100');
  if (panel) { panel.classList.remove('scale-100'); panel.classList.add('scale-95'); }
  setTimeout(() => modal.classList.add('hidden'), 360);
  _confirmFixoCallback = null;
}
document.addEventListener('click', function(e){
  if (e.target && e.target.id === 'confirm-fixo-cancel') closeConfirmFixoModal();
  if (e.target && e.target.id === 'confirm-fixo-ok') {
    if (_confirmFixoCallback) {
      try { _confirmFixoCallback(); } catch(err){ console.error(err); }
    }
    closeConfirmFixoModal();
  }
});

function atualizarTabela() {
  const mesesOrdem = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const _filtroMesEl = document.getElementById('filtro-mes');
  const mesSelecionado = _filtroMesEl ? _filtroMesEl.value : (new Date().toLocaleString('pt-BR', {month: 'long'}));
  const _filtroAnoEl = document.getElementById('filtro-ano');
  const anoSelecionado = (_filtroAnoEl && _filtroAnoEl.value) || new Date().getFullYear().toString();
  const tbody = document.querySelector('.bg-white table tbody');
  tbody.innerHTML = '';
  const filtradas = despesas.filter(d => String(d.mes) === String(mesSelecionado) && String(d.ano) === String(anoSelecionado));
  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td class='px-2 py-2' colspan='9'>Nenhuma despesa cadastrada</td></tr>`;
    atualizarDashboard();
    const table = document.querySelector('.bg-white table');
    const oldTfoot = table.querySelector('tfoot');
    if (oldTfoot) oldTfoot.remove();
    const tfoot0 = document.createElement('tfoot');
    tfoot0.innerHTML = `
      <tr class='bg-gray-50 font-semibold'>
        <td class='px-2 py-2'></td>
        <td class='px-2 py-2'></td>
        <td class='px-2 py-2'></td>
        <td class='px-2 py-2'></td>
        <td class='px-2 py-2'></td>
        <td class='px-2 py-2'></td>
        <td class='px-2 py-2 text-right'>R$ 0,00</td>
        <td class='px-2 py-2'></td>
        <td class='px-2 py-2'></td>
      </tr>`;
    table.appendChild(tfoot0);
    return;
  }
  const ordenadas = [...filtradas].sort((a, b) => mesesOrdem.indexOf(b.mes) - mesesOrdem.indexOf(a.mes));
  ordenadas.forEach((d) => {
    const tr = document.createElement('tr');
    tr.dataset.id = d.id;
    tr.classList.add('hover:bg-sky-50','transition-colors','duration-200');
    const itemId = d.id;

    let valorCell = '';
    let comprovanteCell = '';
    let acoesCell = `
      <button onclick="excluirDespesa('${d.id}')" title='Excluir' class='text-gray-600 hover:text-red-600' style='background:none;border:none;'>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 7v12a2 2 0 002 2h8a2 2 0 002-2V7M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2M6 7h12" /></svg>
      </button>
    `;

    if (d.tipo === 'Fixo') {
      const formatted = `R$ ${Number(d.valor).toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
      valorCell = `
        <div class="flex items-center justify-end gap-2">
          <span class="valor-text" data-id="${d.id}">${formatted}</span>
        </div>
      `;
      acoesCell = `
        <div class="flex items-center gap-2">
          <button type="button" class="btn-editar text-gray-600 hover:text-sky-600" title="Editar" style="background:none;border:none;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M4 20h4l10.607-10.607a1.5 1.5 0 0 0 0-2.121l-1.879-1.879a1.5 1.5 0 0 0-2.121 0L4 16v4z"/></svg>
          </button>
          <button type="button" class="btn-ok hidden text-green-600 hover:text-green-700 font-semibold" title="OK" style="background:none;border:none;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          </button>
          <button onclick="excluirDespesa('${d.id}')" title='Excluir' class='text-gray-600 hover:text-red-600' style='background:none;border:none;'>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 7v12a2 2 0 002 2h8a2 2 0 002-2V7M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2M6 7h12" /></svg>
          </button>
          <button type="button" onclick="triggerAnexar('${d.id}')" title="Anexar comprovante" aria-label="Anexar comprovante" class="text-gray-600 hover:text-sky-600" style="background:none;border:none;">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05L12.7 19.79a5 5 0 0 1-7.07-7.07l8.49-8.49a3.5 3.5 0 0 1 4.95 4.95L10.59 17.29a2 2 0 1 1-2.83-2.83l7.07-7.07"/></svg>
          </button>
        </div>
      `;
    } else {
      valorCell = `R$ ${Number(d.valor).toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
    }

    if (d.comprovante && d.comprovante.mime) {
      if (d.comprovante.mime === 'application/pdf') {
        comprovanteCell = `<div class="text-center"><button type="button" title="Visualizar comprovante" aria-label="Visualizar comprovante" data-id="${d.id}" data-view="pdf" class="view-comprovante text-gray-700 hover:text-sky-600" style="background:none;border:none;"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path><path d="M14 2v6h6"></path></svg></button></div>`;
      } else if (d.comprovante.mime.startsWith('image/')) {
        comprovanteCell = `<div class="text-center"><button type="button" title="Visualizar comprovante" aria-label="Visualizar comprovante" data-id="${d.id}" data-view="img" class="view-comprovante text-gray-700 hover:text-sky-600" style="background:none;border:none;"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path></svg></button></div>`;
      }
    } else {
      comprovanteCell = `<div class="text-center text-gray-300">–</div>`;
    }

    tr.innerHTML = `
      <td class='px-2 py-2'>${d.ano}</td>
      <td class='px-2 py-2'>${d.mes}</td>
      <td class='px-2 py-2'>${d.dia || '-'}</td>
      <td class='px-2 py-2'>${d.tipo}</td>
      <td class='px-2 py-2'>${d.categoria}</td>
      <td class='px-2 py-2'>${d.descricao}</td>
      <td class='px-2 py-2 text-right'>${valorCell}</td>
      <td class='px-2 py-2'>${comprovanteCell}</td>
      <td class='px-2 py-2 text-left'>${acoesCell}</td>
    `;
    tbody.appendChild(tr);

    tr.querySelectorAll('button').forEach(b => b.classList.add('transition-transform','duration-200','hover:scale-105'));

    const btnEdit = tr.querySelector('.btn-editar');
    const btnOk = tr.querySelector('.btn-ok');
    const deleteBtn = tr.querySelector('button[onclick^="excluirDespesa"]');

    if (btnEdit) {
      btnEdit.setAttribute('aria-label', 'Editar valor');
      btnEdit.tabIndex = 0;
      btnEdit.addEventListener('click', (ev) => {
        ev.preventDefault();
        bloquearTodosEdits();
        const span = tr.querySelector('.valor-text');
        if (span) {
          const id = span.dataset.id;
          const raw = span.textContent;
          const input = criarInputValorElement(id, raw);
          span.replaceWith(input);
          input.classList.add('ring-2', 'ring-sky-300');
          input.focus();
          input.select && input.select();
        }
        if (btnOk) btnOk.classList.remove('hidden');
        btnEdit.classList.add('editing');
      });
    }

    if (btnOk) {
      btnOk.setAttribute('aria-label', 'Confirmar edição');
      btnOk.tabIndex = 0;
      btnOk.addEventListener('click', (ev) => {
        ev.preventDefault();
        const input = tr.querySelector('.valor-edit');
        if (input) {
          const id = input.dataset.id;
          const idx = despesas.findIndex(x => x.id === id);
          const novo = parseFloat(input.value);
          if (!isNaN(novo) && idx >= 0) {
            despesas[idx].valor = novo;
            saveDespesas();
            mostrarMensagem('Valor atualizado com sucesso.');
          }
          const span = criarSpanValorElement(input.dataset.id, novo);
          input.replaceWith(span);
        }
        btnOk.classList.add('hidden');
        btnEdit.classList.remove('editing');
      });

      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target && e.target.classList && e.target.classList.contains('valor-edit')) {
          e.preventDefault();
          btnOk.click();
        }
      });
    }

    if (deleteBtn) {
      deleteBtn.setAttribute('aria-label', 'Excluir despesa');
      deleteBtn.tabIndex = 0;
    }
  });

  const totalMes = ordenadas.reduce((acc, it) => acc + (Number(it.valor) || 0), 0);
  const table = document.querySelector('.bg-white table');
  const oldTfoot = table.querySelector('tfoot');
  if (oldTfoot) oldTfoot.remove();
  const tfoot = document.createElement('tfoot');
  tfoot.innerHTML = `
    <tr class='bg-gray-50 font-semibold'>
      <td class='px-2 py-2'></td>
      <td class='px-2 py-2'></td>
      <td class='px-2 py-2'></td>
      <td class='px-2 py-2'></td>
      <td class='px-2 py-2'></td>
      <td class='px-2 py-2'></td>
      <td class='px-2 py-2 text-right'>
        R$ ${totalMes.toLocaleString('pt-BR',{minimumFractionDigits:2})}
      </td>
      <td class='px-2 py-2'></td>
      <td class='px-2 py-2'></td>
    </tr>`;
  table.appendChild(tfoot);

  atualizarDashboard();
  saveDespesas();
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => { fr.abort(); reject(new Error('Falha ao ler o arquivo')); };
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(file);
  });
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const _formDespesaEl = document.getElementById('form-despesa');
if (_formDespesaEl) {
  _formDespesaEl.addEventListener('submit', async function(e) {
  e.preventDefault();
  const ano = document.getElementById('ano-despesa').value;
  const tipo = document.getElementById('tipo-despesa').value;
  const categoria = document.getElementById('categoria-despesa').value;
  const descricao = this.querySelector('input[type="text"]').value;
  const diaSel = document.getElementById('dia-despesa');
  const diaValue = diaSel ? parseInt(diaSel.value, 10) : null;
  const valorRaw = (document.getElementById('valor-despesa') || this.querySelector('input[type="number"]')).value;
  const valor = parseFloat(String(valorRaw).replace(',', '.'));
  if (!valor) {
    mostrarMensagem('Preencha o valor!', true);
    return;
  }

  let comprovanteObj = null;
  if (tipo !== 'Fixo') {
    const inputFile = document.getElementById('comprovante-despesa');
    if (inputFile && inputFile.files && inputFile.files.length > 0) {
      const file = inputFile.files[0];
      if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) {
        mostrarMensagem('Tipo de arquivo não suportado. Use pdf, png ou jpg.', true);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        mostrarMensagem('Arquivo muito grande. Máx 10 MB.', true);
        return;
      }
      try {
        const dataUrl = await readFileAsDataURL(file);
        const tipoShort = file.type === 'application/pdf' ? 'pdf' : 'imagem';
        comprovanteObj = { nome: file.name, tipo: tipoShort, mime: file.type, url: dataUrl };
      } catch (err) {
        console.error(err);
        mostrarMensagem('Erro ao processar o arquivo.', true);
        return;
      }
    }
  } else {
    const inputFile = document.getElementById('comprovante-despesa');
    if (inputFile) inputFile.value = '';
  }

  if (tipo === 'Fixo') {
    const startMonth = (document.getElementById('mes-despesa') && document.getElementById('mes-despesa').value) || MONTHS_PT[0];
    const startIdx = Math.max(0, monthNameToIndex(startMonth));
    const monthsToCreate = MONTHS_PT.slice(startIdx);
    const count = monthsToCreate.length;
    if (!startMonth) {
      const mesSel = document.getElementById('mes-despesa');
      if (mesSel) { mesSel.classList.add('ring-2', 'ring-red-300'); mesSel.focus(); }
      mostrarMensagem('Escolha o Mês de início para despesas fixas', true);
      return;
    }

    const doCreate = function(){
      for (let idx = startIdx; idx < MONTHS_PT.length; idx++) {
        const mes = MONTHS_PT[idx];
        const diaParaMes = diaValue ? Math.min(diaValue, daysInMonth(ano, idx)) : null;
        const item = {id: genId(), ano, mes, dia: diaParaMes, tipo, categoria, descricao: descricao || categoria, valor};
        if (comprovanteObj) item.comprovante = comprovanteObj;
        despesas.push(item);
      }
      atualizarTabela();
      saveDespesas();
      mostrarMensagem('Despesas fixas criadas com sucesso.');
      document.getElementById('form-despesa').reset();
      const now = new Date();
      const anoAtual = now.getFullYear().toString();
      const mesAtual = now.toLocaleString('pt-BR', {month: 'long'});
      const mesAtualCap = mesAtual.charAt(0).toUpperCase() + mesAtual.slice(1);
      const anoElem = document.getElementById('ano-despesa');
      const mesElem = document.getElementById('mes-despesa');
      if (anoElem) anoElem.value = anoAtual;
      if (mesElem) mesElem.value = mesAtualCap;
      atualizarDiasDisponiveis();
    };

    if (count > 1) {
      openConfirmFixoModal(count, monthsToCreate, doCreate);
      return;
    }
    doCreate();
  } else {
    const mes = document.getElementById('mes-despesa').value;
    const item = {id: genId(), ano, mes, dia: diaValue || null, tipo, categoria, descricao: descricao || categoria, valor};
    if (comprovanteObj) item.comprovante = comprovanteObj;
    despesas.push(item);
  }
  atualizarTabela();
  saveDespesas();
  mostrarMensagem('Dados cadastrados com sucesso!');
  this.reset();
  const now = new Date();
  const anoAtual = now.getFullYear().toString();
  const mesAtual = now.toLocaleString('pt-BR', {month: 'long'});
  const mesAtualCap = mesAtual.charAt(0).toUpperCase() + mesAtual.slice(1);
  const anoElem = document.getElementById('ano-despesa');
  const mesElem = document.getElementById('mes-despesa');
  if (anoElem) anoElem.value = anoAtual;
  if (mesElem) mesElem.value = mesAtualCap;
  atualizarDiasDisponiveis();
  this.querySelector('select').dispatchEvent(new Event('change'));
  });
}

function triggerAnexar(id) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'application/pdf,image/png,image/jpeg';
  inp.onchange = async function() {
    if (!inp.files || inp.files.length === 0) return;
    const file = inp.files[0];
    if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) {
      mostrarMensagem('Tipo de arquivo não suportado. Use pdf, png ou jpg.', true);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      mostrarMensagem('Arquivo muito grande. Máx 10 MB.', true);
      return;
    }
    const idx = despesas.findIndex(x => x.id === id);
    if (idx === -1) { mostrarMensagem('Despesa não encontrada', true); return; }
    const exist = despesas[idx].comprovante;
    if (exist) {
      const ok = confirm('Já existe um comprovante para esta despesa. Deseja substituí-lo?');
      if (!ok) return;
    }
    try {
      const dataUrl = await readFileAsDataURL(file);
      const tipoShort = file.type === 'application/pdf' ? 'pdf' : 'imagem';
      despesas[idx].comprovante = { nome: file.name, tipo: tipoShort, mime: file.type, url: dataUrl };
      saveDespesas();
      atualizarTabela();
      mostrarMensagem('Comprovante anexado.');
      highlightRow(id);
    } catch (err) {
      console.error(err);
      mostrarMensagem('Erro ao anexar comprovante.', true);
    }
  };
  inp.click();
}

function highlightRow(id) {
  try {
    const tr = document.querySelector(`tr[data-id="${id}"]`);
    if (!tr) return;
    tr.classList.add('bg-green-50','ring-1','ring-green-200');
    setTimeout(() => {
      tr.classList.remove('bg-green-50','ring-1','ring-green-200');
    }, 1200);
  } catch (e) { /*silent*/ }
}

function openComprovanteModalById(id, viewType) {
  const d = despesas.find(x => x.id === id);
  if (!d || !d.comprovante) return mostrarMensagem('Comprovante não encontrado', true);
  openComprovanteModal(d.comprovante, viewType || (d.comprovante.mime === 'application/pdf' ? 'pdf' : 'img'));
}

function openComprovanteModal(comprovante, viewType) {
  const modal = document.getElementById('comprovante-modal');
  const container = document.getElementById('comprovante-modal-body');
  container.innerHTML = '';
  if (comprovante.mime === 'application/pdf') {
    const iframe = document.createElement('iframe');
    iframe.src = comprovante.url;
    iframe.className = 'w-full h-96 md:h-[70vh] border';
    iframe.setAttribute('aria-label', comprovante.nome || 'PDF comprovante');
    container.appendChild(iframe);
  } else if (comprovante.mime.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = comprovante.url;
    img.alt = comprovante.nome || 'Comprovante';
    img.className = 'max-w-full max-h-[70vh] mx-auto block transition-transform duration-200 cursor-zoom-in';
    img.onclick = function() { img.classList.toggle('scale-150'); img.classList.toggle('cursor-zoom-in'); img.classList.toggle('cursor-zoom-out'); };
    container.appendChild(img);
  }
  modal.classList.remove('hidden');
  setTimeout(() => modal.classList.add('opacity-100'), 20);
}

function closeComprovanteModal() {
  const modal = document.getElementById('comprovante-modal');
  modal.classList.remove('opacity-100');
  setTimeout(() => modal.classList.add('hidden'), 360);
}

document.addEventListener('click', function(e) {
  const btn = e.target.closest && e.target.closest('.view-comprovante');
  if (btn) {
    const id = btn.dataset.id;
    const view = btn.dataset.view;
    openComprovanteModalById(id, view);
  }
});

document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeComprovanteModal(); });

function excluirDespesa(id) {
  const idx = despesas.findIndex(x => x.id === id);
  if (idx === -1) return;
  const ok = confirm('Excluir esta despesa definitivamente? Esta ação não pode ser desfeita.');
  if (!ok) return;
  despesas.splice(idx, 1);
  atualizarTabela();
  saveDespesas();
}

function atualizarDashboard() {
  const hoje = new Date();
  const mesAtual = hoje.toLocaleString('pt-BR', {month: 'long'});
  const anoAtual = hoje.getFullYear().toString();
  const total = despesas.reduce((acc, d) => {
    if (d.mes === mesAtual && d.ano === anoAtual) {
      return acc + Number(d.valor);
    }
    return acc;
  }, 0);
  const alvo = document.querySelector('.text-2xl.font-bold.text-red-500');
  if (alvo) alvo.textContent = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
}

const _tipoDespesaEl = document.getElementById('tipo-despesa');
if (_tipoDespesaEl) {
  _tipoDespesaEl.addEventListener('change', function() {
    const mesDespesaDiv = document.getElementById('mes-despesa-div');
    const mesLabel = mesDespesaDiv && mesDespesaDiv.querySelector('label');
    if (this.value === 'Fixo') {
      if (mesDespesaDiv) mesDespesaDiv.style.display = '';
      if (mesLabel) mesLabel.innerHTML = 'Mês de início <span class="text-red-500">*</span>';
      const mesSel = document.getElementById('mes-despesa'); if (mesSel) mesSel.setAttribute('aria-required','true');
    } else {
      if (mesDespesaDiv) mesDespesaDiv.style.display = '';
      if (mesLabel) mesLabel.innerHTML = 'Mês';
      const mesSel = document.getElementById('mes-despesa'); if (mesSel) { mesSel.removeAttribute('aria-required'); mesSel.classList.remove('ring-2','ring-red-300'); }
    }
    atualizarDiasDisponiveis();
  });

  _tipoDespesaEl.addEventListener('change', function() {
    const comprovanteDiv = document.getElementById('comprovante-despesa-div');
    const inputFile = document.getElementById('comprovante-despesa');
    if (this.value === 'Fixo') {
      if (comprovanteDiv) comprovanteDiv.style.display = 'none';
      if (inputFile) inputFile.value = '';
    } else {
      if (comprovanteDiv) comprovanteDiv.style.display = '';
    }
  });
}

function mostrarMensagem(msg, erro = false) {
  let div = document.getElementById('mensagem-sucesso');
  if (!div) {
    div = document.createElement('div');
    div.id = 'mensagem-sucesso';
    div.className = 'mb-4 p-3 rounded font-semibold';
    const ref = document.getElementById('form-despesa') || document.querySelector('main').firstChild;
    document.querySelector('main').insertBefore(div, ref);
  }
  div.textContent = msg;
  div.className = erro ? 'mb-4 p-3 rounded bg-red-100 text-red-700 font-semibold' : 'mb-4 p-3 rounded bg-green-100 text-green-700 font-semibold';
  div.classList.remove('hidden');
  setTimeout(() => div.classList.add('hidden'), 2500);
}

const _filtroMesEl2 = document.getElementById('filtro-mes');
if (_filtroMesEl2) _filtroMesEl2.addEventListener('change', atualizarTabela);

window.addEventListener('DOMContentLoaded', function() {
  const filtroMes = document.getElementById('filtro-mes');
  const anoDespesa = document.getElementById('ano-despesa');
  const mesDespesa = document.getElementById('mes-despesa');
  const now = new Date();
  const anoAtual = now.getFullYear().toString();
  const mesAtual = now.toLocaleString('pt-BR', {month: 'long'});
  const mesAtualCap = mesAtual.charAt(0).toUpperCase() + mesAtual.slice(1);

  const last = ultimoMesDespesasComDados();
  const mesesDoAnoAtual = new Set(despesas.filter(d => String(d.ano) === anoAtual).map(d => monthNameToIndex(String(d.mes || '')))).size;
  if (mesesDoAnoAtual === 12) {
    if (anoDespesa) anoDespesa.value = anoAtual;
    if (mesDespesa) mesDespesa.value = mesAtualCap;
    if (filtroMes) filtroMes.value = mesAtualCap;
  } else if (last && last.ano) {
    const mesName = MONTHS_PT[last.mesIndex] || mesAtualCap;
    if (anoDespesa) anoDespesa.value = String(last.ano);
    if (mesDespesa) mesDespesa.value = mesName;
    if (filtroMes) filtroMes.value = mesName;
  } else {
    if (anoDespesa) anoDespesa.value = anoAtual;
    if (mesDespesa) mesDespesa.value = mesAtualCap;
    if (filtroMes) filtroMes.value = mesAtualCap;
  }
  const tipoElem = document.getElementById('tipo-despesa');
  if (tipoElem) tipoElem.dispatchEvent(new Event('change'));
  const filtroAno = document.getElementById('filtro-ano');
  if (filtroAno) {
    const anos = [...new Set(despesas.map(d => String(d.ano)).filter(Boolean))].sort((a,b)=>Number(b)-Number(a));
    filtroAno.innerHTML = '';
    if (anos.length === 0) {
      const opt = document.createElement('option'); opt.value = anoAtual; opt.textContent = anoAtual; filtroAno.appendChild(opt);
    } else {
      anos.forEach(a => { const opt = document.createElement('option'); opt.value = a; opt.textContent = a; filtroAno.appendChild(opt); });
      const lastLocal = ultimoMesDespesasComDados();
      if (lastLocal && lastLocal.ano && anos.includes(String(lastLocal.ano))) {
        filtroAno.value = String(lastLocal.ano);
      } else if (anos.includes(anoAtual)) {
        filtroAno.value = anoAtual;
      }
    }
    filtroAno.addEventListener('change', atualizarTabela);
  }

  if (mesDespesa) {
    mesDespesa.addEventListener('change', atualizarDiasDisponiveis);
    mesDespesa.addEventListener('change', function(){ this.classList.remove('ring-2','ring-red-300'); });
  }
  if (anoDespesa) anoDespesa.addEventListener('change', atualizarDiasDisponiveis);
  atualizarDiasDisponiveis();

  atualizarTabela();
});

(function() {
  const btnToggle = document.getElementById('btn-toggle-form');
  const form = document.getElementById('form-despesa');
  if (!btnToggle || !form) return;
  btnToggle.addEventListener('click', function() {
    const isOpen = form.classList.contains('opacity-100');
    if (!isOpen) {
      form.classList.remove('max-h-0', 'opacity-0', '-translate-y-2');
      form.classList.add('max-h-[1100px]', 'opacity-100', 'translate-y-0');
      form.setAttribute('aria-hidden', 'false');
      btnToggle.setAttribute('aria-expanded', 'true');
      btnToggle.textContent = 'Fechar';
      const first = form.querySelector('select, input, textarea, button');
      if (first) first.focus();
    } else {
      form.classList.remove('max-h-[1100px]', 'opacity-100', 'translate-y-0');
      form.classList.add('max-h-0', 'opacity-0', '-translate-y-2');
      form.setAttribute('aria-hidden', 'true');
      btnToggle.setAttribute('aria-expanded', 'false');
      btnToggle.textContent = '+ Lançamentos';
    }
  });
})();

window.addEventListener('beforeunload', function () { saveDespesas(); });

atualizarTabela();

window.addEventListener('storage', (e) => {
  if (e.key === 'despesas' || e.key === 'despesas_last_update') {
    try {
      despesas = JSON.parse(localStorage.getItem('despesas')) || [];
    } catch (err) {
      console.warn('Falha ao ler despesas via storage event:', err);
      despesas = [];
    }
    despesas = despesas.map(d => { if (!d.id) d.id = genId(); if (!('dia' in d)) d.dia = null; return d; });
    saveDespesas();
    atualizarTabela();
    atualizarDashboard();
  }
});