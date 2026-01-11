    // Toggle para exibir/ocultar os painéis de importação ao clicar em 'Importar Vendas'
    (function(){
      const btn = document.getElementById('btn-toggle-import');
      const panels = document.getElementById('import-panels');
      if(btn && panels){
        btn.addEventListener('click', ()=>{
          const isClosed = panels.classList.contains('max-h-0');
          if(isClosed){
            // Open
            panels.classList.remove('max-h-0','opacity-0','-translate-y-2');
            panels.classList.add('max-h-[1000px]','opacity-100','translate-y-0');
            panels.classList.remove('md:scale-95'); panels.classList.add('md:scale-100');
          } else {
            // Close
            panels.classList.remove('max-h-[1000px]','opacity-100','translate-y-0');
            panels.classList.add('max-h-0','opacity-0','-translate-y-2');
            panels.classList.remove('md:scale-100'); panels.classList.add('md:scale-95');
          }
        });
      }
    })();
    
    // --- helpers ---
    async function carregarVendasResumoAsync(){
      try {
        // Prioridade: Firebase > IndexedDB > localStorage > cache em memória
        if (window.FirebaseStore && window.FirebaseStore.isAvailable) {
          try {
            const isAvailable = await window.FirebaseStore.isAvailable();
            if (isAvailable) {
              const dados = await window.FirebaseStore.getItem('vendasResumo', []);
              if (dados && Array.isArray(dados) && dados.length > 0) {
                // Sincroniza com localStorage/IndexedDB
                try { localStorage.setItem('vendasResumo', JSON.stringify(dados)); } catch(e) {}
                try { await idbPut('vendasResumo', dados); } catch(e) {}
                window._vendasResumo_inMemory = dados.slice();
                return dados;
              }
            }
          } catch (err) {
            console.warn('[Receitas] Erro ao carregar do Firebase, tentando IndexedDB:', err);
          }
        }
        
        // Fallback: IndexedDB
        try {
          const dados = await idbGet('vendasResumo');
          if (dados && Array.isArray(dados) && dados.length > 0) {
            try { localStorage.setItem('vendasResumo', JSON.stringify(dados)); } catch(e) {}
            window._vendasResumo_inMemory = dados.slice();
            return dados;
          }
        } catch(e) {}
        
        // Fallback: localStorage
        const dados = JSON.parse(localStorage.getItem('vendasResumo'))||[];
        if (Array.isArray(dados) && dados.length > 0) {
          window._vendasResumo_inMemory = dados.slice();
        }
        return dados;
      } catch(e){ console.error('[DEBUG] Erro ao carregar dados:', e); return []; }
    }
    
    function carregarVendasResumo(){
      try {
        // Tenta sincronizar do Firebase em background (não bloqueia)
        if (window.FirebaseStore && window.FirebaseStore.isAvailable) {
          window.FirebaseStore.isAvailable().then(available => {
            if (available) {
              window.FirebaseStore.getItem('vendasResumo', []).then(dados => {
                if (dados && Array.isArray(dados) && dados.length > 0) {
                  try { localStorage.setItem('vendasResumo', JSON.stringify(dados)); } catch(e) {}
                  window._vendasResumo_inMemory = dados.slice();
                }
              }).catch(() => {});
            }
          }).catch(() => {});
        }
        
        // Prefer in-memory cache loaded from IndexedDB (IDB is default backend)
        if(window._vendasResumo_inMemory && Array.isArray(window._vendasResumo_inMemory)) return window._vendasResumo_inMemory;
        const dados = JSON.parse(localStorage.getItem('vendasResumo'))||[];
        return dados;
      } catch(e){ console.error('[DEBUG] Erro ao carregar dados:', e); return []; }
    }
    // --- IndexedDB helpers (fallback for large datasets) ---
    function idbOpen(){
      return new Promise((resolve,reject)=>{
        if(!window.indexedDB){ return reject(new Error('IndexedDB não suportado')); }
        const req = indexedDB.open('irancash_db', 1);
        req.onupgradeneeded = function(e){
          try{ const db = e.target.result; if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv',{ keyPath: 'k' }); }catch(err){ /* ignore */ }
        };
        req.onsuccess = function(e){ resolve(e.target.result); };
        req.onerror = function(e){ reject(e.target.error || new Error('IndexedDB open error')); };
      });
    }
    function idbPut(k, v){
      try{
        return idbOpen().then(db => new Promise((res, rej)=>{
          try{
            const tx = db.transaction('kv','readwrite');
            const store = tx.objectStore('kv');
            const req = store.put({ k: String(k), v: v });
            req.onsuccess = ()=>{ try{ db.close(); }catch(e){} res(true); };
            req.onerror = (ev)=>{ try{ db.close(); }catch(e){} rej(ev.target.error || new Error('idb put failed')); };
          }catch(err){ try{ db.close(); }catch(e){} rej(err); }
        }));
      }catch(e){ return Promise.reject(e); }
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
    function idbDelete(k){
      try{
        return idbOpen().then(db => new Promise((res, rej)=>{
          try{
            const tx = db.transaction('kv','readwrite');
            const store = tx.objectStore('kv');
            const req = store.delete(String(k));
            req.onsuccess = function(){ try{ db.close(); }catch(e){} res(true); };
            req.onerror = function(ev){ try{ db.close(); }catch(e){} rej(ev.target.error || new Error('idb delete failed')); };
          }catch(err){ try{ db.close(); }catch(e){} rej(err); }
        }));
      }catch(e){ return Promise.reject(e); }
    }

    // On init, if we have an IndexedDB marker but no localStorage data, try to migrate async to localStorage so sync loaders work.
    function tryMigrateFromIDB(){
      try{
        // vendasDetalhadas
        if(!localStorage.getItem('vendasDetalhadas') && localStorage.getItem('vendasDetalhadas_idb')){
          idbGet('vendasDetalhadas').then(data => {
            if(!data) return;
            try{
              // write compact form into localStorage for sync access
              if(Array.isArray(data) || (data && data.data)){
                const payload = data.data || data;
                try{ localStorage.setItem('vendasDetalhadas', JSON.stringify(payload)); localStorage.setItem('vendasDetalhadas_last_update', String(Date.now())); }catch(e){}
              }
            }catch(e){}
          }).catch(e=>{});
        }
        // vendasResumoDia
        if(!localStorage.getItem('vendasResumoDia') && localStorage.getItem('vendasResumoDia_idb')){
          idbGet('vendasResumoDia').then(data => {
            if(!data) return;
            try{ const payload = data.data || data; try{ localStorage.setItem('vendasResumoDia', JSON.stringify(payload)); localStorage.setItem('vendasResumoDia_last_update', String(Date.now())); }catch(e){} }catch(e){}
          }).catch(e=>{});
        }
      }catch(e){}
    }

    // Load data from Firebase > IndexedDB into in-memory caches
    function loadAllFromIDB(){
      // returns a Promise
      return Promise.resolve().then(async ()=>{
        try{
          // Carrega do Firebase primeiro, depois IndexedDB como fallback
          
          // vendasDetalhadas
          try{
            let data = null;
            if (window.FirebaseStore && window.FirebaseStore.isAvailable) {
              try {
                const isAvailable = await window.FirebaseStore.isAvailable();
                if (isAvailable) {
                  data = await window.FirebaseStore.getItem('vendasDetalhadas');
                }
              } catch(e) {}
            }
            if (!data) {
              data = await idbGet('vendasDetalhadas');
            }
            if(data && data.data && Array.isArray(data.data)){
              // expand compact into canonical objects
              try{ window._vendasDetalhadas_inMemory = data.data.map(it => ({ date: it.d||'', time: it.t||'', dateMs: (it.ms!=null)?Number(it.ms):null, valorBruto: (it.v!=null)?(Number(it.v)/100):0, mdr: (it.m!=null)?(Number(it.m)/100):0, source: it.s||'', tipoPagamento: it.p||'', id: it.id||'' })); }catch(e){}
              try{ localStorage.setItem('vendasDetalhadas_idb','1'); }catch(e){}
            }
          }catch(e){ /* ignore */ }
          
          // vendasResumoDia
          try{
            let data2 = null;
            if (window.FirebaseStore && window.FirebaseStore.isAvailable) {
              try {
                const isAvailable = await window.FirebaseStore.isAvailable();
                if (isAvailable) {
                  data2 = await window.FirebaseStore.getItem('vendasResumoDia');
                }
              } catch(e) {}
            }
            if (!data2) {
              data2 = await idbGet('vendasResumoDia');
            }
            if(data2 && data2.data && Array.isArray(data2.data)){
              try{ window._vendasResumoDia_inMemory = data2.data.map(it => ({ anoMesDia: it.a||'', anoMes: (it.a||'').slice(0,7), receitaBruta: (it.b!=null)?(Number(it.b)/100):0, mdr: (it.c!=null)?(Number(it.c)/100):0, source: it.s||'', tipoPagamento: it.p||'' })); }catch(e){}
              try{ localStorage.setItem('vendasResumoDia_idb','1'); }catch(e){}
            }
          }catch(e){ /* ignore */ }
          
          // vendasResumo (mensal)
          try{
            let data3 = null;
            if (window.FirebaseStore && window.FirebaseStore.isAvailable) {
              try {
                const isAvailable = await window.FirebaseStore.isAvailable();
                if (isAvailable) {
                  data3 = await window.FirebaseStore.getItem('vendasResumo');
                }
              } catch(e) {}
            }
            if (!data3) {
              data3 = await idbGet('vendasResumo');
            }
            if(data3){ try{ window._vendasResumo_inMemory = data3; try{ localStorage.setItem('vendasResumo_idb','1'); }catch(e){} }catch(e){} }
          }catch(e){ /* ignore */ }
        }catch(e){ /* swallow */ }
        return true;
      });
    }

    // Fecha/recolhe o painel de importação e oculta o painel de 'Ferramentas rápidas'
    function closeImportPanelsAndHideQuickTools(){
      try{
        const panels = document.getElementById('import-panels');
        if(panels){
          panels.classList.remove('max-h-[1000px]','opacity-100','translate-y-0');
          panels.classList.add('max-h-0','opacity-0','-translate-y-2');
          panels.classList.remove('md:scale-100'); panels.classList.add('md:scale-95');
        }
        const importCfg = document.getElementById('import-config-panel');
        if(importCfg){ importCfg.classList.remove('max-h-[1000px]','opacity-100','translate-y-0'); importCfg.classList.add('max-h-0','opacity-0','-translate-y-2'); importCfg.classList.remove('md:scale-100'); importCfg.classList.add('md:scale-95'); }
        const quick = document.getElementById('quick-tools-panel'); if(quick) quick.style.display = 'none';
        const btn = document.getElementById('btn-toggle-import'); if(btn) btn.textContent = 'Importar Vendas';
      }catch(e){ /* swallow */ }
    }

    // Migrate existing localStorage datasets (vendasDetalhadas, vendasResumoDia) into IndexedDB
    async function migrateLocalStorageToIDB(){
      try{
        // VENDAS DETALHADAS
        try{
          const existsLegacy = !!localStorage.getItem('vendasDetalhadas') || !!localStorage.getItem('vendasDetalhadas_chunks');
          const alreadyIdb = !!localStorage.getItem('vendasDetalhadas_idb');
          if(existsLegacy && !alreadyIdb){
            console.info('Migrando vendasDetalhadas do localStorage para IndexedDB...');
            // carregarVendasDetalhadas expande formatos e returns canonical array
            const canonical = carregarVendasDetalhadas() || [];
            // build compact representation (short keys, cents)
            const compact = canonical.map(x => ({ d: x.date || '', t: x.time || '', ms: (x.dateMs!=null)?Number(x.dateMs):null, v: Math.round((Number(x.valorBruto||0)||0)*100), s: x.source||'', p: x.tipoPagamento||'', m: Math.round((Number(x.mdr||0)||0)*100), id: x.id||'' }));
            await idbPut('vendasDetalhadas', { format:'compact', data: compact });
            // set marker and in-memory cache
            try{ localStorage.setItem('vendasDetalhadas_idb','1'); }catch(e){}
            try{ window._vendasDetalhadas_inMemory = canonical.slice(); }catch(e){}
            // cleanup localStorage keys to free space
            try{ localStorage.removeItem('vendasDetalhadas'); }catch(e){}
            try{ const meta = JSON.parse(localStorage.getItem('vendasDetalhadas_chunks')||'[]'); for(const k of meta) try{ localStorage.removeItem(k); }catch(e){} localStorage.removeItem('vendasDetalhadas_chunks'); }catch(e){}
            try{ localStorage.removeItem('vendasDetalhadas_format'); }catch(e){}
            try{ localStorage.removeItem('vendasDetalhadas_last_update'); }catch(e){}
            console.info('Migração vendasDetalhadas concluída.');
          }
        }catch(e){ console.warn('Migração vendasDetalhadas falhou', e); }

        // VENDAS RESUMO DIA
        try{
          const existsResumo = !!localStorage.getItem('vendasResumoDia') || !!localStorage.getItem('vendasResumoDia_chunks');
          const alreadyIdbResumo = !!localStorage.getItem('vendasResumoDia_idb');
          if(existsResumo && !alreadyIdbResumo){
            console.info('Migrando vendasResumoDia do localStorage para IndexedDB...');
            const canonical = carregarVendasResumoDia() || [];
            const compact = canonical.map(x => ({ a: x.anoMesDia || x.date || '', b: Math.round((Number(x.receitaBruta||0)||0)*100), c: Math.round((Number(x.mdr||0)||0)*100), s: x.source||'', p: x.tipoPagamento||'' }));
            await idbPut('vendasResumoDia', { format:'compact', data: compact });
            try{ localStorage.setItem('vendasResumoDia_idb','1'); }catch(e){}
            try{ window._vendasResumoDia_inMemory = canonical.slice(); }catch(e){}
            try{ localStorage.removeItem('vendasResumoDia'); }catch(e){}
            try{ const meta = JSON.parse(localStorage.getItem('vendasResumoDia_chunks')||'[]'); for(const k of meta) try{ localStorage.removeItem(k); }catch(e){} localStorage.removeItem('vendasResumoDia_chunks'); }catch(e){}
            try{ localStorage.removeItem('vendasResumoDia_last_update'); }catch(e){}
            console.info('Migração vendasResumoDia concluída.');
          }
        }catch(e){ console.warn('Migração vendasResumoDia falhou', e); }

        return true;
      }catch(err){ console.error('migrateLocalStorageToIDB falhou', err); return false; }
    }

    // expose for manual invocation from Console
    window.performFullIDBMigration = migrateLocalStorageToIDB;
    async function salvarVendasResumo(v){ 
      // Salva no Firebase primeiro (se disponível)
      if (window.FirebaseStore && window.FirebaseStore.isAvailable) {
        try {
          const isAvailable = await window.FirebaseStore.isAvailable();
          if (isAvailable) {
            await window.FirebaseStore.setItem('vendasResumo', v);
            console.log('[Receitas] vendasResumo salvo no Firebase');
          }
        } catch (err) {
          console.warn('[Receitas] Erro ao salvar vendasResumo no Firebase:', err);
        }
      }
      
      // Salva também no IndexedDB/localStorage (backup local)
      try{ localStorage.setItem('vendasResumo', JSON.stringify(v)); }catch(e){}
      try{ localStorage.setItem('vendasResumo_last_update', String(Date.now())); }catch(e){}
      // persist monthly resumo also to IndexedDB and update in-memory cache
      try{ idbPut('vendasResumo', v).then(()=>{ try{ localStorage.setItem('vendasResumo_idb','1'); }catch(e){} }).catch(()=>{}); }catch(e){}
      try{ window._vendasResumo_inMemory = Array.isArray(v) ? v.slice() : null; }catch(e){}
    }
    async function salvarVendasPeriodoDoDia(v){
      if (window.FirebaseStore && window.FirebaseStore.isAvailable) {
        try {
          const isAvailable = await window.FirebaseStore.isAvailable();
          if (isAvailable) {
            await window.FirebaseStore.setItem('vendasPeriodoDoDia', v);
            console.log('[Receitas] vendasPeriodoDoDia salvo no Firebase');
          }
        } catch (err) {
          console.warn('[Receitas] Erro ao salvar vendasPeriodoDoDia no Firebase:', err);
        }
      }

      try{ localStorage.setItem('vendasPeriodoDoDia', JSON.stringify(v)); }catch(e){}
      try{ localStorage.setItem('vendasPeriodoDoDia_last_update', String(Date.now())); }catch(e){}
      try{ window._vendasPeriodoDoDia_inMemory = Array.isArray(v) ? v.slice() : null; }catch(e){}
    }

    async function carregarVendasPeriodoDoDiaAsync(){
      try{
        if (window._vendasPeriodoDoDia_inMemory && Array.isArray(window._vendasPeriodoDoDia_inMemory)) {
          return window._vendasPeriodoDoDia_inMemory.slice();
        }
        if (window.FirebaseStore && window.FirebaseStore.isAvailable) {
          try {
            const isAvailable = await window.FirebaseStore.isAvailable();
            if (isAvailable) {
              const dados = await window.FirebaseStore.getItem('vendasPeriodoDoDia', []);
              if (dados && Array.isArray(dados)) {
                try { localStorage.setItem('vendasPeriodoDoDia', JSON.stringify(dados)); } catch(e){}
                window._vendasPeriodoDoDia_inMemory = dados.slice();
                return dados;
              }
            }
          } catch(e) {}
        }
        const local = JSON.parse(localStorage.getItem('vendasPeriodoDoDia') || '[]') || [];
        if (Array.isArray(local)) return local;
        return [];
      }catch(e){ return []; }
    }

    function carregarVendasPeriodoDoDia(){
      try{
        if (window._vendasPeriodoDoDia_inMemory && Array.isArray(window._vendasPeriodoDoDia_inMemory)) {
          return window._vendasPeriodoDoDia_inMemory.slice();
        }
        const local = JSON.parse(localStorage.getItem('vendasPeriodoDoDia') || '[]') || [];
        return Array.isArray(local) ? local : [];
      }catch(e){ return []; }
    }
    // Armazenamento por dia (detalhado) - novo comportamento: gravamos vendas por dia em vendasResumoDia
    function carregarVendasResumoDia(){
      try {
        const CHUNKS_META_KEY = 'vendasResumoDia_chunks';
        const chunksMeta = localStorage.getItem(CHUNKS_META_KEY);
        if(chunksMeta){
          try{
            const keys = JSON.parse(chunksMeta) || [];
            let out = [];
            for(const k of keys){
              try{ const part = JSON.parse(localStorage.getItem(k) || '[]'); if(Array.isArray(part)) out = out.concat(part); }catch(e){}
            }
            // detect compact format (short keys) and expand to canonical shape
            try{
              if(out.length>0 && out[0] && (out[0].a !== undefined || out[0].b !== undefined)){
                const expanded = out.map(it => ({
                  anoMesDia: it.a || it.date || '',
                  anoMes: (it.a || '').slice(0,7) || it.anoMes || '',
                  receitaBruta: (it.b != null) ? (Number(it.b)/100) : Number(it.receitaBruta || it.valor || 0),
                  mdr: (it.c != null) ? (Number(it.c)/100) : Number(it.mdr || 0),
                  receitaLiquida: (it.b != null && it.c != null) ? (Number(it.b - (it.c||0))/100) : Number(it.receitaLiquida || 0),
                  source: it.s || it.source || '',
                  tipoPagamento: it.p || it.tipoPagamento || ''
                }));
                return expanded;
              }
            }catch(e){ /* ignore expand errors */ }
            return out;
          }catch(e){ console.error('[DEBUG] erro ao montar chunks vendasResumoDia', e); }
        }
        // legacy single-key
        const raw = JSON.parse(localStorage.getItem('vendasResumoDia') || '[]') || [];
        // if legacy is empty but we have an in-memory fallback from IDB, return it
        try{
          if((!raw || (Array.isArray(raw) && raw.length===0)) && window._vendasResumoDia_inMemory && Array.isArray(window._vendasResumoDia_inMemory)){
            try{
              const mem = window._vendasResumoDia_inMemory || [];
              const mapped = mem.map(function(it){
                try{
                  const anoMesDia = it.anoMesDia || it.date || it.a || '';
                  const anoMes = it.anoMes || (String(anoMesDia||'').slice(0,7)) || '';
                  const receitaBruta = (it.b!=null) ? (Number(it.b)/100) : Number(it.receitaBruta||0);
                  const mdr = (it.c!=null) ? (Number(it.c)/100) : Number(it.mdr||0);
                  const receitaLiquida = (it.receitaLiquida!=null) ? Number(it.receitaLiquida) : ((it.b!=null && it.c!=null) ? ((Number(it.b)-Number(it.c))/100) : Number(it.receitaLiquida||0));
                  return { anoMesDia, anoMes, receitaBruta, mdr, receitaLiquida, source: it.source||it.s||'', tipoPagamento: it.tipoPagamento||it.p||'' };
                }catch(e){ return it; }
              });
              return mapped;
            }catch(e){}
          }
        }catch(e){}
        try{
          if(Array.isArray(raw) && raw.length>0 && raw[0] && (raw[0].a !== undefined || raw[0].b !== undefined)){
            return raw.map(it => ({ anoMesDia: it.a || '', anoMes: (it.a||'').slice(0,7), receitaBruta: (it.b!=null)?(Number(it.b)/100):0, mdr: (it.c!=null)?(Number(it.c)/100):0, receitaLiquida: (it.b!=null && it.c!=null)?((Number(it.b)-Number(it.c))/100):0, source: it.s||'', tipoPagamento: it.p||'' }));
          }
        }catch(e){}
        return raw;
      } catch(e){ console.error('[DEBUG] Erro ao carregar vendasResumoDia', e); return []; }
    }
    async function salvarVendasResumoDia(v){
      try{
        const CHUNKS_META_KEY = 'vendasResumoDia_chunks';
        if(!Array.isArray(v)) v = [];
        // compact representation: a=anoMesDia, b=receitaBruta(cents), c=mdr(cents), s=source, p=tipo
        const compact = v.map(x => ({ a: x.anoMesDia || x.date || '', b: Math.round((Number(x.receitaBruta||x.valor||0)||0) * 100), c: Math.round((Number(x.mdr||0)||0) * 100), s: x.source||'', p: x.tipoPagamento||'' }));
        
        // Salva no Firebase primeiro (se disponível)
        if (window.FirebaseStore && window.FirebaseStore.isAvailable) {
          try {
            const isAvailable = await window.FirebaseStore.isAvailable();
            if (isAvailable) {
              await window.FirebaseStore.setItem('vendasResumoDia', { format: 'compact', data: compact });
              console.log('[Receitas] vendasResumoDia salvo no Firebase');
            }
          } catch (err) {
            console.warn('[Receitas] Erro ao salvar vendasResumoDia no Firebase:', err);
          }
        }
        
  // Persist compact copy to IndexedDB asynchronously (IDB is the default backend)
  try{ idbPut('vendasResumoDia', { format: 'compact', data: compact }).then(()=>{ try{ localStorage.setItem('vendasResumoDia_idb','1'); }catch(e){} }).catch(()=>{}); }catch(e){}
  // update in-memory cache
  try{ window._vendasResumoDia_inMemory = Array.isArray(v) ? v.slice() : null; }catch(e){}
        // try single-key write first
        try{ localStorage.setItem('vendasResumoDia', JSON.stringify(compact)); localStorage.setItem('vendasResumoDia_last_update', String(Date.now())); try{ localStorage.removeItem(CHUNKS_META_KEY); }catch(e){} return true; }catch(e){}

        // chunked persistence, adaptive
        try{
          try{ const prev = localStorage.getItem(CHUNKS_META_KEY); if(prev){ const keys = JSON.parse(prev)||[]; for(const k of keys) try{ localStorage.removeItem(k); }catch(e){} } }catch(e){}
          let CHUNK_SIZE = 500;
          while(CHUNK_SIZE >= 20){
            try{
              const chunkKeys = [];
              for(let i=0;i<compact.length;i+=CHUNK_SIZE){ const slice = compact.slice(i,i+CHUNK_SIZE); const key = `vendasResumoDia_chunk_${Math.floor(i/CHUNK_SIZE)}`; localStorage.setItem(key, JSON.stringify(slice)); chunkKeys.push(key); }
              localStorage.setItem(CHUNKS_META_KEY, JSON.stringify(chunkKeys));
              localStorage.setItem('vendasResumoDia_last_update', String(Date.now()));
              try{ localStorage.removeItem('vendasResumoDia'); }catch(e){}
              return true;
            }catch(e){ // clear partial and reduce size
              try{ const keys = JSON.parse(localStorage.getItem(CHUNKS_META_KEY) || '[]'); for(const k of keys) try{ localStorage.removeItem(k); }catch(_){}}catch(_){ }
              CHUNK_SIZE = Math.floor(CHUNK_SIZE/2);
            }
          }
          // fallback to IndexedDB if localStorage chunking failed
          try{
            // ensure in-memory cache updated and persist to IndexedDB
            try{ window._vendasResumoDia_inMemory = Array.isArray(v) ? v.slice() : null; }catch(e){}
            try{
              // Await idbPut so we can refresh UI after persistence
              idbPut('vendasResumoDia', { format: 'compact', data: compact }).then(()=>{
                try{ localStorage.setItem('vendasResumoDia_idb','1'); }catch(e){}
                // attempt to refresh in-memory caches / UI from IDB to ensure page reflects new data
                try{ loadAllFromIDB().then(()=>{ try{ atualizarSelectAnos(); const sel = document.getElementById('select-anos-receitas'); if(sel && sel.value) renderizarReceitasAno(sel.value); }catch(e){} }).catch(()=>{}); }catch(e){}
              }).catch(err=>{ console.error('IDB save failed', err); });
            }catch(e){ console.error('IDB put failed', e); }
          }catch(e){}
          // fallback to IndexedDB used; treat as success for the import flow (UI updated from IDB)
          console.info('vendasResumoDia salvo em IndexedDB (fallback após quota excedida)');
          return true;
        }catch(e){ console.error('Erro ao salvar vendasResumoDia', e); return false; }
      }catch(err){ console.error('salvarVendasResumoDia falhou', err); return false; }
    }

    // Agrega vendasResumoDia em vendasResumo (mensal) — mantém compatibilidade com UI atual
    function computeMonthlyResumoFromDaily(){
      try{
        const daily = carregarVendasResumoDia();
        const map = new Map();
        for(const d of daily){
          // d.anoMesDia esperado como 'YYYY/MM/DD' ou tente extrair de d.anoMes
          let anoMesDia = d.anoMesDia || d.date || d.anoMes || '';
          // if date ISO available in d.date, prefer it
          if (d.date && !d.anoMesDia){
            try{ const dt = new Date(d.date); if(!isNaN(dt.getTime())){ const y = dt.getFullYear(); const m = String(dt.getMonth()+1).padStart(2,'0'); const day = String(dt.getDate()).padStart(2,'0'); anoMesDia = `${y}/${m}/${day}`; } }catch(e){}
          }
          // normalize to YYYY/MM/DD
          let parts = String(anoMesDia||'').split('/');
          if(parts.length >= 3){
            const ano = parts[0]; const mes = parts[1].padStart(2,'0'); // day = parts[2]
            const anoMes = `${ano}/${mes}`;
            const key = `${anoMes}||${d.source||''}||${d.tipoPagamento||''}`;
            if(!map.has(key)) map.set(key, { anoMes, source: d.source||'', tipoPagamento: d.tipoPagamento||'', receitaBruta:0, mdr:0, receitaLiquida:0 });
            const obj = map.get(key);
            obj.receitaBruta += Number(d.receitaBruta||d.valor||0);
            obj.mdr += Number(d.mdr||0);
            obj.receitaLiquida = obj.receitaBruta - obj.mdr;
            map.set(key, obj);
          }
        }
        const monthly = Array.from(map.values());
        // salvar em vendasResumo para UI
        salvarVendasResumo(monthly);
        return monthly;
      }catch(e){ console.error('Erro ao computar resumo mensal a partir de diário', e); return []; }
    }
    function orderMonths(values){ 
      // canonical month names without diacritics
      const monthNames = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
      function normalize(s){ try { return String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').trim(); } catch(e) { return String(s||'').toLowerCase().replace(/ç/g,'c').trim(); } }
      function idx(v){ 
        if(v==null) return 99; 
        const s = String(v).trim(); 
        const n = parseInt(s,10); 
        if(!isNaN(n) && n>=1 && n<=12) return n-1; 
        const norm = normalize(s);
        const i = monthNames.indexOf(norm);
        return i>=0?i:99;
      }
      return values.slice().sort((a,b)=>idx(a)-idx(b)); 
    }
    function mesIndex(v){ 
      const monthNames = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
      function normalize(s){ try { return String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').trim(); } catch(e) { return String(s||'').toLowerCase().replace(/ç/g,'c').trim(); } }
      if(v==null) return 99; 
      const s = String(v).trim(); 
      const n = parseInt(s,10); 
      if(!isNaN(n) && n>=1 && n<=12) return n-1; 
      const norm = normalize(s);
      const i = monthNames.indexOf(norm);
      return i>=0?i:99; 
    }

    function atualizarSelectAnos(){ 
      const sel=document.getElementById('select-anos-receitas'); 
      const all=carregarVendasResumo(); 
      const anosSet = new Set(all.map(v=> (v.anoMes && v.anoMes.split('/')[0]) ).filter(Boolean)); 
      const anos=Array.from(anosSet).sort((a,b)=>Number(b)-Number(a)); 
      sel.innerHTML=''; 
      if(anos.length===0){
        const opt=document.createElement('option'); 
        opt.value=''; 
        opt.textContent='Nenhum registro'; 
        sel.appendChild(opt); 
        return;
      } 
      anos.forEach(a=>{
        const opt=document.createElement('option'); 
        opt.value=a; 
        opt.textContent=a; 
        sel.appendChild(opt);
      }); 
      const anoAtual=String(new Date().getFullYear()); 
      if(anos.includes(anoAtual)) sel.value=anoAtual; 
    }

    function renderizarReceitasAno(ano){ 
      const container=document.getElementById('lista-receitas-ano'); 
      container.innerHTML=''; 
      // Sempre renderizar cabeçalho da tabela mesmo que não haja dados — mostraremos linhas vazias/rodapé com zeros
      if(!ano){
        // se nenhum ano for informado, usa o ano atual como default (permite visualizar o cabeçalho)
        ano = String(new Date().getFullYear());
      }
      
      // Atualizar cards de resumo
      atualizarCardsResumo(ano);
      
      const all = carregarVendasResumo().map(v=> ({...v})).filter(v=> (v.anoMes && String(v.anoMes).startsWith(String(ano)+"/"))); 
  // if no data, we'll still render the table header and an empty body (user requested header instead of message)
      // meses, fontes, tipos
      const meses = orderMonths(Array.from(new Set(all.map(v=> v.anoMes && v.anoMes.split('/')[1]).filter(Boolean))).map(m=>{
        const num = parseInt(m,10); if(!isNaN(num)) return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][num-1]; return m; }).filter(Boolean));
      const fontes = Array.from(new Set(all.map(v=> v.source=== 'cartao' ? 'Cartões' : v.source==='pix' ? 'PIX' : (v.source||'')).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
      const tipos = Array.from(new Set(all.map(v=> v.tipoPagamento || '').filter(Boolean))).sort((a,b)=>a.localeCompare(b));
      const filtros = { mes:'Todos', fonte:'Todos', tipo:'Todos' };

      // toolbar (actions only) — filters are rendered inside the table header to match Configurações
      const toolbar = document.createElement('div'); toolbar.className='flex justify-between items-center mb-3';
      toolbar.innerHTML = `<div class="flex gap-2 items-center">
          <span class='text-sm font-semibold'>Filtros</span>
        </div>
        <div class="flex gap-2">
          <button id='btn-limpar-filtros-rec' class='text-sky-700 text-xs'>Limpar filtros</button>
          <button id='btn-delete-selected-rec' class='text-red-600 text-xs'>Excluir selecionados</button>
        </div>`;
      container.appendChild(toolbar);

      // table
      const table = document.createElement('table'); table.className='min-w-full divide-y divide-gray-200 text-sm';
      table.innerHTML = `<thead>
          <tr class='bg-gray-50'>
            <th class='px-2 py-2'><input id='selectAllRec' type='checkbox' /></th>
            <th class='px-2 py-2 text-left'>Ano</th>
            <th class='px-2 py-2 text-left'>Mês</th>
            <th class='px-2 py-2 text-left'>Fonte</th>
            <th class='px-2 py-2 text-left'>Tipo</th>
            <th class='px-2 py-2 text-right'>Receita Bruta</th>
            <th class='px-2 py-2 text-right'>MDR</th>
            <th class='px-2 py-2 text-right'>Receita Líquida</th>
            <th class='px-2 py-2'></th>
          </tr>
          <tr class='bg-white'>
            <th class='px-2 py-2'></th>
            <th class='px-2 py-2'></th>
            <th class='px-2 py-2'>
              <select id='filtro-mes-rec' class='filter w-full'>${['Todos'].concat(meses).map(m=>`<option value="${m}">${m}</option>`).join('')}</select>
            </th>
            <th class='px-2 py-2'>
              <select id='filtro-fonte-rec' class='filter w-full'>${['Todos'].concat(fontes).map(f=>`<option value="${f}">${f}</option>`).join('')}</select>
            </th>
            <th class='px-2 py-2'>
              <select id='filtro-tipo-rec' class='filter w-full'>${['Todos'].concat(tipos).map(t=>`<option value="${t}">${t}</option>`).join('')}</select>
            </th>
            <th class='px-2 py-2'></th>
            <th class='px-2 py-2'></th>
            <th class='px-2 py-2 text-right'></th>
            <th class='px-2 py-2 text-right'></th>
          </tr>
        </thead>
        <tbody></tbody>`;

      container.appendChild(table);

      // container for weekly totals (dias da semana)
      let weeklyContainer = container.querySelector('#weekly-totals-rec');
      if(!weeklyContainer){
        weeklyContainer = document.createElement('div');
        weeklyContainer.id = 'weekly-totals-rec';
        weeklyContainer.className = 'mt-4 bg-white rounded p-4 border';
        container.appendChild(weeklyContainer);
      }

      // container for period totals (período do dia) - REMOVIDO POR SOLICITAÇÃO
      let periodoContainer = container.querySelector('#periodo-totals-rec');
      if(!periodoContainer){
        periodoContainer = document.createElement('div');
        periodoContainer.id = 'periodo-totals-rec';
        periodoContainer.className = 'mt-4 bg-white rounded p-4 border';
        container.appendChild(periodoContainer);
      }

      // container for consistency note
      let consistencyContainer = container.querySelector('#totals-consistency-rec');
      if(!consistencyContainer){
        consistencyContainer = document.createElement('div');
        consistencyContainer.id = 'totals-consistency-rec';
        consistencyContainer.className = 'mt-2 text-xs text-gray-600';
        container.appendChild(consistencyContainer);
      }

        // checagem de consistência entre as três visões (mensal, dia da semana, período do dia)
        (async function reconcileTotalsUI(){
          try{
            // Se não houver um filtro de mês selecionado corretamente, limpa a nota
            const monthIdx = mesIndex(filtros.mes);
            if(!filtros.mes || filtros.mes === 'Todos' || monthIdx === 99) {
              if(typeof consistencyContainer !== 'undefined' && consistencyContainer){
                consistencyContainer.textContent = '';
              }
              return;
            }
            const mesNum = monthIdx + 1;
            const anoStr = String(ano);
            const anoMes = `${anoStr}/${String(mesNum).padStart(2,'0')}`;

            // Calcula o total principal diretamente a partir da tabela renderizada (não depende de variáveis externas)
            let totalPrincipal = 0;
            try{
              const tableEl = container.querySelector('table');
              if(tableEl){
                // tenta obter valor do tfoot; se não, soma as células da coluna "Receita Bruta"
                const tfootVal = tableEl.querySelector('tfoot td');
                if(tfootVal){
                  const txt = tfootVal.textContent || tfootVal.innerText || '';
                  const m = txt.replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',', '.');
                  totalPrincipal = Number(m) || 0;
                } else {
                  // soma valores das linhas (coluna que contém 'R$ ')
                  const rows = tableEl.querySelectorAll('tbody tr');
                  rows.forEach(r=>{
                    const cells = r.querySelectorAll('td');
                    if(cells && cells.length>=6){
                      const txt = cells[5].textContent || '';
                      const m = txt.replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',', '.');
                      totalPrincipal += Number(m) || 0;
                    }
                  });
                }
              }
            }catch(e){ console.warn('Erro ao calcular totalPrincipal a partir da tabela', e); totalPrincipal = 0; }

            // Total semanal: derive a partir de vendasResumoDia (mesma fonte usada para a tabela semanal)
            const weeklySums = getSomaSemanalPorMes(anoMes);
            const totalSemanal = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'].reduce((acc,k)=> acc + Number(weeklySums[k]||0), 0);

            // Total por período: derive usando a função existente (que usa vendasDetalhadas)
            const periodoSums = await getSomaPeriodoPorMes(anoMes);
            const totalPeriodo = ['Madrugada','Manhã','Tarde','Noite'].reduce((acc,k)=> acc + Number(periodoSums[k]||0), 0);

            // Diagnóstico adicional: comparar com vendasDetalhadas e vendasResumoDia (contagens e somas)
            let detalhes = [];
            if (typeof window.carregarVendasDetalhadasAsync === 'function') {
                detalhes = await window.carregarVendasDetalhadasAsync();
            } else {
                detalhes = (typeof carregarVendasDetalhadas === 'function') ? carregarVendasDetalhadas() || [] : (JSON.parse(localStorage.getItem('vendasDetalhadas')||'[]')||[]);
            }
            
            let countDetalhadas = 0, countWithTime = 0;
            let sumDetalhadasTotal = 0, sumDetalhadasWithTime = 0;
            for(const tx of detalhes){
              if(!tx) continue;
              // tentar obter data
              let d = null;
              if(tx.dateMs) d = new Date(Number(tx.dateMs)); else if(tx.date) d = parseToJSDate(tx.date) || new Date(tx.date);
              if(!d || isNaN(d.getTime())){
                const ex = (typeof extractDateTime === 'function') ? extractDateTime(tx.date || tx.time || '') : {dateObj: null, timeStr: null};
                d = ex && ex.dateObj ? ex.dateObj : d;
              }
              if(!d || isNaN(d.getTime())) continue;
              const ym = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;
              if(String(ym) !== String(anoMes)) continue;
              countDetalhadas++;
              const val = Number(tx.valorBruto || tx.value || tx.valor || tx.receitaBruta || 0) || 0;
              sumDetalhadasTotal += val;
              // considera que existe hora se tivermos campo time ou extração retornou timeStr
              let hasTime = false;
              if(tx.time && String(tx.time).trim().length>0) hasTime = true;
              else {
                const ex = (typeof extractDateTime === 'function') ? extractDateTime(tx.date || tx.time || '') : null; if(ex && ex.timeStr) hasTime = true;
              }
              if(hasTime){ countWithTime++; sumDetalhadasWithTime += val; }
            }
            const resumoDia = (typeof carregarVendasResumoDia === 'function') ? carregarVendasResumoDia() || [] : (JSON.parse(localStorage.getItem('vendasResumoDia')||'[]')||[]);
            const resumoDiaFiltered = resumoDia.filter(d => {
              try{ const ym = String(d.anoMes||d.anoMesDia||'').slice(0,7); return String(ym) === String(anoMes); }catch(e){ return false; }
            });
            const countResumoDia = resumoDiaFiltered.length;
            const sumResumoDia = resumoDiaFiltered.reduce((acc,x)=> acc + Number(x.receitaBruta || x.valor || 0), 0);

            const dif1 = Math.abs(totalPrincipal - totalSemanal);
            const dif2 = Math.abs(totalPrincipal - totalPeriodo);
            const ok = (dif1 < 0.005) && (dif2 < 0.005); // tolerância centesimal

            if(typeof consistencyContainer !== 'undefined' && consistencyContainer){
              if(ok){
                consistencyContainer.innerHTML = `<span class="inline-block rounded px-2 py-1 bg-green-50 text-green-700 border border-green-200">Totais consistentes</span>`;
              }else{
                // mensagem detalhada explicativa
                let detailsHtml = `Mensal: R$ ${totalPrincipal.toLocaleString('pt-BR',{minimumFractionDigits:2})} — Semanal: R$ ${totalSemanal.toLocaleString('pt-BR',{minimumFractionDigits:2})} — Período: R$ ${totalPeriodo.toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
                let diag = `<div class="text-xs text-gray-600 mt-2">`;
                diag += `<div>Registros em <strong>vendasResumoDia</strong>: ${countResumoDia} — Soma bruta: R$ ${sumResumoDia.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>`;
                diag += `<div>Registros em <strong>vendasDetalhadas</strong> (mês): ${countDetalhadas} — Soma: R$ ${sumDetalhadasTotal.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>`;
                diag += `<div>Registros em vendasDetalhadas com <strong>hora</strong>: ${countWithTime} — Soma com hora: R$ ${sumDetalhadasWithTime.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>`;
                if(Math.abs(sumDetalhadasWithTime - totalPeriodo) > 0.01){
                  diag += `<div class="mt-1 text-xs text-yellow-700">Observação: o total por período considera apenas transações com informação de hora. Neste mês, apenas R$ ${sumDetalhadasWithTime.toLocaleString('pt-BR',{minimumFractionDigits:2})} têm hora registrada, por isso o total por período é menor que o total mensal.</div>`;
                }
                diag += `</div>`;

                consistencyContainer.innerHTML = `<div class="space-y-1"><div class="inline-block rounded px-2 py-1 bg-yellow-50 text-yellow-800 border border-yellow-200">Diferença detectada entre totais.</div><div class="text-xs text-gray-600">${detailsHtml}</div>${diag}</div>`;
              }
            }
          }catch(e){ console.warn('reconcileTotalsUI falhou', e); }
        })();


        // função que aplica filtros e renderiza linhas / totais / painéis
        function aplicaEFazRender(){ 
          const tbody = table.querySelector('tbody'); 
          tbody.innerHTML=''; 
          let view = all.filter(v=>{
            if(filtros.mes !== 'Todos'){ const mes = (v.anoMes && v.anoMes.split('/')[1]) || ''; const nome = (Number(mes)>=1? ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][Number(mes)-1] : mes); if(String(nome)!==String(filtros.mes)) return false; }
            if(filtros.fonte !== 'Todos'){ const fonte = v.source==='cartao'?'Cartões': v.source==='pix'?'PIX': (v.source||''); if(String(fonte)!==String(filtros.fonte)) return false; }
            if(filtros.tipo !== 'Todos'){ if(String(v.tipoPagamento||'')!==String(filtros.tipo)) return false; }
            return true;
          });
          // ordenar por mês
          view.sort((a,b)=> mesIndex((a.anoMes||'').split('/')[1]) - mesIndex((b.anoMes||'').split('/')[1]));
          view.forEach((v) => {
            const ano = v.anoMes? v.anoMes.split('/')[0]:'';
            const mesNum = v.anoMes? Number(v.anoMes.split('/')[1]): null; 
            const mesNome = mesNum? ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mesNum-1] : '';
            const tr = document.createElement('tr'); 
            
            // Cor de fundo baseada na fonte
            var bgClass = 'odd:bg-white even:bg-gray-50';
            if (v.source === 'cartao') {
              bgClass = 'bg-blue-50 hover:bg-blue-100';
            } else if (v.source === 'pix') {
              bgClass = 'bg-green-50 hover:bg-green-100';
            }
            tr.className = bgClass + ' transition-colors';
            
            // Ícone e badge para fonte
            var fonteDisplay = '';
            if (v.source === 'cartao') {
              fonteDisplay = '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">💳 Cartões</span>';
            } else if (v.source === 'pix') {
              fonteDisplay = '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">📱 PIX</span>';
            } else {
              fonteDisplay = v.source || '';
            }
            
            tr.innerHTML = `
              <td class='px-2 py-2'><input type='checkbox' class='rowCheckbox' data-key='${v.anoMes}__${v.source}__${v.tipoPagamento||''}' /></td>
              <td class='px-2 py-2'>${ano}</td>
              <td class='px-2 py-2 font-medium'>${mesNome}</td>
              <td class='px-2 py-2'>${fonteDisplay}</td>
              <td class='px-2 py-2 text-sm'>${v.tipoPagamento||''}</td>
              <td class='px-2 py-2 text-right text-emerald-600 font-medium'>R$ ${Number(v.receitaBruta||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
              <td class='px-2 py-2 text-right text-red-500'>R$ ${Number(v.mdr||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
              <td class='px-2 py-2 text-right font-bold text-sky-700'>R$ ${Number(v.receitaLiquida||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
              <td class='px-2 py-2 col-actions'><button class='btn-del-rec text-gray-400 hover:text-red-600 transition-colors' data-key='${v.anoMes}__${v.source}__${v.tipoPagamento||''}' title='Excluir'>🗑</button></td>`;
            tbody.appendChild(tr);
          });
          // totais: soma de Receita Bruta, MDR e Receita Líquida
          const totalBruta = view.reduce((acc,x)=> acc + Number(x.receitaBruta||0),0);
          const totalMdr = view.reduce((acc,x)=> acc + Number(x.mdr||0),0);
          const totalLiquida = view.reduce((acc,x)=> acc + Number(x.receitaLiquida||0),0);
          const oldT = table.querySelector('tfoot'); if(oldT) oldT.remove(); 
          const tfoot = document.createElement('tfoot'); 
          tfoot.innerHTML = `
            <tr class='bg-gray-50 font-semibold'>
              <td class='px-2 py-2' colspan='5'></td>
              <td class='px-2 py-2 text-right'>R$ ${totalBruta.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
              <td class='px-2 py-2 text-right'>R$ ${totalMdr.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
              <td class='px-2 py-2 text-right'>R$ ${totalLiquida.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
              <td class='px-2 py-2'></td>
            </tr>`; 
          table.appendChild(tfoot);

          // render weekly totals for selected month
          (function renderWeeklyTotals(){
            try{
              const wrap = weeklyContainer;
              wrap.innerHTML = '';
              if(!filtros.mes || filtros.mes === 'Todos'){
                wrap.innerHTML = `<div class="text-sm text-gray-500">Selecione um mês no filtro acima para ver o total por dia da semana.</div>`;
                return;
              }
              // get month index (0-based) then convert to 1-based
              const monthIdx = mesIndex(filtros.mes);
              if(monthIdx === 99){ wrap.innerHTML = `<div class="text-sm text-gray-500">Mês inválido.</div>`; return; }
              const mesNum = monthIdx + 1;
              const anoStr = String(ano);
              const anoMes = `${anoStr}/${String(mesNum).padStart(2,'0')}`;
              const sums = getSomaSemanalPorMes(anoMes);
              // build table
              const tbl = document.createElement('table'); tbl.className = 'min-w-full text-sm';
              tbl.innerHTML = `<thead><tr class='bg-gray-50'><th class='px-2 py-2 text-left'>Dia da semana</th><th class='px-2 py-2 text-right'>Total (R$)</th></tr></thead><tbody></tbody>`;
              const tb = tbl.querySelector('tbody');
              const order = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
              order.forEach(dn=>{
                const tr = document.createElement('tr'); tr.className='odd:bg-white even:bg-gray-50';
                const val = Number(sums[dn]||0);
                tr.innerHTML = `<td class='px-2 py-2'>${dn.charAt(0).toUpperCase()+dn.slice(1)}</td><td class='px-2 py-2 text-right font-semibold'>R$ ${val.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>`;
                tb.appendChild(tr);
              });
              // linha de total geral
              const totalSum = order.reduce((acc, dn) => acc + Number(sums[dn]||0), 0);
              const trTotal = document.createElement('tr');
              trTotal.className = 'bg-gray-50 font-semibold';
              trTotal.innerHTML = `<td class='px-2 py-2'>Total</td><td class='px-2 py-2 text-right'>R$ ${totalSum.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>`;
              tb.appendChild(trTotal);
              wrap.appendChild(tbl);
            }catch(e){ console.warn('Erro ao renderizar totais semanais', e); }
          })();
          // render period totals for selected month (Período do Dia) REMOVIDO POR SOLICITACAO
          (async function renderPeriodoTotals(){
            try{
              const wrap = periodoContainer;
              if(!wrap) return;
              wrap.innerHTML = '';
              if(!filtros.mes || filtros.mes === 'Todos'){
                wrap.innerHTML = `<div class="text-sm text-gray-500">Selecione um m�s no filtro acima para ver o total por per�odo do dia.</div>`;
                return;
              }
              const monthIdx = mesIndex(filtros.mes);
              if(monthIdx === 99){ wrap.innerHTML = `<div class="text-sm text-gray-500">M�s inv�lido.</div>`; return; }
              const mesNum = monthIdx + 1;
              const anoStr = String(ano);
              const anoMes = `${anoStr}/${String(mesNum).padStart(2,'0')}`;
              const sums = await getSomaPeriodoPorMes(anoMes);
              updateVendasPeriodoDoDiaForMonth(anoMes, sums);

              const tbl = document.createElement('table'); tbl.className = 'min-w-full text-sm';
              tbl.innerHTML = `<thead><tr class='bg-gray-50'><th class='px-2 py-2 text-left'>Periodo do Dia</th><th class='px-2 py-2 text-right'>Total (R$)</th></tr></thead><tbody></tbody>`;
              const tb = tbl.querySelector('tbody');
              const config = (window.SharedUtils && window.SharedUtils.getPeriodosConfig) ? window.SharedUtils.getPeriodosConfig() : {};
              let order = Object.keys(config || {});
              if(order.length === 0) order = ['Madrugada','Manh�','Tarde','Noite'];
              order.forEach(p => {
                const tr = document.createElement('tr'); tr.className = 'odd:bg-white even:bg-gray-50';
                const val = Number(sums[p] || 0);
                tr.innerHTML = `<td class='px-2 py-2'>${p}</td><td class='px-2 py-2 text-right font-semibold'>R$ ${val.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>`;
                tb.appendChild(tr);
              });
              const totalSum = order.reduce((acc, p) => acc + Number(sums[p] || 0), 0);
              const trTotal = document.createElement('tr');
              trTotal.className = 'bg-gray-50 font-semibold';
              trTotal.innerHTML = `<td class='px-2 py-2'>Total</td><td class='px-2 py-2 text-right'>R$ ${totalSum.toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>`;
              tb.appendChild(trTotal);
              wrap.appendChild(tbl);
            }catch(e){
              if(periodoContainer) periodoContainer.innerHTML = '<div class="text-sm text-red-600">Erro ao calcular per�odos.</div>';
            }
          })();

        // seleção
        const selectAll = container.querySelector('#selectAllRec'); 
        const rowCheckboxes = Array.from(container.querySelectorAll('.rowCheckbox'));
        if(selectAll){ 
          selectAll.checked = rowCheckboxes.length>0 && rowCheckboxes.every(r=>r.checked); 
          // usar assignment para evitar múltiplos listeners ao re-render
          selectAll.onchange = function(e){
            rowCheckboxes.forEach(cb=>{
              cb.checked = e.target.checked; 
              const tr=cb.closest('tr'); 
              if(tr) tr.classList.toggle('bg-sky-100', e.target.checked);
            });
          };
        }
        rowCheckboxes.forEach(cb=> cb.addEventListener('change', ()=>{
          if(selectAll) selectAll.checked = rowCheckboxes.length>0 && rowCheckboxes.every(r=>r.checked); 
          const tr=cb.closest('tr'); if(tr) tr.classList.toggle('bg-sky-100', cb.checked);
        }));

        // excluir selecionados
        const btnDelSel = container.querySelector('#btn-delete-selected-rec'); 
        if(btnDelSel) btnDelSel.onclick = function(){
          const checks = Array.from(container.querySelectorAll('.rowCheckbox:checked'));
          if(checks.length===0){ alert('Nenhuma receita selecionada.'); return; }
          if(!confirm(`Confirma exclusão de ${checks.length} item(s)?`)) return;
          const keys = checks.map(c=> c.dataset.key);
          let allRec = carregarVendasResumo();
          allRec = allRec.filter(v => !keys.includes(`${v.anoMes}__${v.source}__${v.tipoPagamento||''}`));
          salvarVendasResumo(allRec);
          // remover também as despesas MDR automáticas relacionadas a essas vendas
          try{ removerDespesasMdrPorVendasKeys(keys); }catch(e){ console.warn('Erro ao remover despesas MDR ao excluir selecionados', e); }
          // remover também as vendas detalhadas relacionadas para evitar re-importação futura
          try{ removerVendasDetalhadasPorVendasResumoKeys(keys); }catch(e){ console.warn('Erro ao remover vendas detalhadas ao excluir selecionados', e); }
          atualizarSelectAnos(); renderizarReceitasAno(ano);
        };

        // excluir linha
        container.querySelectorAll('.btn-del-rec').forEach(b => b.addEventListener('click', (ev)=>{
          const key = ev.currentTarget.dataset.key; 
          if(!confirm('Confirma exclusão deste item?')) return; 
          let allRec = carregarVendasResumo(); 
          allRec = allRec.filter(v => !( `${v.anoMes}__${v.source}__${v.tipoPagamento||''}` === key )); 
          salvarVendasResumo(allRec); 
          // remover também a despesa MDR automática associada a esta venda (se existir)
          try{ removerDespesasMdrPorVendasKeys([key]); }catch(e){ console.warn('Erro ao remover despesa MDR ao excluir item', e); }
          // remover também as vendas detalhadas relacionadas
          try{ removerVendasDetalhadasPorVendasResumoKeys([key]); }catch(e){ console.warn('Erro ao remover vendas detalhadas ao excluir item', e); }
          atualizarSelectAnos(); 
          renderizarReceitasAno(ano);
        }));

        // filtros
        const filtroMesEl = container.querySelector('#filtro-mes-rec');
        const filtroFonteEl = container.querySelector('#filtro-fonte-rec');
        const filtroTipoEl = container.querySelector('#filtro-tipo-rec');
        const btnLimparEl = container.querySelector('#btn-limpar-filtros-rec');
        if(filtroMesEl) filtroMesEl.onchange = function(e){ 
          filtros.mes = e.target.value; 
          aplicaEFazRender(); 
          // Atualizar componentes extras
          if (typeof atualizarComponentesExtras === 'function') {
            atualizarComponentesExtras(ano, filtros.mes);
          }
        };
        if(filtroFonteEl) filtroFonteEl.onchange = function(e){ filtros.fonte = e.target.value; aplicaEFazRender(); };
        if(filtroTipoEl) filtroTipoEl.onchange = function(e){ filtros.tipo = e.target.value; aplicaEFazRender(); };
        if(btnLimparEl) btnLimparEl.onclick = function(){
          filtros.mes='Todos'; filtros.fonte='Todos'; filtros.tipo='Todos'; 
          if(filtroMesEl) filtroMesEl.value='Todos';
          if(filtroFonteEl) filtroFonteEl.value='Todos';
          if(filtroTipoEl) filtroTipoEl.value='Todos';
          aplicaEFazRender();
          // Limpar resumo por tipo
          var resumoTipos = document.getElementById('resumo-tipos-pagamento');
          if (resumoTipos) resumoTipos.innerHTML = '<div class="text-center text-gray-400 text-sm py-4 col-span-full">Selecione um mês para ver o resumo</div>';
        };
      }
      aplicaEFazRender();
      
      // Atualiza componentes dependentes do mês (Comparativo, Resumo Tipo)
      if (typeof atualizarComponentesExtras === 'function') {
        atualizarComponentesExtras(ano, filtros.mes);
      }

      // garante visibilidade
      setTimeout(() => {
        const table = container.querySelector('table');
        if (table) {
          table.style.display = 'table';
          table.style.visibility = 'visible';
          table.style.opacity = '1';
        }
      }, 50);
    }

    // init
    document.getElementById('btn-ver-ano-receitas').addEventListener('click', ()=>{ 
      const sel=document.getElementById('select-anos-receitas'); 
      renderizarReceitasAno(sel.value); 
      setTimeout(() => {
        const table = document.querySelector('#lista-receitas-ano table');
        if (table) {
          table.style.display = 'table';
          table.style.visibility = 'visible';
          table.style.opacity = '1';
        }
      }, 50);
    });
    

    function init(){ 
      // load data from IndexedDB into memory (IDB is now the default backend)
      loadAllFromIDB().then(()=>{
        tryMigrateFromIDB();
        atualizarSelectAnos();
        setTimeout(() => {
          const sel = document.getElementById('select-anos-receitas');
          if (sel && sel.value) { renderizarReceitasAno(sel.value); }
          // Inicializar novos componentes
          carregarMetaReceita();
        }, 100);
      }).catch(()=>{
        // fallback: still try migrate and render
        tryMigrateFromIDB();
        atualizarSelectAnos();
        setTimeout(() => { 
          const sel = document.getElementById('select-anos-receitas'); 
          if (sel && sel.value) renderizarReceitasAno(sel.value);
          // Inicializar novos componentes mesmo no fallback
          carregarMetaReceita();
        }, 100);
      });
    }
    init();

    // Ouve mudanças vindas da página Importar
    window.addEventListener('storage', (e)=>{ 
      if(e.key === 'vendasResumo' || e.key === 'vendasResumo_last_update'){ 
        atualizarSelectAnos(); 
        const sel=document.getElementById('select-anos-receitas'); 
        if(sel && sel.value) {
          renderizarReceitasAno(sel.value); 
        }
      } 
    });

    // Fallback polling (mesma aba)
    setInterval(() => {
      const lastUpdate = localStorage.getItem('vendasResumo_last_update');
      if (lastUpdate && window.lastKnownUpdate !== lastUpdate) {
        window.lastKnownUpdate = lastUpdate;
        atualizarSelectAnos();
        const sel = document.getElementById('select-anos-receitas');
        if (sel && sel.value) {
          renderizarReceitasAno(sel.value);
        }
      }
    }, 1000);
    
    // Intercepta cliques no sidebar para animação sutil antes de navegar
    (function(){
      const links = document.querySelectorAll('aside nav a.sidebar-link');
      links.forEach(a=>{
        // apply immediate guard on mousedown/touchstart to avoid flicker
        a.addEventListener('mousedown', function(){ const asideEl = document.querySelector('aside.sidebar-collapsed'); if (asideEl) asideEl.classList.add('no-collapse'); });
        a.addEventListener('touchstart', function(){ const asideEl = document.querySelector('aside.sidebar-collapsed'); if (asideEl) asideEl.classList.add('no-collapse'); }, {passive:true});

        a.addEventListener('click', function(e){
          const href = a.getAttribute('href');
          if (!href || href.startsWith('#')) return;
          // se já estivermos na mesma rota, deixa o comportamento normal
          const current = location.pathname.split('/').pop();
          if (current === href) return; 
          e.preventDefault();
          const asideEl = document.querySelector('aside.sidebar-collapsed'); if (asideEl) { setTimeout(()=> asideEl.classList.remove('no-collapse'), 1200); }
          const main = document.querySelector('main') || document.querySelector('.main-content') || document.body;
          if (main) main.classList.add('page-exit');
          setTimeout(()=> { location.href = href; }, 260);
        });
      });
    })();

    // ===== Importer helpers & handlers (moved from importar.html, adapted) =====
    function parseNumber(v){
      if (v == null) return 0;
      let s = String(v).trim();
      if (s === '') return 0;
      // remove currency symbol and spaces
      s = s.replace(/R\$|\s/g,'');
      // if contains comma, assume Brazilian format '1.234,56' -> remove dots as thousands and replace comma with dot
      if (s.indexOf(',') !== -1){
        s = s.replace(/\./g,'').replace(',', '.');
      } else {
        // otherwise remove any non-digit except dot and minus
        s = s.replace(/[^0-9.\-]/g,'');
      }
      const n = parseFloat(s);
      return isNaN(n) ? 0 : n;
    }
    // Converte serial Excel para Date sem causar shift de dia por fuso horário.
    // Estratégia: calcula a data em UTC e então cria um Date no horário local com ano/mes/dia correspondentes,
    // garantindo que a data de dia/mês/ano seja preservada independentemente do timezone do navegador.
    function excelDateToJSDate(serial){
      try{
        const serialNum = Number(serial);
        if (isNaN(serialNum)) return null;
        // base date: 1899-12-30 (Excel serial 1 = 1899-12-31, but offset 25569 maps to 1970-01-01)
        // calcula em milissegundos UTC
        const ms = Math.round((serialNum - 25569) * 86400 * 1000);
        const dUtc = new Date(ms);
        // extrai Y/M/D em UTC e cria Data no horário local com esses componentes (sem shift)
        const y = dUtc.getUTCFullYear();
        const m = dUtc.getUTCMonth();
        const day = dUtc.getUTCDate();
        return new Date(y, m, day);
      }catch(e){ return null; }
    }
    function parseDateToAnoMes(value){
      let anoMes = 'Indefinido';
      if (value == null) return { anoMes };
      if (typeof value === 'string'){
        const datePart = value.split(' ')[0].trim();
        if (datePart.includes('/')){
          const parts = datePart.split('/');
          if (parts.length >= 3){
            const mes = parts[1].padStart(2,'0');
            let ano = parts[2].split(' ')[0];
            if (ano.length === 2 && /^\d{2}$/.test(ano)){ const n = Number(ano); ano = n < 50 ? '20' + ano : '19' + ano; }
            anoMes = `${ano}/${mes}`; return { anoMes };
          }
        }
        if (datePart.includes('-')){
          const parts = datePart.split('-');
          if (parts.length === 3){
            if (parts[0].length === 4){ const ano = parts[0]; const mes = parts[1].padStart(2,'0'); anoMes = `${ano}/${mes}`; return { anoMes }; }
            if (parts[2].length === 4 || parts[2].length === 2){ let ano = parts[2]; if (ano.length === 2 && /^\d{2}$/.test(ano)){ const n = Number(ano); ano = n < 50 ? '20' + ano : '19' + ano; } const mes = parts[1].padStart(2,'0'); anoMes = `${ano}/${mes}`; return { anoMes }; }
          }
        }
  const parsed = Date.parse(value);
  if (!isNaN(parsed)){ const d = new Date(parsed); const mes = String(d.getMonth()+1).padStart(2,'0'); const ano = d.getFullYear(); anoMes = `${ano}/${mes}`; return { anoMes }; }
      }
      if (!isNaN(value)){
        const d = excelDateToJSDate(Number(value)); if (d && !isNaN(d.getTime())){ const mes = String(d.getMonth()+1).padStart(2,'0'); const ano = d.getFullYear(); anoMes = `${ano}/${mes}`; return { anoMes }; }
      }
      return { anoMes };
    }

    // Parse a value (string, Excel serial, ISO) into a JS Date if possible.
    function parseToJSDate(value){
      if (value == null) return null;
      // Excel serial number
      if (!isNaN(value) && value !== ''){
        try{ return excelDateToJSDate(Number(value)); }catch(e){}
      }
      if (typeof value === 'string'){
        const s = value.trim();
        // dd/mm/yyyy[ hh:mm[:ss]]
        const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
        if (m1){
          const day = Number(m1[1]); const month = Number(m1[2]); let year = Number(m1[3]); if (year < 100) year += (year < 50 ? 2000 : 1900);
          const hour = m1[4] ? Number(m1[4]) : 0; const min = m1[5] ? Number(m1[5]) : 0; const sec = m1[6] ? Number(m1[6]) : 0;
          return new Date(year, month-1, day, hour, min, sec);
        }
        // yyyy/mm/dd or yyyy-mm-dd optionally with time
        const m2 = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[ T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
        if (m2){
          const year = Number(m2[1]); const month = Number(m2[2]); const day = Number(m2[3]);
          const hour = m2[4] ? Number(m2[4]) : 0; const min = m2[5] ? Number(m2[5]) : 0; const sec = m2[6] ? Number(m2[6]) : 0;
          return new Date(year, month-1, day, hour, min, sec);
        }
        // yyyy-mm-dd or ISO parse
        const iso = Date.parse(s);
        if (!isNaN(iso)) return new Date(iso);
      }
      return null;
    }

    // Extrai data e hora de várias representações (Excel serial, dd/mm/yyyy hh:mm, ISO, ou date+time em uma célula).
    // Retorna { dateObj, dateStr: 'YYYY/MM/DD', timeStr: 'HH:MM:SS' }
    function extractDateTime(value){
      if (value == null) return { dateObj: null, dateStr: null, timeStr: null };
      // helper
      const pad = (n) => String(n).padStart(2,'0');
      // Excel serial (may include fractional part for time)
      if (!isNaN(value) && value !== ''){
        try{
          const serialNum = Number(value);
          const ms = Math.round((serialNum - 25569) * 86400 * 1000);
          const dUtc = new Date(ms);
          const y = dUtc.getUTCFullYear(); const m = dUtc.getUTCMonth()+1; const day = dUtc.getUTCDate();
          const h = dUtc.getUTCHours(); const min = dUtc.getUTCMinutes(); const sec = dUtc.getUTCSeconds();
          const dateStr = `${y}/${pad(m)}/${pad(day)}`;
          const timeStr = `${pad(h)}:${pad(min)}:${pad(sec)}`;
          const dateObj = new Date(y, m-1, day, h, min, sec);
          return { dateObj, dateStr, timeStr };
        }catch(e){ /* fallthrough */ }
      }
      if (typeof value === 'string'){
        const s = value.trim();
        // if contains space between date and time, try split
        const parts = s.split(/\s+/);
        if (parts.length >= 2){
          const datePart = parts[0]; const timePart = parts.slice(1).join(' ');
          // try parse datePart + timePart together
          const dt = parseToJSDate(datePart + ' ' + timePart) || parseToJSDate(s);
          if (dt && !isNaN(dt.getTime())){
            const y = dt.getFullYear(); const m = dt.getMonth()+1; const day = dt.getDate();
            const h = dt.getHours(); const min = dt.getMinutes(); const sec = dt.getSeconds();
            return { dateObj: dt, dateStr: `${y}/${pad(m)}/${pad(day)}`, timeStr: `${pad(h)}:${pad(min)}:${pad(sec)}` };
          }
        }
        // try dd/mm/yyyy with optional time
        const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
        if (m1){
          const day = Number(m1[1]); const month = Number(m1[2]); let year = Number(m1[3]); if (year < 100) year += (year < 50 ? 2000 : 1900);
          const hour = m1[4] ? Number(m1[4]) : 0; const min = m1[5] ? Number(m1[5]) : 0; const sec = m1[6] ? Number(m1[6]) : 0;
          const dateObj = new Date(year, month-1, day, hour, min, sec);
          return { dateObj, dateStr: `${year}/${pad(month)}/${pad(day)}`, timeStr: `${pad(hour)}:${pad(min)}:${pad(sec)}` };
        }
        // yyyy-mm-dd or ISO
        const iso = Date.parse(s);
        if (!isNaN(iso)){
          const dt = new Date(iso);
          const y = dt.getFullYear(); const m = dt.getMonth()+1; const day = dt.getDate();
          const h = dt.getHours(); const min = dt.getMinutes(); const sec = dt.getSeconds();
          return { dateObj: dt, dateStr: `${y}/${pad(m)}/${pad(day)}`, timeStr: `${pad(h)}:${pad(min)}:${pad(sec)}` };
        }
      }
      return { dateObj: null, dateStr: null, timeStr: null };
    }

    // Normaliza um objeto de venda detalhada para o formato canônico usado pela aplicação.
    // Garante campos: date (YYYY/MM/DD), time (HH:MM:SS), ano, mes, dia (strings), anoMes (YYYY/MM),
    // valorBruto, mdr, valorLiquido (Number), source, tipoPagamento, dateMs (ms since epoch) e id determinístico.
    function normalizeVendaDetalhada(raw){
      try{
        if(!raw || typeof raw !== 'object') return null;
        const pad = (n) => String(n).padStart(2,'0');
        // prefer explicit date/time fields if present
        let dateStr = raw.date || null;
        let timeStr = raw.time || null;
        let dateObj = null;
        // Attempt robust extraction from various possible raw inputs.
        //  - handle combined cells with two numeric tokens like "45688 25569.83" (take first >=40000 as excel serial)
        //  - handle time field that actually contains an excel serial
        //  - handle millisecond/second timestamps
        // If dateStr exists but contains multiple tokens (e.g. '45688 25569.83'), try to extract an Excel serial token
        if(dateStr && typeof dateStr === 'string'){
          const parts = dateStr.split(/\s+/).filter(Boolean);
          if(parts.length > 1){
            const excelCandidate = parts.find(p => !isNaN(p) && Number(p) >= 40000 && Number(p) < 60000);
            if(excelCandidate){
              const serialNum = Number(excelCandidate);
              const baseDate = excelDateToJSDate(serialNum);
              if(baseDate && !isNaN(baseDate.getTime())){
                const fracStr = parts.find(p => p !== excelCandidate && !isNaN(p));
                let parsed = baseDate;
                if(fracStr){
                  const frac = Number(fracStr) - Math.floor(Number(fracStr));
                  if(frac > 0){
                    const addMs = Math.round(frac * 24 * 60 * 60 * 1000);
                    parsed = new Date(baseDate.getTime() + addMs);
                  }
                }
                dateObj = parsed;
                dateStr = `${parsed.getFullYear()}/${pad(parsed.getMonth()+1)}/${pad(parsed.getDate())}`;
                timeStr = timeStr || `${String(parsed.getHours()).padStart(2,'0')}:${String(parsed.getMinutes()).padStart(2,'0')}:${String(parsed.getSeconds()).padStart(2,'0')}`;
              }
            }
          }
        }
        if(!dateStr){ // try extract from combined or other fields
          const combined = raw.date || raw.time || raw.data || raw.datetime || null;
          // if combined is a string with two numeric tokens, try to pick the token that looks like an Excel serial
          if(combined && typeof combined === 'string'){
            const parts = combined.split(/\s+/).filter(Boolean);
            const excelCandidate = parts.find(p => !isNaN(p) && Number(p) >= 40000 && Number(p) < 60000);
            if(excelCandidate){
              // parse serial and also consider fractional part as time
              const serialNum = Number(excelCandidate);
              const baseDate = excelDateToJSDate(serialNum);
              if(baseDate && !isNaN(baseDate.getTime())){
                const frac = serialNum - Math.floor(serialNum);
                let parsed = baseDate;
                if(frac > 0){
                  const addMs = Math.round(frac * 24 * 60 * 60 * 1000);
                  parsed = new Date(baseDate.getTime() + addMs);
                }
                dateObj = parsed;
                dateStr = `${parsed.getFullYear()}/${pad(parsed.getMonth()+1)}/${pad(parsed.getDate())}`;
                timeStr = timeStr || `${String(parsed.getHours()).padStart(2,'0')}:${String(parsed.getMinutes()).padStart(2,'0')}:${String(parsed.getSeconds()).padStart(2,'0')}`;
              }
            }
          }
          // if still not found, try generic extractor (handles dd/mm/yyyy hh:mm or ISO)
          if(!dateObj){
            const ex = extractDateTime(combined);
            if(ex){ dateStr = dateStr || ex.dateStr; timeStr = timeStr || ex.timeStr; dateObj = dateObj || ex.dateObj; }
          }
        }
        if(!dateObj && dateStr){ dateObj = parseToJSDate(dateStr) || (new Date(dateStr)); }
        if(!dateStr && dateObj && !isNaN(dateObj.getTime())){ dateStr = `${dateObj.getFullYear()}/${pad(dateObj.getMonth()+1)}/${pad(dateObj.getDate())}`; }
        if(!timeStr && dateObj && !isNaN(dateObj.getTime())){ const hh = String(dateObj.getHours()).padStart(2,'0'); const mm = String(dateObj.getMinutes()).padStart(2,'0'); const ss = String(dateObj.getSeconds()).padStart(2,'0'); timeStr = `${hh}:${mm}:${ss}`; }

        if(!dateObj){
          // raw.date might be a plain numeric serial (or string containing numeric). Try parse.
          const maybe = raw.date != null ? String(raw.date).trim() : '';
          if(maybe && !isNaN(maybe)){
            const n = Number(maybe);
            // Excel serial range heuristic
            if(n >= 40000 && n < 60000){
              const d = excelDateToJSDate(n);
              if(d && !isNaN(d.getTime())){
                dateObj = d;
                const hh = String(d.getHours()).padStart(2,'0'); const mm = String(d.getMinutes()).padStart(2,'0'); const ss = String(d.getSeconds()).padStart(2,'0');
                dateStr = `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`;
                timeStr = timeStr || `${hh}:${mm}:${ss}`;
              }
            }
            // also try raw.time if it contains a serial
            if(!dateObj && raw.time != null && String(raw.time).trim() && !isNaN(String(raw.time).trim())){
              const tn = Number(String(raw.time).trim());
              if(tn >= 40000 && tn < 60000){
                const d = excelDateToJSDate(tn);
                if(d && !isNaN(d.getTime())){
                  dateObj = d;
                  const hh = String(d.getHours()).padStart(2,'0'); const mm = String(d.getMinutes()).padStart(2,'0'); const ss = String(d.getSeconds()).padStart(2,'0');
                  dateStr = `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`;
                  timeStr = timeStr || `${hh}:${mm}:${ss}`;
                }
              }
            }
          }
          // if still not parsed, try timestamps (ms or seconds)
          if(!dateObj){
            const cand = (raw.date || raw.time || '').toString().trim();
            const maybeMs = Number(cand);
            if(!isNaN(maybeMs) && maybeMs > 1e11){ // ms timestamp
              const d = new Date(maybeMs);
              if(d && !isNaN(d.getTime())){ dateObj = d; dateStr = `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`; timeStr = timeStr || `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`; }
            } else if(!isNaN(maybeMs) && maybeMs > 1e9 && maybeMs < 1e11){ // seconds
              const d = new Date(Math.round(maybeMs) * 1000);
              if(d && !isNaN(d.getTime())){ dateObj = d; dateStr = `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`; timeStr = timeStr || `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`; }
            }
          }
        }

        // finalize date/time fallback
        let ano='', mes='', dia='', anoMes=''; let dateMs = null;
        if(dateStr){ const parts = String(dateStr).split('/'); if(parts.length>=3){ ano = parts[0]; mes = String(parts[1]).padStart(2,'0'); dia = String(parts[2]).padStart(2,'0'); anoMes = `${ano}/${mes}`; } }
        if(!dateMs && dateObj && !isNaN(dateObj.getTime())) dateMs = dateObj.getTime();

        // amounts
        const valorBruto = (raw.valorBruto != null ? Number(raw.valorBruto) : (raw.value != null ? Number(raw.value) : Number(raw.valor || 0))) || 0;
        const mdr = (raw.mdr != null ? Number(raw.mdr) : (raw.valorMdr != null ? Number(raw.valorMdr) : Number(raw.valorMDR || 0))) || 0;
        const valorLiquido = (raw.valorLiquido != null ? Number(raw.valorLiquido) : (raw.valorLiquidoRaw != null ? Number(raw.valorLiquidoRaw) : (valorBruto - mdr))) || (valorBruto - mdr);

        // canonicalize source string: prefer 'pix' or 'cartao' (lowercase)
        let rawSourceStr = (raw.source || raw.fonte || '').toString().trim().toLowerCase();
        let source = 'cartao';
        if(rawSourceStr){
          if(rawSourceStr.indexOf('pix') !== -1) source = 'pix';
          else if(rawSourceStr.indexOf('cart') !== -1 || rawSourceStr.indexOf('cred') !== -1 || rawSourceStr.indexOf('deb') !== -1) source = 'cartao';
          else source = rawSourceStr; // keep lowercase fallback (e.g., custom tags)
        } else {
          // fallback: infer from tipoPagamento when possible
          const tp = String(raw.tipoPagamento || '').toLowerCase();
          if(tp.indexOf('pix') !== -1) source = 'pix';
          else source = 'cartao';
        }
        const tipoPagamento = raw.tipoPagamento || raw.tipo || raw.modalidade || '';

        // ensure time string is zero-padded to HH:MM:SS
        // If timeStr is a numeric Excel-like serial (e.g. 25569.8849...), extract fractional part as time of day.
        if((typeof timeStr === 'number') || (typeof timeStr === 'string' && /^\d+(?:\.\d+)?$/.test(timeStr))){
          const n = Number(timeStr);
          if(!isNaN(n)){
            const frac = n - Math.floor(n);
            if(frac > 0){
              const totalSec = Math.round(frac * 24 * 60 * 60);
              const hh = Math.floor(totalSec / 3600);
              const mm = Math.floor((totalSec % 3600) / 60);
              const ss = totalSec % 60;
              timeStr = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
            } else if(n > 1e11){
              // maybe it's a ms timestamp
              try{ const d = new Date(Math.round(n)); if(!isNaN(d.getTime())){ timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`; } }catch(e){}
            }
          }
        }
        let timeFinal = timeStr || '';
        if(timeFinal && /^\\d{1,2}:\d{1,2}$/.test(timeFinal)) timeFinal = timeFinal + ':00';
        if(timeFinal){ const m = String(timeFinal).match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/); if(m){ timeFinal = `${m[1].padStart(2,'0')}:${m[2].padStart(2,'0')}:${m[3].padStart(2,'0')}`; } }

        const dateField = dateStr || '';
        const timeField = timeFinal || '';
        const id = `${dateField} ${timeField}||${Number(valorBruto||0).toFixed(2)}||${source}||${String(tipoPagamento||'')}`;

        return {
          date: dateField,
          time: timeField,
          ano: String(ano||''),
          mes: String(mes||''),
          dia: String(dia||''),
          anoMes: anoMes || '',
          dateMs: dateMs,
          valorBruto: Number(valorBruto||0),
          mdr: Number(mdr||0),
          valorLiquido: Number(valorLiquido||0),
          source: source,
          tipoPagamento: String(tipoPagamento||''),
          id: id
        };
      }catch(e){ return null; }
    }

    // Detailed transactions storage (keeps per-row data to allow weekday/month aggregations)
    // Support chunked persistence for large datasets to avoid localStorage quota failures.
    // carregarVendasDetalhadas will read either the legacy single key or assemble from chunk keys.
    function carregarVendasDetalhadas(){
      // Check for global override/interceptor first
      if (window.carregarVendasDetalhadas && window.carregarVendasDetalhadas !== carregarVendasDetalhadas) {
         return window.carregarVendasDetalhadas();
      }
      try {
        const chunksMeta = localStorage.getItem('vendasDetalhadas_chunks');
        if(chunksMeta){
          try{
            const keys = JSON.parse(chunksMeta) || [];
            let out = [];
            for(const k of keys){
              try{ const part = JSON.parse(localStorage.getItem(k) || '[]'); if(Array.isArray(part)) out = out.concat(part); }catch(e){}
            }
            // detect compact format (short keys) and expand to canonical shape if needed
            try{
              if(out.length>0){
                const first = out[0];
                // object-compact format
                if(first && (first.d !== undefined || first.v !== undefined)){
                  const expanded = out.map(it => ({
                    date: it.d || '',
                    time: it.t || '',
                    dateMs: (it.ms != null) ? Number(it.ms) : null,
                    valorBruto: (it.v != null) ? (Number(it.v)/100) : 0,
                    mdr: (it.m != null) ? (Number(it.m)/100) : 0,
                    source: it.s || '',
                    tipoPagamento: it.p || '',
                    id: it.id || ''
                  }));
                  return expanded;
                }
                // ultra-compact array format: [d,t,v,s,p,m] (d=date, t=time, v=cents, s=source, p=tipo, m=mdr cents)
                if(Array.isArray(first)){
                  const expanded = out.map(arr => ({
                    date: arr[0] || '',
                    time: arr[1] || '',
                    dateMs: null,
                    valorBruto: (arr[2] != null) ? Number(arr[2])/100 : 0,
                    source: arr[3] || '',
                    tipoPagamento: arr[4] || '',
                    mdr: (arr[5] != null) ? Number(arr[5])/100 : 0,
                    id: `${arr[0]||''} ${arr[1]||''}||${((arr[2]!=null)?(Number(arr[2])/100).toFixed(2):'0.00')}||${arr[3]||''}||${arr[4]||''}`
                  }));
                  return expanded;
                }
              }
            }catch(e){ /* ignore expansion errors, return raw */ }
            return out;
          }catch(e){ /* fall through to legacy */ }
        }
        // legacy single-key
        const raw = JSON.parse(localStorage.getItem('vendasDetalhadas') || '[]') || [];
        // detect compact single-key
        try{
          if(Array.isArray(raw) && raw.length>0){
            const first = raw[0];
            if(first && (first.d !== undefined || first.v !== undefined)){
              return raw.map(it => ({ date: it.d || '', time: it.t || '', dateMs: (it.ms != null)?Number(it.ms):null, valorBruto: (it.v!=null)?(Number(it.v)/100):0, mdr: (it.m!=null)?(Number(it.m)/100):0, source: it.s||'', tipoPagamento: it.p||'', id: it.id||'' }));
            }
            if(Array.isArray(first)){
              return raw.map(arr => ({ date: arr[0] || '', time: arr[1] || '', dateMs: null, valorBruto: (arr[2] != null) ? Number(arr[2])/100 : 0, source: arr[3] || '', tipoPagamento: arr[4] || '', mdr: (arr[5] != null) ? Number(arr[5])/100 : 0, id: `${arr[0]||''} ${arr[1]||''}||${((arr[2]!=null)?(Number(arr[2])/100).toFixed(2):'0.00')}||${arr[3]||''}||${arr[4]||''}` }));
            }
          }
        }catch(e){}
        // If legacy localStorage is empty but we have an in-memory fallback (set when IDB was used), return it
        try{
          if((!raw || (Array.isArray(raw) && raw.length===0)) && window._vendasDetalhadas_inMemory && Array.isArray(window._vendasDetalhadas_inMemory)){
            // expand in-memory normalized records to canonical shape if needed
            try{
              const mem = window._vendasDetalhadas_inMemory || [];
              const mapped = mem.map(function(x){
                try{
                  if(x && x.date) return x;
                  if(Array.isArray(x)){
                    const id = `${x[0]||''} ${x[1]||''}||${((x[2]!=null)?(Number(x[2])/100).toFixed(2):'0.00')}||${x[3]||''}||${x[4]||''}`;
                    return { date: x[0]||'', time: x[1]||'', dateMs: null, valorBruto: (x[2]!=null)?(Number(x[2])/100):0, source: x[3]||'', tipoPagamento: x[4]||'', mdr: (x[5]!=null)?(Number(x[5])/100):0, id };
                  }
                  return x;
                }catch(e){ return x; }
              });
              return mapped;
            }catch(e){}
          }
        }catch(e){}
        return raw;
      } catch(e){ return []; }
    }

    // Async loader that reads from IndexedDB first, expands compact formats, and returns canonical array
    async function carregarVendasDetalhadasAsync(){
      // Check for global override/interceptor first (e.g. Firebase Adapter)
      if (window.carregarVendasDetalhadasAsync && window.carregarVendasDetalhadasAsync !== carregarVendasDetalhadasAsync) {
         return await window.carregarVendasDetalhadasAsync();
      }
      try{
        // prefer in-memory cache populated at boot
        if(window._vendasDetalhadas_inMemory && Array.isArray(window._vendasDetalhadas_inMemory)) return window._vendasDetalhadas_inMemory.slice();
        // try IDB
        try{
          const data = await idbGet('vendasDetalhadas');
          if(data && Array.isArray(data.data)){
            const arr = data.data;
            // detect compact object or ultra-array
            if(arr.length>0){
              const first = arr[0];
              if(first && (first.d !== undefined || first.v !== undefined)){
                return arr.map(it => ({ date: it.d || '', time: it.t || '', dateMs: (it.ms != null)?Number(it.ms):null, valorBruto: (it.v!=null)?(Number(it.v)/100):0, mdr: (it.m!=null)?(Number(it.m)/100):0, source: it.s||'', tipoPagamento: it.p||'', id: it.id||'' }));
              }
              if(Array.isArray(first)){
                return arr.map(a => ({ date: a[0]||'', time: a[1]||'', dateMs: null, valorBruto: (a[2]!=null)?(Number(a[2])/100):0, mdr: (a[5]!=null)?(Number(a[5])/100):0, source: a[3]||'', tipoPagamento: a[4]||'', id: `${a[0]||''} ${a[1]||''}||${((a[2]!=null)?(Number(a[2])/100).toFixed(2):'0.00')}||${a[3]||''}||${a[4]||''}` }));
              }
            }
            return [];
          }
        }catch(e){ /* ignore idb read errors */ }
        // fallback to legacy localStorage loader
        return carregarVendasDetalhadas();
      }catch(err){ console.warn('carregarVendasDetalhadasAsync falhou', err); return []; }
    }

    // salvarVendasDetalhadas will attempt to write the full array to a single key; if that fails
    // it will split the array into smaller chunks and persist each chunk under vendasDetalhadas_chunk_<i>
    // and store the chunk keys list in 'vendasDetalhadas_chunks'. It also removes old chunk keys when
    // saving in legacy single-key mode.
    async function salvarVendasDetalhadas(arr){
      // Check for global override/interceptor first (e.g. Firebase Adapter)
      if (window.salvarVendasDetalhadas && window.salvarVendasDetalhadas !== salvarVendasDetalhadas) {
         return await window.salvarVendasDetalhadas(arr);
      }
      try{
        if(!Array.isArray(arr)) arr = [];
        const LEGACY_KEY = 'vendasDetalhadas';
        const CHUNKS_META_KEY = 'vendasDetalhadas_chunks';

        // Create a compact representation to reduce JSON size: short keys and integer cents for values
        const compact = arr.map(x => {
          try{
            return {
              d: x.date || '',
              t: x.time || '',
              ms: (x.dateMs != null) ? Number(x.dateMs) : null,
              v: Math.round((Number(x.valorBruto || x.value || x.valor || x.receitaBruta || 0) || 0) * 100),
              s: x.source || '',
              p: x.tipoPagamento || '',
              m: (x.mdr != null) ? Math.round(Number(x.mdr || 0) * 100) : 0,
              id: x.id || ''
            };
          }catch(e){ return {d:'',t:'',ms:null,v:0,s:'',p:'',m:0,id:''}; }
        });

  // Persist compact copy to IndexedDB asynchronously (IDB is the default backend)
  try{ idbPut('vendasDetalhadas', { format: 'compact', data: compact }).then(()=>{ try{ localStorage.setItem('vendasDetalhadas_idb','1'); }catch(e){} }).catch(()=>{}); }catch(e){}
  // update in-memory canonical cache so synchronous loaders use IDB-backed data
  try{ window._vendasDetalhadas_inMemory = Array.isArray(arr) ? arr.slice() : null; }catch(e){}

        // Try to write whole compact array to single key first
        try{
          localStorage.setItem(LEGACY_KEY, JSON.stringify(compact));
          // cleanup old chunk keys if exist
          try{ const prev = localStorage.getItem(CHUNKS_META_KEY); if(prev){ const keys = JSON.parse(prev) || []; for(const k of keys) try{ localStorage.removeItem(k); }catch(e){} localStorage.removeItem(CHUNKS_META_KEY); } }catch(e){}
          // also persist to IDB asynchronously
          try{ await idbPut('vendasDetalhadas', { format:'compact', data: compact }); try{ localStorage.setItem('vendasDetalhadas_idb','1'); }catch(e){} }catch(e){}
          // update in-memory cache
          try{ window._vendasDetalhadas_inMemory = Array.isArray(arr) ? arr.slice() : null; }catch(e){}
          return true;
        }catch(e){ /* fallthrough to chunked persistence */ }

        // chunked persistence with adaptive chunk size
        try{
          // remove previous chunks if any
          try{ const prev = localStorage.getItem(CHUNKS_META_KEY); if(prev){ const keys = JSON.parse(prev) || []; for(const k of keys) try{ localStorage.removeItem(k); }catch(e){} } }catch(e){}

          // Try several strategies, progressively more compact and smaller chunk sizes.
          const strategies = [
            { type: 'object-compact', data: compact, initialChunk: 1000, minChunk: 50 },
          ];

          let wrote = false;
          for(const strat of strategies){
            let CHUNK_SIZE = strat.initialChunk;
            while(CHUNK_SIZE >= strat.minChunk){
              try{
                const chunkKeys = [];
                for(let i=0;i<strat.data.length;i+=CHUNK_SIZE){
                  const slice = strat.data.slice(i, i+CHUNK_SIZE);
                  const key = `vendasDetalhadas_chunk_${Math.floor(i/CHUNK_SIZE)}`;
                  localStorage.setItem(key, JSON.stringify(slice));
                  chunkKeys.push(key);
                }
                localStorage.setItem(CHUNKS_META_KEY, JSON.stringify(chunkKeys));
                try{ localStorage.removeItem(LEGACY_KEY); }catch(e){}
                // mark format used
                try{ localStorage.setItem('vendasDetalhadas_format','compact'); }catch(e){}
                wrote = true; break;
              }catch(e){
                // clear any keys written in this attempt
                try{ const keys = JSON.parse(localStorage.getItem(CHUNKS_META_KEY) || '[]'); for(const k of keys) try{ localStorage.removeItem(k); }catch(_){}}catch(_){ }
                CHUNK_SIZE = Math.floor(CHUNK_SIZE / 2);
              }
            }
            if(wrote) break;
          }

          if(wrote) return true;

          // As a last resort, attempt an ultra-compact representation (arrays) which has much lower JSON overhead.
          try{
            const ultra = compact.map(it => {
              // [date, time, valorCents, source, tipo, mdrCents]
              return [ it.d || '', it.t || '', Number(it.v || 0), it.s || '', it.p || '', Number(it.m || 0) ];
            });
            // try single-key first
            try{ localStorage.setItem(LEGACY_KEY, JSON.stringify(ultra)); localStorage.setItem('vendasDetalhadas_format','ultra'); try{ localStorage.removeItem(CHUNKS_META_KEY); }catch(e){} return true; }catch(e){}
            // chunk ultra with small sizes
            let CHUNK = 200;
            while(CHUNK >= 20){
              try{
                const chunkKeys = [];
                for(let i=0;i<ultra.length;i+=CHUNK){
                  const slice = ultra.slice(i,i+CHUNK);
                  const key = 'vendasDetalhadas_chunk_' + Math.floor(i/CHUNK);
                  localStorage.setItem(key, JSON.stringify(slice));
                  chunkKeys.push(key);
                }
                localStorage.setItem(CHUNKS_META_KEY, JSON.stringify(chunkKeys));
                try{ localStorage.removeItem(LEGACY_KEY); }catch(e){}
                try{ localStorage.setItem('vendasDetalhadas_format','ultra'); }catch(e){}
                return true;
              }catch(e){
                try{
                  const keys = JSON.parse(localStorage.getItem(CHUNKS_META_KEY) || '[]');
                  for(const k of keys){ try{ localStorage.removeItem(k); }catch(_){}}
                }catch(_){ }
                CHUNK = Math.floor(CHUNK/2);
              }
            }
          }catch(e){ /* fallthrough */ }

          // If all localStorage strategies failed, fallback to IndexedDB (awaited) and keep in-memory copy
          try{
            try{ window._vendasDetalhadas_inMemory = Array.isArray(arr) ? arr.slice() : null; }catch(e){}
            await idbPut('vendasDetalhadas', { format: 'compact', data: compact });
            try{ localStorage.setItem('vendasDetalhadas_idb','1'); }catch(e){}
            return true;
          }catch(err){ console.error('Erro ao salvar em IndexedDB', err); return false; }
        }catch(e){ console.error('Erro ao salvar vendasDetalhadas em chunks', e); return false; }
      }catch(err){ console.error('salvarVendasDetalhadas falhou', err); return false; }
    }
    async function addVendaDetalhada(tx){
      try{
        const arr = await carregarVendasDetalhadasAsync();
        const existing = new Set(arr.map(x => x && x.id ? x.id : `${x.date||''} ${x.time||''}||${Number(x.valorBruto||0).toFixed(2)}||${x.source||''}||${x.tipoPagamento||''}`));
        const normalized = normalizeVendaDetalhada(tx);
        if(!normalized) return false;
        // if exact id exists, skip
        if(existing.has(normalized.id)) return false;
        // if not, but there is an existing placeholder (no date/dateMs) with same signature (valor/source/tipo),
        // replace it with the normalized record that includes date/time
        if(normalized && (normalized.date || normalized.dateMs)){
          const signatureSuffix = `||${Number(normalized.valorBruto||0).toFixed(2)}||${normalized.source}||${normalized.tipoPagamento}`;
          const idx = arr.findIndex(x => x && x.id && String(x.id).endsWith(signatureSuffix) && (!x.date || !x.dateMs));
          if(idx >= 0){ arr[idx] = normalized; await salvarVendasDetalhadas(arr); return true; }
        }
        arr.push(normalized);
        await salvarVendasDetalhadas(arr);
        return true;
      }catch(e){ console.warn('Erro ao salvar venda detalhada', e); return false; }
    }

    // Adiciona múltiplas vendas detalhadas em lote (mais eficiente que chamar addVendaDetalhada por linha)
    async function addVendasDetalhadasBulk(txs){
      try{
        if(!Array.isArray(txs) || txs.length===0) return 0;
        const arr = await carregarVendasDetalhadasAsync();
        const existing = new Set(arr.map(x => x && x.id ? x.id : `${x.date||''} ${x.time||''}||${Number(x.valorBruto||0).toFixed(2)}||${x.source||''}||${x.tipoPagamento||''}`));
        let added = 0;
        let replaced = 0;
        for(const tx of txs){
          const normalized = normalizeVendaDetalhada(tx);
          if(!normalized) continue;
          if(existing.has(normalized.id)) continue;
          // attempt replace: if normalized has date info and there's an existing placeholder (same valor/source/tipo) without date, replace it
          const signatureSuffix = `||${Number(normalized.valorBruto||0).toFixed(2)}||${normalized.source}||${normalized.tipoPagamento}`;
          if(normalized && (normalized.date || normalized.dateMs)){
            const idx = arr.findIndex(x => x && x.id && String(x.id).endsWith(signatureSuffix) && (!x.date || !x.dateMs));
            if(idx >= 0){ arr[idx] = normalized; existing.add(normalized.id); replaced++; continue; }
          }
          arr.push(normalized);
          existing.add(normalized.id);
          added++;
        }
        if(added>0 || replaced>0) await salvarVendasDetalhadas(arr);
        if(replaced>0) console.info('[addVendasDetalhadasBulk] replaced placeholders:', replaced);
        return added + replaced;
      }catch(e){ console.warn('Erro em addVendasDetalhadasBulk', e); return 0; }
    }

    // remove duplicates in vendasDetalhadas by id (or by computed signature) and persist unique list
    function dedupeVendasDetalhadas(){
      try{
        const arr = carregarVendasDetalhadas();
        const map = new Map();
        for (const x of arr){
          const nx = normalizeVendaDetalhada(x) || x;
          const key = nx && nx.id ? nx.id : `${nx.date||''} ${nx.time||''}||${Number(nx.valorBruto||0).toFixed(2)}||${nx.source||''}||${nx.tipoPagamento||''}`;
          if (!map.has(key)) map.set(key, {...nx, id: key});
        }
        const unique = Array.from(map.values());
        salvarVendasDetalhadas(unique);
        return unique.length;
      }catch(e){ return 0; }
    }

    // Reconstrói vendasResumoDia a partir de vendasDetalhadas (idempotente)
    async function rebuildDailyFromDetalhadas(){
      try{
        // dedupeVendasDetalhadas(); // Otimização: Skip dedupe síncrono para evitar travamento. O bulk add já verifica duplicatas.
        const detalhes = await carregarVendasDetalhadasAsync();
        const map = new Map();
        
        // Processa em chunks para não travar a UI
        const CHUNK_SIZE = 500;
        for (let i = 0; i < detalhes.length; i += CHUNK_SIZE) {
          const chunk = detalhes.slice(i, i + CHUNK_SIZE);
          
          for(const tx of chunk){
            if(!tx) continue;
            // tx.date should be 'YYYY/MM/DD' after normalization but try parse robustly
            const d = parseToJSDate(tx.date) || (tx.dateMs ? new Date(Number(tx.dateMs)) : null) || (tx.date ? new Date(tx.date) : null);
            if(!d || isNaN(d.getTime())) continue;
            const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0');
            const anoMesDia = `${y}/${m}/${day}`;
            const anoMes = `${y}/${m}`;
            const source = tx.source || '';
            const tipoPagamento = tx.tipoPagamento || '';
            const key = `${anoMesDia}||${source}||${tipoPagamento}`;
            const valor = Number(tx.valorBruto || 0) || 0;
            const mdrVal = Number(tx.mdr || 0) || 0;
            if(!map.has(key)) map.set(key, { anoMesDia, anoMes, source, tipoPagamento, receitaBruta:0, mdr:0, receitaLiquida:0 });
            const obj = map.get(key);
            obj.receitaBruta = (Number(obj.receitaBruta)||0) + valor;
            obj.mdr = (Number(obj.mdr)||0) + mdrVal;
            obj.receitaLiquida = obj.receitaBruta - obj.mdr;
            map.set(key, obj);
          }
          
          // Cede controle para a UI a cada chunk
          if (i + CHUNK_SIZE < detalhes.length) await new Promise(r => setTimeout(r, 0));
        }

        const daily = Array.from(map.values());
        await salvarVendasResumoDia(daily);
        // atualizar resumo mensal tamb
        computeMonthlyResumoFromDaily();
        // atualizar resumo por periodo do dia tambem
        await computeVendasPeriodoDoDiaFromDetalhadas();
        return daily;
      }catch(e){ console.warn('Erro em rebuildDailyFromDetalhadas', e); return []; }
    }

    // Remove vendasDetalhadas correspondentes às chaves de vendasResumo (formato das chaves: 'YYYY/MM__source__tipo')
    function removerVendasDetalhadasPorVendasResumoKeys(keys){
      try{
        if(!Array.isArray(keys) || keys.length===0) return;
        const detalhes = carregarVendasDetalhadas();
        const parsedKeys = keys.map(k => {
          const parts = String(k||'').split('__');
          return { anoMes: parts[0]||'', source: parts[1]||'', tipo: parts[2]||'' };
        });
        const kept = detalhes.filter(tx => {
          try{
            const d = parseToJSDate(tx.date) || new Date(tx.date || '');
            if(!d || isNaN(d.getTime())) return true; // keep if cannot parse date
            const ano = d.getFullYear(); const mes = String(d.getMonth()+1).padStart(2,'0');
            const txAnoMes = `${ano}/${mes}`;
            const txSource = tx.source || '';
            const txTipo = tx.tipoPagamento || '';
            // if any parsedKey matches this transaction, remove it (i.e., return false)
            for(const pk of parsedKeys){
              if(pk.anoMes && pk.anoMes === txAnoMes && (pk.source === '' || pk.source === txSource) && (pk.tipo === '' || pk.tipo === txTipo)){
                return false;
              }
            }
            return true;
          }catch(e){ return true; }
        });
        salvarVendasDetalhadas(kept);
        // rebuild daily/monthly from remaining detalhes
        try{ rebuildDailyFromDetalhadas(); }catch(e){}
        try{ computeWeekdaySumsPerMonth(); }catch(e){}
      }catch(err){ console.warn('Erro ao remover vendas detalhadas por chaves', err); }
    }

    // Compute sums by weekday (0=Sunday..6=Saturday) grouped per month (YYYY/MM)
    function computeWeekdaySumsPerMonth(){
      // ensure we don't have duplicates before computing
      try{ dedupeVendasDetalhadas(); }catch(e){}
      const all = carregarVendasDetalhadas();
      const out = {};
      for (const t of all){
        // t.date should be ISO or parsable
        const d = t && t.date ? parseToJSDate(t.date) || (t.dateMs ? new Date(Number(t.dateMs)) : new Date(t.date)) : (t.dateMs ? new Date(Number(t.dateMs)) : null);
        if (!d || isNaN(d.getTime())) continue;
        const ano = d.getFullYear(); const mes = String(d.getMonth()+1).padStart(2,'0');
        const key = `${ano}/${mes}`;
        if (!out[key]) out[key] = { '0':0,'1':0,'2':0,'3':0,'4':0,'5':0,'6':0 };
        const wd = String(d.getDay());
        const v = Number(t.valorBruto || t.value || t.valor || 0) || 0;
        out[key][wd] = (Number(out[key][wd]) || 0) + v;
      }
      try{ localStorage.setItem('vendas_por_dia_semana', JSON.stringify(out)); }catch(e){ }
      return out;
    }

    // Retorna o nome do dia da semana em português a partir de uma Date ou string de data
    function getDiaSemana(dateInput){
      try{
        let d = null;
        if (!dateInput) return null;
        if (dateInput instanceof Date) d = dateInput;
        else d = parseToJSDate(String(dateInput)) || new Date(String(dateInput));
        if (!d || isNaN(d.getTime())) return null;
        const nomes = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
        return nomes[d.getDay()];
      }catch(e){ return null; }
    }

    // Agrega vendas por dia da semana para um mês especificado (anoMes no formato 'YYYY/MM')
    // Retorna objeto com chaves: domingo, segunda, terça, quarta, quinta, sexta, sábado
    function getSomaSemanalPorMes(anoMes){
      const zeroObj = { 'domingo':0,'segunda':0,'terça':0,'quarta':0,'quinta':0,'sexta':0,'sábado':0 };
      if(!anoMes) return zeroObj;
      try{
        // Prefer aggregating from vendasResumoDia (agregados por dia) because
        // essa fonte contém os valores que aparecem na tabela superior (vendasResumo).
        // Dessa forma garantimos que a soma semanal será consistente com a tabela.
        const daily = carregarVendasResumoDia() || [];
        const out = { ...zeroObj };
        for (const d of daily){
          try{
            if (!d || !d.anoMesDia) continue;
            // d.anoMes is 'YYYY/MM'
            if (String(d.anoMes) !== String(anoMes)) continue;
            const parts = String(d.anoMesDia).split('/');
            if (parts.length < 3) continue;
            const y = Number(parts[0]); const m = Number(parts[1]) - 1; const day = Number(parts[2]);
            if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(day)) continue;
            const dt = new Date(y, m, day);
            const nome = getDiaSemana(dt);
            if (!nome) continue;
            const v = Number(d.receitaBruta ?? d.valor ?? 0) || 0;
            out[nome] = (Number(out[nome]) || 0) + v;
          }catch(e){ /* ignore malformed daily */ }
        }
        return out;
      }catch(e){ return zeroObj; }
    }

    // === NOVO: classificação por período do dia e agregação mensal ===
    // Retorna 'Madrugada', 'Manhã', 'Tarde' ou 'Noite' dado um timeStr 'HH:MM:SS'
    function getPeriodoDoDia(timeStr){
      try{
        if (window.SharedUtils && typeof window.SharedUtils.getPeriodoDoDia === 'function') {
          const fromConfig = window.SharedUtils.getPeriodoDoDia(timeStr);
          if (fromConfig) return fromConfig;
        }
        if(!timeStr) return null;
        const m = String(timeStr).trim().replace('h',':').match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
        if(!m){ 
          // fallback: tentar extrair a partir de uma data com hora (ex: '30/01/2025 18:37:21')
          const dt = parseToJSDate(String(timeStr));
          if(dt && !isNaN(dt.getTime())){
            const hh = dt.getHours(), mm = dt.getMinutes(), ss = dt.getSeconds();
            const t = (hh*3600)+(mm*60)+(ss);
            if(t>=1 && t<= 5*3600 + 59*60 + 59) return 'Madrugada';
            if(t>=6*3600 && t<= 11*3600 + 59*60 + 59) return 'Manh�';
            if(t>=12*3600 && t<= 17*3600 + 59*60 + 59) return 'Tarde';
            if(t>=18*3600 && t<= 24*3600) return 'Noite';
            return 'Madrugada'; // fallback
          }
          return null;
        }
        const hh = Number(m[1]||0), mm = Number(m[2]||0), ss = Number(m[3]||0);
        const t = (hh*3600)+(mm*60)+(ss);
        // 00:00:01 a 05:59:59 - Madrugada (observando que 00:00:00 puro cai fora; vamos considerar 00:00:00 como Madrugada tambǸm)
        if(t>=1 && t<= 5*3600 + 59*60 + 59) return 'Madrugada';
        if(t===0) return 'Madrugada';
        // 06:00:00 a 11:59:59 - Manh�
        if(t>=6*3600 && t<= 11*3600 + 59*60 + 59) return 'Manh�';
        // 12:00:00 a 17:59:59 - Tarde
        if(t>=12*3600 && t<= 17*3600 + 59*60 + 59) return 'Tarde';
        // 18:00:00 a 24:00:00 - Noite
        if(t>=18*3600 && t<= 24*3600) return 'Noite';
        return 'Madrugada';
      }catch(e){ return null; }
    }

    // Soma os valores por período do dia dentro de um mês 'YYYY/MM'
    
    // === NOVO: utilitários de consistência de totais ===
    function getTotalMensalPorAnoMes(anoMes){
      try{
        const detalhes = carregarVendasDetalhadas() || [];
        let total = 0;
        for(const tx of detalhes){
          if(!tx) continue;
          let d = null;
          if(tx.dateMs){ d = new Date(Number(tx.dateMs)); } else if(tx.date){ d = parseToJSDate(tx.date) || new Date(tx.date); }
          if(!d || isNaN(d.getTime())){
            const ex = extractDateTime(tx.date || tx.time || '');
            d = ex.dateObj;
          }
          if(!d || isNaN(d.getTime())) continue;
          const ym = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;
          if(String(ym) !== String(anoMes)) continue;
          total += Number(tx.valorBruto || tx.value || tx.valor || 0) || 0;
        }
        return total;
      }catch(e){ console.warn('getTotalMensalPorAnoMes falhou', e); return 0; }
    }

    function getTotalSemanalPorAnoMes(anoMes){
      // Soma dos 7 dias (recomputando dos detalhes para evitar dependências)
      try{
        const detalhes = carregarVendasDetalhadas() || [];
        const byW = {0:0,1:0,2:0,3:0,4:0,5:0,6:0};
        for(const tx of detalhes){
          if(!tx) continue;
          let d = null;
          if(tx.dateMs){ d = new Date(Number(tx.dateMs)); } else if(tx.date){ d = parseToJSDate(tx.date) || new Date(tx.date); }
          if(!d || isNaN(d.getTime())){
            const ex = extractDateTime(tx.date || tx.time || '');
            d = ex.dateObj;
          }
          if(!d || isNaN(d.getTime())) continue;
          const ym = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;
          if(String(ym) !== String(anoMes)) continue;
          const wd = d.getDay(); // 0..6
          byW[wd] += Number(tx.valorBruto || tx.value || tx.valor || 0) || 0;
        }
        return Object.values(byW).reduce((a,b)=>a+b,0);
      }catch(e){ console.warn('getTotalSemanalPorAnoMes falhou', e); return 0; }
    }

    async function getTotalPeriodoPorAnoMes(anoMes){
      try{
        const sums = await getSomaPeriodoPorMes(anoMes);
        return ['Madrugada','Manhã','Tarde','Noite'].reduce((acc,k)=> acc + Number(sums[k]||0), 0);
      }catch(e){ console.warn('getTotalPeriodoPorAnoMes falhou', e); return 0; }
    }

    async function getSomaPeriodoPorMes(anoMes){
      const zero = { 'Madrugada':0, 'Manhã':0, 'Tarde':0, 'Noite':0 };
      if(!anoMes) return zero;
      try{
        // Preferência: usar o adaptador async se disponível (lida com chunks/firebase)
        let detalhes = [];
        if (typeof window.carregarVendasDetalhadasAsync === 'function') {
           detalhes = await window.carregarVendasDetalhadasAsync();
        } else {
           // Fallback manual
           detalhes = carregarVendasDetalhadas() || [];
           if (detalhes.length === 0 && window.IRANCASH && window.IRANCASH.DataStore) {
               const raw = await window.IRANCASH.DataStore.getItemAsync('vendasDetalhadas', []);
               if (Array.isArray(raw) && raw.length > 0) {
                   try {
                       localStorage.setItem('vendasDetalhadas', JSON.stringify(raw));
                       detalhes = carregarVendasDetalhadas(); 
                   } catch(e) {}
               }
           }
        }
        
        const out = { ...zero };
        if(!detalhes) return out;

        for(const tx of detalhes){
          if(!tx) continue;
          // Determina se pertence ao ano/mes pedido
          let d = null;
          if(tx.dateMs){ d = new Date(Number(tx.dateMs)); } else if(tx.date){ d = parseToJSDate(tx.date) || new Date(tx.date); }
          if(!d || isNaN(d.getTime())){
            // tenta extrair de um campo combinado (ex: '30/01/2025 18:37:21')
            const ex = extractDateTime(tx.date || tx.time || '');
            d = ex.dateObj;
          }
          if(!d || isNaN(d.getTime())) continue;
          const ym = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;
          if(String(ym) !== String(anoMes)) continue;

          // time string: prefer explicit tx.time; otherwise attempt extractDateTime but only accept
          // the extracted time if the original raw contains a time-like token (':' or 'T') or
          // if the original looks like an Excel serial with fractional part.
          let timeStr = tx.time || null;
          if(!timeStr){
            const rawDateStr = tx.date || '';
            const ex = extractDateTime(rawDateStr || '');
            const hasTimeLike = (typeof rawDateStr === 'string' && (rawDateStr.indexOf(':') !== -1 || rawDateStr.indexOf('T') !== -1));
            const hasFractionSerial = (typeof rawDateStr === 'string' && /\d+\.\d+/.test(rawDateStr));
            if(ex && ex.timeStr && (hasTimeLike || hasFractionSerial)){
              timeStr = ex.timeStr;
            } else {
              // Fallback: se temos um objeto Date válido 'd' (vindo de dateMs ou parseado), use a hora dele
              // Isso alinha com a lógica do dashboard.js que extrai hora do Date se não houver string explícita
              if(d && !isNaN(d.getTime())){
                 const hh = d.getHours(), mm = d.getMinutes(), ss = d.getSeconds();
                 // Evita considerar 00:00:00 como hora válida se não tiver certeza (mas aqui 'd' já é nossa melhor aposta)
                 // No dashboard.js usamos: if(!timeStr){ const hh... timeStr = ... }
                 timeStr = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
              } else {
                 timeStr = null;
              }
            }
          }
          
          // Dashboard logic: if(timeStr === '00:00:00') timeStr = null;
          // MAS, se o timeStr foi derivado explicitamente do objeto Date (que pode ser midnight real), 
          // devemos permitir '00:00:00' se quisermos que conte como Madrugada.
          // O dashboard.js na verdade diz: if(timeStr === '00:00:00') timeStr = null;
          // E depois getPeriodoDoDiaLocal retorna null se timeStr for null.
          // Se queremos que conte, precisamos que getPeriodoDoDia aceite null ou que timeStr não seja anulado.
          // Vamos ver getPeriodoDoDia: ele retorna null se !timeStr.
          // Então se timeStr for '00:00:00', ele é anulado e vira null -> sem período.
          // Para corrigir isso e contar como Madrugada, devemos NÃO anular se for derivado de d válido.
          
          // FIX: Se timeStr é '00:00:00', vamos assumir Madrugada (0h) em vez de anular,
          // pois muitas vezes a venda ocorre à meia noite ou a importação define assim.
          // Se for null, continua null.
          // if(timeStr === '00:00:00') timeStr = null; <--- REMOVIDO para permitir contagem
          
          const periodo = getPeriodoDoDia(timeStr);
          const valor = Number(tx.valorBruto || tx.value || tx.valor || 0) || 0;
          if(periodo && (periodo in out)){ out[periodo] = (Number(out[periodo])||0) + valor; }
        }
        return out;
      }catch(e){ return zero; }
    }

    async function computeVendasPeriodoDoDiaFromDetalhadas(){
      try{
        let detalhes = [];
        if (typeof window.carregarVendasDetalhadasAsync === 'function') {
          detalhes = await window.carregarVendasDetalhadasAsync();
        } else {
          detalhes = carregarVendasDetalhadas() || [];
        }

        const map = new Map();
        for(const tx of detalhes){
          if(!tx) continue;
          let d = null;
          if(tx.dateMs){ d = new Date(Number(tx.dateMs)); } else if(tx.date){ d = parseToJSDate(tx.date) || new Date(tx.date); }
          if(!d || isNaN(d.getTime())){
            const ex = extractDateTime(tx.date || tx.time || '');
            d = ex.dateObj;
          }
          if(!d || isNaN(d.getTime())) continue;
          const anoMes = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`;

          let timeStr = tx.time || null;
          if(!timeStr){
            const rawDateStr = tx.date || '';
            const ex = extractDateTime(rawDateStr || '');
            const hasTimeLike = (typeof rawDateStr === 'string' && (rawDateStr.indexOf(':') !== -1 || rawDateStr.indexOf('T') !== -1));
            const hasFractionSerial = (typeof rawDateStr === 'string' && /\d+\.\d+/.test(rawDateStr));
            if(ex && ex.timeStr && (hasTimeLike || hasFractionSerial)){
              timeStr = ex.timeStr;
            } else if(d && !isNaN(d.getTime())) {
              const hh = d.getHours(), mm = d.getMinutes(), ss = d.getSeconds();
              timeStr = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
            }
          }

          const periodo = getPeriodoDoDia(timeStr);
          if(!periodo) continue;
          const key = `${anoMes}||${periodo}`;
          const val = Number(tx.valorBruto || tx.value || tx.valor || 0) || 0;
          const cur = map.get(key) || { anoMes, periodo, total: 0 };
          cur.total = (Number(cur.total) || 0) + val;
          map.set(key, cur);
        }

        const out = Array.from(map.values());
        await salvarVendasPeriodoDoDia(out);
        return out;
      }catch(e){
        console.warn('computeVendasPeriodoDoDiaFromDetalhadas falhou', e);
        return [];
      }
    }

    async function updateVendasPeriodoDoDiaForMonth(anoMes, sums){
      try{
        if(!anoMes) return;
        const current = await carregarVendasPeriodoDoDiaAsync();
        const filtered = Array.isArray(current) ? current.filter(x => x && x.anoMes !== anoMes) : [];
        const config = (window.SharedUtils && window.SharedUtils.getPeriodosConfig) ? window.SharedUtils.getPeriodosConfig() : {};
        let order = Object.keys(config || {});
        if(order.length === 0) order = ['Madrugada','Manh�','Tarde','Noite'];
        order.forEach(p => {
          filtered.push({ anoMes: anoMes, periodo: p, total: Number(sums[p] || 0) || 0 });
        });
        await salvarVendasPeriodoDoDia(filtered);
      }catch(e){ /* ignore */ }
    }

    // Export vendasDetalhadas as downloadable JSON file
    function exportVendasDetalhadas(){
      try{
        const arr = carregarVendasDetalhadas() || [];
        const blob = new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const fileName = `vendasDetalhadas_export_${Date.now()}.json`;
        a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=> URL.revokeObjectURL(url), 1000);
        return true;
      }catch(e){ console.error('Erro ao exportar vendasDetalhadas', e); return false; }
    }

    // Force dedupe + rebuild from vendasDetalhadas and refresh UI
    function forceRebuildFromDetalhadas(){
      try{
        console.info('Executando forceRebuildFromDetalhadas...');
        // Migration: normalize source values in existing vendasDetalhadas so 'PIX' variants become 'pix'
        try{
          const arr = carregarVendasDetalhadas() || [];
          let changed = 0;
          for(let i=0;i<arr.length;i++){
            const x = arr[i]; if(!x) continue;
            const rawSrc = (x.source || '').toString().trim();
            const srcLow = rawSrc.toLowerCase();
            let newSrc = rawSrc;
            if(!rawSrc){
              // infer from tipoPagamento or id
              const tp = (x.tipoPagamento || '').toString().toLowerCase();
              if(tp.indexOf('pix') !== -1) newSrc = 'pix';
              else if(tp.indexOf('deb') !== -1 || tp.indexOf('cred') !== -1 || tp.indexOf('cart') !== -1) newSrc = 'cartao';
            } else {
              if(srcLow.indexOf('pix') !== -1) newSrc = 'pix';
              else if(srcLow.indexOf('cart') !== -1 || srcLow.indexOf('cred') !== -1 || srcLow.indexOf('deb') !== -1) newSrc = 'cartao';
              else newSrc = srcLow; // keep normalized lower-case
            }
            if(newSrc !== rawSrc){ arr[i].source = newSrc; changed++; }
          }
          if(changed>0){ salvarVendasDetalhadas(arr); console.info('Normalized source for', changed, 'records'); }
        }catch(e){ console.warn('source normalization migration failed', e); }

        if(typeof dedupeVendasDetalhadas === 'function') try{ dedupeVendasDetalhadas(); console.info('dedupeVendasDetalhadas OK'); }catch(e){ console.warn('dedupeVendasDetalhadas falhou', e); }
        if(typeof rebuildDailyFromDetalhadas === 'function') try{ rebuildDailyFromDetalhadas(); console.info('rebuildDailyFromDetalhadas OK'); }catch(e){ console.warn('rebuildDailyFromDetalhadas falhou', e); }
        if(typeof computeMonthlyResumoFromDaily === 'function') try{ computeMonthlyResumoFromDaily(); console.info('computeMonthlyResumoFromDaily OK'); }catch(e){ console.warn('computeMonthlyResumoFromDaily falhou', e); }
        if(typeof computeWeekdaySumsPerMonth === 'function') try{ computeWeekdaySumsPerMonth(); console.info('computeWeekdaySumsPerMonth OK'); }catch(e){ console.warn('computeWeekdaySumsPerMonth falhou', e); }
        if(typeof computeVendasPeriodoDoDiaFromDetalhadas === 'function') try{ computeVendasPeriodoDoDiaFromDetalhadas(); console.info('computeVendasPeriodoDoDiaFromDetalhadas OK'); }catch(e){ console.warn('computeVendasPeriodoDoDiaFromDetalhadas falhou', e); }
        atualizarSelectAnos(); const sel = document.getElementById('select-anos-receitas'); if(sel && sel.value) renderizarReceitasAno(sel.value);
        return true;
      }catch(e){ console.error('forceRebuildFromDetalhadas falhou', e); return false; }
    }


    function getWeekdaySumsForMonth(anoMes){
      try{ const p = JSON.parse(localStorage.getItem('vendas_por_dia_semana') || '{}'); return p[anoMes] || { '0':0,'1':0,'2':0,'3':0,'4':0,'5':0,'6':0 }; }catch(e){ return { '0':0,'1':0,'2':0,'3':0,'4':0,'5':0,'6':0 }; }
    }

    // Inputs
    const fileInputCartao = document.getElementById('fileInputCartao');
    const fileNameCartao = document.getElementById('fileNameCartao');
    const processarBtnCartao = document.getElementById('processarBtnCartao');

    const fileInputPix = document.getElementById('fileInputPix');
    const fileNamePix = document.getElementById('fileNamePix');
    const processarBtnPix = document.getElementById('processarBtnPix');

    let arquivosSelecionadosCartao = [];
    let arquivosSelecionadosPix = [];

    // --- Header mapping helpers ---
    function detectHeaderRow(json){
      // tenta escolher a linha com mais células texto (primeiras 10 linhas)
      let best = {idx:0, score: -1};
      for (let i=0;i<Math.min(10,json.length);i++){
        const row = json[i] || [];
        let score = 0;
        for (const cell of row){ if (cell !== null && cell !== undefined && String(cell).trim().length>0) score += 1; }
        if (score > best.score){ best = {idx:i, score}; }
      }
      return best.idx;
    }

    function getHeadersFromJson(json, overrideHeaderRow){
      const hr = (typeof overrideHeaderRow === 'number' && !isNaN(overrideHeaderRow)) ? overrideHeaderRow : detectHeaderRow(json);
      const headerRow = json[hr] || [];
      return headerRow.map(h => h==null? '': String(h).trim());
    }

    function loadMapping(key){
      try{ return JSON.parse(localStorage.getItem(key)) || {}; } catch(e){ return {}; }
    }
    function saveMapping(key, map){ try{ localStorage.setItem(key, JSON.stringify(map)); }catch(e){} }

    function renderMappingUI(panelId, fieldsContainerId, headers, storageKey, defaults){
      const panel = document.getElementById(panelId);
      const container = document.getElementById(fieldsContainerId);
      if(!panel || !container) return;
      container.innerHTML='';
  const mapping = loadMapping(storageKey) || {};
  // if saved mapping only contains headerRow (from import config) treat it as empty so auto-detect runs
  const userMappingKeys = Object.keys(mapping).filter(k => k !== 'headerRow');
  const auto = (userMappingKeys.length === 0) ? autoMapHeaders(headers, defaults) : {};
      const options = [''].concat(headers);
      // also offer numeric index options up to headers length-1
      for (const f of defaults){
        const row = document.createElement('div');
        row.className='flex items-center gap-2';
        const label = document.createElement('div'); label.className='w-36 text-xs text-gray-600'; label.textContent = f.label;
        const sel = document.createElement('select'); sel.className='map-select rounded border px-2 py-1 text-sm flex-1';
        // option for automatic index by header name
        sel.innerHTML = options.map(o => `<option value="${o}">${o||'(nenhum)'}</option>`).join('') +
                        Array.from({length: Math.max(0, Math.min(30, headers.length+5))}).map((_,i)=>`<option value="__idx__${i}">Índice ${i}</option>`).join('');
        // set current value from mapping, auto-detect or default
        const current = (mapping[f.key] || auto[f.key] || f.default);
        if(current!==undefined && current!==null){ sel.value = current; }
        row.appendChild(label); row.appendChild(sel);
        container.appendChild(row);
      }
      // show panel
      panel.classList.remove('hidden');
    }

    function normalizeForMatch(s){ if(!s) return ''; try{ return String(s).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,''); }catch(e){ return String(s).toLowerCase(); } }

    function autoMapHeaders(headers, defaults){
      const map = {};
      const norm = headers.map(h => normalizeForMatch(h||''));
      function findByWords(words){
        for (let i=0;i<norm.length;i++){ const h = norm[i]; for (const w of words){ if(w && h.includes(w)) return headers[i]; } }
        return null;
      }
      // heuristics per key
      defaults.forEach(d => {
        const k = d.key;
        let found = null;
        if(k === 'date'){
          found = findByWords(['data','date','emissao','emissão','timestamp','dia']);
        } else if(k === 'time'){
          found = findByWords(['hora','time','horario']);
        } else if(k === 'status'){
          found = findByWords(['status','situacao','situação','estado','estado da']);
        } else if(k === 'valorBruto'){
          found = findByWords(['valor da venda atualizado','valor da venda original','valor da venda','valor atualizado','valor original','valor bruto','valor','amount','valorvenda']);
        } else if(k === 'modalidade'){
          found = findByWords(['modalidade','tipo','tipo de pagamento','forma']);
        } else if(k === 'valorMdr' || k === 'mdr'){
          found = findByWords(['mdr','taxa mdr','taxa mdr','taxa','taxa mdr']);
        } else if(k === 'valorLiquido'){
          found = findByWords(['valor liquido','valor líquido','liquido','liquidado','liquido','liquid']);
        }
        // fallback: try to find words from key name
        if(!found){ found = findByWords([normalizeForMatch(k)]); }
        // if still not found, try to guess by index common patterns (e.g., valorBruto prefer column 4 etc.) -- use header index if present
        if(!found){
          // no header match, try numeric fallback: look for header containing 'valor' for valor fields
          if(k === 'valorBruto' || k === 'valorLiquido' || k === 'valorMdr'){
            found = findByWords(['valor']);
          }
        }
        if(found){ map[k] = found; }
      });
      // special case: if time wasn't found but date was found (common when date and time are in same cell), map time to the same header as date
      if(!map.time && map.date){ map.time = map.date; }
      return map;
    }

    function readFirstFileHeaders(file, headerRowOverride){
      return new Promise(async (resolve, reject)=>{
        try{
          const data = await readFileArrayBufferWithRetry(file);
          const workbook = XLSX.read(new Uint8Array(data), {type:'array'});
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, {header:1});
          const headers = getHeadersFromJson(json, headerRowOverride);
          resolve({headers,json});
        }catch(err){ reject(err); }
      });
    }

    function applyMappingIndex(headers, mappingValue, fallbackIndex){
      if(!mappingValue) return fallbackIndex;
      if(String(mappingValue).startsWith('__idx__')){
        const n = Number(String(mappingValue).replace('__idx__',''));
        return Number.isFinite(n) ? n : fallbackIndex;
      }
      // try find header name
      const idx = headers.indexOf(String(mappingValue));
      return idx >= 0 ? idx : fallbackIndex;
    }

    // Lê um File/Blob em ArrayBuffer com retries para contornar locks temporários do SO (ex: arquivo aberto no Excel/OneDrive)
    async function readFileArrayBufferWithRetry(file, attempts = 4, delayMs = 400){
      for(let i=0;i<attempts;i++){
        try{
          return await file.arrayBuffer();
        }catch(err){
          // última tentativa: lança um erro mais amigável
          if(i === attempts - 1){
            const msg = (err && err.message) ? err.message : String(err);
            throw new Error('Não foi possível ler o arquivo. Feche-o no Excel/OneDrive (se aberto) e tente novamente. Detalhe técnico: ' + msg);
          }
          // aguarda um pouco antes de tentar novamente
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }


    // --- helpers para sincronizar MDR como despesas ---
    function genIdLocal() { return (Date.now().toString(36) + Math.random().toString(36).slice(2,8)); }
    function carregarDespesas() { try { return JSON.parse(localStorage.getItem('despesas')) || []; } catch(e){ return []; } }
    function salvarDespesas(ds) { try { localStorage.setItem('despesas', JSON.stringify(ds)); } catch(e){} }

    // Recebe um array de objetos resumoPorMes (val) e sincroniza lançamentos MDR em despesas
    function syncMdrToDespesas(vals){
      // Defensive: aggregate incoming vals by unique key (source||anoMes||tipo) so we create/keep
      // only one automatic despesa por mês+fonte+tipo, summing MDR when multiple daily inputs arrive.
      if (!Array.isArray(vals) || vals.length===0) return;
      const despesas = carregarDespesas();
      // aggregate incoming vals by key
      const agg = new Map();
      for (const v of vals){
        if (!v || !v.anoMes) continue;
        const key = `${v.source}||${v.anoMes}||${v.tipoPagamento||''}`;
        const mdrVal = Number(v.mdr || 0);
        if (mdrVal <= 0) continue;
        if (!agg.has(key)) agg.set(key, { source: v.source, anoMes: v.anoMes, tipoPagamento: v.tipoPagamento||'', mdr: 0 });
        const cur = agg.get(key);
        cur.mdr = (Number(cur.mdr) || 0) + mdrVal;
        agg.set(key, cur);
      }
      // build set of keys to keep
      const newKeys = Array.from(agg.keys());
      const newKeysSet = new Set(newKeys);
      // remove existing automatic despesas that are for keys that are NOT in newKeys
      // Mantém: despesas não automáticas OU despesas automáticas que estão nas novas chaves
      const filtered = despesas.filter(d => !d.autoFromVendasKey || newKeysSet.has(d.autoFromVendasKey));
      // Now, update or add one despesa per aggregated key
      const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      for (const [key, data] of agg.entries()){
        // Verifica se já existe uma despesa com esta chave
        const existingIndex = filtered.findIndex(d => d.autoFromVendasKey === key);
        
        const parts = String(data.anoMes||'').split('/');
        const ano = parts[0] || String(new Date().getFullYear());
        const mesNum = parts[1] ? Number(parts[1]) : null;
        const mesNome = (mesNum && mesNum>=1 && mesNum<=12) ? MONTHS_PT[mesNum-1] : MONTHS_PT[new Date().getMonth()];
        // calcula o último dia do mês para usar como dia padrão
        let lastDay = 1;
        try{
          if (mesNum && !isNaN(Number(ano))) {
            lastDay = new Date(Number(ano), Number(mesNum), 0).getDate();
          } else {
            const d = new Date(); lastDay = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
          }
        } catch(e){ lastDay = 1; }
        
        if (existingIndex >= 0) {
          // Atualiza a despesa existente
          filtered[existingIndex].valor = Number(data.mdr || 0);
          filtered[existingIndex].descricao = `MDR ${data.source || ''} ${data.tipoPagamento || ''}`.trim();
          filtered[existingIndex].ano = String(ano);
          filtered[existingIndex].mes = mesNome;
          filtered[existingIndex].dia = lastDay;
        } else {
          // Cria uma nova despesa
          const item = {
            id: genIdLocal(),
            ano: String(ano),
            mes: mesNome,
            dia: lastDay,
            tipo: 'Variável',
            categoria: 'Taxas de Vendas (MDR)',
            descricao: `MDR ${data.source || ''} ${data.tipoPagamento || ''}`.trim(),
            valor: Number(data.mdr || 0),
            autoFromVendasKey: key
          };
          filtered.push(item);
        }
      }
      salvarDespesas(filtered);
      try { localStorage.setItem('despesas_last_update', String(Date.now())); } catch(e){}
      // Dispara evento customizado para atualizar tabelas em outras páginas
      try {
        window.dispatchEvent(new CustomEvent('irancash:despesas:updated', { detail: { action: 'syncMdr' } }));
      } catch(e){}
    }

    // Remove despesas automáticas (MDR) geradas a partir de chaves de vendas
    // keys: array de chaves no formato usado na tabela: `${anoMes}__${source}__${tipo}`
    function removerDespesasMdrPorVendasKeys(keys){
      try{
        if(!Array.isArray(keys) || keys.length===0) return;
        const despesas = carregarDespesas();
        const autoKeysSet = new Set(keys.map(k=>{
          const parts = String(k||'').split('__');
          const anoMes = parts[0]||'';
          const source = parts[1]||'';
          const tipo = parts[2]||'';
          return `${source}||${anoMes}||${tipo}`; // mesmo formato usado em autoFromVendasKey
        }));
        const filtered = despesas.filter(d => !(d && d.autoFromVendasKey && autoKeysSet.has(d.autoFromVendasKey)));
        salvarDespesas(filtered);
        try{ localStorage.setItem('despesas_last_update', String(Date.now())); }catch(e){}
        // Dispara evento customizado para atualizar tabelas em outras páginas
        try {
          window.dispatchEvent(new CustomEvent('irancash:despesas:updated', { detail: { action: 'removeMdr', keys } }));
        } catch(e){}
      }catch(err){ console.warn('Erro ao remover despesas MDR por chaves de vendas', err); }
    }

    if(fileInputCartao){
      fileInputCartao.addEventListener('change', (e)=>{
        const files = e.target.files ? Array.from(e.target.files) : [];
        arquivosSelecionadosCartao = files;
        fileNameCartao.textContent = files.length ? `Arquivos: ${files.map(f=>f.name).join(', ')}` : '';
        processarBtnCartao.disabled = files.length === 0;
      });
    }
    if(fileInputPix){
      fileInputPix.addEventListener('change', (e)=>{
        const files = e.target.files ? Array.from(e.target.files) : [];
        arquivosSelecionadosPix = files;
        fileNamePix.textContent = files.length ? `Arquivos: ${files.map(f=>f.name).join(', ')}` : '';
        processarBtnPix.disabled = files.length === 0;
      });
    }

    // Config / mapping UI wiring removida

    // Configuração de importação removida (migrada para Configurações)


    // ===== Processar Cartões =====
    if(processarBtnCartao){
      processarBtnCartao.addEventListener('click', async ()=>{
        if (!arquivosSelecionadosCartao.length) return;
        
        // Ativa loading
        if (window.LoadingUtils) {
          window.LoadingUtils.setButtonLoading(processarBtnCartao, true, 'Processando...');
          window.LoadingUtils.toggleFullPageLoading(true, 'Processando arquivos de cartões...');
        } else {
          processarBtnCartao.disabled = true;
        }
        
  let resumoPorDia = {};
  let totalVendas = 0;
  let detalheBuffer = [];
        try{
          const savedMap = loadMapping('mapping_cartao') || {};
          for (const arquivo of arquivosSelecionadosCartao){
            const data = await readFileArrayBufferWithRetry(arquivo);
            const workbook = XLSX.read(new Uint8Array(data), {type: 'array'});
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, {header:1});

            // detect header row and headers
            const headerRowIndex = (typeof savedMap.headerRow === 'number') ? savedMap.headerRow : detectHeaderRow(json);
            const headers = (json[headerRowIndex] || []).map(h => h==null? '': String(h).trim());

            for (let i = headerRowIndex+1; i<json.length; i++){
              let row = json[i]; if(!row) continue;
              if (Array.isArray(row) && row.length===1 && typeof row[0]==='string' && row[0].includes(';')){ row = row[0].split(';').map(c => c==null ? '' : String(c).trim()); }

              // resolve indices by mapping or fallback to legacy indices
              const idxDate = applyMappingIndex(headers, savedMap.date || savedMap.data || savedMap.dataDaVenda, 0);
              const idxStatus = applyMappingIndex(headers, savedMap.status || savedMap.statusVenda, 2);
              const idxValorBruto = applyMappingIndex(headers, savedMap.valorBruto || savedMap.valorVendaAtualizado || savedMap['valor da venda atualizado'], 4);
              const idxModalidade = applyMappingIndex(headers, savedMap.modalidade || savedMap.tipo || savedMap['modalidade'], 5);
              const idxMdr = applyMappingIndex(headers, savedMap.valorMdr || savedMap.mdr || savedMap['valor mdr'], 11);
              const idxValorLiquido = applyMappingIndex(headers, savedMap.valorLiquido || savedMap['valor liquido'] , 16);

              const status = String(row[idxStatus]||'').trim().toLowerCase(); if (status === 'negada') continue;

              // obter data completa e normalizar para YYYY/MM/DD
              let anoMes = 'Indefinido';
              let anoMesDia = 'Indefinido';
              try{
                const dateObj = parseToJSDate(row[idxDate]);
                if (dateObj && !isNaN(dateObj.getTime())){
                  const y = dateObj.getFullYear(); const m = String(dateObj.getMonth()+1).padStart(2,'0'); const day = String(dateObj.getDate()).padStart(2,'0');
                  anoMes = `${y}/${m}`;
                  anoMesDia = `${y}/${m}/${day}`;
                } else {
                  const parsed = parseDateToAnoMes(row[idxDate]) || {}; anoMes = parsed.anoMes || 'Indefinido';
                }
              }catch(e){ anoMes = (parseDateToAnoMes(row[idxDate])||{}).anoMes || 'Indefinido'; }
              const modalidadeRaw = (row[idxModalidade]||'').toString().trim().toLowerCase();
              const modalidadeNorm = modalidadeRaw.normalize ? modalidadeRaw.normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/\s+/g,'') : modalidadeRaw;
              let tipoPagamento = '';
              if (modalidadeNorm.includes('debito') || modalidadeNorm.includes('deb')) tipoPagamento = 'Débito';
              else if (modalidadeNorm.includes('credito') || modalidadeNorm.includes('cred')) tipoPagamento = 'Crédito';
              else if (modalidadeNorm.includes('pix')) tipoPagamento = 'PIX';
              if (tipoPagamento!=='Débito' && tipoPagamento!=='Crédito') continue;

              const valorBruto = parseNumber(row[idxValorBruto]);
              const valorMDR  = parseNumber(row[idxMdr]);

              // save transaction-level detail (mantém granularidade por linha) - cartão: time pode estar em coluna separada
              try{
                const idxTime = applyMappingIndex(headers, savedMap.time || savedMap.hora || savedMap.timeVenda, 1);
                const rawDate = row[idxDate];
                const rawTime = row[idxTime];
                const combined = (rawDate ? String(rawDate) : '') + (rawTime ? (' ' + String(rawTime)) : '');
                const dt = extractDateTime(combined || rawDate);
                
                // Validação de horário obrigatório (Cartão)
                let finalTime = dt && dt.timeStr ? dt.timeStr : (rawTime || null);
                if (!finalTime) {
                    // Tenta extrair da string raw se o extractDateTime falhou
                    if (rawTime && String(rawTime).trim().match(/\d{1,2}:\d{1,2}/)) {
                        finalTime = String(rawTime).trim();
                    }
                }

                if (!finalTime) {
                    // Erro: Horário obrigatório não encontrado
                    const identificador = `Linha ${i + 1} (Data: ${rawDate || 'N/A'}, Valor: ${valorBruto})`;
                    const msgErro = `Erro na importação de Cartões:\n\n` +
                        `A venda na ${identificador} não possui um horário válido.\n` +
                        `O campo de horário é OBRIGATÓRIO para todas as vendas.\n\n` +
                        `Por favor, corrija o arquivo adicionando o horário nesta venda e tente importar novamente.`;
                    
                    alert(msgErro);
                    throw new Error(msgErro); // Interrompe o processamento
                }

                // push raw object with known amount fields; normalization will occur in addVendasDetalhadasBulk
                // store the raw combined date/time string so normalizeVendaDetalhada can re-parse if initial extract failed
                const rawObj = { date: combined || rawDate, dateMs: dt && dt.dateObj ? dt.dateObj.getTime() : null, time: finalTime, valorBruto: valorBruto, mdr: valorMDR, valorLiquido: (parseNumber(row[idxValorLiquido]) || (valorBruto - valorMDR)), source: 'cartao', tipoPagamento };
                  detalheBuffer.push(rawObj);
              }catch(e){ /* ignore */ }

              // agregar por dia (YYYY/MM/DD)
              const keyDia = `${anoMesDia}||${tipoPagamento}`;
              if(!resumoPorDia[keyDia]) resumoPorDia[keyDia] = {receitaBruta:0, mdr:0, anoMesDia, anoMes, source:'cartao', tipoPagamento};
              resumoPorDia[keyDia].receitaBruta += valorBruto;
              resumoPorDia[keyDia].mdr          += valorMDR;
              resumoPorDia[keyDia].receitaLiquida = resumoPorDia[keyDia].receitaBruta - resumoPorDia[keyDia].mdr;
              totalVendas++;
            }
          }

          // gravar vendas detalhadas em lote (mais eficiente) e reconstruir agregações a partir dos detalhes
          try{
            if(Array.isArray(detalheBuffer) && detalheBuffer.length>0){
              let beforeCount = 0;
              try { beforeCount = (JSON.parse(localStorage.getItem('vendasDetalhadas')||'[]')||[]).filter(x=>x && x.source==='cartao').length; } catch(e){}
              
              const added = await addVendasDetalhadasBulk(detalheBuffer);
              
              let afterCount = 0;
              try { afterCount = (JSON.parse(localStorage.getItem('vendasDetalhadas')||'[]')||[]).filter(x=>x && x.source==='cartao').length; } catch(e){}
              
              console.info('[IMPORT CARTAO] detalheBuffer rows:', detalheBuffer.length, 'added:', added, 'before:', beforeCount, 'after:', afterCount);
              
              if(added > 0){ 
                 try {
                   const sample = JSON.parse(localStorage.getItem('vendasDetalhadas')||'[]').filter(x=>x && x.source==='cartao').slice(Math.max(0, afterCount-10), afterCount);
                   console.debug('[IMPORT CARTAO] sample added items:', sample); 
                 } catch(e){}
              }
            }
            // rebuild diário/mensal a partir do conjunto completo de vendasDetalhadas
            const daily = await rebuildDailyFromDetalhadas();
            const monthlyResumo = computeMonthlyResumoFromDaily();
            try { syncMdrToDespesas(monthlyResumo); } catch(e){ console.warn('syncMdrToDespesas falhou', e); }
            try{ computeWeekdaySumsPerMonth(); }catch(e){ /* ignore */ }
          }catch(e){ console.error('Erro durante persistência/rebuild (cartões):', e); }
          
          // Mostrar toast de sucesso
          mostrarToastReceitas('✅ Importação Cartões concluída!', 'success');
          
          atualizarSelectAnos();
          const sel = document.getElementById('select-anos-receitas'); if(sel && sel.value) renderizarReceitasAno(sel.value);
        } catch(err){ 
          console.error(err); 
          alert('Erro ao processar arquivos de cartões: ' + (err && err.message ? err.message : err));
          mostrarToastReceitas('❌ Erro na importação', 'error');
        }
        finally{ 
          if (window.LoadingUtils) {
            window.LoadingUtils.setButtonLoading(processarBtnCartao, false);
            window.LoadingUtils.toggleFullPageLoading(false);
          } else {
            processarBtnCartao.disabled = false;
          }
        }
      });
    }

    // ===== Processar PIX =====
    if(processarBtnPix){
      processarBtnPix.addEventListener('click', async ()=>{
        if (!arquivosSelecionadosPix.length) return;
        
        // Ativa loading
        if (window.LoadingUtils) {
          window.LoadingUtils.setButtonLoading(processarBtnPix, true, 'Processando...');
          window.LoadingUtils.toggleFullPageLoading(true, 'Processando arquivos PIX...');
        } else {
          processarBtnPix.disabled = true;
        }
        
  let resumoPorDia = {};
  let totalVendas = 0;
  let detalheBuffer = [];
        try{
          const savedMap = loadMapping('mapping_pix') || {};
          for (const arquivo of arquivosSelecionadosPix){
            const data = await readFileArrayBufferWithRetry(arquivo);
            const workbook = XLSX.read(new Uint8Array(data), {type:'array'});
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, {header:1});

            const headerRowIndex = (typeof savedMap.headerRow === 'number') ? savedMap.headerRow : detectHeaderRow(json);
            const headers = (json[headerRowIndex] || []).map(h => h==null? '': String(h).trim());

            for (let i=headerRowIndex+1; i<json.length; i++){
              let row = json[i]; if(!row) continue;
              if (Array.isArray(row) && row.length===1 && typeof row[0]==='string' && row[0].includes(';')){ row = row[0].split(';').map(c => c==null ? '' : String(c).trim()); }

              const idxDate = applyMappingIndex(headers, savedMap.date || savedMap.data, 0);
              const idxStatus = applyMappingIndex(headers, savedMap.status || savedMap.statusVenda, 13);
              const idxValorBruto = applyMappingIndex(headers, savedMap.valorBruto || savedMap['valor bruto'], 16);
              const idxValorLiquido = applyMappingIndex(headers, savedMap.valorLiquido || savedMap['valor liquido'], 21);

              const dataRaw = row[idxDate];
              const status = String((row[idxStatus] || '') || '').trim().toLowerCase();
              if (!['approved','aprovado','concluida','concluído','concluido','liquidado'].some(s => status.includes(s))) continue;

              // obter data completa YYYY/MM/DD
              let anoMes = 'Indefinido';
              let anoMesDia = 'Indefinido';
              try{
                const dateObj = parseToJSDate(dataRaw);
                if (dateObj && !isNaN(dateObj.getTime())){
                  const y = dateObj.getFullYear(); const m = String(dateObj.getMonth()+1).padStart(2,'0'); const day = String(dateObj.getDate()).padStart(2,'0');
                  anoMes = `${y}/${m}`;
                  anoMesDia = `${y}/${m}/${day}`;
                } else {
                  const parsed = parseDateToAnoMes(dataRaw) || {}; anoMes = parsed.anoMes || 'Indefinido';
                }
              }catch(e){ anoMes = (parseDateToAnoMes(dataRaw)||{}).anoMes || 'Indefinido'; }

              const tipoPagamento = 'PIX';

              const valorBruto   = parseNumber(row[idxValorBruto]);
              const valorLiquido = parseNumber(row[idxValorLiquido]);
              const valorMDR = (valorBruto || 0) - (valorLiquido || 0);

              // save transaction-level detail for PIX
              try{
                // PIX: data e hora costumam vir juntas na mesma célula (ex: '2025-01-15 13:45:00')
                const dt = extractDateTime(dataRaw);
                
                // Validação de horário obrigatório (PIX)
                let finalTime = dt && dt.timeStr ? dt.timeStr : null;
                
                // Se não encontrou no extractDateTime, tenta extrair da string raw usando regex simples
                if (!finalTime && dataRaw && String(dataRaw).match(/\d{1,2}:\d{1,2}/)) {
                   const match = String(dataRaw).match(/(\d{1,2}:\d{1,2}(?::\d{1,2})?)/);
                   if (match) finalTime = match[1];
                }

                if (!finalTime) {
                    // Erro: Horário obrigatório não encontrado
                    const identificador = `Linha ${i + 1} (Data: ${dataRaw || 'N/A'}, Valor: ${valorBruto})`;
                    const msgErro = `Erro na importação de PIX:\n\n` +
                        `A venda na ${identificador} não possui um horário válido.\n` +
                        `O campo de horário é OBRIGATÓRIO para todas as vendas.\n\n` +
                        `Por favor, verifique se a coluna de Data contém o horário (ex: "dd/mm/aaaa HH:mm") e tente importar novamente.`;
                    
                    alert(msgErro);
                    throw new Error(msgErro); // Interrompe o processamento
                }

                // store original dataRaw so normalizeVendaDetalhada can attempt robust parsing
                const rawObj = { date: dataRaw, dateMs: dt && dt.dateObj ? dt.dateObj.getTime() : null, time: finalTime, valorBruto: valorBruto, mdr: valorMDR, valorLiquido: valorLiquido, source: 'pix', tipoPagamento };
                detalheBuffer.push(rawObj);
              }catch(e){ if(e.message && e.message.startsWith('Erro na importação')) throw e; /* rethrow validation errors */ }

              const keyDia = `${anoMesDia}||${tipoPagamento}`;
              if(!resumoPorDia[keyDia]) resumoPorDia[keyDia] = {receitaBruta:0, mdr:0, anoMesDia, anoMes, source:'pix', tipoPagamento};
              resumoPorDia[keyDia].receitaBruta   += valorBruto;
              resumoPorDia[keyDia].mdr            += valorMDR;
              resumoPorDia[keyDia].receitaLiquida  = resumoPorDia[keyDia].receitaBruta - resumoPorDia[keyDia].mdr;
              totalVendas++;
            }
          }
          // gravar vendas detalhadas em lote (mais eficiente) e reconstruir agregações a partir dos detalhes
          try{
            if(Array.isArray(detalheBuffer) && detalheBuffer.length>0){
              let beforeCount = 0;
              try { beforeCount = (JSON.parse(localStorage.getItem('vendasDetalhadas')||'[]')||[]).filter(x=>x && x.source==='pix').length; } catch(e){}
              
              const added = await addVendasDetalhadasBulk(detalheBuffer);
              
              let afterCount = 0;
              try { afterCount = (JSON.parse(localStorage.getItem('vendasDetalhadas')||'[]')||[]).filter(x=>x && x.source==='pix').length; } catch(e){}
              
              console.info('[IMPORT PIX] detalheBuffer rows:', detalheBuffer.length, 'added(replaced):', added, 'before pix count:', beforeCount, 'after pix count:', afterCount);
              
              if(added > 0){ 
                 try {
                   const sample = JSON.parse(localStorage.getItem('vendasDetalhadas')||'[]').filter(x=>x && x.source==='pix').slice(Math.max(0, afterCount-10), afterCount);
                   console.debug('[IMPORT PIX] sample added items:', sample); 
                 } catch(e){}
              }
            }
            // rebuild diário/mensal a partir do conjunto completo de vendasDetalhadas
            const daily = await rebuildDailyFromDetalhadas();
            const monthlyResumo = computeMonthlyResumoFromDaily();
            try { syncMdrToDespesas(monthlyResumo); } catch(e){ console.warn('syncMdrToDespesas falhou', e); }
            try{ computeWeekdaySumsPerMonth(); }catch(e){ /* ignore */ }
          }catch(e){ console.error('Erro durante persistência/rebuild (PIX):', e); }
          
          // Mostrar toast de sucesso
          mostrarToastReceitas('✅ Importação PIX concluída!', 'success');
          
          atualizarSelectAnos();
          const sel = document.getElementById('select-anos-receitas'); if(sel && sel.value) renderizarReceitasAno(sel.value);
        } catch(err){ 
          console.error(err); 
          alert('Erro ao processar arquivos PIX: ' + (err && err.message ? err.message : err));
          mostrarToastReceitas('❌ Erro na importação PIX', 'error');
        }
        finally{ 
          if (window.LoadingUtils) {
            window.LoadingUtils.setButtonLoading(processarBtnPix, false);
            window.LoadingUtils.toggleFullPageLoading(false);
          } else {
            processarBtnPix.disabled = false;
          }
        }
      });
    }

// ========== FUNÇÕES DE UX E VISUAL ==========

    // Excluir selecionados (bulk)
    const btnDelete = document.getElementById('btn-excluir-selecionados');
    if (btnDelete) {
      btnDelete.addEventListener('click', async () => {
        const checked = document.querySelectorAll('.check-venda:checked');
        if (checked.length === 0) {
          alert('Selecione pelo menos um item para excluir.');
          return;
        }

        if (!confirm(`Tem certeza que deseja excluir ${checked.length} item(ns)?`)) return;

        try {
          // IDs to remove
          const idsToRemove = new Set(Array.from(checked).map(c => c.dataset.id).filter(Boolean));
          
          // Get current list (always force async load to check cloud/chunks first)
          let all = [];
          try {
             all = await carregarVendasDetalhadasAsync();
          } catch(e) {
             console.warn('Fallback sync load for delete', e);
             all = JSON.parse(localStorage.getItem('vendasDetalhadas') || '[]');
          }
          
          if (!Array.isArray(all)) all = [];

          const initialCount = all.length;
          const filtered = all.filter(v => !idsToRemove.has(String(v.id || '')));
          const finalCount = filtered.length;

          console.log(`[DELETE] Removing ${idsToRemove.size} items. Before: ${initialCount}, After: ${finalCount}`);
          
          // Update in-memory cache IMMEDIATELY to reflect deletion in UI right away
          window._vendasDetalhadas_inMemory = filtered;

          // CLEANUP LOCAL STORAGE EXPLICITLY to prevent ghost data
          try {
            localStorage.removeItem('vendasDetalhadas');
            localStorage.removeItem('vendasDetalhadas_chunks');
            // Remove chunks pattern
            Object.keys(localStorage).forEach(k => {
               if(k.startsWith('vendasDetalhadas_chunk_')) localStorage.removeItem(k);
            });
          } catch(e) { console.warn('Erro ao limpar localStorage antigo:', e); }

          // Save back (will use Firebase adapter if available)
          await salvarVendasDetalhadas(filtered);
          
          // Force rebuild aggregations immediately
          await rebuildDailyFromDetalhadas();
          
          // Refresh UI
          renderizarReceitasAno(document.getElementById('select-anos-receitas')?.value || 'Todos');
          
          mostrarToastReceitas('✅ Itens excluídos com sucesso!', 'success');
          
          // Uncheck header checkbox if checked
          const headerCheck = document.getElementById('check-all-vendas');
          if(headerCheck) headerCheck.checked = false;

        } catch (err) {
          console.error('Erro ao excluir itens:', err);
          alert('Erro ao excluir itens: ' + err.message);
        }
      });
    }

// Formatar valor em Real
function fmtBRL(n) {
  return 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Toast de notificação
function mostrarToastReceitas(mensagem, tipo) {
  var toast = document.getElementById('toast-receitas');
  if (!toast) return;
  
  var cor = tipo === 'success' ? 'bg-emerald-500' : tipo === 'error' ? 'bg-red-500' : 'bg-sky-500';
  toast.className = 'fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 text-white ' + cor + ' transform translate-y-0 opacity-100 transition-all duration-300';
  toast.innerHTML = '<span>' + mensagem + '</span>';
  
  setTimeout(function() {
    toast.className = 'fixed bottom-4 right-4 transform translate-y-20 opacity-0 transition-all duration-300 z-50';
  }, 3000);
}

// Atualizar cards de resumo do ano
function atualizarCardsResumo(ano) {
  try {
    var dados = carregarVendasResumo() || [];
    var anoAtual = String(ano);
    var anoAnterior = String(Number(ano) - 1);
    
    // Filtrar dados do ano atual e anterior
    var dadosAno = dados.filter(function(v) {
      return v.anoMes && String(v.anoMes).startsWith(anoAtual + '/');
    });
    var dadosAnoAnterior = dados.filter(function(v) {
      return v.anoMes && String(v.anoMes).startsWith(anoAnterior + '/');
    });
    
    // Calcular totais do ano atual
    var totalBruta = 0, totalMDR = 0;
    var cartaoBruta = 0, cartaoMDR = 0;
    var pixBruta = 0, pixMDR = 0;
    var porMes = {};
    
    dadosAno.forEach(function(v) {
      var bruta = Number(v.receitaBruta || 0);
      var mdr = Number(v.mdr || 0);
      totalBruta += bruta;
      totalMDR += mdr;
      
      // Por fonte
      if (v.source === 'cartao') {
        cartaoBruta += bruta;
        cartaoMDR += mdr;
      } else if (v.source === 'pix') {
        pixBruta += bruta;
        pixMDR += mdr;
      }
      
      // Por mês
      var mes = v.anoMes ? v.anoMes.split('/')[1] : '';
      if (mes) {
        if (!porMes[mes]) porMes[mes] = 0;
        porMes[mes] += bruta;
      }
    });
    
    // Calcular totais do ano anterior
    var totalBrutaAnterior = 0, totalMDRAnterior = 0;
    dadosAnoAnterior.forEach(function(v) {
      totalBrutaAnterior += Number(v.receitaBruta || 0);
      totalMDRAnterior += Number(v.mdr || 0);
    });
    
    // Encontrar melhor mês
    var melhorMes = '--';
    var melhorMesValor = 0;
    var mesesNome = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    for (var mes in porMes) {
      if (porMes[mes] > melhorMesValor) {
        melhorMesValor = porMes[mes];
        var mesNum = parseInt(mes, 10);
        melhorMes = mesesNome[mesNum] || mes;
      }
    }
    
    // Calcular variações
    var variacaoBruta = totalBrutaAnterior > 0 ? ((totalBruta - totalBrutaAnterior) / totalBrutaAnterior * 100) : 0;
    var variacaoMDR = totalMDRAnterior > 0 ? ((totalMDR - totalMDRAnterior) / totalMDRAnterior * 100) : 0;
    var variacaoLiquida = (totalBrutaAnterior - totalMDRAnterior) > 0 ? 
      (((totalBruta - totalMDR) - (totalBrutaAnterior - totalMDRAnterior)) / (totalBrutaAnterior - totalMDRAnterior) * 100) : 0;
    
    // Atualizar elementos
    var el;
    
    // Receita Bruta
    el = document.getElementById('card-receita-bruta');
    if (el) el.textContent = fmtBRL(totalBruta);
    el = document.getElementById('card-receita-bruta-comp');
    if (el && totalBrutaAnterior > 0) {
      var seta = variacaoBruta >= 0 ? '↑' : '↓';
      var cor = variacaoBruta >= 0 ? 'text-emerald-600' : 'text-red-600';
      el.className = 'text-xs mt-1 ' + cor;
      el.textContent = seta + ' ' + Math.abs(variacaoBruta).toFixed(1) + '% vs ' + anoAnterior;
    } else if (el) {
      el.textContent = '';
    }
    
    // MDR
    el = document.getElementById('card-mdr-total');
    if (el) el.textContent = fmtBRL(totalMDR);
    el = document.getElementById('card-mdr-comp');
    if (el && totalMDRAnterior > 0) {
      var seta = variacaoMDR <= 0 ? '↓' : '↑';
      var cor = variacaoMDR <= 0 ? 'text-emerald-600' : 'text-red-600';
      el.className = 'text-xs mt-1 ' + cor;
      el.textContent = seta + ' ' + Math.abs(variacaoMDR).toFixed(1) + '% vs ' + anoAnterior;
    } else if (el) {
      el.textContent = '';
    }
    
    // Receita Líquida
    el = document.getElementById('card-receita-liquida');
    if (el) el.textContent = fmtBRL(totalBruta - totalMDR);
    el = document.getElementById('card-receita-liquida-comp');
    if (el && (totalBrutaAnterior - totalMDRAnterior) > 0) {
      var seta = variacaoLiquida >= 0 ? '↑' : '↓';
      var cor = variacaoLiquida >= 0 ? 'text-sky-600' : 'text-red-600';
      el.className = 'text-xs mt-1 ' + cor;
      el.textContent = seta + ' ' + Math.abs(variacaoLiquida).toFixed(1) + '% vs ' + anoAnterior;
    } else if (el) {
      el.textContent = '';
    }
    
    // Melhor Mês
    el = document.getElementById('card-melhor-mes');
    if (el) el.textContent = melhorMes;
    el = document.getElementById('card-melhor-mes-valor');
    if (el) el.textContent = melhorMesValor > 0 ? fmtBRL(melhorMesValor) : '';
    
    // Cartão
    el = document.getElementById('card-cartao-bruta');
    if (el) el.textContent = fmtBRL(cartaoBruta);
    el = document.getElementById('card-cartao-mdr');
    if (el) el.textContent = fmtBRL(cartaoMDR);
    el = document.getElementById('card-cartao-liquida');
    if (el) el.textContent = fmtBRL(cartaoBruta - cartaoMDR);
    
    // PIX
    el = document.getElementById('card-pix-bruta');
    if (el) el.textContent = fmtBRL(pixBruta);
    el = document.getElementById('card-pix-mdr');
    if (el) el.textContent = fmtBRL(pixMDR);
    el = document.getElementById('card-pix-liquida');
    if (el) el.textContent = fmtBRL(pixBruta - pixMDR);
    
  } catch (e) {
    console.error('Erro ao atualizar cards resumo:', e);
  }
}
// ========== META DE RECEITA MENSAL ==========
var metaReceitaAtual = 0;
var mesAtualMeta = null;

function carregarMetaReceita() {
  try {
    var meta = localStorage.getItem('metaReceitaMensal');
    return meta ? Number(meta) : 0;
  } catch (e) {
    return 0;
  }
}

function salvarMetaReceita(valor) {
  try {
    localStorage.setItem('metaReceitaMensal', String(valor));
    mostrarToastReceitas('✅ Meta salva!', 'success');
  } catch (e) {
    console.error('Erro ao salvar meta:', e);
  }
}

function atualizarBarraMeta(receitaAtual, meta) {
  var barra = document.getElementById('barra-meta-receita');
  var elAtual = document.getElementById('meta-atual-receita');
  var elPorcentagem = document.getElementById('meta-porcentagem-receita');
  var elAlvo = document.getElementById('meta-alvo-receita');
  
  if (!barra) return;
  
  var porcentagem = meta > 0 ? Math.min((receitaAtual / meta) * 100, 100) : 0;
  
  barra.style.width = porcentagem + '%';
  
  // Cor baseada no progresso
  if (porcentagem >= 100) {
    barra.className = 'h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500';
  } else if (porcentagem >= 70) {
    barra.className = 'h-full bg-gradient-to-r from-sky-400 to-sky-600 transition-all duration-500';
  } else if (porcentagem >= 40) {
    barra.className = 'h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-500';
  } else {
    barra.className = 'h-full bg-gradient-to-r from-red-400 to-red-600 transition-all duration-500';
  }
  
  if (elAtual) elAtual.textContent = fmtBRL(receitaAtual);
  if (elPorcentagem) {
    elPorcentagem.textContent = porcentagem.toFixed(0) + '%';
    elPorcentagem.className = 'font-bold ' + (porcentagem >= 100 ? 'text-emerald-600' : porcentagem >= 70 ? 'text-sky-600' : porcentagem >= 40 ? 'text-amber-600' : 'text-red-600');
  }
  if (elAlvo) elAlvo.textContent = 'Meta: ' + fmtBRL(meta);
}

// Inicializar meta
(function initMetaReceita() {
  var inputMeta = document.getElementById('input-meta-receita');
  var btnSalvar = document.getElementById('btn-salvar-meta-receita');
  
  if (inputMeta) {
    var metaSalva = carregarMetaReceita();
    if (metaSalva > 0) {
      inputMeta.value = metaSalva;
    }
  }
  
  if (btnSalvar) {
    btnSalvar.addEventListener('click', function() {
      var valor = Number(inputMeta.value) || 0;
      salvarMetaReceita(valor);
      metaReceitaAtual = valor;
      // Atualizar barra com receita do mês atual
      atualizarMetaComMesAtual();
    });
  }
})();

function atualizarMetaComMesAtual() {
  var meta = carregarMetaReceita();
  var hoje = new Date();
  var ano = document.getElementById('select-anos-receitas');
  var anoVal = ano ? ano.value : String(hoje.getFullYear());
  var mesAtual = hoje.getMonth() + 1;
  
  var dados = carregarVendasResumo() || [];
  var receitaMes = 0;
  
  dados.forEach(function(v) {
    if (v.anoMes) {
      var partes = v.anoMes.split('/');
      if (partes[0] === anoVal && Number(partes[1]) === mesAtual) {
        receitaMes += Number(v.receitaBruta || 0);
      }
    }
  });
  
  atualizarBarraMeta(receitaMes, meta);
}

// ========== COMPARATIVO ANO ANTERIOR ==========
function atualizarComparativoAnoAnterior(ano, mes) {
  var container = document.getElementById('comparativo-ano-anterior');
  if (!container) return;
  
  try {
    var dados = carregarVendasResumo() || [];
    var anoAtual = String(ano);
    var anoAnterior = String(Number(ano) - 1);
    var mesStr = mes < 10 ? '0' + mes : String(mes);
    
    var filtroAtual = anoAtual + '/' + mesStr;
    var filtroAnterior = anoAnterior + '/' + mesStr;
    
    var receitaAtual = 0, receitaAnterior = 0;
    var transacoesAtual = 0, transacoesAnterior = 0;
    
    dados.forEach(function(v) {
      if (v.anoMes === filtroAtual) {
        receitaAtual += Number(v.receitaBruta || 0);
        transacoesAtual += Number(v.transacoes || 1);
      }
      if (v.anoMes === filtroAnterior) {
        receitaAnterior += Number(v.receitaBruta || 0);
        transacoesAnterior += Number(v.transacoes || 1);
      }
    });
    
    // Calcular variação percentual
    var variacao = 0;
    var variacaoTxt = 'N/A';
    var variacaoCor = 'text-gray-500';
    var variacaoIcon = '➖';
    
    if (receitaAnterior > 0) {
      variacao = ((receitaAtual - receitaAnterior) / receitaAnterior) * 100;
      if (variacao > 0) {
        variacaoTxt = '+' + variacao.toFixed(1) + '%';
        variacaoCor = 'text-emerald-600';
        variacaoIcon = '📈';
      } else if (variacao < 0) {
        variacaoTxt = variacao.toFixed(1) + '%';
        variacaoCor = 'text-red-500';
        variacaoIcon = '📉';
      } else {
        variacaoTxt = '0%';
        variacaoIcon = '➖';
      }
    } else if (receitaAtual > 0) {
      variacaoTxt = 'Novo';
      variacaoCor = 'text-sky-500';
      variacaoIcon = '🆕';
    }
    
    var mesesNome = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    var nomeMes = mesesNome[mes - 1] || '';
    
    var html = '';
    
    // Card Ano Atual
    html += '<div class="bg-gradient-to-br from-sky-50 to-sky-100 rounded-lg p-4 border border-sky-200">';
    html += '<div class="text-xs text-sky-600 font-medium mb-1">' + nomeMes + ' ' + anoAtual + '</div>';
    html += '<div class="text-2xl font-bold text-sky-700">' + fmtBRL(receitaAtual) + '</div>';
    html += '<div class="text-xs text-gray-500 mt-1">' + transacoesAtual + ' transações</div>';
    html += '</div>';
    
    // Card Variação
    html += '<div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200 flex flex-col items-center justify-center">';
    html += '<div class="text-2xl mb-1">' + variacaoIcon + '</div>';
    html += '<div class="text-2xl font-bold ' + variacaoCor + '">' + variacaoTxt + '</div>';
    html += '<div class="text-xs text-gray-500">vs ano anterior</div>';
    html += '</div>';
    
    // Card Ano Anterior
    html += '<div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200">';
    html += '<div class="text-xs text-gray-600 font-medium mb-1">' + nomeMes + ' ' + anoAnterior + '</div>';
    html += '<div class="text-2xl font-bold text-gray-600">' + fmtBRL(receitaAnterior) + '</div>';
    html += '<div class="text-xs text-gray-500 mt-1">' + transacoesAnterior + ' transações</div>';
    html += '</div>';
    
    container.innerHTML = html;
    
  } catch (e) {
    console.error('Erro ao atualizar comparativo:', e);
    container.innerHTML = '<div class="text-center text-red-400 text-sm py-4 col-span-full">Erro ao carregar</div>';
  }
}

// ========== RESUMO POR TIPO DE PAGAMENTO COM TICKET MÉDIO ==========
function atualizarResumoPorTipo(ano, mes) {
  var container = document.getElementById('resumo-tipos-pagamento');
  if (!container) return;
  
  try {
    var dados = carregarVendasResumo() || [];
    var filtro = ano + '/' + (mes < 10 ? '0' + mes : mes);
    
    var porTipo = {};
    
    dados.forEach(function(v) {
      if (v.anoMes === filtro && v.tipoPagamento) {
        var tipo = v.tipoPagamento;
        if (!porTipo[tipo]) {
          porTipo[tipo] = { bruta: 0, mdr: 0, transacoes: 0 };
        }
        porTipo[tipo].bruta += Number(v.receitaBruta || 0);
        porTipo[tipo].mdr += Number(v.mdr || 0);
        porTipo[tipo].transacoes += Number(v.transacoes || 1);
      }
    });
    
    var tipos = Object.keys(porTipo);
    
    if (tipos.length === 0) {
      container.innerHTML = '<div class="text-center text-gray-400 text-sm py-4 col-span-full">Nenhum dado para este mês</div>';
      return;
    }
    
    // Cores para tipos de pagamento
    var cores = {
      'Crédito': { bg: 'from-blue-50 to-blue-100', border: 'border-blue-200', text: 'text-blue-700', icon: '💳' },
      'Débito': { bg: 'from-green-50 to-green-100', border: 'border-green-200', text: 'text-green-700', icon: '💳' },
      'PIX': { bg: 'from-emerald-50 to-emerald-100', border: 'border-emerald-200', text: 'text-emerald-700', icon: '📱' },
      'PIX Saque': { bg: 'from-teal-50 to-teal-100', border: 'border-teal-200', text: 'text-teal-700', icon: '💸' },
      'Voucher': { bg: 'from-purple-50 to-purple-100', border: 'border-purple-200', text: 'text-purple-700', icon: '🎫' },
      'default': { bg: 'from-gray-50 to-gray-100', border: 'border-gray-200', text: 'text-gray-700', icon: '💰' }
    };
    
    var html = '';
    tipos.sort().forEach(function(tipo) {
      var cor = cores[tipo] || cores['default'];
      var info = porTipo[tipo];
      var liquido = info.bruta - info.mdr;
      var ticketMedio = info.transacoes > 0 ? info.bruta / info.transacoes : 0;
      
      html += '<div class="bg-gradient-to-br ' + cor.bg + ' rounded-lg p-3 border ' + cor.border + '">';
      html += '<div class="flex items-center gap-1 mb-2">';
      html += '<span>' + cor.icon + '</span>';
      html += '<span class="text-xs font-medium ' + cor.text + '">' + tipo + '</span>';
      html += '</div>';
      html += '<div class="text-lg font-bold ' + cor.text + '">' + fmtBRL(liquido) + '</div>';
      html += '<div class="text-xs text-gray-500">Bruto: ' + fmtBRL(info.bruta) + '</div>';
      html += '<div class="flex items-center gap-1 mt-2 pt-2 border-t border-gray-200">';
      html += '<span class="text-xs">🎫</span>';
      html += '<span class="text-xs text-gray-600">Ticket médio: <strong class="' + cor.text + '">' + fmtBRL(ticketMedio) + '</strong></span>';
      html += '</div>';
      html += '<div class="text-xs text-gray-400 mt-1">' + info.transacoes + ' transações</div>';
      html += '</div>';
    });
    
    container.innerHTML = html;
    
  } catch (e) {
    console.error('Erro ao atualizar resumo por tipo:', e);
    container.innerHTML = '<div class="text-center text-red-400 text-sm py-4 col-span-full">Erro ao carregar</div>';
  }
}

// Atualizar tudo quando mudar filtro de mês
function atualizarComponentesExtras(ano, mesFiltro) {
  // Atualizar meta
  atualizarMetaComMesAtual();
  
  // Se tiver filtro de mês específico, atualizar resumo por tipo e comparativo
  if (mesFiltro && mesFiltro !== 'Todos') {
    var mesesNome = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    var mesIdx = mesesNome.indexOf(mesFiltro) + 1;
    if (mesIdx > 0) {
      atualizarResumoPorTipo(ano, mesIdx);
      atualizarComparativoAnoAnterior(ano, mesIdx);
    }
  } else {
    // Limpar comparativo se não houver mês específico
    var containerComp = document.getElementById('comparativo-ano-anterior');
    if (containerComp) {
      containerComp.innerHTML = '<div class="text-center text-gray-400 text-sm py-4 col-span-full">Selecione um mês para ver o comparativo</div>';
    }
  }
}

























