/**
 * Logica da Pagina de Login (Atualizado para AuthService)
 * Gerencia validacao, feedback visual e integracao com autenticacao
 */

// Removendo imports diretos do Firebase para usar o AuthService
// import { auth } from './firebase-init.js';
// import { signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const btnLogin = document.getElementById('btn-login');
  const spinner = document.getElementById('spinner');
  const btnGoogle = document.getElementById('btn-google-login');
  const spinnerGoogle = document.getElementById('spinner-google');
  const btnTogglePassword = document.getElementById('btn-toggle-password');
  
  // Toggle Password Visibility
  if (btnTogglePassword) {
    btnTogglePassword.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      
      // Toggle icons
      document.getElementById('icon-eye').classList.toggle('hidden');
      document.getElementById('icon-eye-off').classList.toggle('hidden');
    });
  }

  // Form Submission
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Reset errors
      hideError('email');
      hideError('password');
      
      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();
      let isValid = true;
      
      // Validacao especial para "Teste"
      const isDevLogin = (email === 'Teste');
      
      // Basic Validation (se nao for o login especial "Teste")
      if (!isDevLogin && (!email || !isValidEmail(email))) {
        showError('email', 'Por favor, insira um e-mail valido.');
        isValid = false;
      }
      
      if (!password) {
        showError('password', 'A senha e obrigatoria.');
        isValid = false;
      }
      
      if (!isValid) return;
      
      // Start Loading
      setLoading(true);
      
      try {
        // Simular delay de rede
        await new Promise(r => setTimeout(r, 800));

        // Usar AuthService
        if (typeof AuthService !== 'undefined') {
            const result = await AuthService.login(email, password);
            
            if (result.success) {
                window.location.href = 'index.html';
            } else {
                showError('password', result.message || 'Credenciais invalidas.');
                setLoading(false);
            }
        } else {
            console.error('AuthService nao carregado!');
            showError('email', 'Erro interno: Servico de autenticacao indisponivel.');
            setLoading(false);
        }
        
      } catch (error) {
        console.error('Login error:', error);
        showError('password', 'Ocorreu um erro ao tentar entrar. Tente novamente.');
        setLoading(false);
      }
    });
  }

  if (btnGoogle) {
    btnGoogle.addEventListener('click', async () => {
      hideError('email');
      hideError('password');

      setGoogleLoading(true);

      try {
        if (typeof AuthService !== 'undefined' && typeof AuthService.loginWithGoogle === 'function') {
          const result = await AuthService.loginWithGoogle();
          if (result.success) {
            window.location.href = 'index.html';
            return;
          }
          showError('email', result.message || 'Falha ao entrar com Google.');
        } else {
          showError('email', 'Login com Google indisponivel.');
        }
      } catch (error) {
        console.error('Google login error:', error);
        showError('email', 'Erro ao entrar com Google.');
      }

      setGoogleLoading(false);
    });
  }
  
  // Helpers
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
  
  function showError(fieldId, message) {
    const errorEl = document.getElementById(`error-${fieldId}`);
    const inputEl = document.getElementById(fieldId);
    
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
    
    if (inputEl) {
      inputEl.classList.add('border-red-500', 'focus:ring-red-200');
      inputEl.classList.remove('border-gray-200', 'focus:ring-sky-500/20');
    }
  }
  
  function hideError(fieldId) {
    const errorEl = document.getElementById(`error-${fieldId}`);
    const inputEl = document.getElementById(fieldId);
    
    if (errorEl) {
      errorEl.classList.add('hidden');
    }
    
    if (inputEl) {
      inputEl.classList.remove('border-red-500', 'focus:ring-red-200');
      inputEl.classList.add('border-gray-200', 'focus:ring-sky-500/20');
    }
  }
  
  function setLoading(isLoading) {
    if (isLoading) {
      btnLogin.disabled = true;
      btnLogin.querySelector('span').textContent = 'Entrando...';
      spinner.classList.remove('hidden');
    } else {
      btnLogin.disabled = false;
      btnLogin.querySelector('span').textContent = 'Entrar';
      spinner.classList.add('hidden');
    }

    if (btnGoogle) {
      btnGoogle.disabled = isLoading;
      btnGoogle.classList.toggle('opacity-70', isLoading);
    }
  }

  function setGoogleLoading(isLoading) {
    if (btnGoogle) {
      btnGoogle.disabled = isLoading;
      btnGoogle.classList.toggle('opacity-70', isLoading);
    }

    if (spinnerGoogle) {
      spinnerGoogle.classList.toggle('hidden', !isLoading);
    }

    if (btnLogin) {
      btnLogin.disabled = isLoading;
    }
  }
});
