/**
 * LAVACASH — modo de proprietário único.
 *
 * Os nomes de papéis antigos continuam sendo entendidos apenas para manter a
 * compatibilidade com os dados já gravados. A autorização efetiva possui uma
 * única regra: somente a conta proprietária pode iniciar e manter uma sessão.
 */
(function (global) {
  'use strict';

  const OWNER_EMAIL = 'iranildofilho2021@gmail.com';
  const OWNER_UID = 'hLS4UEKfG0UcWEXjZYQEq5Ob9cU2';
  const DENIED_MESSAGE = 'Este sistema é de uso exclusivo do proprietário.';

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isOwnerEmail(value) {
    return normalizeEmail(value) === OWNER_EMAIL;
  }

  function isOwnerUser(user) {
    if (!user || typeof user !== 'object') return false;
    const uid = String(user.uid || user.localId || '').trim();
    return isOwnerEmail(user.email) || uid === OWNER_UID;
  }

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (error) {
      return null;
    }
  }

  function clearUnauthorizedLocalSessions() {
    ['currentUser', 'irancash_session'].forEach(key => {
      const value = readJson(key);
      if (value && !isOwnerUser(value)) localStorage.removeItem(key);
    });
  }

  function ownerView(user) {
    if (!isOwnerUser(user)) return null;
    return Object.assign({}, user, {
      tipoAcesso: 'desenvolvedor',
      role: 'developer',
      lavanderias: ['all'],
      aprovado: true,
      active: true
    });
  }

  function patchUserSystem() {
    const system = global.UserSystem;
    if (!system || system.__ownerOnlyMode) return;

    const originalGetCurrentUser = system.getCurrentUser.bind(system);
    const originalLogin = typeof system.login === 'function' ? system.login.bind(system) : null;

    system.ROLE_LABELS = Object.assign({}, system.ROLE_LABELS, {
      desenvolvedor: 'Proprietário',
      developer: 'Proprietário',
      admin: 'Proprietário',
      gerente: 'Proprietário',
      cadastrador: 'Proprietário',
      visualizador: 'Proprietário',
      proprietario: 'Proprietário'
    });

    system.getCurrentUser = function () {
      const user = originalGetCurrentUser();
      if (!user) return null;
      if (!isOwnerUser(user)) {
        clearUnauthorizedLocalSessions();
        return null;
      }
      return ownerView(user);
    };

    if (originalLogin) {
      system.login = function (email, password) {
        if (!isOwnerEmail(email)) throw new Error(DENIED_MESSAGE);
        return ownerView(originalLogin(email, password));
      };
    }

    system.isDeveloper = function () { return Boolean(this.getCurrentUser()); };
    system.hasPermission = function () { return Boolean(this.getCurrentUser()); };
    system.canEdit = function () { return Boolean(this.getCurrentUser()); };
    system.verificarPermissao = function () { return Boolean(this.getCurrentUser()); };
    system.getMinhasLavanderias = function () {
      return this.getCurrentUser() ? this.getLavanderias() : [];
    };
    system.getLavanderiasPermitidas = function () {
      return this.getCurrentUser() ? this.getLavanderias().map(item => item.id) : [];
    };
    system.temAcessoLavanderia = function (lavanderiaId) {
      return Boolean(this.getCurrentUser() && lavanderiaId);
    };
    system.podeGerenciarLavanderia = function (lavanderiaId) {
      return Boolean(this.getCurrentUser() && lavanderiaId);
    };
    system.filtrarPorLavanderiaPermitida = function (dados) {
      return this.getCurrentUser() && Array.isArray(dados) ? dados : [];
    };

    system.getCadastrosPendentes = function () { return []; };
    system.solicitarCadastro = function () { throw new Error(DENIED_MESSAGE); };
    system.aprovarCadastro = function () { return { success: false, message: DENIED_MESSAGE }; };
    system.rejeitarCadastro = function () { return { success: false, message: DENIED_MESSAGE }; };
    system.criarUsuario = function () { return { success: false, message: DENIED_MESSAGE }; };
    system.atualizarUsuario = function () { return { success: false, message: DENIED_MESSAGE }; };
    system.removerUsuario = function () { return { success: false, message: DENIED_MESSAGE }; };
    system.getUsuarios = function () {
      const owner = this.getCurrentUser();
      return owner ? [owner] : [];
    };

    system.__ownerOnlyMode = true;
  }

  function patchAuthService() {
    const auth = global.AuthService;
    if (!auth || auth.__ownerOnlyMode) return;

    const originalLogin = auth.login.bind(auth);
    const originalGoogleLogin = auth.loginWithGoogle.bind(auth);
    const originalResetPassword = auth.resetPassword.bind(auth);
    const originalGetCurrentUser = auth.getCurrentUser.bind(auth);
    const originalLogout = auth.logout.bind(auth);

    auth.login = async function (email, password) {
      if (!isOwnerEmail(email)) return { success: false, message: DENIED_MESSAGE };
      const result = await originalLogin(email, password);
      if (result && result.success && !isOwnerUser(result.user)) {
        await originalLogout();
        return { success: false, message: DENIED_MESSAGE };
      }
      if (result && result.user) result.user = ownerView(result.user);
      return result;
    };

    auth.loginWithGoogle = async function () {
      const result = await originalGoogleLogin();
      if (result && result.success && !isOwnerUser(result.user)) {
        await originalLogout();
        return { success: false, message: DENIED_MESSAGE };
      }
      if (result && result.user) result.user = ownerView(result.user);
      return result;
    };

    auth.resetPassword = function (email) {
      if (!isOwnerEmail(email)) return Promise.resolve({ success: false, message: DENIED_MESSAGE });
      return originalResetPassword(email);
    };

    auth.signup = function () { return Promise.resolve({ success: false, message: DENIED_MESSAGE }); };
    auth.requestAccessWithGoogle = function () { return Promise.resolve({ success: false, message: DENIED_MESSAGE }); };
    auth.register = function () { return Promise.resolve({ success: false, message: DENIED_MESSAGE }); };
    auth.provisionLegacyUserForCloud = function () { return Promise.resolve({ success: false, message: DENIED_MESSAGE }); };

    auth.getCurrentUser = function () {
      const user = originalGetCurrentUser();
      if (!user || !isOwnerUser(user)) return null;
      return ownerView(user);
    };
    auth.isAuthenticated = function () { return Boolean(auth.getCurrentUser()); };
    auth.hasPermission = function () { return Boolean(auth.getCurrentUser()); };
    auth.canAccessPage = function () { return Boolean(auth.getCurrentUser()); };
    auth.getAllUsers = function () {
      const owner = auth.getCurrentUser();
      return owner ? [owner] : [];
    };
    auth.toggleUserStatus = function () { return false; };
    auth.deleteUser = function () { return false; };
    auth.updateUserRole = function () { return false; };
    auth.__ownerOnlyMode = true;
  }

  function apply() {
    clearUnauthorizedLocalSessions();
    patchUserSystem();
    patchAuthService();
  }

  global.LavaCashOwnerMode = Object.freeze({
    email: OWNER_EMAIL,
    uid: OWNER_UID,
    isOwnerEmail,
    isOwnerUser,
    apply
  });

  global.addEventListener('firebase:auth-user', event => {
    if (isOwnerUser(event && event.detail)) return;
    clearUnauthorizedLocalSessions();
    const service = global.AuthService;
    if (service && typeof service.logout === 'function') {
      Promise.resolve(service.logout()).catch(function () {});
    }
  });

  apply();
})(window);
