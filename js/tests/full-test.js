/**
 * Testes de Carga e Integração para Firebase
 * Execute chamando window.runFullTests() no console
 */
(function() {
  'use strict';

  async function runFullTests() {
    console.group('🚀 Iniciando Testes de Carga e Integração Firebase');
    const Store = window.FirebaseStore;
    
    if (!Store || !await Store.isAvailable()) {
      console.error('❌ Firebase não está disponível. Abortando.');
      console.groupEnd();
      return;
    }

    const results = { passed: 0, failed: 0, timings: {} };

    // 1. Teste de Carga: Criação em Massa
    try {
      console.time('Carga: 100 itens');
      const batchSize = 100;
      const items = [];
      for (let i = 0; i < batchSize; i++) {
        items.push({
          id: `load_test_${Date.now()}_${i}`,
          key: `load_test_key_${i}`,
          value: { index: i, timestamp: Date.now(), data: 'x'.repeat(100) } // payload de ~100 bytes
        });
      }

      // Usando Promise.all para simular concorrência
      await Promise.all(items.map(item => Store.setItem(item.key, item.value)));
      
      console.timeEnd('Carga: 100 itens');
      console.log('✅ Carga de 100 itens concluída com sucesso');
      results.passed++;
    } catch (e) {
      console.error('❌ Falha no teste de carga:', e);
      results.failed++;
    }

    // 2. Teste de Leitura e Verificação
    try {
      console.time('Leitura: 100 itens');
      const keys = await Store.getAllKeys();
      const loadKeys = keys.filter(k => k.startsWith('load_test_key_'));
      
      if (loadKeys.length < 100) {
        throw new Error(`Esperado 100 chaves de teste, encontrado ${loadKeys.length}`);
      }

      const item0 = await Store.getItem(loadKeys[0]);
      if (!item0 || !item0.data) throw new Error('Dados corrompidos ou ausentes');

      console.timeEnd('Leitura: 100 itens');
      console.log('✅ Leitura e verificação concluída');
      results.passed++;
    } catch (e) {
      console.error('❌ Falha no teste de leitura:', e);
      results.failed++;
    }

    // 3. Teste de Atualização Concorrente (Simulação)
    try {
      const key = 'concurrent_test_key';
      await Store.setItem(key, { count: 0 });
      
      // Simula 5 atualizações "quase" simultâneas
      // Nota: Firestore Client SDK lida com fila de escrita, então não é "race condition" real no servidor,
      // mas testa a robustez do cliente.
      const updates = [];
      for (let i = 1; i <= 5; i++) {
        updates.push(Store.setItem(key, { count: i }));
      }
      await Promise.all(updates);
      
      const final = await Store.getItem(key);
      console.log('Valor final após updates concorrentes:', final); // Deve ser 5 (ou último processado)
      console.log('✅ Teste de concorrência concluído (sem erros de rede)');
      results.passed++;
    } catch (e) {
      console.error('❌ Falha no teste de concorrência:', e);
      results.failed++;
    }

    // 4. Limpeza
    try {
      console.log('🧹 Limpando dados de teste...');
      const keys = await Store.getAllKeys();
      const testKeys = keys.filter(k => k.startsWith('load_test_') || k === 'concurrent_test_key');
      await Promise.all(testKeys.map(k => Store.removeItem(k)));
      console.log(`✅ ${testKeys.length} itens de teste removidos`);
      results.passed++;
    } catch (e) {
      console.error('❌ Falha na limpeza:', e);
      results.failed++;
    }

    console.log('📊 Resultados Finais:', results);
    console.groupEnd();
    return results;
  }

  // Expor globalmente
  window.runFullTests = runFullTests;

})();
