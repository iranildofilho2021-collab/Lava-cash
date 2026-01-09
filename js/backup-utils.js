/**
 * Utilitários para backup e restauração de dados do IRANCASH
 * Permite exportar e importar dados do IndexedDB (com fallback localStorage)
 */
(function(global) {
  'use strict';

  const BACKUP_KEYS = [
    'categorias',
    'despesas',
    'vendasResumo',
    'vendasResumoDia',
    'vendasResumoDia_chunks',
    'importConfig',
    'mappingCartao',
    'mappingPix',
    'irancash_theme',
    'investimentoInicial'
  ];

  /**
   * Coleta todos os dados relevantes do IndexedDB e localStorage
   */
  async function collectData() {
    const data = {
      version: '2.0',
      storageType: 'IndexedDB',
      exportedAt: new Date().toISOString(),
      appName: 'IRANCASH',
      data: {}
    };

    // Tenta coletar do IndexedDB primeiro
    if (global.IndexedDBStore) {
      try {
        const allData = await global.IndexedDBStore.getAll();
        Object.assign(data.data, allData);
        console.log('[Backup] Dados coletados do IndexedDB');
      } catch (err) {
        console.warn('[Backup] Fallback para localStorage:', err);
      }
    }

    // Coleta também do localStorage (fallback/complemento)
    BACKUP_KEYS.forEach(key => {
      if (data.data[key]) return; // Já coletado do IndexedDB
      try {
        const value = localStorage.getItem(key);
        if (value !== null) {
          data.data[key] = JSON.parse(value);
        }
      } catch (e) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          data.data[key] = value;
        }
      }
    });

    // Coleta chunks de vendasResumoDia do localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('vendasResumoDia_chunk') && !data.data[key]) {
        try {
          data.data[key] = JSON.parse(localStorage.getItem(key));
        } catch (e) {
          data.data[key] = localStorage.getItem(key);
        }
      }
    }

    return data;
  }

  /**
   * Exporta dados para arquivo JSON (async)
   */
  async function exportBackup() {
    try {
      const data = await collectData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const date = new Date().toISOString().slice(0, 10);
      const filename = `irancash-backup-${date}.json`;
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Backup exportado com sucesso!', 'success');
      return true;
    } catch (error) {
      console.error('[Backup] Erro ao exportar:', error);
      showToast('Erro ao exportar backup', 'error');
      return false;
    }
  }

  /**
   * Importa dados de um arquivo JSON para IndexedDB
   */
  function importBackup(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('Nenhum arquivo selecionado'));
        return;
      }

      const reader = new FileReader();
      
      reader.onload = async function(e) {
        try {
          const data = JSON.parse(e.target.result);
          
          if (!data.appName || data.appName !== 'IRANCASH') {
            throw new Error('Arquivo de backup inválido');
          }

          // Confirma antes de sobrescrever
          const confirmed = confirm(
            `Restaurar backup de ${new Date(data.exportedAt).toLocaleDateString('pt-BR')}?\n\n` +
            `Versão: ${data.version || '1.0'}\n` +
            'ATENÇÃO: Isso substituirá todos os dados atuais!'
          );

          if (!confirmed) {
            resolve(false);
            return;
          }

          // Restaura os dados no IndexedDB e localStorage
          for (const key of Object.keys(data.data)) {
            const value = data.data[key];
            
            // Salva no IndexedDB
            if (global.IndexedDBStore) {
              try {
                await global.IndexedDBStore.setItem(key, value);
              } catch (err) {
                console.warn('[Backup] Erro ao salvar no IndexedDB:', key, err);
              }
            }
            
            // Salva também no localStorage (backup)
            try {
              if (typeof value === 'object') {
                localStorage.setItem(key, JSON.stringify(value));
              } else {
                localStorage.setItem(key, value);
              }
            } catch (err) {
              console.warn('[Backup] Erro ao salvar no localStorage:', key, err);
            }
          }

          showToast('Backup restaurado com sucesso! Recarregando...', 'success');
          
          setTimeout(() => {
            window.location.reload();
          }, 1500);

          resolve(true);
        } catch (error) {
          console.error('[Backup] Erro ao importar:', error);
          showToast('Erro ao importar backup: ' + error.message, 'error');
          reject(error);
        }
      };

      reader.onerror = function() {
        reject(new Error('Erro ao ler arquivo'));
      };

      reader.readAsText(file);
    });
  }

  /**
   * Limpa todos os dados do aplicativo (IndexedDB e localStorage)
   */
  async function clearAllData() {
    const confirmed = confirm(
      'TEM CERTEZA que deseja apagar TODOS os dados?\n\n' +
      'Esta ação NÃO pode ser desfeita!\n\n' +
      'Recomendamos fazer um backup antes.'
    );

    if (!confirmed) return false;

    const doubleConfirm = confirm('Confirme novamente: APAGAR TODOS OS DADOS?');
    
    if (!doubleConfirm) return false;

    try {
      // Limpa IndexedDB
      if (global.IndexedDBStore) {
        await global.IndexedDBStore.clear();
      }
      
      // Limpa localStorage
      BACKUP_KEYS.forEach(key => localStorage.removeItem(key));
      
      // Remove chunks
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('vendasResumoDia_chunk')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));

      showToast('Dados apagados. Recarregando...', 'success');
      setTimeout(() => window.location.reload(), 1500);
      return true;
    } catch (error) {
      console.error('[Backup] Erro ao limpar dados:', error);
      showToast('Erro ao limpar dados', 'error');
      return false;
    }
  }

  /**
   * Mostra toast de notificação
   */
  function showToast(message, type = 'success') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Calcula uso do armazenamento (IndexedDB + localStorage)
   */
  async function getStorageUsage() {
    // Tenta usar IndexedDB primeiro
    if (global.IndexedDBStore) {
      try {
        return await global.IndexedDBStore.getStorageUsage();
      } catch (err) {
        console.warn('[Backup] Fallback para cálculo localStorage:', err);
      }
    }
    
    // Fallback: calcula do localStorage
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      total += (key.length + value.length) * 2; // UTF-16
    }
    return {
      used: total,
      usedMB: (total / (1024 * 1024)).toFixed(2),
      quota: 50 * 1024 * 1024, // ~50MB com IndexedDB
      quotaMB: '50.00',
      percentage: ((total / (50 * 1024 * 1024)) * 100).toFixed(1)
    };
  }

  // Expõe API global
  global.BackupUtils = {
    export: exportBackup,
    import: importBackup,
    clear: clearAllData,
    getStorageUsage: getStorageUsage
  };

  // Auto-inicialização: conecta o botão de backup e mostra uso de storage
  async function initBackupButton() {
    const backupBtn = document.querySelector('[data-backup-export]');
    if (backupBtn) {
      backupBtn.addEventListener('click', exportBackup);
    }

    // Mostra indicador de armazenamento
    const storageIndicator = document.getElementById('storageUsage');
    if (storageIndicator) {
      const usage = await getStorageUsage();
      const barFill = storageIndicator.querySelector('.bar-fill');
      const percentLabel = storageIndicator.querySelector('[data-storage-percent]');
      
      if (barFill && percentLabel) {
        barFill.style.width = usage.percentage + '%';
        percentLabel.textContent = usage.percentage + '% de ' + usage.quotaMB + 'MB';
        
        // Muda cor baseado no uso
        if (parseFloat(usage.percentage) > 80) {
          barFill.classList.add('danger');
        } else if (parseFloat(usage.percentage) > 50) {
          barFill.classList.add('warning');
        }
        
        storageIndicator.classList.remove('hidden');
      }
    }
  }

  // Inicializa quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBackupButton);
  } else {
    initBackupButton();
  }

})(window);
