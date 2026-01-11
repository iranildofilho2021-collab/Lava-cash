/**
 * Adaptador para conectar a lógica de Receitas (Vendas) ao Firebase
 * Sobrescreve funções de persistência do receitas.js para usar FirebaseStore
 */
(function() {
  'use strict';

  // Aguarda inicialização do Firebase
  window.addEventListener('firebase:initialized', setupAdapter);
  
  // Tenta configurar imediatamente se já estiver pronto
  if (window.IRANCASH && window.IRANCASH.Firebase && window.IRANCASH.Firebase.ready) {
    setupAdapter();
  } else {
    // Fallback: tenta novamente em 1s
    setTimeout(setupAdapter, 1000);
  }

  function setupAdapter() {
    if (window._receitasAdapterInitialized) return;
    
    console.log('[ReceitasAdapter] Inicializando adaptador Firebase para Receitas...');

    // 1. Intercepta salvamento de Vendas Detalhadas
    // A função original salvarVendasDetalhadas pode estar definida no escopo global ou dentro de um closure
    // Se estiver global, sobrescrevemos. Se não, precisamos garantir que o código que a chama use nossa versão.
    // Como receitas.js é um script grande e complexo, vamos expor funções globais que ele possa usar ou sobrescrever se possível.
    
    const originalSalvarVendasDetalhadas = window.salvarVendasDetalhadas;
    
    window.salvarVendasDetalhadas = async function(vendas) {
      console.log('[ReceitasAdapter] Salvando vendas detalhadas no Firebase...', vendas ? vendas.length : 0);
      
      // Atualiza cache em memória explicitamente para garantir UI responsiva mesmo se localStorage falhar
      try { window._vendasDetalhadas_inMemory = Array.isArray(vendas) ? vendas.slice() : []; } catch(e){}

      // Chama original para manter comportamento local (localStorage/IndexedDB)
      if (typeof originalSalvarVendasDetalhadas === 'function') {
        try { 
          await originalSalvarVendasDetalhadas(vendas); 
        } catch(e) { 
          console.warn('Erro no salvarVendasDetalhadas original:', e); 
        }
      } else {
        // Fallback se original não existir (embora deva existir)
        try {
          if (typeof idbPut === 'function') {
            const compact = vendas.map(x => ({ 
              d: x.date || '', t: x.time || '', ms: (x.dateMs!=null)?Number(x.dateMs):null, 
              v: Math.round((Number(x.valorBruto||0)||0)*100), s: x.source||'', p: x.tipoPagamento||'', 
              m: Math.round((Number(x.mdr||0)||0)*100), id: x.id||'' 
            }));
            idbPut('vendasDetalhadas', { format:'compact', data: compact });
            localStorage.setItem('vendasDetalhadas_idb','1');
          }
        } catch(e) {}
      }

      // Salva no Firebase em background (não bloqueia a UI)
      (async () => {
        if (window.FirebaseStore && await window.FirebaseStore.isAvailable()) {
          try {
            // Salva em chunks ou coleção separada se for muito grande
            // Para simplificar e manter compatibilidade, salvamos o objeto completo por enquanto
            // Idealmente, usaríamos subcoleção 'vendas' no Firestore
            
            // Otimização: Salvar formato compacto
            const compact = vendas.map(x => ({ 
              d: x.date || '', t: x.time || '', ms: (x.dateMs!=null)?Number(x.dateMs):null, 
              v: Math.round((Number(x.valorBruto||0)||0)*100), s: x.source||'', p: x.tipoPagamento||'', 
              m: Math.round((Number(x.mdr||0)||0)*100), id: x.id||'' 
            }));
            
            // Verificar tamanho antes de salvar (limite Firestore: 1MB)
            const jsonStr = JSON.stringify({ format:'compact', data: compact });
            const sizeBytes = new Blob([jsonStr]).size;
            
            if (sizeBytes > 900000) { // Margem de segurança (aprox 900KB)
               console.warn(`[ReceitasAdapter] Payload muito grande (${(sizeBytes/1024/1024).toFixed(2)} MB). Dividindo em chunks...`);
               
               // Se o tamanho exceder 900KB, vamos dividir em múltiplos documentos (chunks)
               console.log('[ReceitasAdapter] Iniciando salvamento em chunks...');
               
               // Ordenar por data decrescente (mais recentes primeiro) para facilitar visualização nos chunks
               compact.sort((a,b) => (b.ms || 0) - (a.ms || 0));
               
               const CHUNK_SIZE = 2000; // ~2000 itens por doc deve ser seguro (< 500KB)
               const chunks = [];
               for (let i = 0; i < compact.length; i += CHUNK_SIZE) {
                   chunks.push(compact.slice(i, i + CHUNK_SIZE));
               }
               
               // Salvar metadados no documento principal
               await window.FirebaseStore.setItem('vendasDetalhadas', { 
                   format: 'chunked', 
                   count: compact.length,
                   chunkCount: chunks.length,
                   timestamp: Date.now() 
               });
               
               // Salvar cada chunk em documento separado
               for (let i = 0; i < chunks.length; i++) {
                   const chunkKey = `vendasDetalhadas_chunk_${i}`;
                   await window.FirebaseStore.setItem(chunkKey, {
                       format: 'chunk_part',
                       index: i,
                       total: chunks.length,
                       data: chunks[i]
                   });
               }
               console.log(`[ReceitasAdapter] Salvo em ${chunks.length} chunks com sucesso.`);
            } else {
               await window.FirebaseStore.setItem('vendasDetalhadas', { format:'compact', data: compact });
            }

            console.log('[ReceitasAdapter] Vendas detalhadas sincronizadas com Firebase');
          } catch (err) {
            console.error('[ReceitasAdapter] Erro ao salvar vendas no Firebase:', err);
          }
        }
      })();
    };

    // 2. Intercepta salvamento de Resumo Dia
    const originalSalvarVendasResumoDia = window.salvarVendasResumoDia; // Assumindo que existe ou lógica similar
    
    // Se não houver função global, vamos monitorar mudanças no localStorage ou injetar na lógica de importação
    // Em receitas.js, a função syncMdrToDespesas chama salvarDespesas. Vamos sobrescrever essa localmente se pudermos,
    // mas ela está dentro de um closure. Felizmente, ela usa localStorage.
    
    // Vamos sobrescrever a função global de carregar para priorizar Firebase
    const originalCarregarVendasResumo = window.carregarVendasResumo;
    window.carregarVendasResumo = function() {
      // Tenta pegar do cache em memória que o FirebaseStore popula
      if (window._vendasResumo_inMemory) return window._vendasResumo_inMemory;
      return originalCarregarVendasResumo ? originalCarregarVendasResumo() : [];
    };

    // 4. Intercepta carregamento de Vendas Detalhadas (Async e Sync)
    // Isso é CRUCIAL para garantir que a UI leia do Firebase (que tem os chunks) e não do localStorage quebrado
    const originalCarregarVendasDetalhadasAsync = window.carregarVendasDetalhadasAsync;
    
    window.carregarVendasDetalhadasAsync = async function() {
      // 1. Tentar cache em memória
      if(window._vendasDetalhadas_inMemory && Array.isArray(window._vendasDetalhadas_inMemory)) {
        return window._vendasDetalhadas_inMemory.slice();
      }
      
      // 2. Tentar ler do Firebase (fonte da verdade)
      if (window.FirebaseStore && await window.FirebaseStore.isAvailable()) {
        try {
          const remoteData = await window.FirebaseStore.getItem('vendasDetalhadas');
          
          if (remoteData) {
            // Caso 1: Dados salvos em chunks (formato novo)
            if (remoteData.format === 'chunked') {
              console.log(`[ReceitasAdapter] Carregando ${remoteData.count} itens de ${remoteData.chunkCount} chunks do Firebase...`);
              let fullData = [];
              
              // Carregar chunks em paralelo
              const promises = [];
              for (let i = 0; i < remoteData.chunkCount; i++) {
                 promises.push(window.FirebaseStore.getItem(`vendasDetalhadas_chunk_${i}`));
              }
              
              const chunks = await Promise.all(promises);
              
              // Montar array completo
              chunks.forEach(chunk => {
                if (chunk && Array.isArray(chunk.data)) {
                  fullData = fullData.concat(chunk.data);
                }
              });
              
              // Expandir formato compacto
              const expanded = fullData.map(it => ({ 
                date: it.d || '', 
                time: it.t || '', 
                dateMs: (it.ms != null)?Number(it.ms):null, 
                valorBruto: (it.v!=null)?(Number(it.v)/100):0, 
                mdr: (it.m!=null)?(Number(it.m)/100):0, 
                source: it.s||'', 
                tipoPagamento: it.p||'', 
                id: it.id||'' 
              }));
              
              // Atualizar cache em memória
              window._vendasDetalhadas_inMemory = expanded;
              return expanded;
            }
            
            // Caso 2: Dados salvos em formato compacto único (formato anterior)
            if (remoteData.format === 'compact' && Array.isArray(remoteData.data)) {
               const expanded = remoteData.data.map(it => ({ 
                date: it.d || '', 
                time: it.t || '', 
                dateMs: (it.ms != null)?Number(it.ms):null, 
                valorBruto: (it.v!=null)?(Number(it.v)/100):0, 
                mdr: (it.m!=null)?(Number(it.m)/100):0, 
                source: it.s||'', 
                tipoPagamento: it.p||'', 
                id: it.id||'' 
              }));
              window._vendasDetalhadas_inMemory = expanded;
              return expanded;
            }
          }
        } catch(e) {
          console.warn('[ReceitasAdapter] Erro ao carregar do Firebase, tentando local:', e);
        }
      }
      
      // 3. Fallback para local (IndexedDB/LocalStorage) se Firebase falhar ou não tiver dados
      if (typeof originalCarregarVendasDetalhadasAsync === 'function') {
        return await originalCarregarVendasDetalhadasAsync();
      }
      
      return [];
    };

    // Sobrescrever também a versão síncrona para preferir a memória atualizada
    // Isso evita que a UI renderize dados antigos do localStorage logo após uma exclusão falhar ao salvar no disco
    const originalCarregarVendasDetalhadas = window.carregarVendasDetalhadas;
    window.carregarVendasDetalhadas = function() {
       // Se tivermos dados frescos na memória (vindos do Firebase ou de uma edição recente), use-os!
       if (window._vendasDetalhadas_inMemory && Array.isArray(window._vendasDetalhadas_inMemory)) {
          return window._vendasDetalhadas_inMemory.slice();
       }
       return originalCarregarVendasDetalhadas ? originalCarregarVendasDetalhadas() : [];
    };

    // 3. Sincronização de MDR (Despesas Automáticas)
    // O receitas.js usa uma função local salvarDespesas. Não conseguimos sobrescrevê-la diretamente.
    // Mas podemos ouvir o evento 'irancash:despesas:updated' que ela dispara (se disparar) ou monitorar localStorage.
    // O melhor é garantir que o DataStore (que já está conectado ao Firebase) seja a fonte da verdade.
    
    // Vamos monkey-patch localStorage.setItem para capturar 'despesas' e enviar para Firebase
    // Isso é um pouco agressivo, mas garante que qualquer escrita local vá para a nuvem
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value) {
      originalSetItem.apply(this, [key, value]);
      
      if (key === 'despesas') {
        // Envia para Firebase em background
        if (window.FirebaseStore) {
          try {
            const parsed = JSON.parse(value);
            window.FirebaseStore.isAvailable().then(avail => {
              if (avail) window.FirebaseStore.setItem('despesas', parsed);
            });
          } catch(e) {}
        }
      }
      
      if (key === 'vendasResumo') {
        try {
          const parsed = JSON.parse(value);
          // OTIMIZAÇÃO: Atualiza cache em memória imediatamente para evitar race condition na UI
          // Isso resolve o bug onde a exclusão de itens antigos precisava ser feita duas vezes
          window._vendasResumo_inMemory = parsed;
          
          if (window.FirebaseStore) {
            window.FirebaseStore.isAvailable().then(avail => {
              if (avail) window.FirebaseStore.setItem('vendasResumo', parsed);
            });
          }
        } catch(e) {}
      }
      
      if (key === 'vendasResumoDia') {
         try {
           const parsed = JSON.parse(value);
           window._vendasResumoDia_inMemory = parsed; // Otimização
           
           if (window.FirebaseStore) {
             window.FirebaseStore.isAvailable().then(avail => {
               if (avail) window.FirebaseStore.setItem('vendasResumoDia', parsed);
             });
           }
         } catch(e) {}
      }
    };

    window._receitasAdapterInitialized = true;
    console.log('[ReceitasAdapter] Adaptador configurado com sucesso.');

    // 4. Migração Inicial Automática com Chunking
    // O firebase-store.js não migra vendasDetalhadas automaticamente para evitar erro de tamanho.
    // O adaptador assume essa responsabilidade aqui, usando a lógica de chunking.
    (async () => {
      try {
        if (window.FirebaseStore && await window.FirebaseStore.isAvailable()) {
           const localRaw = localStorage.getItem('vendasDetalhadas');
           if (localRaw) {
             const remoteData = await window.FirebaseStore.getItem('vendasDetalhadas');
             // Se não existe remoto, ou se o local parece mais novo (simplificação: apenas se não existir remoto para evitar overwrite acidental)
             if (!remoteData) {
               console.log('[ReceitasAdapter] Migrando vendasDetalhadas local -> Firebase com chunking...');
               const vendas = JSON.parse(localRaw);
               if (Array.isArray(vendas) && vendas.length > 0) {
                 await window.salvarVendasDetalhadas(vendas);
               }
             }
           }
        }
      } catch(e) { console.warn('[ReceitasAdapter] Erro na migração inicial:', e); }
    })();
  }

})();
