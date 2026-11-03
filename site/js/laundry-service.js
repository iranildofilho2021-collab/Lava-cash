/**
 * LaundryService - Serviço de Lavanderias Multi-Tenant
 * Gerencia a lavanderia selecionada e prefixa chaves de dados
 *
 * IMPORTANTE: Os dados são separados por lavanderia no Firebase
 * Exemplo: lav1_receitas, lav2_receitas, etc.
 */

const LaundryService = {
  // Chave para armazenar lavanderia selecionada
  STORAGE_KEY: 'lavanderiaSelecionada',

  /**
   * Obtém o ID da lavanderia atualmente selecionada
   * @returns {string|null}
   */
  getCurrentLaundryId() {
    // Primeiro tenta do UserSystem
    if (window.UserSystem) {
      const lavanderia = window.UserSystem.getLavanderiaSelecionada();
      if (lavanderia && lavanderia.id) {
        return lavanderia.id;
      }
    }

    // Fallback para localStorage
    return localStorage.getItem(this.STORAGE_KEY) || null;
  },

  /**
   * Obtém a lavanderia selecionada completa
   * @returns {Object|null}
   */
  getCurrentLaundry() {
    if (window.UserSystem) {
      return window.UserSystem.getLavanderiaSelecionada();
    }
    return null;
  },

  /**
   * Define a lavanderia atual
   * @param {string} laundryId
   */
  setCurrentLaundry(laundryId) {
    localStorage.setItem(this.STORAGE_KEY, laundryId);

    if (window.UserSystem) {
      window.UserSystem.selecionarLavanderia(laundryId);
    }

    // Dispara evento para atualizar a UI
    window.dispatchEvent(new CustomEvent('laundry:changed', {
      detail: { laundryId }
    }));
  },

  /**
   * Obtém todas as lavanderias do usuário atual
   * @returns {Array}
   */
  getUserLaundries() {
    if (window.UserSystem) {
      return window.UserSystem.getMinhasLavanderias();
    }
    return [];
  },

  /**
   * Obtém o prefixo de dados para a lavanderia atual
   * Usado para separar dados no Firebase/localStorage
   * @returns {string}
   */
  getDataPrefix() {
    const laundryId = this.getCurrentLaundryId();
    return laundryId ? `${laundryId}_` : '';
  },

  /**
   * Obtém a chave com prefixo da lavanderia
   * @param {string} key - Chave original (ex: 'receitas')
   * @returns {string} - Chave com prefixo (ex: 'lav1_receitas')
   */
  getLaundryKey(key) {
    const prefix = this.getDataPrefix();
    return prefix + key;
  },

  /**
   * Remove o prefixo da lavanderia de uma chave
   * @param {string} key - Chave com prefixo
   * @returns {string} - Chave original
   */
  stripLaundryPrefix(key) {
    const prefix = this.getDataPrefix();
    if (prefix && key.startsWith(prefix)) {
      return key.substring(prefix.length);
    }
    return key;
  },

  /**
   * Verifica se uma chave pertence à lavanderia atual
   * @param {string} key
   * @returns {boolean}
   */
  isCurrentLaundryKey(key) {
    const prefix = this.getDataPrefix();
    return prefix ? key.startsWith(prefix) : true;
  },

  /**
   * Obtém todas as chaves de dados de uma lavanderia específica
   * @param {string} laundryId
   * @param {string} dataKey - Tipo de dado (ex: 'receitas', 'despesas')
   * @returns {string}
   */
  getKeyForLaundry(laundryId, dataKey) {
    return `${laundryId}_${dataKey}`;
  }
};

// Exportar para uso global
window.LaundryService = LaundryService;

// Log de inicialização
console.log('[LaundryService] Serviço de lavanderias inicializado');
