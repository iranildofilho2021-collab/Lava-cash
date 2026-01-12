/**
 * Auth service with Firebase Auth support (email/password)
 * Falls back to localStorage when Firebase is unavailable.
 */
(function(global) {
  'use strict';

  const USERS_DB_KEY = 'irancash_users_db';
  const SESSION_KEY = 'irancash_session';

  const DEV_ADMIN_EMAILS = [
    'iranildofilho2021@gmail.com'
  ];

  const ROLES = {
    developer: { name: 'Desenvolvedor', permissions: ['*'] },
    cadastrador: { name: 'Cadastrador', permissions: ['read', 'create', 'update', 'delete'] },
    visualizador: { name: 'Visualizador', permissions: ['read'] }
  };

  let authModulePromise = null;
  let firebaseAuthSetup = false;
  let authReady = false;
  let authReadyResolve;
  const authReadyPromise = new Promise(resolve => { authReadyResolve = resolve; });

  function markReady() {
    if (authReady) return;
    authReady = true;
    if (typeof authReadyResolve === 'function') authReadyResolve();
  }

  function safeParseJSON(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isDevEmail(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return false;
    return DEV_ADMIN_EMAILS.some(item => normalizeEmail(item) === normalized);
  }

  function getUsersDB() {
    return safeParseJSON(localStorage.getItem(USERS_DB_KEY), []);
  }

  function sanitizeUser(user) {
    if (!user || typeof user !== 'object') return null;
    return {
      id: user.id || '',
      uid: user.uid || '',
      name: user.name || '',
      email: user.email || '',
      role: user.role || 'visualizador',
      active: user.active !== false,
      createdAt: user.createdAt || new Date().toISOString()
    };
  }

  function saveUsersDB(users, syncRemote = true) {
    const list = Array.isArray(users) ? users : [];
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(list));
    if (syncRemote) syncUsersDbToFirebase(list);
  }

  function upsertUserProfile(profile) {
    const users = getUsersDB();
    const clean = sanitizeUser(profile);
    if (!clean) return;
    const idx = users.findIndex(u => (clean.uid && u.uid === clean.uid) || (clean.email && u.email === clean.email));
    if (idx >= 0) {
      const existing = users[idx] || {};
      users[idx] = { ...existing, ...clean };
    } else {
      users.push(clean);
    }
    saveUsersDB(users);
  }

  async function syncUsersDbToFirebase(users) {
    if (!global.FirebaseStore || !global.FirebaseStore.isAvailable) return;
    try {
      const available = await global.FirebaseStore.isAvailable();
      if (!available) return;
      await global.FirebaseStore.setItem(USERS_DB_KEY, (Array.isArray(users) ? users.map(sanitizeUser).filter(Boolean) : []));
    } catch (e) {
      // keep local
    }
  }

  async function hydrateUsersDbFromFirebase() {
    if (!global.FirebaseStore || !global.FirebaseStore.isAvailable) return;
    try {
      const available = await global.FirebaseStore.isAvailable();
      if (!available) return;
      const remote = await global.FirebaseStore.getItem(USERS_DB_KEY, null);
      if (Array.isArray(remote) && remote.length) {
        saveUsersDB(remote, false);
      }
    } catch (e) {
      // ignore
    }
  }

  function getSession() {
    return safeParseJSON(localStorage.getItem(SESSION_KEY), null);
  }

  function setSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function findUserByEmail(email) {
    if (!email) return null;
    const users = getUsersDB();
    return users.find(u => u.email === email) || null;
  }

  function getFirebaseAuth() {
    if (global.FirebaseStore && typeof global.FirebaseStore.getAuth === 'function') {
      return global.FirebaseStore.getAuth();
    }
    return null;
  }

  async function loadAuthModule() {
    if (!authModulePromise) {
      authModulePromise = import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    }
    return authModulePromise;
  }

  function userProfileKey(uid) {
    return 'user_' + uid;
  }

  async function saveUserProfile(profile) {
    const clean = sanitizeUser(profile);
    if (!clean) return;
    upsertUserProfile(clean);

    if (!global.FirebaseStore || !global.FirebaseStore.isAvailable) return;
    try {
      const available = await global.FirebaseStore.isAvailable();
      if (!available) return;
      if (clean.uid) {
        await global.FirebaseStore.setItem(userProfileKey(clean.uid), clean);
      }
    } catch (e) {
      // ignore
    }
  }

  async function getOrCreateProfile(user) {
    const uid = user && user.uid ? user.uid : '';
    const email = user && user.email ? user.email : '';
    let profile = null;

    if (uid && global.FirebaseStore && global.FirebaseStore.isAvailable) {
      try {
        const available = await global.FirebaseStore.isAvailable();
        if (available) {
          profile = await global.FirebaseStore.getItem(userProfileKey(uid), null);
        }
      } catch (e) {}
    }

    if (!profile && email) {
      const local = findUserByEmail(email);
      if (local) profile = { ...local, uid: uid || local.uid };
    }

    if (!profile) {
      const name = (user && user.displayName) ? user.displayName : (email ? email.split('@')[0] : 'Usuario');
      profile = {
        uid,
        name,
        email,
        role: 'visualizador',
        active: true,
        createdAt: new Date().toISOString()
      };
    }

    if (profile && isDevEmail(profile.email)) {
      profile.role = 'developer';
    }

    await saveUserProfile(profile);
    return profile;
  }

  async function setupFirebaseAuth() {
    if (firebaseAuthSetup) return;
    firebaseAuthSetup = true;

    const auth = getFirebaseAuth();
    if (!auth) {
      markReady();
      return;
    }

    try {
      const mod = await loadAuthModule();
      mod.onAuthStateChanged(auth, async (user) => {
        if (user) {
          const profile = await getOrCreateProfile(user);
          if (profile && profile.active === false) {
            try { await mod.signOut(auth); } catch (e) {}
            clearSession();
          } else {
            setSession({
              uid: profile.uid || user.uid,
              name: profile.name || user.displayName || '',
              email: profile.email || user.email || '',
              role: profile.role || 'visualizador',
              loginTime: Date.now()
            });
          }
        } else {
          clearSession();
        }
        markReady();
      });
    } catch (e) {
      markReady();
    }
  }

  async function login(emailOrLogin, password) {
    const auth = getFirebaseAuth();
    if (auth) {
      try {
        const mod = await loadAuthModule();
        const cred = await mod.signInWithEmailAndPassword(auth, emailOrLogin, password);
        const profile = await getOrCreateProfile(cred.user);
        if (profile && profile.active === false) {
          try { await mod.signOut(auth); } catch (e) {}
          clearSession();
          return { success: false, message: 'Sua conta esta inativa. Contate o administrador.' };
        }
        const session = {
          uid: profile.uid || cred.user.uid,
          name: profile.name || cred.user.displayName || '',
          email: profile.email || cred.user.email || '',
          role: profile.role || 'visualizador',
          loginTime: Date.now()
        };
        setSession(session);
        return { success: true, user: session };
      } catch (e) {
        return { success: false, message: 'Credenciais invalidas.' };
      }
    }

    // Local fallback
    const user = findUserByEmail(emailOrLogin);
    if (user && user.password === password) {
      if (user.active === false) {
        return { success: false, message: 'Sua conta esta inativa. Contate o administrador.' };
      }
      const session = { name: user.name, email: user.email, role: user.role, loginTime: Date.now() };
      setSession(session);
      return { success: true, user: session };
    }

    return { success: false, message: 'Credenciais invalidas.' };
  }

  async function loginWithGoogle() {
    const auth = getFirebaseAuth();
    if (!auth) {
      return { success: false, message: 'Login com Google indisponivel.' };
    }

    try {
      const mod = await loadAuthModule();
      const provider = new mod.GoogleAuthProvider();
      if (provider && provider.setCustomParameters) {
        provider.setCustomParameters({ prompt: 'select_account' });
      }
      const cred = await mod.signInWithPopup(auth, provider);
      const profile = await getOrCreateProfile(cred.user);
      if (profile && profile.active === false) {
        try { await mod.signOut(auth); } catch (e) {}
        clearSession();
        return { success: false, message: 'Sua conta esta inativa. Contate o administrador.' };
      }
      const session = {
        uid: profile.uid || cred.user.uid,
        name: profile.name || cred.user.displayName || '',
        email: profile.email || cred.user.email || '',
        role: profile.role || 'visualizador',
        loginTime: Date.now()
      };
      setSession(session);
      return { success: true, user: session };
    } catch (e) {
      const code = e && e.code ? String(e.code) : '';
      if (code === 'auth/popup-blocked') {
        return { success: false, message: 'Popup bloqueado. Permita popups e tente novamente.' };
      }
      if (code === 'auth/popup-closed-by-user') {
        return { success: false, message: 'Popup fechado antes de concluir o login.' };
      }
      if (code === 'auth/operation-not-allowed') {
        return { success: false, message: 'Login com Google nao habilitado no Firebase.' };
      }
      if (code === 'auth/unauthorized-domain') {
        return { success: false, message: 'Dominio nao autorizado no Firebase.' };
      }
      return { success: false, message: 'Falha ao entrar com Google.' };
    }
  }

  async function register(userData) {
    const payload = userData || {};
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim();
    const password = String(payload.password || '').trim();
    const roleInput = String(payload.role || 'visualizador').trim();
    const role = isDevEmail(email) ? 'developer' : (ROLES[roleInput] ? roleInput : 'visualizador');

    if (!name || !email || !password) {
      return { success: false, message: 'Dados invalidos.' };
    }

    const auth = getFirebaseAuth();
    if (auth) {
      try {
        const mod = await loadAuthModule();
        const cred = await mod.createUserWithEmailAndPassword(auth, email, password);
        if (name) {
          try { await mod.updateProfile(cred.user, { displayName: name }); } catch (e) {}
        }
        const profile = {
          uid: cred.user.uid,
          name: name,
          email: email,
          role: role,
          active: true,
          createdAt: new Date().toISOString()
        };
        await saveUserProfile(profile);
        try { await mod.signOut(auth); } catch (e) {}
        clearSession();
        return { success: true };
      } catch (e) {
        const code = e && e.code ? String(e.code) : '';
        if (code === 'auth/email-already-in-use') {
          return { success: false, message: 'E-mail ja cadastrado.' };
        }
        if (code === 'auth/weak-password') {
          return { success: false, message: 'Senha muito fraca.' };
        }
        if (code === 'auth/invalid-email') {
          return { success: false, message: 'E-mail invalido.' };
        }
        return { success: false, message: 'Erro ao criar conta.' };
      }
    }

    const users = getUsersDB();
    if (users.find(u => u.email === email)) {
      return { success: false, message: 'E-mail ja cadastrado.' };
    }
    const newUser = {
      id: String(Date.now()),
      name: name,
      email: email,
      password: password,
      role: role,
      active: true,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    saveUsersDB(users);
    return { success: true };
  }

  async function logout() {
    clearSession();
    const auth = getFirebaseAuth();
    if (auth) {
      try {
        const mod = await loadAuthModule();
        await mod.signOut(auth);
      } catch (e) {}
    }
    window.location.href = 'index.html';
  }

  function getCurrentUser() {
    return getSession();
  }

  function isAuthenticated() {
    return !!getCurrentUser();
  }

  function hasPermission(permission) {
    const user = getCurrentUser();
    if (!user) return false;

    const roleConfig = ROLES[user.role];
    if (!roleConfig) return false;

    if (roleConfig.permissions.includes('*')) return true;
    return roleConfig.permissions.includes(permission);
  }

  function canAccessPage(pageName) {
    const user = getCurrentUser();
    if (!user) return false;

    if (pageName.includes('configuracoes') || pageName.includes('Configuracoes')) {
      return user.role === 'developer';
    }

    return true;
  }

  function getAllUsers() {
    return getUsersDB().map(u => ({ ...u, password: '***' }));
  }

  function toggleUserStatus(email) {
    const users = getUsersDB();
    const user = users.find(u => u.email === email);
    if (user) {
      user.active = !user.active;
      saveUsersDB(users);
      if (user.uid) { saveUserProfile(user); }
      return true;
    }
    return false;
  }

  function deleteUser(email) {
    let users = getUsersDB();
    const initialLen = users.length;
    const removed = users.find(u => u.email === email) || null;
    users = users.filter(u => u.email !== email);
    if (users.length !== initialLen) {
      saveUsersDB(users);
      if (removed && removed.uid && global.FirebaseStore && global.FirebaseStore.isAvailable) {
        global.FirebaseStore.isAvailable().then(avail => {
          if (avail) global.FirebaseStore.removeItem(userProfileKey(removed.uid));
        });
      }
      return true;
    }
    return false;
  }

  function updateUserRole(email, newRole) {
    const users = getUsersDB();
    const user = users.find(u => u.email === email);
    if (user && ROLES[newRole]) {
      user.role = newRole;
      saveUsersDB(users);
      if (user.uid) { saveUserProfile(user); }
      return true;
    }
    return false;
  }

  function whenReady() {
    return authReadyPromise;
  }

  function init() {
    if (global.FirebaseStore && global.FirebaseStore.initialized && global.FirebaseStore.initialized()) {
      setupFirebaseAuth();
      hydrateUsersDbFromFirebase();
    }

    global.addEventListener('firebase:initialized', () => {
      setupFirebaseAuth();
      hydrateUsersDbFromFirebase();
    });

    global.addEventListener('firebase:init-error', () => {
      markReady();
    });

    // Fallback to avoid blocking if Firebase is unavailable
    setTimeout(() => { if (!authReady) markReady(); }, 1500);
  }

  init();

  global.AuthService = {
    login,
    loginWithGoogle,
    logout,
    register,
    getCurrentUser,
    isAuthenticated,
    hasPermission,
    canAccessPage,
    getAllUsers,
    toggleUserStatus,
    deleteUser,
    updateUserRole,
    whenReady,
    ROLES
  };

})(window);
