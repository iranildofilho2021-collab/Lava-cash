/**
 * Utilitários de validação e feedback visual para formulários
 * Inclui sanitização de dados para segurança
 * @module ValidationUtils
 */
(function(global) {
  'use strict';

  // ========== SANITIZAÇÃO (SEGURANÇA) ==========

  /**
   * Escapa caracteres HTML para prevenir XSS
   * @param {string} str - String a escapar
   * @returns {string} String escapada
   */
  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    };
    return str.replace(/[&<>"'`=/]/g, s => map[s]);
  }

  /**
   * Sanitiza string removendo tags HTML
   * @param {string} str - String a sanitizar
   * @returns {string} String sem tags HTML
   */
  function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/<[^>]*>/g, '').trim();
  }

  /**
   * Sanitiza número
   * @param {any} value - Valor a sanitizar
   * @param {number} defaultValue - Valor padrão se inválido
   * @returns {number} Número sanitizado
   */
  function sanitizeNumber(value, defaultValue = 0) {
    const num = parseFloat(String(value).replace(',', '.'));
    return isNaN(num) ? defaultValue : num;
  }

  /**
   * Valida e sanitiza entrada de moeda brasileira
   * @param {string} value - Valor em formato brasileiro
   * @returns {number} Valor numérico
   */
  function sanitizeCurrency(value) {
    if (typeof value !== 'string') return 0;
    // Remove R$, espaços, e converte formato brasileiro
    const cleaned = value
      .replace(/R\$\s*/gi, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .trim();
    return sanitizeNumber(cleaned, 0);
  }

  // ========== VALIDAÇÃO DE CAMPOS ==========

  /**
   * Mostra mensagem de erro em um campo
   * @param {HTMLElement} field - Campo de formulário
   * @param {string} message - Mensagem de erro
   */
  function showFieldError(field, message) {
    if (!field) return;
    
    removeFieldError(field);
    
    field.classList.add('input-error');
    field.classList.remove('input-valid');
    field.setAttribute('aria-invalid', 'true');
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.id = `${field.id || 'field'}-error-${Date.now()}`;
    errorDiv.textContent = message;
    errorDiv.setAttribute('role', 'alert');
    errorDiv.setAttribute('aria-live', 'polite');
    
    field.setAttribute('aria-describedby', errorDiv.id);
    field.parentNode.insertBefore(errorDiv, field.nextSibling);
    
    field.focus();
  }

  /**
   * Remove erro de um campo
   * @param {HTMLElement} field - Campo de formulário
   */
  function removeFieldError(field) {
    if (!field) return;
    
    field.classList.remove('input-error', 'input-valid');
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
    
    const parent = field.parentNode;
    if (parent) {
      const errorDivs = parent.querySelectorAll('.error-message');
      errorDivs.forEach(div => div.remove());
    }
  }

  /**
   * Marca campo como válido
   * @param {HTMLElement} field - Campo de formulário
   */
  function markFieldValid(field) {
    if (!field) return;
    removeFieldError(field);
    field.classList.add('input-valid');
    field.setAttribute('aria-invalid', 'false');
  }

  /**
   * Valida campo obrigatório
   * @param {HTMLElement} field - Campo de formulário
   * @param {string} fieldName - Nome do campo para mensagem
   * @returns {boolean} Se é válido
   */
  function validateRequired(field, fieldName) {
    const value = field.value ? sanitizeString(field.value) : '';
    if (!value) {
      showFieldError(field, `${escapeHtml(fieldName)} é obrigatório`);
      return false;
    }
    markFieldValid(field);
    return true;
  }

  /**
   * Valida número positivo
   * @param {HTMLElement} field - Campo de formulário
   * @param {string} fieldName - Nome do campo para mensagem
   * @param {number} min - Valor mínimo (default: 0)
   * @returns {boolean} Se é válido
   */
  function validatePositiveNumber(field, fieldName, min = 0) {
    const value = sanitizeNumber(field.value);
    if (isNaN(value) || value < min) {
      const minText = min === 0 ? 'zero' : min.toString();
      showFieldError(field, `${escapeHtml(fieldName)} deve ser maior ou igual a ${minText}`);
      return false;
    }
    markFieldValid(field);
    return true;
  }

  /**
   * Valida email
   * @param {HTMLElement} field - Campo de formulário
   * @returns {boolean} Se é válido
   */
  function validateEmail(field) {
    const value = sanitizeString(field.value);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      showFieldError(field, 'Email inválido');
      return false;
    }
    markFieldValid(field);
    return true;
  }

  /**
   * Valida data
   * @param {HTMLElement} field - Campo de formulário
   * @param {string} fieldName - Nome do campo
   * @param {Object} options - Opções (minDate, maxDate)
   * @returns {boolean} Se é válido
   */
  function validateDate(field, fieldName, options = {}) {
    const value = field.value;
    if (!value) {
      showFieldError(field, `${escapeHtml(fieldName)} é obrigatório`);
      return false;
    }
    
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      showFieldError(field, `${escapeHtml(fieldName)} inválido`);
      return false;
    }

    if (options.minDate && date < new Date(options.minDate)) {
      showFieldError(field, `${escapeHtml(fieldName)} deve ser após ${options.minDate}`);
      return false;
    }

    if (options.maxDate && date > new Date(options.maxDate)) {
      showFieldError(field, `${escapeHtml(fieldName)} deve ser antes de ${options.maxDate}`);
      return false;
    }

    markFieldValid(field);
    return true;
  }

  /**
   * Valida arquivo
   * @param {HTMLInputElement} field - Campo de arquivo
   * @param {Object} options - Opções de validação
   * @returns {Object} Resultado da validação
   */
  function validateFile(field, options = {}) {
    const { 
      maxSizeMB = 10, 
      allowedTypes = [],
      required = false 
    } = options;

    if (!field.files || field.files.length === 0) {
      if (required) {
        showFieldError(field, 'Arquivo é obrigatório');
        return { valid: false };
      }
      return { valid: true };
    }
    
    const file = field.files[0];
    const maxBytes = maxSizeMB * 1024 * 1024;
    
    if (allowedTypes.length > 0) {
      const isValidType = allowedTypes.some(type => {
        if (type.includes('*')) {
          return file.type.startsWith(type.replace('*', ''));
        }
        return file.type === type;
      });
      
      if (!isValidType) {
        const typeNames = allowedTypes.map(t => t.split('/')[1] || t).join(', ');
        showFieldError(field, `Tipo não permitido. Use: ${typeNames}`);
        return { valid: false };
      }
    }
    
    if (file.size > maxBytes) {
      showFieldError(field, `Arquivo muito grande. Máximo: ${maxSizeMB} MB`);
      return { valid: false };
    }
    
    markFieldValid(field);
    return { valid: true, file };
  }

  /**
   * Limpa todos os erros de um formulário
   * @param {HTMLFormElement} form - Formulário
   */
  function clearFormErrors(form) {
    if (!form) return;
    
    const fields = form.querySelectorAll('.input-error, .input-valid');
    fields.forEach(field => {
      field.classList.remove('input-error', 'input-valid');
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
    });
    
    const errorMessages = form.querySelectorAll('.error-message');
    errorMessages.forEach(msg => msg.remove());
  }

  /**
   * Configura validação em tempo real para um campo
   * @param {HTMLElement} field - Campo de formulário
   * @param {Function} validationFn - Função de validação a executar
   * @param {string} eventName - Nome do evento (default: 'input')
   */
  function setupRealTimeValidation(field, validationFn, eventName = 'input') {
    if (!field || typeof validationFn !== 'function') return;
    
    field.addEventListener(eventName, () => {
      validationFn(field);
    });
    
    // Também valida no blur para garantir
    if (eventName !== 'blur') {
      field.addEventListener('blur', () => {
        validationFn(field);
      });
    }
  }

  /**
   * Valida formulário completo
   * @param {HTMLFormElement} form - Formulário
   * @param {Object} rules - Regras de validação por campo
   * @returns {boolean} Se o formulário é válido
   */
  function validateForm(form, rules) {
    if (!form || !rules) return false;
    
    clearFormErrors(form);
    let isValid = true;
    let firstInvalidField = null;
    
    Object.keys(rules).forEach(fieldId => {
      const field = form.querySelector(`#${fieldId}`);
      if (!field) return;
      
      const fieldRules = rules[fieldId];
      
      if (fieldRules.required && !validateRequired(field, fieldRules.label || fieldId)) {
        isValid = false;
        if (!firstInvalidField) firstInvalidField = field;
      }
      
      if (fieldRules.type === 'number' && field.value) {
        if (!validatePositiveNumber(field, fieldRules.label || fieldId, fieldRules.min || 0)) {
          isValid = false;
          if (!firstInvalidField) firstInvalidField = field;
        }
      }
      
      if (fieldRules.type === 'email' && field.value) {
        if (!validateEmail(field)) {
          isValid = false;
          if (!firstInvalidField) firstInvalidField = field;
        }
      }
    });
    
    if (firstInvalidField) {
      firstInvalidField.focus();
      firstInvalidField.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    return isValid;
  }

  // Exporta funções para uso global
  global.ValidationUtils = {
    // Sanitização
    escapeHtml,
    sanitizeString,
    sanitizeNumber,
    sanitizeCurrency,
    // Validação
    showFieldError,
    removeFieldError,
    markFieldValid,
    validateRequired,
    validatePositiveNumber,
    validateEmail,
    validateDate,
    validateFile,
    clearFormErrors,
    validateForm,
    setupRealTimeValidation
  };

  // Aliases para compatibilidade
  global.validateEmail = validateEmail;
  global.validateDate = validateDate;
  global.showFieldError = showFieldError;
  global.removeFieldError = removeFieldError;
  global.markFieldValid = markFieldValid;
  global.validateRequired = validateRequired;
  global.validatePositiveNumber = validatePositiveNumber;
  global.validateFile = validateFile;
  global.clearFormErrors = clearFormErrors;

})(window);
