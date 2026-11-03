/**
 * Auth service with Firebase Auth support (email/password + Google)
 * Source of truth for session: usuarios_lavaja (UserSystem).
 * Firebase Auth is used only for Google OAuth and password-reset email.
 *
 * KEY DESIGN DECISIONS
 * ---------------------
 * 1. login()  -> always calls UserSystem.login() first (legacy/local is the source of truth).
 *              Firebase account is provisioned in the BACKGROUND, never blocks login.
 * 2. onAuthStateChanged -> NEVER clears currentUser / legacy session.
 *              It only clears irancash_session when that session was explicitly
 *              created by a Firebase-only flow (source === 'firebase').
 * 3. signup()  -> creates a pending access request immediately (no Firebase needed).
 *              Firebase Auth account is provisioned in the background so
 *              password-reset becomes possible after admin approval.
 * 4. resetPassword / loginWithGoogle / requestAccessWithGoogle ->
 *              use waitForFirebaseAuth(), which resolves when Firebase finishes
 *              initialising (up to 4 s), so they are never blocked by timing.
 */
(function(global) {
  'use strict';

  // Constants
  const USERS_DB_KEY         = 'irancash_users_db';
  const SESSION_KEY          = 'irancash_session';
  const LEGACY_USERS_KEY     = 'usuarios_lavaja';
  const PUBLIC_USERS_KEY     = 'usuarios_lavaja_public';
  const LEGACY_CURRENT_USER  = 'currentUser';
  const PENDING_REQUESTS_KEY = 'cadastros_pendentes';
  const SOURCE_LEGACY        = 'legacy';
  const SOURCE_FIREBASE      = 'firebase';
  const ENABLE_LEGACY_CLOUD_LOGIN = false;

  const DEV_ADMIN_EMAILS = ['iranildofilho2021@gmail.com'];

  const ROLES = {
    developer:    { name: 'Desenvolvedor', permissions: ['*'] },
    cadastrador:  { name: 'Cadastrador',   permissions: ['read', 'create', 'update', 'delete'] },
    visualizador: { name: 'Visualizador',  permissions: ['read'] }
  };

  // State
  let authModulePromise = null;
  let appModulePromise  = null;
  let functionsModulePromise = null;
  let firebaseAuthSetup = false;
  let authReady         = false;
  let authReadyResolve;
  const authReadyPromise = new Promise(resolve => { authReadyResolve = resolve; });

  let _fbAuthResolved = false;
  let _fbAuthResolve;
  const _fbAuthPromise = new Promise(resolve => { _fbAuthResolve = resolve; });
  const pendingRemoteWrites = new Map();

  // Session timeout constants
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  const SESSION_LAST_ACTIVITY_KEY = 'irancash_last_activity';
  let _inactivityTimer = null;

  // Internal helpers
  function markReady() {
    if (authReady) return;
    authReady = true;
    if (typeof authReadyResolve === 'function') authReadyResolve();
  }

  // Session timeout helpers
  function _recordActivity() {
    try { localStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(Date.now())); } catch (e) {}
  }

  function _clearInactivityTimer() {
    if (_inactivityTimer) { clearTimeout(_inactivityTimer); _inactivityTimer = null; }
  }

  function _scheduleInactivityTimer() {
    _clearInactivityTimer();
    _inactivityTimer = setTimeout(function() {
      if (isAuthenticated()) {
        logout();
      }
    }, SESSION_TIMEOUT_MS);
  }

  function _startActivityTracking() {
    _recordActivity();
    _scheduleInactivityTimer();
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    function onActivity() {
      _recordActivity();
      _scheduleInactivityTimer();
    }
    events.forEach(function(ev) { global.addEventListener(ev, onActivity, { passive: true }); });
  }

  function _checkSessionExpiry() {
    try {
      const last = parseInt(localStorage.getItem(SESSION_LAST_ACTIVITY_KEY) || '0', 10);
      if (last && (Date.now() - last) > SESSION_TIMEOUT_MS) {
        clearSession();
        clearLegacyCurrentUser();
        try { localStorage.removeItem(SESSION_LAST_ACTIVITY_KEY); } catch (e) {}
      }
    } catch (e) {}
  }

  function resolveFirebaseAuth() {
    if (_fbAuthResolved) return;
    _fbAuthResolved = true;
    if (typeof _fbAuthResolve === 'function') _fbAuthResolve(getFirebaseAuth());
  }

  function waitForFirebaseAuth() {
    if (_fbAuthResolved) return Promise.resolve(getFirebaseAuth());
    return _fbAuthPromise;
  }

  function safeParseJSON(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
  }

  function waitWithTimeout(promise, timeoutMs, fallback) {
    return new Promise(resolve => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(fallback);
      }, timeoutMs);

      Promise.resolve(promise).then(
        value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      );
    });
  }

  function waitOrThrow(promise, timeoutMs, message) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const error = new Error(message);
        error.code = 'auth/timeout';
        reject(error);
      }, timeoutMs);

      Promise.resolve(promise).then(
        value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        error => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  function generateFirebaseTemporaryPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
    const length = 20;
    let password = '';
    try {
      const bytes = new Uint8Array(length);
      global.crypto.getRandomValues(bytes);
      for (let i = 0; i < length; i++) password += chars[bytes[i] % chars.length];
      return password;
    } catch (e) {
      for (let i = 0; i < length; i++) password += chars[Math.floor(Math.random() * chars.length)];
      return password;
    }
  }

  function gerarSaltSenhaFallback() {
    const fallback = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    try {
      const bytes = new Uint8Array(16);
      global.crypto.getRandomValues(bytes);
      return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      return fallback;
    }
  }

  function hashSenhaComSaltFallback(senha, salt) {
    const base = `${String(salt || '')}::${String(senha || '')}`;
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;

    for (let i = 0; i < base.length; i++) {
      const c = base.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= c;
      h2 = Math.imul(h2, 0x85ebca6b);
    }

    const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
    return `${p1}${p2}`;
  }

  function buildSenhaStorageValueFallback(senha) {
    const senhaTexto = String(senha || '');
    if (!senhaTexto) return null;
    const us = getUserSystem();
    if (us && typeof us.hashPasswordForStorage === 'function') {
      return us.hashPasswordForStorage(senhaTexto);
    }
    const salt = gerarSaltSenhaFallback();
    return {
      scheme: 'irancash-v2',
      salt,
      hash: hashSenhaComSaltFallback(senhaTexto, salt)
    };
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isDevEmail(email) {
    const n = normalizeEmail(email);
    return !!n && DEV_ADMIN_EMAILS.some(item => normalizeEmail(item) === n);
  }

  // irancash_users_db helpers
  function getUsersDB() {
    return safeParseJSON(localStorage.getItem(USERS_DB_KEY), []);
  }

  function sanitizeUser(user) {
    if (!user || typeof user !== 'object') return null;
    return {
      id:        user.id        || '',
      uid:       user.uid       || '',
      name:      user.name      || '',
      email:     user.email     || '',
      role:      user.role      || 'visualizador',
      active:    user.active    !== false,
      createdAt: user.createdAt || new Date().toISOString()
    };
  }

  function saveUsersDB(users, syncRemote) {
    const list = Array.isArray(users) ? users : [];
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(list));
    if (syncRemote !== false) syncUsersDbToFirebase(list);
  }

  function upsertUserProfile(profile) {
    const users = getUsersDB();
    const clean = sanitizeUser(profile);
    if (!clean) return;
    const idx = users.findIndex(u =>
      (clean.uid   && u.uid   === clean.uid)  ||
      (clean.email && normalizeEmail(u.email) === normalizeEmail(clean.email))
    );
    if (idx >= 0) {
      users[idx] = Object.assign({}, users[idx] || {}, clean);
    } else {
      users.push(clean);
    }
    saveUsersDB(users);
  }

  async function syncUsersDbToFirebase(users) {
    if (!global.FirebaseStore || !global.FirebaseStore.isAvailable || !hasFirebaseAuthUser()) return;
    try {
      if (!(await global.FirebaseStore.isAvailable()) || !hasFirebaseAuthUser()) return;
      await global.FirebaseStore.setItem(
        USERS_DB_KEY,
        Array.isArray(users) ? users.map(sanitizeUser).filter(Boolean) : []
      );
    } catch (e) {}
  }

  async function hydratePublicUsersFromFirebase() {
    if (!global.FirebaseStore || !global.FirebaseStore.isAvailable || !hasFirebaseAuthUser()) return [];
    try {
      const available = await waitWithTimeout(global.FirebaseStore.isAvailable(), 3000, false);
      if (!available || !hasFirebaseAuthUser()) return getPublicUsers();
      const remote = await waitWithTimeout(
        global.FirebaseStore.getItem(PUBLIC_USERS_KEY, null),
        8000,
        null
      );
      if (Array.isArray(remote)) {
        const normalized = remote.map(normalizeLegacyUser).filter(Boolean);
        localStorage.setItem(PUBLIC_USERS_KEY, JSON.stringify(normalized));
        return normalized;
      }
    } catch (e) {}
    return getPublicUsers();
  }

  async function hydrateApprovedUserFromFirebase(email) {
    const normalizedEmail = normalizeEmail(email);
    const localUser = findLegacyApprovedUserByEmail(normalizedEmail);
    if (localUser) return localUser;

    if (global.FirebaseStore && typeof global.FirebaseStore.getUserAccess === 'function') {
      try {
        const directAccess = await waitWithTimeout(
          global.FirebaseStore.getUserAccess(normalizedEmail),
          6000,
          null
        );
        if (directAccess && directAccess.aprovado !== false) {
          return cacheApprovedLegacyUser(directAccess);
        }
      } catch (e) {}
    }

    await hydratePublicUsersFromFirebase();
    return findLegacyApprovedUserByEmail(normalizedEmail);
  }

  async function hydrateUsersDbFromFirebase() {
    if (!global.FirebaseStore || !global.FirebaseStore.isAvailable || !hasFirebaseAuthUser()) return;
    try {
      const available = await waitWithTimeout(global.FirebaseStore.isAvailable(), 3000, false);
      if (!available || !hasFirebaseAuthUser()) return;
      const remote = await waitWithTimeout(
        global.FirebaseStore.getItem(USERS_DB_KEY, null),
        8000,
        null
      );
      if (Array.isArray(remote) && remote.length) saveUsersDB(remote, false);
    } catch (e) {}
  }

  // irancash_session helpers
  function getSession()   { return safeParseJSON(localStorage.getItem(SESSION_KEY), null); }
  function setSession(s)  { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  // UserSystem / legacy helpers
  function getUserSystem() {
    return global.UserSystem && typeof global.UserSystem === 'object' ? global.UserSystem : null;
  }
  function getLegacyUsers()     { return safeParseJSON(localStorage.getItem(LEGACY_USERS_KEY), []); }
  function getPublicUsers()     { return safeParseJSON(localStorage.getItem(PUBLIC_USERS_KEY), []); }
  function getKnownLegacyUsers() {
    const users = [...getLegacyUsers(), ...getPublicUsers()]
      .map(normalizeLegacyUser)
      .filter(Boolean);
    const merged = new Map();
    users.forEach(function(user) {
      const key = normalizeEmail(user.email) || user.id;
      if (!key) return;
      merged.set(key, choosePreferredLegacyUser(merged.get(key), user));
    });
    return Array.from(merged.values());
  }
  function getPendingRequests() { return safeParseJSON(localStorage.getItem(PENDING_REQUESTS_KEY), []); }

  function normalizeLegacyTipoAcesso(tipoAcesso) {
    const us = getUserSystem();
    if (us && typeof us.normalizarTipoAcesso === 'function') return us.normalizarTipoAcesso(tipoAcesso);
    const normalized = String(tipoAcesso || '').trim().toLowerCase();

    if ([
      'admin',
      'gerente',
      'administrador',
      'administrator',
      'adm',
      'cadastrador',
      'gestor',
      'manager'
    ].includes(normalized)) return 'admin';

    if ([
      'desenvolvedor',
      'developer',
      'dev',
      'desenvolvimento'
    ].includes(normalized)) return 'desenvolvedor';

    if ([
      'visualizador',
      'viewer',
      'leitor',
      'consulta',
      'readonly',
      'read-only'
    ].includes(normalized)) return 'visualizador';

    return normalized || 'visualizador';
  }

  function normalizeLegacyUser(user) {
    if (!user || typeof user !== 'object') return null;
    const us = getUserSystem();
    if (us && typeof us.normalizarUsuario === 'function') return us.normalizarUsuario(user);
    return Object.assign({}, user, { tipoAcesso: normalizeLegacyTipoAcesso(user.tipoAcesso || user.role) });
  }

  function mapLegacyTipoAcessoToRole(tipoAcesso) {
    switch (normalizeLegacyTipoAcesso(tipoAcesso)) {
      case 'desenvolvedor': return 'developer';
      case 'admin':         return 'cadastrador';
      default:              return 'visualizador';
    }
  }

  function rankLegacyTipoAcesso(tipoAcesso) {
    switch (normalizeLegacyTipoAcesso(tipoAcesso)) {
      case 'desenvolvedor': return 3;
      case 'admin':         return 2;
      case 'visualizador':  return 1;
      default:              return 0;
    }
  }

  function countLegacyLaundries(user) {
    if (!Array.isArray(user && user.lavanderias)) return 0;
    if (user.lavanderias.includes('all')) return Number.MAX_SAFE_INTEGER;
    return user.lavanderias.filter(Boolean).length;
  }

  function choosePreferredLegacyUser(currentUser, candidateUser) {
    const current = normalizeLegacyUser(currentUser);
    const candidate = normalizeLegacyUser(candidateUser);

    if (!current) return candidate;
    if (!candidate) return current;

    const currentRank = rankLegacyTipoAcesso(current.tipoAcesso || current.role);
    const candidateRank = rankLegacyTipoAcesso(candidate.tipoAcesso || candidate.role);
    if (candidateRank !== currentRank) {
      return candidateRank > currentRank ? candidate : current;
    }

    const currentApproved = current.aprovado === true || current.aprovado === 1 || current.active === true;
    const candidateApproved = candidate.aprovado === true || candidate.aprovado === 1 || candidate.active === true;
    if (candidateApproved !== currentApproved) {
      return candidateApproved ? candidate : current;
    }

    const currentLaundryCount = countLegacyLaundries(current);
    const candidateLaundryCount = countLegacyLaundries(candidate);
    if (candidateLaundryCount !== currentLaundryCount) {
      return candidateLaundryCount > currentLaundryCount ? candidate : current;
    }

    return candidate;
  }

  function setLegacyCurrentUser(user) {
    if (!user) { localStorage.removeItem(LEGACY_CURRENT_USER); return; }
    localStorage.setItem(LEGACY_CURRENT_USER, JSON.stringify(user));
  }
  function clearLegacyCurrentUser() { localStorage.removeItem(LEGACY_CURRENT_USER); }

  function findLegacyUserByEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return null;
    return getKnownLegacyUsers()
      .filter(user => normalizeEmail(user && user.email) === normalizedEmail)
      .reduce((preferredUser, candidateUser) => choosePreferredLegacyUser(preferredUser, candidateUser), null);
  }
  function findLegacyApprovedUserByEmail(email) {
    const u = findLegacyUserByEmail(email);
    if (!u) return null;
    // Desenvolvedor e e-mail principal sempre têm acesso, mesmo sem flag aprovado
    const isDevRole = normalizeLegacyTipoAcesso(u.tipoAcesso || u.role) === 'desenvolvedor';
    const isPrimary = DEV_ADMIN_EMAILS.map(e => normalizeEmail(e)).includes(normalizeEmail(email));
    if (u.aprovado || isDevRole || isPrimary) {
      // Auto-corrige aprovado:true se ausente
      if (!u.aprovado) {
        u.aprovado = true;
        const users = getLegacyUsers().map(x => normalizeEmail(x && x.email) === normalizeEmail(email) ? { ...x, aprovado: true } : x);
        const publicUsers = getPublicUsers().map(x => normalizeEmail(x && x.email) === normalizeEmail(email) ? { ...x, aprovado: true } : x);
        try { localStorage.setItem(LEGACY_USERS_KEY, JSON.stringify(users)); } catch(e) {}
        try { localStorage.setItem(PUBLIC_USERS_KEY, JSON.stringify(publicUsers)); } catch(e) {}
      }
      return normalizeLegacyUser(u);
    }
    return null;
  }

  function ensurePrimaryDeveloperLegacyUser(firebaseUser) {
    const email = normalizeEmail(firebaseUser && firebaseUser.email);
    if (!isDevEmail(email)) return null;

    const users = getLegacyUsers();
    const index = users.findIndex(u => normalizeEmail(u && u.email) === email);
    const existing = index >= 0 ? users[index] : {};
    const legacyUser = normalizeLegacyUser(Object.assign({}, existing, {
      id:          existing.id || 'admin1',
      nome:        existing.nome || (firebaseUser && firebaseUser.displayName) || 'Administrador',
      email,
      senha:       null,
      tipoAcesso:  'desenvolvedor',
      lavanderias: ['all'],
      aprovado:    true,
      googleOnly:  true,
      criadoEm:    existing.criadoEm || new Date().toISOString()
    }));

    if (index >= 0) users[index] = legacyUser;
    else users.push(legacyUser);

    localStorage.setItem(LEGACY_USERS_KEY, JSON.stringify(users));
    syncRemoteKey(LEGACY_USERS_KEY, users);
    return legacyUser;
  }

  function findPendingRequestByEmail(email) {
    const n = normalizeEmail(email);
    return n ? (getPendingRequests().find(i => normalizeEmail(i && i.email) === n) || null) : null;
  }

  function cacheApprovedLegacyUser(user) {
    const normalized = normalizeLegacyUser(user);
    if (!normalized || !normalized.email) return null;

    try {
      const publicUsers = getPublicUsers();
      const email = normalizeEmail(normalized.email);
      const filtered = publicUsers.filter(item => normalizeEmail(item && item.email) !== email);
      filtered.push({
        id: normalized.id || email,
        nome: normalized.nome || normalized.name || '',
        email,
        telefone: normalized.telefone || '',
        tipoAcesso: normalizeLegacyTipoAcesso(normalized.tipoAcesso || normalized.role),
        lavanderias: Array.isArray(normalized.lavanderias) ? normalized.lavanderias : [],
        aprovado: true,
        criadoEm: normalized.criadoEm || normalized.createdAt || new Date().toISOString(),
        aprovadoEm: normalized.aprovadoEm || null
      });
      localStorage.setItem(PUBLIC_USERS_KEY, JSON.stringify(filtered));
    } catch (e) {}

    return normalized;
  }

  function buildLegacySession(legacyUser, firebaseUser) {
    const u = normalizeLegacyUser(legacyUser);
    return {
      uid:       (firebaseUser && firebaseUser.uid) || (u && u.id) || '',
      name:      (u && u.nome)  || '',
      email:     (u && u.email) || '',
      role:      mapLegacyTipoAcessoToRole(u && u.tipoAcesso),
      source:    SOURCE_LEGACY,
      loginTime: Date.now()
    };
  }

  function syncLegacySession(legacyUser, firebaseUser) {
    const u = normalizeLegacyUser(legacyUser);
    if (!u) return null;
    setLegacyCurrentUser(u);
    const session = buildLegacySession(u, firebaseUser);
    setSession(session);
    return session;
  }

  async function flushPendingRemoteWrites() {
    if (!global.FirebaseStore || !global.FirebaseStore.isAvailable || !hasFirebaseAuthUser()) return;
    try {
      const available = await global.FirebaseStore.isAvailable();
      if (!available || !hasFirebaseAuthUser() || pendingRemoteWrites.size === 0) return;

      const entries = Array.from(pendingRemoteWrites.entries());
      for (const [key, value] of entries) {
        try {
          await global.FirebaseStore.setItem(key, value);
          pendingRemoteWrites.delete(key);
        } catch (e) {}
      }
    } catch (e) {}
  }

  async function syncRemoteKey(key, value) {
    if (!hasFirebaseAuthUser()) return;
    pendingRemoteWrites.set(key, value);
    await flushPendingRemoteWrites();
  }

  function waitForFirebaseStore(timeoutMs = 6000) {
    if (global.FirebaseStore &&
        typeof global.FirebaseStore.initialized === 'function' &&
        global.FirebaseStore.initialized()) {
      return Promise.resolve(global.FirebaseStore);
    }

    return waitWithTimeout(new Promise(resolve => {
      const done = () => {
        resolve(global.FirebaseStore || null);
      };
      global.addEventListener('firebase:initialized', done, { once: true });
      global.addEventListener('firebase:init-error', () => resolve(null), { once: true });
    }), timeoutMs, null);
  }

  function sanitizePendingAccessRequestForCloud(solicitacao) {
    const source = solicitacao && typeof solicitacao === 'object' ? solicitacao : {};
    const clean = {
      ...source,
      id: source.id || ('sol_' + Date.now()),
      nome: String(source.nome || '').trim(),
      email: normalizeEmail(source.email),
      telefone: String(source.telefone || '').trim(),
      lavanderiaSolicitada: String(source.lavanderiaSolicitada || '').trim(),
      status: source.status || 'pendente',
      dataRegistro: source.dataRegistro || new Date().toISOString()
    };

    if (typeof clean.senha === 'string') {
      clean.senha = buildSenhaStorageValueFallback(clean.senha);
    }
    if (!clean.senha) delete clean.senha;
    return clean;
  }

  async function savePendingAccessRequestToCloud(solicitacao) {
    const store = await waitForFirebaseStore(7000);
    if (!store || typeof store.addPendingAccessRequest !== 'function') {
      return false;
    }

    try {
      await store.addPendingAccessRequest(sanitizePendingAccessRequestForCloud(solicitacao));
      return true;
    } catch (error) {
      console.error('[AuthService] Não foi possível salvar solicitação na nuvem:', error);
      return false;
    }
  }

  function syncClaimsInBackground() {
    // O banco agora usa o token do Firebase diretamente no Supabase. A antiga
    // Cloud Function gravava `role` com o papel interno (admin/visualizador),
    // enquanto o Supabase exige `role: authenticated`. Apenas renovamos o token
    // aqui para preservar as claims já sincronizadas pela migração.
    setTimeout(function() {
      const auth = getFirebaseAuth();
      const user = auth && auth.currentUser;
      if (!user || typeof user.getIdToken !== 'function') return;
      user.getIdToken(true).then(function() {
        global.dispatchEvent(new CustomEvent('firebase:claims-synced', {
          detail: { uid: user.uid }
        }));
      }).catch(function(error) {
        console.warn('[AuthService] Token de acesso não renovado:', error);
      });
    }, 0);
  }

  function createPendingAccessRequest(payload) {
    const nome               = String((payload && payload.nome)               || '').trim();
    const email              = String((payload && payload.email)              || '').trim();
    const telefone           = String((payload && payload.telefone)           || '').trim();
    const lavanderiaSolicitada = String((payload && payload.lavanderiaSolicitada) || '').trim();
    const senha              = String((payload && payload.senha)              || '');
    const normEmail          = normalizeEmail(email);

    if (!nome || !normEmail) throw new Error('Informe nome e e-mail para solicitar acesso.');

    const us = getUserSystem();
    if (us && typeof us.solicitarCadastro === 'function') {
      return us.solicitarCadastro({ nome, email: normEmail, telefone, lavanderiaSolicitada, senha }, { skipCloud: true });
    }

    const usuarios  = getLegacyUsers();
    const pendentes = getPendingRequests();

    if (usuarios.some(u => normalizeEmail(u && u.email) === normEmail)) {
      throw new Error('Este e-mail ja esta cadastrado. Faca login para continuar.');
    }
    if (pendentes.some(i => normalizeEmail(i && i.email) === normEmail)) {
      throw new Error('Ja existe uma solicitacao pendente para este e-mail.');
    }

    const solicitacao = {
      id: 'sol_' + Date.now(),
      nome,
      email: normEmail,
      telefone,
      lavanderiaSolicitada,
      senha: buildSenhaStorageValueFallback(senha),
      status: 'pendente',
      dataRegistro: new Date().toISOString()
    };
    pendentes.push(solicitacao);
    localStorage.setItem(PENDING_REQUESTS_KEY, JSON.stringify(pendentes));
    syncRemoteKey(PENDING_REQUESTS_KEY, pendentes);
    return solicitacao;
  }

  function removeLocalPendingAccessRequest(solicitacao) {
    const requestId = String(solicitacao && solicitacao.id || '').trim();
    const requestEmail = normalizeEmail(solicitacao && solicitacao.email);
    if (!requestId && !requestEmail) return;

    try {
      const pendentes = getPendingRequests();
      const filtrados = pendentes.filter(item => {
        const sameId = requestId && String(item && item.id || '').trim() === requestId;
        const sameEmail = requestEmail && normalizeEmail(item && item.email) === requestEmail;
        return !sameId && !sameEmail;
      });
      localStorage.setItem(PENDING_REQUESTS_KEY, JSON.stringify(filtrados));
    } catch (e) {}
  }

  // Firebase helpers
  function getFirebaseAuth() {
    if (global.FirebaseStore && typeof global.FirebaseStore.getAuth === 'function') {
      return global.FirebaseStore.getAuth();
    }
    return null;
  }

  function hasFirebaseAuthUser() {
    const auth = getFirebaseAuth();
    return Boolean(auth && auth.currentUser);
  }

  function notifyFirebaseAuthUser(user) {
    if (!user) return;
    try {
      global.dispatchEvent(new CustomEvent('firebase:auth-user', {
        detail: { uid: user.uid, email: user.email }
      }));
    } catch (eventError) {}
  }

  async function loginWithLegacyCloud(email, password) {
    if (!ENABLE_LEGACY_CLOUD_LOGIN) {
      return { success: false, skipped: true };
    }

    try {
      const result = await callCloudFunction('legacyEmailPasswordLogin', {
        email: normalizeEmail(email),
        password: String(password || '')
      });

      if (!result || !result.customToken || !result.user) {
        return { success: false, skipped: true };
      }

      const legacyUser = cacheApprovedLegacyUser(result.user);
      const auth = await waitForFirebaseAuth();
      if (!auth) throw new Error('Firebase Auth indisponível.');
      const mod = await loadAuthModule();
      const cred = await mod.signInWithCustomToken(auth, result.customToken);
      const session = syncLegacySession(legacyUser, cred.user);

      await saveLegacyProfile(cred.user, legacyUser);
      notifyFirebaseAuthUser(cred.user);
      _startActivityTracking();
      syncClaimsInBackground();

      return { success: true, user: session };
    } catch (error) {
      const code = String(error && error.code || '');
      if (code.includes('unauthenticated') || code.includes('invalid-argument')) {
        return { success: false, skipped: true, message: error.message };
      }
      console.warn('[AuthService] Login legado na nuvem indisponível:', error);
      return { success: false, skipped: true, message: error && error.message };
    }
  }

  async function loadAuthModule() {
    if (!authModulePromise) {
      authModulePromise = import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    }
    return authModulePromise;
  }

  async function loadAppModule() {
    if (!appModulePromise) {
      appModulePromise = import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
    }
    return appModulePromise;
  }

  async function loadFunctionsModule() {
    if (!functionsModulePromise) {
      functionsModulePromise = import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');
    }
    return functionsModulePromise;
  }

  async function callCloudFunction(functionName, payload) {
    const app = global.LAVACASH_FIREBASE_APP;
    if (!app) throw new Error('Firebase ainda não inicializado.');
    const mod = await loadFunctionsModule();
    const functions = mod.getFunctions(app, 'us-central1');
    const callable = mod.httpsCallable(functions, functionName);
    const response = await callable(payload || {});
    return response.data || null;
  }

  async function createSecondaryAuth() {
    const mainApp = global.LAVACASH_FIREBASE_APP;
    const config = mainApp && mainApp.options ? mainApp.options : null;
    if (!config || !config.apiKey || !config.projectId) return null;

    const appMod = await loadAppModule();
    const authMod = await loadAuthModule();
    const appName = `lavacash-admin-auth-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const app = appMod.initializeApp(config, appName);
    const auth = authMod.getAuth(app);

    return { appMod, authMod, app, auth };
  }

  function userProfileKey(uid) { return 'user_' + uid; }

  async function saveUserProfile(profile) {
    const clean = sanitizeUser(profile);
    if (!clean) return;
    upsertUserProfile(clean);
    if (!global.FirebaseStore || !global.FirebaseStore.isAvailable || !hasFirebaseAuthUser()) return;
    try {
      const available = await waitWithTimeout(global.FirebaseStore.isAvailable(), 3000, false);
      if (!available || !hasFirebaseAuthUser()) return;
      if (clean.uid) {
        await waitWithTimeout(
          global.FirebaseStore.setItem(userProfileKey(clean.uid), clean),
          6000,
          false
        );
      }
    } catch (e) {}
  }

  async function saveLegacyProfile(firebaseUser, legacyUser) {
    if (!firebaseUser || !legacyUser) return;
    const u = normalizeLegacyUser(legacyUser);
    await saveUserProfile({
      uid:       firebaseUser.uid,
      name:      (u && u.nome) || firebaseUser.displayName || '',
      email:     (u && u.email) || firebaseUser.email || '',
      role:      mapLegacyTipoAcessoToRole(u && u.tipoAcesso),
      active:    (u && u.aprovado) !== false,
      createdAt: (u && u.criadoEm) || new Date().toISOString()
    });
  }

  // Background Firebase provisioning (never blocks callers)
  async function _provisionFirebaseAccountInBackground(email, password, legacyUser) {
    if (!email || !password) return { provisioned: false };
    try {
      const auth = await waitForFirebaseAuth();
      if (!auth) return { provisioned: false };
      const mod = await loadAuthModule();
      let firebaseUser = null;
      let requiresPasswordReset = false;

      try {
        const cred = await mod.signInWithEmailAndPassword(auth, email, password);
        firebaseUser = cred.user;
      } catch (signInErr) {
        const code = String(signInErr && signInErr.code || '');
        const notFound = ['auth/user-not-found', 'auth/invalid-credential',
                          'auth/wrong-password', 'auth/invalid-login-credentials'].includes(code);
        if (notFound) {
          try {
            const firebasePassword = String(password || '').length >= 6
              ? password
              : generateFirebaseTemporaryPassword();
            requiresPasswordReset = firebasePassword !== password;
            const cred = await mod.createUserWithEmailAndPassword(auth, email, firebasePassword);
            firebaseUser = cred.user;
            if (legacyUser && legacyUser.nome) {
              try { await mod.updateProfile(firebaseUser, { displayName: legacyUser.nome }); } catch (e) {}
            }
            if (requiresPasswordReset) {
              try { await mod.sendPasswordResetEmail(auth, email); } catch (resetErr) {}
            }
          } catch (createErr) {
            const createCode = String(createErr && createErr.code || '');
            if (createCode === 'auth/email-already-in-use') {
              try { await mod.sendPasswordResetEmail(auth, email); } catch (resetErr) {}
              requiresPasswordReset = true;
            }
          }
        }
      }

      if (firebaseUser && legacyUser) {
        await saveLegacyProfile(firebaseUser, legacyUser);
        syncClaimsInBackground();
        const session = getSession();
        if (session && session.source === SOURCE_LEGACY && !session.uid) {
          session.uid = firebaseUser.uid;
          setSession(session);
        }
      }
      return { provisioned: Boolean(firebaseUser), requiresPasswordReset };
    } catch (e) {}
    return { provisioned: false };
  }

  async function _provisionFirebaseForSignup(email, password, nome) {
    try {
      const auth = await waitForFirebaseAuth();
      if (!auth) return;
      const mod  = await loadAuthModule();
      const cred = await mod.createUserWithEmailAndPassword(auth, email, password);
      if (nome) { try { await mod.updateProfile(cred.user, { displayName: nome }); } catch (e) {} }
      await saveUserProfile({
        uid: cred.user.uid, name: nome, email,
        role: 'visualizador', active: false,
        createdAt: new Date().toISOString()
      });
      try { await mod.signOut(auth); } catch (e) {}
    } catch (e) {}
  }

  // setupFirebaseAuth
  async function setupFirebaseAuth() {
    if (firebaseAuthSetup) return;
    firebaseAuthSetup = true;

    const auth = getFirebaseAuth();
    if (!auth) { markReady(); return; }

    try {
      const mod = await loadAuthModule();
      mod.onAuthStateChanged(auth, async (user) => {
        if (user) {
          const legacyUser = await hydrateApprovedUserFromFirebase(user.email);
          if (legacyUser) {
            saveLegacyProfile(user, legacyUser).catch(function() {});
            syncLegacySession(legacyUser, user);
            notifyFirebaseAuthUser(user);
            syncClaimsInBackground();
          } else if (isDevEmail(user.email)) {
            const developerUser = ensurePrimaryDeveloperLegacyUser(user);
            saveLegacyProfile(user, developerUser).catch(function() {});
            syncLegacySession(developerUser, user);
            notifyFirebaseAuthUser(user);
            syncClaimsInBackground();
          } else {
            // Not approved in usuarios_lavaja: sign out Firebase silently.
            // Preserve any existing legacy session.
            try { await mod.signOut(auth); } catch (e) {}
            const session = getSession();
            if (session && session.source === SOURCE_FIREBASE) clearSession();
          }
        } else {
          // CRITICAL FIX: Firebase says no user.
          // This fires on EVERY page load when there is no Firebase session.
          // Do NOT clear the legacy session (currentUser / usuarios_lavaja).
          // Only clear if the session was created by a Firebase-only flow.
          const session = getSession();
          if (session && session.source === SOURCE_FIREBASE) clearSession();
          // Never touch currentUser here.
        }
        markReady();
      });
    } catch (e) { markReady(); }
  }

  // Sync Firebase password reset back to local UserSystem
  async function _syncFirebasePasswordToLocal(email, newPassword) {
    try {
      const us = getUserSystem();
      const normEmail = normalizeEmail(email);
      if (!us || typeof us._atualizarSenhaLocal !== 'function') {
        // Fallback: update in usuarios_lavaja directly
        const users = getLegacyUsers();
        const user = users.find(u => normalizeEmail(u && u.email) === normEmail);
        if (user) {
          // Re-hash with UserSystem if available, otherwise store plain for later migration
          if (us && typeof us.hashSenha === 'function') {
            const salt = us._gerarSaltSenha ? us._gerarSaltSenha() : String(Date.now());
            user.senhaHash = us.hashSenha(newPassword, salt);
            user.senhaSalt = salt;
            user.senhaScheme = us.PASSWORD_HASH_SCHEME || 'irancash-v2';
            delete user.senha;
          } else {
            user.senha = newPassword;
          }
          localStorage.setItem('usuarios_lavaja', JSON.stringify(users));
          syncRemoteKey('usuarios_lavaja', users);
        }
        return;
      }
      us._atualizarSenhaLocal(normEmail, newPassword);
    } catch (e) {}
  }

  // Public: login
  async function login(emailOrLogin, password) {
    const us = getUserSystem();

    // Primary: UserSystem (usuarios_lavaja is the source of truth)
    if (us && typeof us.login === 'function') {
      try {
        const legacyUser = normalizeLegacyUser(us.login(emailOrLogin, password));
        const session    = syncLegacySession(legacyUser, null);
        _startActivityTracking();
        // Aguarda uma janela curta para criar/vincular a conta no Firebase antes
        // do redirect. Em iPhone/Safari o redirect imediato podia cancelar essa
        // sincronização e deixar o usuário sem login em outro aparelho.
        const provisionResult = await waitWithTimeout(
          _provisionFirebaseAccountInBackground(normalizeEmail(emailOrLogin), password, legacyUser),
          6000,
          { provisioned: false }
        );
        const cloudAuth = getFirebaseAuth();
        if (!provisionResult?.provisioned || !cloudAuth?.currentUser
            || normalizeEmail(cloudAuth.currentUser.email) !== normalizeEmail(emailOrLogin)) {
          clearSession();
          localStorage.removeItem('currentUser');
          return { success: false, message: 'O login no Firebase não foi confirmado. Verifique a conexão ou use a recuperação de senha.' };
        }
        const response = { success: true, user: syncLegacySession(legacyUser, cloudAuth.currentUser) };
        if (provisionResult && provisionResult.requiresPasswordReset) {
          response.warning = 'Conta vinculada ao Firebase. Enviamos um e-mail para definir uma senha com 6 ou mais caracteres antes de usar em outro aparelho.';
        }
        return response;
      } catch (error) {
        // Local login failed. On a new iPhone/Safari install, localStorage may not
        // have usuarios_lavaja yet. Try Firebase Auth, then hydrate the approved
        // public profile from Firestore and rebuild the local session.
        const normEmail = normalizeEmail(emailOrLogin);
        const legacyCloudLogin = await waitWithTimeout(
          loginWithLegacyCloud(normEmail, password),
          9000,
          { success: false, skipped: true }
        );
        if (legacyCloudLogin && legacyCloudLogin.success) {
          return legacyCloudLogin;
        }

        try {
          const auth = await waitForFirebaseAuth();
          if (auth) {
            const mod = await loadAuthModule();
            const cred = await waitOrThrow(
              mod.signInWithEmailAndPassword(auth, normEmail, password),
              20000,
              'O Firebase demorou para responder. Verifique a conexão e tente novamente.'
            );
            if (cred && cred.user) {
              const approvedUser = await hydrateApprovedUserFromFirebase(normEmail)
                || ensurePrimaryDeveloperLegacyUser(cred.user);

              if (!approvedUser) {
                try { await mod.signOut(auth); } catch (signOutErr) {}
                if (findPendingRequestByEmail(normEmail)) {
                  return { success: false, message: 'Seu cadastro ainda está pendente de aprovação.' };
                }
                return { success: false, message: 'Seu e-mail ainda não possui acesso liberado. Solicite aprovação ao administrador.' };
              }

              const privateLocalUser = getLegacyUsers().find(function(user) {
                return normalizeEmail(user && user.email) === normEmail;
              });
              if (privateLocalUser) {
                await _syncFirebasePasswordToLocal(normEmail, password);
              }

              let session = null;
              try {
                const updated = normalizeLegacyUser(us.login(emailOrLogin, password));
                session = syncLegacySession(updated, cred.user);
              } catch (retryErr) {
                session = syncLegacySession(approvedUser, cred.user);
              }

              saveLegacyProfile(cred.user, approvedUser).catch(function() {});
              notifyFirebaseAuthUser(cred.user);
              _startActivityTracking();
              syncClaimsInBackground();
              return { success: true, user: session };
            }
          }
        } catch (fbErr) {
          const code = String(fbErr && fbErr.code || '');
          if (code === 'auth/invalid-email') {
            return { success: false, message: 'Informe um e-mail válido.' };
          }
          if (code === 'auth/user-disabled') {
            return { success: false, message: 'Esta conta está desativada. Contate o administrador.' };
          }
          if ([
            'auth/user-not-found',
            'auth/wrong-password',
            'auth/invalid-credential',
            'auth/invalid-login-credentials'
          ].includes(code)) {
            return {
              success: false,
              message: 'E-mail ou senha incorretos. Se for o primeiro acesso neste aparelho, use "Esqueci minha senha" para ativar a conta na nuvem.'
            };
          }
          if (code === 'auth/network-request-failed') {
            return { success: false, message: 'Falha de rede ao entrar. Verifique a internet e tente novamente.' };
          }
          if (code === 'auth/timeout') {
            return { success: false, message: fbErr.message || 'O login demorou demais. Tente novamente.' };
          }
        }
        return { success: false, message: (error && error.message) || 'Credenciais inválidas.' };
      }
    }

    // Fallback: irancash_users_db
    const normEmail = normalizeEmail(emailOrLogin);
    const user = getUsersDB().find(function(u) {
      return normalizeEmail(u && u.email) === normEmail && u.password === password;
    });
    if (user) {
      if (user.active === false) return { success: false, message: 'Sua conta esta inativa. Contate o administrador.' };
      const session = { name: user.name, email: user.email, role: user.role, source: SOURCE_LEGACY, loginTime: Date.now() };
      setSession(session);
      return { success: true, user: session };
    }

    return { success: false, message: 'Credenciais invalidas.' };
  }

  // Public: loginWithGoogle
  async function loginWithGoogle() {
    const auth = await waitForFirebaseAuth();
    if (!auth) {
      return { success: false, message: 'Login com Google indisponivel. Verifique sua conexao com a internet.' };
    }

    try {
      const mod      = await loadAuthModule();
      const provider = new mod.GoogleAuthProvider();
      if (provider.setCustomParameters) provider.setCustomParameters({ prompt: 'select_account' });

      const cred       = await waitOrThrow(
        mod.signInWithPopup(auth, provider),
        90000,
        'O login com Google demorou demais. Feche a janela do Google e tente novamente.'
      );
      const legacyUser = await hydrateApprovedUserFromFirebase(cred.user && cred.user.email)
        || ensurePrimaryDeveloperLegacyUser(cred.user);

      if (!legacyUser) {
        try { await mod.signOut(auth); } catch (e) {}
        if (findPendingRequestByEmail(cred.user && cred.user.email)) {
          return { success: false, message: 'Seu cadastro ainda esta pendente de aprovacao.' };
        }
        return { success: false, message: 'Sua conta Google ainda nao possui acesso liberado. Solicite cadastro primeiro.' };
      }

      const session = syncLegacySession(legacyUser, cred.user);
      saveLegacyProfile(cred.user, legacyUser).catch(function() {});
      _startActivityTracking();
      syncClaimsInBackground();
      return { success: true, user: session };

    } catch (e) {
      const code = String(e && e.code || '');
      const detail = String((e && (e.message || e.customData?._tokenResponse?.error?.message)) || '').trim();
      console.error('[AuthService] Falha no login Google:', { code, detail, error: e });
      if (code === 'auth/popup-blocked')         return { success: false, message: 'Popup bloqueado. Permita popups e tente novamente.' };
      if (code === 'auth/popup-closed-by-user')  return { success: false, message: 'Popup fechado antes de concluir o login.' };
      if (code === 'auth/cancelled-popup-request') return { success: false, message: 'O login anterior ainda estava aberto. Feche o popup e tente novamente.' };
      if (code === 'auth/operation-not-allowed') return { success: false, message: 'Login com Google nao habilitado no Firebase.' };
      if (code === 'auth/unauthorized-domain')   return { success: false, message: 'Dominio nao autorizado no Firebase.' };
      if (code === 'auth/network-request-failed') return { success: false, message: 'Falha de rede ao entrar com Google. Verifique a internet e tente novamente.' };
      if (code === 'auth/internal-error') return { success: false, message: 'Falha interna no Google Auth. Atualize a pagina e tente novamente.' };
      if (code === 'auth/timeout') return { success: false, message: e.message || 'O login com Google demorou demais. Tente novamente.' };
      return { success: false, message: code ? ('Falha ao entrar com Google: ' + code) : 'Falha ao entrar com Google.' };
    }
  }

  // Public: signup (access request -- Firebase optional)
  async function signup(email, password, extra) {
    const nome               = String((extra && (extra.nome || extra.name)) || '').trim();
    const telefone           = String((extra && (extra.telefone || extra.phone)) || '').trim();
    const lavanderiaSolicitada = String((extra && (extra.nomeLavanderia || extra.lavanderiaSolicitada)) || '').trim();
    const normEmail          = normalizeEmail(email);

    if (!nome || !normEmail || !String(password || '').trim()) {
      return { success: false, message: 'Preencha nome, e-mail e senha para solicitar acesso.' };
    }
    if (findLegacyUserByEmail(normEmail)) {
      return { success: false, message: 'Este e-mail ja esta cadastrado. Faca login para continuar.' };
    }
    if (findPendingRequestByEmail(normEmail)) {
      return { success: false, message: 'Ja existe uma solicitacao pendente para este e-mail.' };
    }

    try {
      const solicitacao = createPendingAccessRequest({ nome, email: normEmail, telefone, lavanderiaSolicitada, senha: password });
      const cloudSaved = await waitWithTimeout(savePendingAccessRequestToCloud(solicitacao), 8000, false);
      if (!cloudSaved) {
        removeLocalPendingAccessRequest(solicitacao);
        return {
          success: false,
          message: 'Não foi possível salvar a solicitação na nuvem. Verifique a internet e tente novamente.'
        };
      }
      await waitWithTimeout(_provisionFirebaseForSignup(normEmail, password, nome), 8000, null);
      return { success: true, message: 'Solicitacao enviada com sucesso. Aguarde a aprovacao do administrador.' };
    } catch (e) {
      return { success: false, message: (e && e.message) || 'Nao foi possivel enviar a solicitacao.' };
    }
  }

  // Public: requestAccessWithGoogle
  async function requestAccessWithGoogle(extra) {
    const auth = await waitForFirebaseAuth();
    if (!auth) {
      return { success: false, message: 'Solicitacao com Google indisponivel. Verifique sua conexao com a internet.' };
    }

    var mod = null;
    try {
      mod            = await loadAuthModule();
      const provider = new mod.GoogleAuthProvider();
      if (provider.setCustomParameters) provider.setCustomParameters({ prompt: 'select_account' });

      const cred     = await mod.signInWithPopup(auth, provider);
      const email    = normalizeEmail(cred.user && cred.user.email);
      const nome     = String((cred.user && cred.user.displayName) || (email ? email.split('@')[0] : 'Usuario')).trim();
      const telefone           = String((extra && (extra.telefone || extra.phone)) || '').trim();
      const lavanderiaSolicitada = String((extra && (extra.lavanderiaSolicitada || extra.nomeLavanderia)) || '').trim();

      if (!email) throw new Error('Nao foi possivel obter o e-mail da sua conta Google.');

      if (findLegacyApprovedUserByEmail(email)) {
        try { await mod.signOut(auth); } catch (e) {}
        clearSession(); clearLegacyCurrentUser();
        return { success: false, message: 'Este e-mail ja possui acesso aprovado. Use Entrar com Google na tela de login.' };
      }
      if (findPendingRequestByEmail(email)) {
        try { await mod.signOut(auth); } catch (e) {}
        clearSession(); clearLegacyCurrentUser();
        return { success: false, message: 'Ja existe uma solicitacao pendente para este e-mail.' };
      }

      const solicitacao = createPendingAccessRequest({ nome, email, telefone, lavanderiaSolicitada, senha: '' });
      const cloudSaved = await waitWithTimeout(savePendingAccessRequestToCloud(solicitacao), 8000, false);
      if (!cloudSaved) {
        removeLocalPendingAccessRequest(solicitacao);
        try { await mod.signOut(auth); } catch (e) {}
        clearSession(); clearLegacyCurrentUser();
        return {
          success: false,
          message: 'Não foi possível salvar a solicitação na nuvem. Verifique a internet e tente novamente.'
        };
      }
      try { await mod.signOut(auth); } catch (e) {}
      clearSession(); clearLegacyCurrentUser();
      return { success: true, message: 'Solicitacao com Google enviada com sucesso. Aguarde a aprovacao do administrador.' };

    } catch (e) {
      if (auth && mod) { try { await mod.signOut(auth); } catch (se) {} }
      clearSession(); clearLegacyCurrentUser();
      const code = String(e && e.code || '');
      if (code === 'auth/popup-blocked')         return { success: false, message: 'Popup bloqueado. Permita popups e tente novamente.' };
      if (code === 'auth/popup-closed-by-user')  return { success: false, message: 'Popup fechado antes de concluir a solicitacao.' };
      if (code === 'auth/operation-not-allowed') return { success: false, message: 'Google nao esta habilitado no Firebase Auth.' };
      if (code === 'auth/unauthorized-domain')   return { success: false, message: 'Dominio nao autorizado no Firebase.' };
      return { success: false, message: (e && e.message) || 'Nao foi possivel solicitar acesso com Google.' };
    }
  }

  // Public: resetPassword
  async function resetPassword(email) {
    const normEmail = normalizeEmail(email);
    if (!normEmail) return { success: false, message: 'Informe um e-mail valido.' };

    const auth = await waitForFirebaseAuth();
    if (!auth) {
      return { success: false, message: 'Recuperacao por e-mail indisponivel. Verifique sua conexao com a internet.' };
    }

    try {
      const mod        = await loadAuthModule();
      const legacyUser = findLegacyUserByEmail(normEmail);

      try {
        await mod.sendPasswordResetEmail(auth, normEmail);
        return { success: true, message: 'Enviamos um link de redefinicao. Verifique sua caixa de entrada e tambem o spam.' };
      } catch (resetErr) {
        const code = String(resetErr && resetErr.code || '');

        if (code === 'auth/user-not-found') {
          const legacyPlainPassword = (legacyUser && typeof legacyUser.senha === 'string') ? legacyUser.senha : '';
          if (legacyUser && legacyPlainPassword) {
            try {
              const cred = await mod.createUserWithEmailAndPassword(auth, normEmail, legacyPlainPassword);
              if (legacyUser.nome) { try { await mod.updateProfile(cred.user, { displayName: legacyUser.nome }); } catch (e) {} }
              await saveUserProfile({
                uid: cred.user.uid, name: legacyUser.nome || '', email: normEmail,
                role: mapLegacyTipoAcessoToRole(legacyUser.tipoAcesso),
                active: legacyUser.aprovado !== false,
                createdAt: legacyUser.criadoEm || new Date().toISOString()
              });
              await mod.sendPasswordResetEmail(auth, normEmail);
              try { await mod.signOut(auth); } catch (e) {}
              return { success: true, message: 'Enviamos um link de redefinicao. Verifique sua caixa de entrada e tambem o spam.' };
            } catch (provisionErr) {
              const pCode = String(provisionErr && provisionErr.code || '');
              if (pCode === 'auth/email-already-in-use') {
                try {
                  await mod.sendPasswordResetEmail(auth, normEmail);
                  return { success: true, message: 'Enviamos um link de redefinicao. Verifique sua caixa de entrada e tambem o spam.' };
                } catch (e) {}
              }
            }
          }

          if (findPendingRequestByEmail(normEmail)) {
            return { success: false, message: 'Sua solicitacao ainda esta pendente de aprovacao.' };
          }
          if (!legacyUser) {
            return { success: false, message: 'Nenhuma conta encontrada com este e-mail.' };
          }
          return { success: false, message: 'Conta encontrada mas ainda nao vinculada ao sistema de recuperacao. Contate o administrador.' };
        }

        throw resetErr;
      }
    } catch (e) {
      const code = String(e && e.code || '');
      if (code === 'auth/invalid-email')     return { success: false, message: 'Informe um e-mail valido.' };
      if (code === 'auth/too-many-requests') return { success: false, message: 'Muitas tentativas. Aguarde e tente novamente.' };
      return { success: false, message: 'Nao foi possivel processar a redefinicao de senha.' };
    }
  }

  // Public: register (admin tool)
  async function register(userData) {
    const payload  = userData || {};
    const name     = String(payload.name     || '').trim();
    const email    = String(payload.email    || '').trim();
    const password = String(payload.password || '').trim();
    const roleInput = String(payload.role    || 'visualizador').trim();
    const role     = isDevEmail(email) ? 'developer' : (ROLES[roleInput] ? roleInput : 'visualizador');

    if (!name || !email || !password) return { success: false, message: 'Dados invalidos.' };

    const auth = getFirebaseAuth();
    if (auth) {
      try {
        const mod  = await loadAuthModule();
        const cred = await mod.createUserWithEmailAndPassword(auth, email, password);
        if (name) { try { await mod.updateProfile(cred.user, { displayName: name }); } catch (e) {} }
        await saveUserProfile({ uid: cred.user.uid, name, email, role, active: true, createdAt: new Date().toISOString() });
        try { await mod.signOut(auth); } catch (e) {}
        clearSession();
        return { success: true };
      } catch (e) {
        const code = String(e && e.code || '');
        if (code === 'auth/email-already-in-use') return { success: false, message: 'E-mail ja cadastrado.' };
        if (code === 'auth/weak-password')         return { success: false, message: 'Senha muito fraca.' };
        if (code === 'auth/invalid-email')         return { success: false, message: 'E-mail invalido.' };
        return { success: false, message: 'Erro ao criar conta.' };
      }
    }

    const users = getUsersDB();
    if (users.find(function(u) { return normalizeEmail(u && u.email) === normalizeEmail(email); })) {
      return { success: false, message: 'E-mail ja cadastrado.' };
    }
    users.push({ id: String(Date.now()), uid: '', name, email, password, role, active: true, createdAt: new Date().toISOString() });
    saveUsersDB(users);
    return { success: true };
  }

  async function provisionLegacyUserForCloud(userData, password, options) {
    const legacyUser = normalizeLegacyUser(userData);
    const email = normalizeEmail(legacyUser && legacyUser.email);
    const senha = String(password || '');
    const opts = options || {};

    if (!legacyUser || !email) {
      return { success: false, message: 'Usuario sem e-mail valido para criar login na nuvem.' };
    }

    const allowTemporaryPassword = opts.allowTemporaryPassword === true;
    if ((!senha || senha.length < 6) && !allowTemporaryPassword) {
      return { success: false, message: 'A senha precisa ter no minimo 6 caracteres para funcionar em outros aparelhos.' };
    }

    let secondary = null;
    try {
      await waitWithTimeout(waitForFirebaseAuth(), 5000, null);
      secondary = await createSecondaryAuth();
      if (!secondary || !secondary.auth) {
        return { success: false, message: 'Firebase Auth indisponivel para criar a conta na nuvem.' };
      }

      const { authMod, auth, appMod, app } = secondary;
      let firebaseUser = null;
      let alreadyExists = false;
      const firebasePassword = senha.length >= 6 ? senha : generateFirebaseTemporaryPassword();
      const requiresPasswordReset = firebasePassword !== senha || opts.sendResetAfterCreate === true;

      try {
        const cred = await authMod.createUserWithEmailAndPassword(auth, email, firebasePassword);
        firebaseUser = cred.user;
        if (legacyUser.nome) {
          try { await authMod.updateProfile(firebaseUser, { displayName: legacyUser.nome }); } catch (profileErr) {}
        }
        if (requiresPasswordReset) {
          try { await authMod.sendPasswordResetEmail(auth, email); } catch (resetErr) {}
        }
      } catch (createErr) {
        const code = String(createErr && createErr.code || '');
        if (code === 'auth/email-already-in-use') {
          alreadyExists = true;
          if (opts.sendResetIfExists !== false) {
            try { await authMod.sendPasswordResetEmail(auth, email); } catch (resetErr) {}
          }
        } else if (code === 'auth/weak-password') {
          return { success: false, message: 'Senha muito fraca. Use no minimo 6 caracteres.' };
        } else if (code === 'auth/invalid-email') {
          return { success: false, message: 'E-mail invalido para criar conta na nuvem.' };
        } else {
          return { success: false, message: 'Nao foi possivel criar a conta no Firebase Auth.' };
        }
      }

      if (firebaseUser) {
        await saveLegacyProfile(firebaseUser, legacyUser);
        syncClaimsInBackground();
      }

      return {
        success: true,
        provisioned: Boolean(firebaseUser),
        alreadyExists,
        requiresPasswordReset,
        message: alreadyExists
          ? 'A conta ja existia no Firebase Auth. Se a senha nao entrar em outro aparelho, use redefinicao de senha.'
          : (requiresPasswordReset ? 'Conta criada no Firebase Auth com redefinicao de senha enviada.' : 'Conta criada no Firebase Auth.')
      };
    } catch (e) {
      return { success: false, message: 'Erro ao preparar a conta na nuvem.' };
    } finally {
      if (secondary) {
        try { await secondary.authMod.signOut(secondary.auth); } catch (signOutErr) {}
        try { await secondary.appMod.deleteApp(secondary.app); } catch (deleteErr) {}
      }
    }
  }

  // Public: logout
  async function logout() {
    _clearInactivityTimer();
    try { localStorage.removeItem(SESSION_LAST_ACTIVITY_KEY); } catch (e) {}
    clearSession();
    clearLegacyCurrentUser();
    const auth = getFirebaseAuth();
    if (auth) {
      try { const mod = await loadAuthModule(); await mod.signOut(auth); } catch (e) {}
    }
    window.location.href = './index.html';
  }

  // Public: session/permission helpers
  function getCurrentUser()  { return getSession(); }
  function isAuthenticated() { return !!getCurrentUser(); }
  function whenReady()       { return authReadyPromise; }

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
    // Delegate to UserSystem.verificarPermissao (reads saved permissoes_acesso)
    const us = getUserSystem();
    if (us && typeof us.verificarPermissao === 'function') {
      const page = pageName.replace(/\.html$/, '');
      return us.verificarPermissao(page);
    }
    // Fallback: only configuracoes is restricted (developer only)
    if (pageName.includes('configuracoes') || pageName.includes('Configuracoes')) {
      return user.role === 'developer';
    }
    return true;
  }

  function getAllUsers() { return getUsersDB().map(function(u) { return Object.assign({}, u, { password: '***' }); }); }

  function toggleUserStatus(email) {
    const users = getUsersDB();
    const normEmail = normalizeEmail(email);
    const user  = users.find(function(u) { return normalizeEmail(u && u.email) === normEmail; });
    if (user) { user.active = !user.active; saveUsersDB(users); if (user.uid) saveUserProfile(user); return true; }
    return false;
  }

  function deleteUser(email) {
    const users    = getUsersDB();
    const normEmail = normalizeEmail(email);
    const removed  = users.find(function(u) { return normalizeEmail(u && u.email) === normEmail; }) || null;
    const filtered = users.filter(function(u) { return normalizeEmail(u && u.email) !== normEmail; });
    if (filtered.length !== users.length) {
      saveUsersDB(filtered);
      if (removed && removed.uid && global.FirebaseStore && global.FirebaseStore.isAvailable) {
        global.FirebaseStore.isAvailable().then(function(avail) {
          if (avail) global.FirebaseStore.removeItem(userProfileKey(removed.uid));
        });
      }
      return true;
    }
    return false;
  }

  function updateUserRole(email, newRole) {
    const users = getUsersDB();
    const normEmail = normalizeEmail(email);
    const user  = users.find(function(u) { return normalizeEmail(u && u.email) === normEmail; });
    if (user && ROLES[newRole]) { user.role = newRole; saveUsersDB(users); if (user.uid) saveUserProfile(user); return true; }
    return false;
  }

  // init
  function init() {
    _checkSessionExpiry();
    if (isAuthenticated()) _startActivityTracking();

    if (global.FirebaseStore &&
        typeof global.FirebaseStore.initialized === 'function' &&
        global.FirebaseStore.initialized()) {
      resolveFirebaseAuth();
      setupFirebaseAuth();
      hydrateUsersDbFromFirebase();
      flushPendingRemoteWrites();
    }

    global.addEventListener('firebase:initialized', function() {
      resolveFirebaseAuth();
      setupFirebaseAuth();
      hydrateUsersDbFromFirebase();
      flushPendingRemoteWrites();
    });

    global.addEventListener('firebase:init-error', function() {
      resolveFirebaseAuth();
      markReady();
    });

    setTimeout(function() {
      resolveFirebaseAuth();
      if (!authReady) markReady();
    }, 4000);
  }

  init();

  // Public API
  global.AuthService = {
    login,
    loginWithGoogle,
    signup,
    requestAccessWithGoogle,
    resetPassword,
    logout,
    register,
    provisionLegacyUserForCloud,
    getCurrentUser,
    getSession,
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
