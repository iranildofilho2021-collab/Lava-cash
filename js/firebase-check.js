/**
 * Utilitário para verificar se os dados estão sendo salvos no Firebase
 * Execute no console do navegador para verificar o status
 */
(function(global) {
  'use strict';

  /**
   * Verifica onde os dados estão sendo salvos
   */
  async function verificarOndeDadosSalvos() {
    console.log('=== VERIFICAÇÃO DE ONDE OS DADOS ESTÃO SENDO SALVOS ===\n');
    
    // Verifica Firebase
    console.log('📡 FIREBASE:');
    if (global.FirebaseStore && global.FirebaseStore.isAvailable) {
      try {
        const isAvailable = await global.FirebaseStore.isAvailable();
        console.log('  ✅ Firebase está disponível:', isAvailable);
        
        if (isAvailable) {
          // Verifica vendasResumo
          const vendasResumo = await global.FirebaseStore.getItem('vendasResumo');
          console.log('  📊 vendasResumo no Firebase:', vendasResumo ? `${vendasResumo.length} registros` : 'vazio');
          
          // Verifica vendasResumoDia
          const vendasResumoDia = await global.FirebaseStore.getItem('vendasResumoDia');
          if (vendasResumoDia && vendasResumoDia.data) {
            console.log('  📅 vendasResumoDia no Firebase:', `${vendasResumoDia.data.length} registros`);
          } else {
            console.log('  📅 vendasResumoDia no Firebase: vazio');
          }
          
          // Verifica despesas
          const despesas = await global.FirebaseStore.getItem('despesas');
          console.log('  💰 despesas no Firebase:', despesas ? `${despesas.length} registros` : 'vazio');
          
          // Verifica categorias
          const categorias = await global.FirebaseStore.getItem('categorias');
          console.log('  🏷️ categorias no Firebase:', categorias ? `${categorias.length} itens` : 'vazio');
        }
      } catch (err) {
        console.error('  ❌ Erro ao verificar Firebase:', err);
      }
    } else {
      console.log('  ❌ FirebaseStore não está disponível');
    }
    
    console.log('\n💾 LOCALSTORAGE:');
    try {
      const vendasResumoLocal = localStorage.getItem('vendasResumo');
      const vendasResumoParsed = vendasResumoLocal ? JSON.parse(vendasResumoLocal) : null;
      console.log('  📊 vendasResumo no localStorage:', vendasResumoParsed ? `${vendasResumoParsed.length} registros` : 'vazio');
      
      const vendasResumoDiaLocal = localStorage.getItem('vendasResumoDia');
      const vendasResumoDiaParsed = vendasResumoDiaLocal ? JSON.parse(vendasResumoDiaLocal) : null;
      console.log('  📅 vendasResumoDia no localStorage:', vendasResumoDiaParsed ? `${vendasResumoDiaParsed.length} registros` : 'vazio');
      
      const despesasLocal = localStorage.getItem('despesas');
      const despesasParsed = despesasLocal ? JSON.parse(despesasLocal) : null;
      console.log('  💰 despesas no localStorage:', despesasParsed ? `${despesasParsed.length} registros` : 'vazio');
    } catch (err) {
      console.error('  ❌ Erro ao verificar localStorage:', err);
    }
    
    console.log('\n🗄️ INDEXEDDB:');
    if (global.IndexedDBStore && global.IndexedDBStore.getItem) {
      try {
        const vendasResumoIDB = await global.IndexedDBStore.getItem('vendasResumo');
        console.log('  📊 vendasResumo no IndexedDB:', vendasResumoIDB ? `${vendasResumoIDB.length} registros` : 'vazio');
        
        const vendasResumoDiaIDB = await global.IndexedDBStore.getItem('vendasResumoDia');
        if (vendasResumoDiaIDB && vendasResumoDiaIDB.data) {
          console.log('  📅 vendasResumoDia no IndexedDB:', `${vendasResumoDiaIDB.data.length} registros`);
        } else {
          console.log('  📅 vendasResumoDia no IndexedDB: vazio');
        }
      } catch (err) {
        console.error('  ❌ Erro ao verificar IndexedDB:', err);
      }
    } else {
      console.log('  ❌ IndexedDBStore não está disponível');
    }
    
    console.log('\n=== FIM DA VERIFICAÇÃO ===');
    console.log('\n💡 DICA: Para migrar dados locais para Firebase, execute:');
    console.log('   window.FirebaseStore.migrateFromLocalStorage()');
  }

  /**
   * Força migração de dados locais para Firebase
   */
  async function migrarParaFirebase() {
    console.log('🔄 Iniciando migração para Firebase...');
    if (global.FirebaseStore && global.FirebaseStore.migrateFromLocalStorage) {
      try {
        const result = await global.FirebaseStore.migrateFromLocalStorage();
        console.log('✅ Migração concluída:', result);
        console.log('   - Itens migrados:', result.migrated);
        console.log('   - Erros:', result.errors);
      } catch (err) {
        console.error('❌ Erro na migração:', err);
      }
    } else {
      console.error('❌ FirebaseStore não está disponível');
    }
  }

  // Expõe funções globalmente
  global.verificarDadosFirebase = verificarOndeDadosSalvos;
  global.migrarParaFirebase = migrarParaFirebase;

  console.log('✅ Utilitários Firebase carregados!');
  console.log('📝 Use no console:');
  console.log('   - verificarDadosFirebase() - Verifica onde os dados estão salvos');
  console.log('   - migrarParaFirebase() - Migra dados locais para Firebase');

})(window);
