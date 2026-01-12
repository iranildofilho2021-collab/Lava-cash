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
      initImportConfig();
      initPeriodosConfig();
      initDespesasToggle(); 
      initUsersSection();
      initSystemSettings(); // New
    })();
    
    // ---------- Configurações do Sistema (Dev Only) ----------
    async function initSystemSettings() {
        if (!window.AuthService || !window.SettingsService) return;
        
        const currentUser = AuthService.getCurrentUser();
        if (!currentUser || currentUser.role !== 'developer') return;

        const section = document.getElementById('system-settings-section');
        if (section) section.classList.remove('hidden');

        // Load Settings
        const settings = await SettingsService.getSettings();
        
        // App Name
        const nameInput = document.getElementById('app-name-input');
        if (nameInput) nameInput.value = settings.appName || '';
        
        document.getElementById('btn-save-app-name')?.addEventListener('click', async () => {
            const newName = nameInput.value.trim();
            if(!newName) return showMsg('Nome inválido', true);
            await SettingsService.saveSettings({ appName: newName });
            showMsg('Nome da aplicação atualizado!');
        });

        // Partners
        renderPartnersTable(settings.partners);

        document.getElementById('btn-save-partners')?.addEventListener('click', async () => {
            const rows = document.querySelectorAll('#partners-list-body tr');
            const newPartners = [];
            
            rows.forEach(tr => {
                const inputs = tr.querySelectorAll('input');
                newPartners.push({
                    name: inputs[0].value,
                    share: Number(inputs[1].value),
                    investment: Number(inputs[2].value),
                    role: 'Sócio'
                });
            });
            
            await SettingsService.saveSettings({ partners: newPartners });
            showMsg('Dados dos sócios atualizados!');
        });
    }

    function renderPartnersTable(partners) {
        const tbody = document.getElementById('partners-list-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        partners.forEach((p, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-3 py-2"><input type="text" class="w-full border rounded p-1" value="${p.name}"></td>
                <td class="px-3 py-2"><input type="number" class="w-full border rounded p-1 text-center" value="${p.share}"></td>
                <td class="px-3 py-2"><input type="number" class="w-full border rounded p-1 text-center" value="${p.investment}"></td>
            `;
            tbody.appendChild(tr);
        });
    }

    // ---------- Gestão de Usuários ----------
    function initUsersSection() {
        if (!window.AuthService) return;
        
        // Check permission (already protected by page access, but double check)
        const currentUser = AuthService.getCurrentUser();
        if (!currentUser || currentUser.role !== 'developer') return;

        const section = document.getElementById('users-section');
        const tbody = document.getElementById('users-list-body');
        
        if (section) section.classList.remove('hidden');
        
        renderUsersTable();

        // Make render available globally or attach refresh logic
        window.refreshUsersTable = renderUsersTable;
    }

    function renderUsersTable() {
        const tbody = document.getElementById('users-list-body');
        if (!tbody) return;
        
        const users = AuthService.getAllUsers();
        tbody.innerHTML = '';

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-4 text-center text-gray-500">Nenhum usuário cadastrado.</td></tr>';
            return;
        }

        users.forEach(user => {
            const isDev = user.role === 'developer';
            const tr = document.createElement('tr');
            
            // Status Badge
            const statusClass = user.active 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800';
            const statusLabel = user.active ? 'Ativo' : 'Inativo';

            tr.innerHTML = `
                <td class="px-3 py-3 whitespace-nowrap text-gray-900">${user.name}</td>
                <td class="px-3 py-3 whitespace-nowrap text-gray-500">${user.email}</td>
                <td class="px-3 py-3 whitespace-nowrap text-gray-500 capitalize">
                    ${!isDev ? `
                    <select onchange="handleUserAction('role', '${user.email}', this.value)" class="text-sm border-gray-300 rounded focus:ring-sky-500 focus:border-sky-500">
                        <option value="visualizador" ${user.role === 'visualizador' ? 'selected' : ''}>Visualizador</option>
                        <option value="cadastrador" ${user.role === 'cadastrador' ? 'selected' : ''}>Cadastrador</option>
                    </select>
                    ` : '<span class="font-bold">Developer</span>'}
                </td>
                <td class="px-3 py-3 whitespace-nowrap text-center">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}">
                        ${statusLabel}
                    </span>
                </td>
                <td class="px-3 py-3 whitespace-nowrap text-right text-sm font-medium">
                    ${!isDev ? `
                    <button onclick="handleUserAction('toggle', '${user.email}')" class="text-sky-600 hover:text-sky-900 mr-3">
                        ${user.active ? 'Bloquear' : 'Ativar'}
                    </button>
                    <button onclick="handleUserAction('delete', '${user.email}')" class="text-red-600 hover:text-red-900">
                        Excluir
                    </button>
                    ` : '<span class="text-gray-400 italic">Admin</span>'}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Expose handler globally for the onclick events in HTML string
    window.handleUserAction = function(action, email, value) {
        if (!window.AuthService) return;
        
        if (action === 'toggle') {
            if (AuthService.toggleUserStatus(email)) {
                showMsg('Status do usuário atualizado.');
                renderUsersTable();
            }
        } else if (action === 'delete') {
            if (confirm(`Tem certeza que deseja excluir o usuário ${email}?`)) {
                if (AuthService.deleteUser(email)) {
                    showMsg('Usuário excluído.');
                    renderUsersTable();
                }
            }
        } else if (action === 'role') {
            if (AuthService.updateUserRole(email, value)) {
                showMsg('Nível de acesso atualizado.');
                // Não precisa re-renderizar tudo se for só select, mas garante consistência
            }
        }
    };
    
    // Toggle Genérico
    function setupToggle(btnId, sectionId, btnTextClosed, btnTextOpened) {
       const btn = document.getElementById(btnId);
       const section = document.getElementById(sectionId);
       if(btn && section) {
          btn.addEventListener('click', () => {
             const isClosed = section.classList.contains('max-h-0');
             if(isClosed) {
                section.classList.remove('max-h-0', 'opacity-0', '-translate-y-2');
                section.classList.add('max-h-[2000px]', 'opacity-100', 'translate-y-0');
                if(btnTextOpened) btn.textContent = btnTextOpened;
             } else {
                section.classList.remove('max-h-[2000px]', 'opacity-100', 'translate-y-0');
                section.classList.add('max-h-0', 'opacity-0', '-translate-y-2');
                if(btnTextClosed) btn.textContent = btnTextClosed;
             }
          });
       }
    }
    
    function initDespesasToggle() {
       setupToggle('btn-toggle-despesas', 'despesas-section', 'Gerenciar Despesas', 'Fechar Gerenciar Despesas');
    }

    // ---------- Configuração de Importação (Mapping) ----------
    function initImportConfig() {
      // Toggle logic using generic helper
      setupToggle('btn-toggle-import-config', 'import-config-content', 'Configurações de Importação', 'Fechar Configurações de Importação');

      // 1. Carregar configuração de linhas de cabeçalho

      const mapCartao = loadMapping('mapping_cartao');
      const mapPix = loadMapping('mapping_pix');
      
      const inputCartao = document.getElementById('headerline-cartao');
      if (inputCartao) inputCartao.value = mapCartao.headerRow || 2;
      
      const inputPix = document.getElementById('headerline-pix');
      if (inputPix) inputPix.value = mapPix.headerRow || 2;
      
      // Salvar botão geral
      const btnSave = document.getElementById('save-import-config');
      if (btnSave) {
        btnSave.addEventListener('click', () => {
          const vCartao = parseInt(inputCartao.value) || 2;
          const vPix = parseInt(inputPix.value) || 2;
          
          const mc = loadMapping('mapping_cartao');
          mc.headerRow = vCartao;
          saveMapping('mapping_cartao', mc);
          
          const mp = loadMapping('mapping_pix');
          mp.headerRow = vPix;
          saveMapping('mapping_pix', mp);
          
          showMsg('Configurações de linha de cabeçalho salvas.');
        });
      }
      
      // 2. Mapeamento Cartão
      setupMappingPanel('mapping-cartao', 'mapping_cartao', [
        { key: 'date', label: 'Data', default: 'Data Venda' },
        { key: 'time', label: 'Hora', default: 'Hora Venda' },
        { key: 'valorBruto', label: 'Valor Bruto', default: 'Valor Bruto' },
        { key: 'mdr', label: 'Taxa (MDR)', default: 'Valor Taxa' },
        { key: 'valorLiquido', label: 'Valor Líquido', default: 'Valor Liquido' },
        { key: 'modalidade', label: 'Modalidade (Déb/Cré)', default: 'Modalidade' },
        { key: 'bandeira', label: 'Bandeira', default: 'Bandeira' },
        { key: 'nsus', label: 'NSU', default: 'NSU' }
      ]);
      
      // 3. Mapeamento PIX
      setupMappingPanel('mapping-pix', 'mapping_pix', [
        { key: 'date', label: 'Data', default: 'Data' },
        { key: 'valorBruto', label: 'Valor', default: 'Valor' },
        { key: 'descricao', label: 'Descrição/ID', default: 'Descrição' }
      ]);
    }
    
    function setupMappingPanel(prefix, storageKey, fields) {
       const btnOpen = document.getElementById(`open-${prefix}`);
       const panel = document.getElementById(`${prefix}-panel`);
       const fileInput = document.getElementById(`${prefix}-sample-file`);
       const fieldsContainer = `${prefix}-fields`; // ID string for renderMappingUI
       const btnSave = document.getElementById(`save-${prefix}`);
       const btnReset = document.getElementById(`reset-${prefix}`);
       
       if (!btnOpen || !panel) return;
       
       // Toggle panel
       btnOpen.addEventListener('click', () => {
         panel.classList.toggle('hidden');
         // Se abriu e já tem mapping salvo, tenta renderizar (mesmo sem headers novos)
         if (!panel.classList.contains('hidden')) {
           // tenta carregar headers salvos ou vazios
           renderMappingUI(panel.id, fieldsContainer, [], storageKey, fields);
         }
       });
       
       // Handle file sample
       if (fileInput) {
         fileInput.addEventListener('change', async (e) => {
           const f = e.target.files[0];
           if (!f) return;
           try {
             // Requer ExcelUtils ou processamento simples
             let headers = [];
             if (f.name.endsWith('.csv')) {
                const text = await f.text();
                // Simples parse CSV linha 1 ou 2
                const lines = text.split(/\r?\n/);
                // Pega linha configurada ou detecta
                const currentMap = loadMapping(storageKey);
                const rowIdx = (currentMap.headerRow || 2) - 1; 
                if (lines[rowIdx]) headers = lines[rowIdx].split(/,|;/).map(s => s.replace(/["']/g, '').trim());
                else if (lines[0]) headers = lines[0].split(/,|;/).map(s => s.replace(/["']/g, '').trim());
             } else {
                // Se tiver ExcelUtils global
                if (window.ExcelUtils) {
                   const json = await window.ExcelUtils.readExcel(f);
                   headers = getHeadersFromJson(json, (loadMapping(storageKey).headerRow || 0) - 1);
                } else {
                   alert('Biblioteca ExcelUtils não carregada. Tente CSV ou recarregue.');
                   return;
                }
             }
             
             if (headers.length > 0) {
                renderMappingUI(panel.id, fieldsContainer, headers, storageKey, fields);
                showMsg(`Arquivo lido. ${headers.length} colunas encontradas.`);
             }
           } catch (err) {
             console.error(err);
             showMsg('Erro ao ler arquivo: ' + err.message, true);
           }
         });
       }
       
       // Save
       if (btnSave) {
         btnSave.addEventListener('click', () => {
            const container = document.getElementById(fieldsContainer);
            const selects = container.querySelectorAll('select');
            const map = loadMapping(storageKey); // preserve existing props like headerRow
            selects.forEach(sel => {
               // find key from label sibling? No, recreate structure or rely on order?
               // Better: iterate fields definition again and match index
               // renderMappingUI creates rows in same order as fields
            });
            
            // Re-read from DOM
            let idx = 0;
            fields.forEach(f => {
               if (selects[idx]) {
                 const val = selects[idx].value;
                 if (val) map[f.key] = val;
                 else delete map[f.key];
                 idx++;
               }
            });
            
            saveMapping(storageKey, map);
            showMsg(`Mapeamento ${prefix} salvo.`);
            panel.classList.add('hidden');
         });
       }
       
       // Reset
       if (btnReset) {
         btnReset.addEventListener('click', () => {
           if (confirm('Restaurar mapeamento padrão?')) {
             saveMapping(storageKey, {}); // limpa mas mantém objeto
             showMsg('Mapeamento resetado.');
             panel.classList.add('hidden');
             // reload page or re-render if open
           }
         });
       }
    }

    // ---------- Configuração de Períodos ----------
    function initPeriodosConfig() {
      setupToggle('btn-toggle-periodos', 'periodos-section', 'Configuração de Períodos do Dia', 'Fechar Configuração de Períodos');
      
      const container = document.getElementById('periodos-config-container');

      const btnSave = document.getElementById('btn-save-periodos');
      const btnReset = document.getElementById('btn-reset-periodos');
      
      if (!container) return;

      // Add Edit button if not exists (dynamic UI)
      let btnEdit = document.getElementById('btn-edit-periodos');
      if (!btnEdit && btnSave) {
         btnEdit = document.createElement('button');
         btnEdit.id = 'btn-edit-periodos';
         btnEdit.className = 'bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded px-4 py-2';
         btnEdit.textContent = 'Editar Regras';
         // Insert before save
         btnSave.parentNode.insertBefore(btnEdit, btnSave);
         // Hide save/reset initially
         btnSave.classList.add('hidden');
         btnReset.classList.add('hidden');
      }
      
      // Cancel button
      let btnCancel = document.getElementById('btn-cancel-periodos');
      if (!btnCancel && btnSave) {
         btnCancel = document.createElement('button');
         btnCancel.id = 'btn-cancel-periodos';
         btnCancel.className = 'bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded px-4 py-2 hidden';
         btnCancel.textContent = 'Cancelar';
         btnSave.parentNode.appendChild(btnCancel);
      }
      
      function render(editable = false) {
        const config = (window.SharedUtils && window.SharedUtils.getPeriodosConfig) ? window.SharedUtils.getPeriodosConfig() : {};
        container.innerHTML = '';
        const order = ['Madrugada', 'Manhã', 'Tarde', 'Noite'];
        
        order.forEach(nome => {
           const range = config[nome] || { start: '00:00', end: '00:00' };
           const div = document.createElement('div');
           div.className = 'border rounded p-3 bg-gray-50';
           div.innerHTML = `
             <div class="font-semibold text-gray-700 mb-2">${nome}</div>
             <div class="flex items-center gap-2 mb-2">
               <label class="text-xs w-10">Início:</label>
               <input type="time" class="p-start border rounded px-1 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500" data-period="${nome}" value="${range.start}" ${editable?'':'disabled'}>
             </div>
             <div class="flex items-center gap-2">
               <label class="text-xs w-10">Fim:</label>
               <input type="time" class="p-end border rounded px-1 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500" data-period="${nome}" value="${range.end}" ${editable?'':'disabled'}>
             </div>
           `;
           container.appendChild(div);
        });
      }
      
      render(false);

      if (btnEdit) {
         btnEdit.addEventListener('click', () => {
            render(true);
            btnEdit.classList.add('hidden');
            btnSave.classList.remove('hidden');
            btnReset.classList.remove('hidden');
            btnCancel.classList.remove('hidden');
         });
      }

      if (btnCancel) {
         btnCancel.addEventListener('click', () => {
            render(false);
            btnEdit.classList.remove('hidden');
            btnSave.classList.add('hidden');
            btnReset.classList.add('hidden');
            btnCancel.classList.add('hidden');
         });
      }
      
      if (btnSave) {
        btnSave.addEventListener('click', () => {
          const newConfig = {};
          const cards = container.querySelectorAll('div.border');
          let hasError = false;
          
          cards.forEach(card => {
             const startIn = card.querySelector('.p-start');
             const endIn = card.querySelector('.p-end');
             if (startIn && endIn) {
               const nome = startIn.dataset.period;
               newConfig[nome] = { start: startIn.value, end: endIn.value };
             }
          });
          
          if (!hasError) {
             if(window.SharedUtils && window.SharedUtils.savePeriodosConfig) {
                window.SharedUtils.savePeriodosConfig(newConfig);
             }
             showMsg('Períodos atualizados com sucesso!');
             // Return to view mode
             render(false);
             btnEdit.classList.remove('hidden');
             btnSave.classList.add('hidden');
             btnReset.classList.add('hidden');
             btnCancel.classList.add('hidden');
          }
        });
      }
      
      if (btnReset) {
        btnReset.addEventListener('click', () => {
          if (confirm('Restaurar períodos padrão?')) {
            localStorage.removeItem('config_periodos');
            render(true); // Keep in edit mode to show changes? Or close? Let's keep in edit mode so user sees what happened
            showMsg('Períodos restaurados.');
          }
        });
      }
    }

    // ---------- Backup Section ----------
    function initBackupSection() {
      const btnExport = document.getElementById('btn-export-backup');
      const inputImport = document.getElementById('input-import-backup');
      const btnClear = document.getElementById('btn-clear-data');
      
      // updateStorageIndicator removido da UI
      
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
          // Mostra modal customizado
          const modal = document.getElementById('modal-limpar-dados');
          if (modal) modal.classList.remove('hidden');
        });
      }

      // Modal lógica
      const modal = document.getElementById('modal-limpar-dados');
      const btnNuvem = document.getElementById('btn-apagar-nuvem');
      const btnLocal = document.getElementById('btn-apagar-local');
      const btnCancelar = document.getElementById('btn-cancelar-limpar');
      if (btnCancelar && modal) {
        btnCancelar.onclick = () => modal.classList.add('hidden');
      }
      if (btnNuvem) {
        btnNuvem.onclick = async () => {
          modal.classList.add('hidden');
          showMsg('Apagando dados da nuvem...');
          try {
            if (window.FirebaseStore && window.FirebaseStore.getAllKeys) {
              const keys = await window.FirebaseStore.getAllKeys();
              // Não apagar dados de usuários
              const userKeys = ['users', 'usuarios', 'user-management', 'gestao-usuarios'];
              const toDelete = keys.filter(k => !userKeys.includes(k));
              for (const key of toDelete) {
                await window.FirebaseStore.removeItem(key);
              }
              showMsg('Dados da nuvem apagados com sucesso!');
            } else {
              showMsg('FirebaseStore não disponível.', true);
            }
          } catch (e) {
            showMsg('Erro ao apagar dados da nuvem.', true);
          }
        };
      }
      if (btnLocal) {
        btnLocal.onclick = async () => {
          modal.classList.add('hidden');
          showMsg('Apagando dados locais...');
          try {
            // Chaves de gestão de usuários que devem ser preservadas
            const userKeys = ['users', 'usuarios', 'user-management', 'gestao-usuarios'];

            // Limpa localStorage, preservando dados de usuários
            for (let i = localStorage.length - 1; i >= 0; i--) {
              const key = localStorage.key(i);
              if (!userKeys.includes(key)) {
                localStorage.removeItem(key);
              }
            }

            // Limpa IndexedDB, preservando dados de usuários
            if (window.IndexedDBStore && window.IndexedDBStore.getAllKeys && window.IndexedDBStore.removeItem) {
              const keys = await window.IndexedDBStore.getAllKeys();
              for (const key of keys) {
                if (!userKeys.includes(key)) {
                  await window.IndexedDBStore.removeItem(key);
                }
              }
            } else if (window.IndexedDBStore && window.IndexedDBStore.clear) {
              // Se não for possível filtrar, faz clear (menos seguro)
              await window.IndexedDBStore.clear();
            }

            showMsg('Dados locais apagados, gestão de usuários preservada!');
          } catch (e) {
            showMsg('Erro ao apagar dados locais.', true);
          }
        };
      }
    }

    // initResetButton removed

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






