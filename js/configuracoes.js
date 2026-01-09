const categoriaStore = (window.IRANCASH && window.IRANCASH.DataStore) ? window.IRANCASH.DataStore : null;
const categoriasFallback = ['Conta de Agua','Energia','Suprimentos','Aluguel','Royalties','Seguro','Contadora','DAS-Impostos','Emprestimo','Salario','INSS','VmPay'];

// ---------- Preferências (moeda/fuso) ----------
    async function getPrefsAsync() {
      try {
        if (typeof IndexedDBStore !== 'undefined' && IndexedDBStore.getItem) {
          const data = await IndexedDBStore.getItem('prefs');
          if (data) return data;
        }
        return JSON.parse(localStorage.getItem('prefs')) || {};
      } catch { return {}; }
    }
    function getPrefs() {
      try { return JSON.parse(localStorage.getItem('prefs')) || {}; } catch { return {}; }
    }
    function setPrefs(p) {
      localStorage.setItem('prefs', JSON.stringify(p));
      // Também salva no IndexedDB de forma assíncrona
      if (typeof IndexedDBStore !== 'undefined' && IndexedDBStore.setItem) {
        IndexedDBStore.setItem('prefs', p).catch(e => console.warn('Erro ao salvar prefs no IndexedDB:', e));
      }
    }
    function initPrefs() {
      const selMoeda = document.getElementById('sel-moeda');
      const selFuso = document.getElementById('sel-fuso');
      const prefs = getPrefs();

      if (prefs.moeda) selMoeda.value = prefs.moeda;
      if (prefs.fuso) {
        const exists = Array.from(selFuso.options).some(o => o.value === prefs.fuso || o.text === prefs.fuso);
        if (!exists) {
          const opt = document.createElement('option');
          opt.textContent = prefs.fuso;
          selFuso.appendChild(opt);
        }
        selFuso.value = prefs.fuso;
      }

      selMoeda.addEventListener('change', () => {
        setPrefs({ ...getPrefs(), moeda: selMoeda.value });
        showMsg('Moeda salva.');
      });
      selFuso.addEventListener('change', () => {
        setPrefs({ ...getPrefs(), fuso: selFuso.value });
        showMsg('Fuso horário salvo.');
      });
    }

    // ---------- Toast / mensagens ----------
    function showMsg(text, isError=false) {
      let div = document.getElementById('msg-config');
      if (!div) {
        div = document.createElement('div');
        div.id = 'msg-config';
        div.className = 'mb-4 w-full';
        // insere no topo do main
        document.querySelector('main').prepend(div);
      }
      div.textContent = text;
      div.className = isError
        ? 'mb-4 p-3 rounded bg-red-100 text-red-700 font-semibold'
        : 'mb-4 p-3 rounded bg-green-100 text-green-700 font-semibold';
      clearTimeout(showMsg._t);
      showMsg._t = setTimeout(() => { div.textContent=''; div.className='mb-4 w-full'; }, 2500);
    }

    // ---------- Categorias ----------

    // Carrega categorias priorizando IndexedDB
    async function carregarCategoriasAsync() {
      if (categoriaStore && typeof categoriaStore.loadCategories === 'function') {
        return categoriaStore.loadCategories();
      }
      if (typeof IndexedDBStore !== 'undefined' && IndexedDBStore.getItem) {
        try {
          const data = await IndexedDBStore.getItem('categorias');
          if (Array.isArray(data) && data.length) return data;
        } catch (err) { console.warn('[Configuracoes] IndexedDB categorias:', err); }
      }
      try {
        const data = JSON.parse(localStorage.getItem('categorias'));
        if (Array.isArray(data) && data.length) return data;
      } catch (err) { console.warn('[Configuracoes] localStorage categorias:', err); }
      return categoriasFallback.slice();
    }

    // Salva categorias em IndexedDB e localStorage
    async function salvarCategoriasAsync(categorias) {
      if (categoriaStore && typeof categoriaStore.saveCategories === 'function') {
        return categoriaStore.saveCategories(categorias);
      }
      localStorage.setItem('categorias', JSON.stringify(categorias));
      if (typeof IndexedDBStore !== 'undefined' && IndexedDBStore.setItem) {
        try {
          await IndexedDBStore.setItem('categorias', categorias);
        } catch (e) { showMsg('Erro ao salvar categorias no IndexedDB.', true); }
      }
      return categorias;
    }

    // Renderiza categorias (async)
    async function renderizarCategorias() {
      const lista = document.getElementById('lista-categorias');
      const categorias = await carregarCategoriasAsync();
      lista.innerHTML = '';
      categorias.forEach((cat, i) => {
        const chip = document.createElement('span');
        chip.className = 'bg-gray-100 rounded px-2 py-1 text-sm inline-flex items-center';
        chip.innerHTML = `<span>${cat}</span>`;
        const btn = document.createElement('button');
        btn.textContent = '✕';
        btn.className = 'ml-2 text-red-500 hover:text-red-600';
        btn.title = 'Remover';
        btn.onclick = async () => {
          const novas = (await carregarCategoriasAsync()).filter((_, idx) => idx !== i);
          await salvarCategoriasAsync(novas);
          renderizarCategorias();
          showMsg('Categoria removida.');
        };
        chip.appendChild(btn);
        lista.appendChild(chip);
      });
    }

    // Adiciona categoria (async)
    async function adicionarCategoria() {
      const input = document.getElementById('novaCategoria');
      const valor = input.value.trim();
      if (!valor) { showMsg('Informe um nome de categoria.', true); return; }
      const categorias = await carregarCategoriasAsync();
      const jaExiste = categorias.some(c => c.toLowerCase() === valor.toLowerCase());
      if (jaExiste) { showMsg('Esta categoria já existe.', true); return; }
      categorias.push(valor);
      await salvarCategoriasAsync(categorias);
      renderizarCategorias();
      input.value = '';
      showMsg('Categoria adicionada.');
    }

    // ---------- Despesas ----------
    function genIdLocal() {
      return (Date.now().toString(36) + Math.random().toString(36).slice(2,8));
    }
    
    // Substituído por DataStore.loadDespesasAsync
    async function carregarDespesas() {
      if (window.IRANCASH && window.IRANCASH.DataStore) {
        return await window.IRANCASH.DataStore.loadDespesasAsync();
      }
      try { return JSON.parse(localStorage.getItem('despesas')) || []; } catch { return []; }
    }

    // Substituído por DataStore.saveDespesasAsync
    async function salvarDespesas(ds) {
      if (window.IRANCASH && window.IRANCASH.DataStore) {
        await window.IRANCASH.DataStore.saveDespesasAsync(ds);
        return;
      }
      localStorage.setItem('despesas', JSON.stringify(ds));
    }

    async function atualizarSelectAnos() {
      const sel = document.getElementById('select-anos-despesas');
      const ds = await carregarDespesas();
      const anosSet = new Set(ds.map(d => String(d.ano)));
      const anos = Array.from(anosSet).sort((a,b) => Number(b) - Number(a));
      sel.innerHTML = '';
      if (anos.length === 0) {
        const opt = document.createElement('option'); opt.textContent = 'Nenhum registro'; opt.value = '';
        sel.appendChild(opt);
        return;
      }
      anos.forEach(a => {
        const opt = document.createElement('option'); opt.value = a; opt.textContent = a;
        sel.appendChild(opt);
      });
      const anoAtual = String(new Date().getFullYear());
      if (anos.includes(anoAtual)) sel.value = anoAtual;
    }

    // estado global
    const filtros = { mes: 'Todos', tipo: 'Todos', categoria: 'Todos' };
    let mostrarAcoes = false;

    // helpers filtros
    function uniqueSorted(arr) {
      return Array.from(new Set(arr.filter(Boolean))).sort((a,b)=> String(a).localeCompare(String(b),'pt-BR'));
    }

    function montaOptions(values, atual) {
      const opts = ['<option value="Todos">Todos</option>']
        .concat(values.map(v => `<option value="${String(v)}"${String(v)===String(atual)?' selected':''}>${v}</option>`));
      return opts.join('');
    }

    // Ordena uma lista de meses qualquer (nomes ou números) de Janeiro a Dezembro
    function orderMonths(values) {
      const monthNames = ['janeiro','fevereiro','março','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
      function idxOf(v) {
        if (v == null) return 99;
        const s = String(v).trim().toLowerCase();
        // se for número em string
        const num = parseInt(s, 10);
        if (!isNaN(num) && num >=1 && num <=12) return num - 1;
        // normaliza 'março' vs 'marco'
        const norm = s.replace('ç','c');
        const i = monthNames.indexOf(norm);
        if (i >= 0) return i;
        return 99; // coloca no final
      }
      return values.slice().sort((a,b) => idxOf(a) - idxOf(b));
    }

    // retorna índice (0-11) de um mês dado nome ou número; valores desconhecidos -> 99
    function mesIndex(v) {
      const monthNames = ['janeiro','fevereiro','março','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
      if (v == null) return 99;
      const s = String(v).trim().toLowerCase();
      const num = parseInt(s,10);
      if (!isNaN(num) && num >= 1 && num <= 12) return num - 1;
      const norm = s.replace('ç','c');
      const i = monthNames.indexOf(norm);
      if (i >= 0) return i;
      return 99;
    }

    function aplicaFiltros(linhas) {
      return linhas.filter(d => {
        const okMes = filtros.mes === 'Todos' || String(d.mes) === String(filtros.mes);
        const okTipo = filtros.tipo === 'Todos' || String(d.tipo) === String(filtros.tipo);
        const okCat = filtros.categoria === 'Todos' || String(d.categoria) === String(filtros.categoria);
        return okMes && okTipo && okCat;
      });
    }

    async function renderizarDespesasAno(ano) {
      const container = document.getElementById('lista-despesas-ano');
      container.innerHTML = '';
      if (!ano) { container.textContent = 'Escolha um ano para visualizar.'; return; }

      let all = await carregarDespesas();
      let ds = all.map(d => ({...d, ano:String(d.ano)})).filter(d => d.ano === ano);
      if (ds.length === 0) { container.textContent = 'Nenhuma despesa encontrada para o ano ' + ano; return; }

      // valores únicos para popular filtros
      const meses = orderMonths(uniqueSorted(ds.map(d => d.mes)));
      const tipos = uniqueSorted(ds.map(d => d.tipo));
      const cats  = uniqueSorted(ds.map(d => d.categoria));

      // aplica filtros vigentes
      const dsView = aplicaFiltros(ds);
      // ordenar por mês (Janeiro..Dezembro) — se mesmo mês, ordenar por descrição
      dsView.sort((a,b) => {
        const mi = mesIndex(a.mes) - mesIndex(b.mes);
        if (mi !== 0) return mi;
        return String(a.descricao || '').localeCompare(String(b.descricao || ''), 'pt-BR');
      });

      // total filtrado
      const totalFiltrado = dsView.reduce((acc, d) => {
        const n = Number(String(d.valor).replace(',','.'));
        return acc + (isNaN(n) ? 0 : n);
      }, 0);

      const table = document.createElement('table');
      table.className = 'min-w-full divide-y divide-gray-200 text-sm';

      // thead com duas linhas: seleção + títulos + filtros (sem cabeçalho "Ações")
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr class="bg-gray-50">
          <th class='px-2 py-2'><input id="selectAllConfig" type="checkbox" aria-label="Selecionar todos" /></th>
          <th class='px-2 py-2 text-left'>Ano</th>
          <th class='px-2 py-2 text-left'>Mês</th>
          <th class='px-2 py-2 text-left'>Dia</th>
          <th class='px-2 py-2 text-left'>Tipo</th>
          <th class='px-2 py-2 text-left'>Categoria</th>
          <th class='px-2 py-2 text-left'>Descrição</th>
          <th class='px-2 py-2 text-left'>Valor (R$)</th>
          <th class='px-2 py-2 text-left'></th>
        </tr>
        <tr class="bg-white">
          <th class='px-2 py-2'></th>
          <th class='px-2 py-2'></th>
          <th class='px-2 py-2'>
            <select id="filtro-mes" class="filter w-full">
              ${montaOptions(meses, filtros.mes)}
            </select>
          </th>
          <th class='px-2 py-2'>
            <!-- Dia: sem filtro -->
          </th>
          <th class='px-2 py-2'>
            <select id="filtro-tipo" class="filter w-full">
              ${montaOptions(tipos, filtros.tipo)}
            </select>
          </th>
          <th class='px-2 py-2'>
            <select id="filtro-cat" class="filter w-full">
              ${montaOptions(cats, filtros.categoria)}
            </select>
          </th>
          <th class='px-2 py-2'></th>
          <th class='px-2 py-2'></th>
          <th class='px-2 py-2 text-right'></th>
        </tr>`;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');

      dsView.forEach(d => {
        if (!d.id) d.id = genIdLocal();
        const tr = document.createElement('tr');
        tr.className = 'odd:bg-white even:bg-gray-50';
        const valorNumber = Number(String(d.valor).replace(',','.')) || 0;
        tr.innerHTML = `
          <td class='px-2 py-2'><input type="checkbox" class="rowCheckbox" data-id='${d.id}' aria-label="Selecionar linha" /></td>
          <td class='px-2 py-2 whitespace-nowrap'>${d.ano}</td>
          <td class='px-2 py-2 whitespace-nowrap'>${d.mes}</td>
          <td class='px-2 py-2 whitespace-nowrap'>${d.dia || ''}</td>
          <td class='px-2 py-2 whitespace-nowrap'>${d.tipo}</td>
          <td class='px-2 py-2 whitespace-nowrap'>${d.categoria}</td>
          <td class='px-2 py-2'>${d.descricao || ''}</td>
          <td class='px-2 py-2 valor-td'>R$ ${valorNumber.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
          <td class='px-2 py-2 col-actions ${mostrarAcoes ? '' : 'hidden-actions'}'>
            <button data-id='${d.id}' class='btn-edit-config text-gray-600 hover:text-sky-600' title='Editar'>✎</button>
            <button data-id='${d.id}' class='btn-del-config text-gray-600 hover:text-red-600 ml-2' title='Excluir'>🗑</button>
          </td>`;
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);

      // tfoot com totalizador do filtrado
      const tfoot = document.createElement('tfoot');
      tfoot.innerHTML = `
        <tr class="bg-gray-50 font-semibold">
          <td class='px-2 py-2' colspan="6"></td>
          <td class='px-2 py-2 text-right'>Total filtrado</td>
          <td class='px-2 py-2 text-left total-valor-td'>R$ ${totalFiltrado.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
          <td class='px-2 py-2'></td>
        </tr>`;
      table.appendChild(tfoot);

      // toolbar with actions closer to the table
      const toolbar = document.createElement('div');
      toolbar.className = 'flex justify-end gap-3 mb-2';
      toolbar.innerHTML = `
        <div class="flex gap-2">
          <button id="btn-limpar-filtros-toolbar" class="text-sky-700 hover:underline text-xs">Limpar filtros</button>
          <button id="btn-toggle-acoes-toolbar" class="text-slate-700 hover:underline text-xs">${mostrarAcoes ? 'Ocultar Editar' : 'Editar'}</button>
          <button id="btn-delete-selected-config" class="text-red-600 hover:underline text-xs">Excluir selecionados</button>
        </div>
      `;
      container.appendChild(toolbar);
      container.appendChild(table);

      // listeners dos filtros e toolbar actions
      document.getElementById('filtro-mes').addEventListener('change', (e)=>{
        filtros.mes = e.target.value;
        renderizarDespesasAno(ano);
      });
      document.getElementById('filtro-tipo').addEventListener('change', (e)=>{
        filtros.tipo = e.target.value;
        renderizarDespesasAno(ano);
      });
      document.getElementById('filtro-cat').addEventListener('change', (e)=>{
        filtros.categoria = e.target.value;
        renderizarDespesasAno(ano);
      });
      document.getElementById('btn-limpar-filtros-toolbar').addEventListener('click', ()=>{
        filtros.mes = 'Todos';
        filtros.tipo = 'Todos';
        filtros.categoria = 'Todos';
        renderizarDespesasAno(ano);
      });
      document.getElementById('btn-toggle-acoes-toolbar').addEventListener('click', ()=>{
        mostrarAcoes = !mostrarAcoes;
        renderizarDespesasAno(ano);
      });
      // excluir selecionados
      const btnDelSel = document.getElementById('btn-delete-selected-config');
      if (btnDelSel) btnDelSel.addEventListener('click', async ()=>{
        const checked = Array.from(container.querySelectorAll('.rowCheckbox:checked'));
        if (checked.length === 0) { showMsg('Nenhuma despesa selecionada.', true); return; }
        if (!confirm(`Confirma exclusão de ${checked.length} despesa(s) selecionada(s)?`)) return;
        const ids = checked.map(cb => cb.dataset.id).filter(Boolean);
        let all = await carregarDespesas();
        const before = all.length;
        all = all.filter(d => !ids.includes(String(d.id)));
        await salvarDespesas(all);
        try { localStorage.setItem('despesas_last_update', String(Date.now())); } catch (e) { /* ignore */ }
        const removed = before - all.length;
        showMsg(`${removed} despesa(s) excluída(s).`);
        await atualizarSelectAnos();
        // resetar filtros para mostrar todas as despesas
        filtros.mes = 'Todos'; filtros.tipo = 'Todos'; filtros.categoria = 'Todos';
        await renderizarDespesasAno(ano);
      });

      // seleção por linha (checkboxes)
      (function initRowSelection(){
        const selectAll = container.querySelector('#selectAllConfig');
        const rowCheckboxes = Array.from(container.querySelectorAll('.rowCheckbox'));
        if (!selectAll && rowCheckboxes.length === 0) return;
        if (selectAll) {
          selectAll.checked = rowCheckboxes.length > 0 && rowCheckboxes.every(r => r.checked);
          selectAll.addEventListener('change', (e) => {
            rowCheckboxes.forEach(cb => {
              cb.checked = e.target.checked;
              const tr = cb.closest('tr');
              if (tr) tr.classList.toggle('bg-sky-100', e.target.checked);
            });
          });
        }
        rowCheckboxes.forEach(cb => cb.addEventListener('change', () => {
          if (selectAll) selectAll.checked = rowCheckboxes.length > 0 && rowCheckboxes.every(r => r.checked);
          const tr = cb.closest('tr');
          if (tr) tr.classList.toggle('bg-sky-100', cb.checked);
        }));
      })();

      // handlers estáveis para Editar / Excluir — permite reuso ao restaurar a linha
      const handleDeleteClick = async (evt) => {
        const id = evt.currentTarget.dataset.id;
        if (!confirm('Confirma exclusão desta despesa?')) return;
        let all = await carregarDespesas();
        all = all.filter(x => String(x.id) !== String(id));
        await salvarDespesas(all);
        try { localStorage.setItem('despesas_last_update', String(Date.now())); } catch (e) { /* ignore */ }
        showMsg('Despesa excluída.');
        await atualizarSelectAnos();
        // Reaplicar filtros e re-render global aqui é aceitável para exclusão:
        filtros.mes = 'Todos'; filtros.tipo = 'Todos'; filtros.categoria = 'Todos';
        await renderizarDespesasAno(ano);
      };

      const handleEditClick = async (ev) => {
        // evita múltiplas edições simultâneas
        if (container.querySelector('.valor-td input')) { showMsg('Finalize a edição atual primeiro.', true); return; }
        const id = ev.currentTarget.dataset.id;
        const dsAll = await carregarDespesas();
        const idx = dsAll.findIndex(x => String(x.id) === String(id));
        if (idx === -1) { showMsg('Registro não encontrado', true); return; }

        const row = ev.currentTarget.closest('tr');
        const valorTd = row.querySelector('.valor-td');
        const actionsTd = row.querySelector('.col-actions');

        const originalNumber = Number(String(dsAll[idx].valor).replace(',','.')) || 0;

        const input = document.createElement('input');
        input.type = 'number'; input.step = '0.01'; input.min = '0';
        input.className = 'rounded border px-2 py-1 w-32';
        input.value = originalNumber.toFixed(2);
        valorTd.innerHTML = '';
        valorTd.appendChild(input);
        input.focus();

        const btnSave = document.createElement('button');
        btnSave.className = 'bg-green-500 hover:bg-green-600 text-white rounded px-2 py-1 mr-2';
        btnSave.textContent = 'Salvar';
        btnSave.type = 'button'; // evita comportamento de submit implícito

        const btnCancel = document.createElement('button');
        btnCancel.className = 'bg-gray-200 hover:bg-gray-300 text-gray-800 rounded px-2 py-1';
        btnCancel.textContent = 'Cancelar';
        btnCancel.type = 'button'; // evita submit

        const oldActionsHTML = actionsTd.innerHTML;
        actionsTd.innerHTML = '';
        actionsTd.appendChild(btnSave);
        actionsTd.appendChild(btnCancel);

        const restoreRow = () => {
          const novoValor = Number(dsAll[idx].valor) || 0;
          valorTd.textContent = 'R$ ' + novoValor.toLocaleString('pt-BR',{minimumFractionDigits:2});
          actionsTd.innerHTML = oldActionsHTML;
          actionsTd.classList.toggle('hidden-actions', !mostrarAcoes);
          // recoloca handlers estáveis
          actionsTd.querySelector('.btn-edit-config')?.addEventListener('click', handleEditClick);
          actionsTd.querySelector('.btn-del-config')?.addEventListener('click', handleDeleteClick);
          // remove foco de qualquer elemento que possa manter "estado de edição"
          if (document.activeElement) document.activeElement.blur();
        };

        btnSave.addEventListener('click', async () => {
          const novo = parseFloat(String(input.value).replace(',', '.'));
          if (isNaN(novo)) { showMsg('Valor inválido.', true); return; }
          dsAll[idx].valor = novo;
          await salvarDespesas(dsAll);
          try { localStorage.setItem('despesas_last_update', String(Date.now())); } catch (e) { /* ignore */ }
          showMsg('Valor atualizado.');
          // 1) restaura a linha primeiro
          restoreRow();
          // 2) atualiza total do rodapé sem re-render completo
          const allNow = await carregarDespesas();
          const allNowFiltered = allNow.map(d => ({...d, ano: String(d.ano)})).filter(d => d.ano === ano);
          const filteredNow = aplicaFiltros(allNowFiltered);
          const newTotal = filteredNow.reduce((acc, d) => {
            const n = Number(String(d.valor).replace(',','.'));
            return acc + (isNaN(n) ? 0 : n);
          }, 0);
          const totalTd = table.querySelector('.total-valor-td');
          if (totalTd) totalTd.textContent = 'R$ ' + newTotal.toLocaleString('pt-BR',{minimumFractionDigits:2});
        });

        btnCancel.addEventListener('click', restoreRow);
      };

      // anexar handlers estáveis
      container.querySelectorAll('.btn-edit-config').forEach(b => b.addEventListener('click', handleEditClick));
      container.querySelectorAll('.btn-del-config').forEach(b => b.addEventListener('click', handleDeleteClick));
    }

    // ---------- Ações globais ----------
    document.getElementById('adicionarCategoria').addEventListener('click', adicionarCategoria);
    document.getElementById('novaCategoria').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') adicionarCategoria();
    });

    // Toggle para exibir/ocultar seção de categorias com animação (slide + opacity)
    const btnToggleCategorias = document.getElementById('btn-toggle-categorias');
    const categoriasSection = document.getElementById('categorias-section');
    if (btnToggleCategorias && categoriasSection) {
      btnToggleCategorias.addEventListener('click', () => {
        const isClosed = categoriasSection.classList.contains('opacity-0');
        if (isClosed) {
          // abrir: maximiza altura e mostra
          categoriasSection.classList.remove('max-h-0','opacity-0','-translate-y-2');
          categoriasSection.classList.add('max-h-[600px]','opacity-100','translate-y-0');
          // força re-render das categorias ao mostrar
          renderizarCategorias();
          btnToggleCategorias.textContent = 'Fechar Gerenciar Categorias';
        } else {
          // fechar: recolhe novamente
          categoriasSection.classList.remove('max-h-[600px]','opacity-100','translate-y-0');
          categoriasSection.classList.add('max-h-0','opacity-0','-translate-y-2');
          btnToggleCategorias.textContent = 'Gerenciar Categorias de Despesas';
        }
      });
      if (window.location.hash === '#categorias-section') {
        btnToggleCategorias.click();
        setTimeout(() => categoriasSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
      }
    }


    if (categoriaStore && typeof categoriaStore.subscribeCategories === 'function') {
      categoriaStore.subscribeCategories(() => {
        if (document.getElementById('lista-categorias')) {
          renderizarCategorias();
        }
      });
    }

    if (categoriaStore && typeof categoriaStore.subscribeCategories === 'function') {
      categoriaStore.subscribeCategories(() => {
        if (document.getElementById('lista-categorias')) {
          renderizarCategorias();
        }
      });
    }
    // Nota: atalho do sidebar para categorias removido; apenas o botão permanece

    document.getElementById('btn-ver-ano').addEventListener('click', async () => {
      const sel = document.getElementById('select-anos-despesas');
      // ao trocar de ano, reseta filtros (comportamento de planilha)
      filtros.mes = 'Todos';
      filtros.tipo = 'Todos';
      filtros.categoria = 'Todos';
      // mantém estado do "mostrarAcoes" do jeito que estiver
      await renderizarDespesasAno(sel.value);
    });

    // Listener para eventos customizados de atualização de despesas (incluindo MDR)
    window.addEventListener('irancash:despesas:updated', async (e) => {
      try {
        // Atualiza select de anos e re-renderiza se houver ano selecionado
        await atualizarSelectAnos();
        const sel = document.getElementById('select-anos-despesas');
        if (sel && sel.value) {
          await renderizarDespesasAno(sel.value);
        }
      } catch (err) {
        console.warn('Erro ao atualizar despesas via evento customizado (configurações):', err);
      }
    });

    // Listener para storage events (atualização de despesas de outras abas)
    window.addEventListener('storage', async (e) => {
      if (e.key === 'despesas' || e.key === 'despesas_last_update') {
        try {
          await atualizarSelectAnos();
          const sel = document.getElementById('select-anos-despesas');
          if (sel && sel.value) {
            await renderizarDespesasAno(sel.value);
          }
        } catch (err) {
          console.warn('Erro ao atualizar despesas via storage event (configurações):', err);
        }
      }
    });

    // ---------- Init ----------
    (function init(){
      initPrefs();
      renderizarCategorias();
      atualizarSelectAnos();
      initBackupSection();
    })();

    // ---------- Backup Section ----------
    function initBackupSection() {
      const btnExport = document.getElementById('btn-export-backup');
      const inputImport = document.getElementById('input-import-backup');
      const btnClear = document.getElementById('btn-clear-data');
      
      // Atualiza indicador de storage
      updateStorageIndicator();
      
      if (btnExport) {
        btnExport.addEventListener('click', () => {
          if (window.BackupUtils && typeof window.BackupUtils.export === 'function') {
            window.BackupUtils.export();
          } else {
            showMsg('Erro: utilitário de backup não carregado.', true);
          }
        });
      }
      
      if (inputImport) {
        inputImport.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          
          try {
            if (window.BackupUtils && typeof window.BackupUtils.import === 'function') {
              await window.BackupUtils.import(file);
            } else {
              showMsg('Erro: utilitário de backup não carregado.', true);
            }
          } catch (err) {
            showMsg('Erro ao importar backup: ' + err.message, true);
          }
          
          // Limpa input para permitir reimportar o mesmo arquivo
          inputImport.value = '';
        });
      }
      
      if (btnClear) {
        btnClear.addEventListener('click', () => {
          if (window.BackupUtils && typeof window.BackupUtils.clear === 'function') {
            window.BackupUtils.clear();
          } else {
            showMsg('Erro: utilitário de backup não carregado.', true);
          }
        });
      }
    }

    function updateStorageIndicator() {
      if (!window.BackupUtils || typeof window.BackupUtils.getStorageUsage !== 'function') {
        return;
      }
      
      const usage = window.BackupUtils.getStorageUsage();
      const percentText = document.getElementById('storage-percent-text');
      const barFill = document.getElementById('storage-bar-fill');
      
      if (percentText) {
        percentText.textContent = usage.usedMB + ' MB (' + usage.percentage + '%)';
      }
      
      if (barFill) {
        barFill.style.width = usage.percentage + '%';
        
        // Muda cor baseado no uso
        barFill.classList.remove('warning', 'danger');
        if (parseFloat(usage.percentage) > 80) {
          barFill.style.background = '#ef4444';
        } else if (parseFloat(usage.percentage) > 50) {
          barFill.style.background = '#f59e0b';
        } else {
          barFill.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
        }
      }
    }






