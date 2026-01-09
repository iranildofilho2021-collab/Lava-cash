/**
 * Utilitários de Segurança para IRANCASH
 * Proteção de dados, validação e sanitização
 * @module SecurityUtils
 */
(function(global) {
  'use strict';

  // ========== CONSTANTES ==========
  const MAX_STORAGE_SIZE = 4.5 * 1024 * 1024; // 4.5MB limite seguro
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutos
  const RATE_LIMIT_WINDOW = 1000; // 1 segundo
  const RATE_LIMIT_MAX = 10; // máximo de operações por janela

  // Estado interno
  let lastActivityTime = Date.now();
  const rateLimitMap = new Map();

  // ========== SANITIZAÇÃO ==========

  /**
   * Escapa HTML para prevenir XSS
   */
  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
      '/': '&#x2F;'
    };
    return str.replace(/[&<>"'/]/g, s => map[s]);
  }

  /**
   * Sanitiza objeto recursivamente
   */
  function sanitizeObject(obj) {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/javascript:/gi, '')
                .replace(/on\w+=/gi, '');
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeObject(item));
    }
    
    if (typeof obj === 'object') {
      const sanitized = {};
      for (const key of Object.keys(obj)) {
        const sanitizedKey = escapeHtml(key);
        sanitized[sanitizedKey] = sanitizeObject(obj[key]);
      }
      return sanitized;
    }
    
    return obj;
  }

  /**
   * Valida JSON antes de parse
   */
  function safeJsonParse(str, defaultValue = null) {
    if (typeof str !== 'string') return defaultValue;
    try {
      const parsed = JSON.parse(str);
      return sanitizeObject(parsed);
    } catch (e) {
      console.warn('[Security] JSON parse failed:', e.message);
      return defaultValue;
    }
  }

  // ========== PROTEÇÃO DE STORAGE ==========

  /**
   * Verifica espaço disponível no localStorage
   */
  function checkStorageSpace() {
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        total += (key.length + value.length) * 2;
      }
      return {
        used: total,
        available: MAX_STORAGE_SIZE - total,
        percentage: (total / MAX_STORAGE_SIZE * 100).toFixed(1)
      };
    } catch (e) {
      console.error('[Security] Storage check failed:', e);
      return { used: 0, available: 0, percentage: 0 };
    }
  }

  /**
   * Salva dados com verificação de espaço
   */
  function secureSetItem(key, value) {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      const size = (key.length + stringValue.length) * 2;
      const space = checkStorageSpace();
      
      if (size > space.available) {
        console.warn('[Security] Storage limit would be exceeded');
        return false;
      }
      
      localStorage.setItem(key, stringValue);
      return true;
    } catch (e) {
      console.error('[Security] Failed to save:', e);
      return false;
    }
  }

  /**
   * Recupera dados com sanitização
   */
  function secureGetItem(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key);
      if (value === null) return defaultValue;
      return safeJsonParse(value, defaultValue);
    } catch (e) {
      console.error('[Security] Failed to retrieve:', e);
      return defaultValue;
    }
  }

  // ========== RATE LIMITING ==========

  /**
   * Verifica rate limit para uma ação
   */
  function checkRateLimit(action) {
    const now = Date.now();
    const key = action || 'default';
    
    if (!rateLimitMap.has(key)) {
      rateLimitMap.set(key, { count: 1, windowStart: now });
      return true;
    }
    
    const limit = rateLimitMap.get(key);
    
    if (now - limit.windowStart > RATE_LIMIT_WINDOW) {
      limit.count = 1;
      limit.windowStart = now;
      return true;
    }
    
    if (limit.count >= RATE_LIMIT_MAX) {
      console.warn(`[Security] Rate limit exceeded for action: ${key}`);
      return false;
    }
    
    limit.count++;
    return true;
  }

  // ========== GERENCIAMENTO DE SESSÃO ==========

  /**
   * Atualiza timestamp de atividade
   */
  function updateActivity() {
    lastActivityTime = Date.now();
  }

  /**
   * Verifica se sessão expirou
   */
  function isSessionExpired() {
    return Date.now() - lastActivityTime > SESSION_TIMEOUT;
  }

  /**
   * Monitora atividade do usuário
   */
  function setupActivityMonitor() {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });
    
    // Verifica periodicamente se sessão expirou
    setInterval(() => {
      if (isSessionExpired()) {
        console.warn('[Security] Session timeout - consider implementing auto-logout');
      }
    }, 60000); // Verifica a cada minuto
  }

  // ========== VALIDAÇÃO DE ENTRADA ==========

  /**
   * Valida entrada numérica
   */
  function isValidNumber(value, options = {}) {
    const { min = -Infinity, max = Infinity, allowNegative = true } = options;
    const num = parseFloat(value);
    
    if (isNaN(num)) return false;
    if (!allowNegative && num < 0) return false;
    if (num < min || num > max) return false;
    
    return true;
  }

  /**
   * Valida data
   */
  function isValidDate(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  }

  /**
   * Valida se é uma chave de localStorage segura
   */
  function isValidStorageKey(key) {
    if (typeof key !== 'string') return false;
    if (key.length === 0 || key.length > 100) return false;
    // Permite apenas caracteres alfanuméricos, underline e hífen
    return /^[a-zA-Z0-9_-]+$/.test(key);
  }

  // ========== CSP E INTEGRIDADE ==========

  /**
   * Verifica integridade dos dados armazenados
   */
  function verifyDataIntegrity() {
    const issues = [];
    const keys = ['despesas', 'categorias', 'vendasResumo'];
    
    keys.forEach(key => {
      try {
        const data = localStorage.getItem(key);
        if (data) {
          JSON.parse(data);
        }
      } catch (e) {
        issues.push({ key, error: 'Dados corrompidos' });
      }
    });
    
    return {
      valid: issues.length === 0,
      issues
    };
  }

  // ========== INICIALIZAÇÃO ==========

  /**
   * Inicializa módulo de segurança
   */
  function init() {
    setupActivityMonitor();
    
    // Verifica integridade na inicialização
    const integrity = verifyDataIntegrity();
    if (!integrity.valid) {
      console.warn('[Security] Data integrity issues found:', integrity.issues);
    }
    
    console.log('[Security] Module initialized');
  }

  // Inicializa quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exporta API
  global.SecurityUtils = {
    // Sanitização
    escapeHtml,
    sanitizeObject,
    safeJsonParse,
    // Storage
    checkStorageSpace,
    secureSetItem,
    secureGetItem,
    // Rate Limiting
    checkRateLimit,
    // Sessão
    updateActivity,
    isSessionExpired,
    // Validação
    isValidNumber,
    isValidDate,
    isValidStorageKey,
    // Integridade
    verifyDataIntegrity
  };

})(window);
