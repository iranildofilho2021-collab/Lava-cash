/**
 * Sistema de Usuários e Permissões - LAVACASH
 * Versão Híbrida: Firebase + localStorage
 *
 * Tipos de Acesso:
 * - desenvolvedor: Acesso total, pode aprovar cadastros e gerenciar lavanderias
 * - admin: Acesso total a uma lavanderia específica
 * - visualizador: Apenas visualiza dados
 */

const UserSystem = {
  PRIMARY_ADMIN_EMAIL: 'iranildofilho2021@gmail.com',
  LEGACY_DEV_EMAIL: 'dev@lavaja.com',
  PASSWORD_HASH_SCHEME: 'irancash-v2',
  ADMIN_BOOTSTRAP_PASSWORD_KEY: 'irancash_admin_bootstrap_password',

  ROLES: {
    DESENVOLVEDOR: 'desenvolvedor',
    ADMIN: 'admin',
    GERENTE: 'gerente',
    VISUALIZADOR: 'visualizador'
  },

  ROLE_LABELS: {
    desenvolvedor: 'Desenvolvedor',
    admin: 'Administrador',
    gerente: 'Administrador',
    visualizador: 'Visualizador'
  },

  ROLE_PERMISSIONS: {
    desenvolvedor: ['all', 'aprovar_cadastros', 'gerenciar_lavanderias', 'configuracoes_sistema'],
    admin: ['receitas', 'despesas', 'analise', 'configuracoes', 'ajuda'],
    gerente: ['receitas', 'despesas', 'analise', 'configuracoes', 'ajuda'],
    visualizador: ['dashboard', 'analise', 'ajuda']
  },

  PAGE_ACCESS_DEFAULTS: {
    visualizador: ['dashboard', 'analise-financeira', 'investimento-inicial', 'ajuda'],
    admin: ['dashboard', 'receitas', 'despesas', 'analise-financeira', 'investimento-inicial', 'ajuda'],
    desenvolvedor: ['all']
  },

  // Flag para verificar se Firebase está disponível
  _useFirebase: false,
  _firebaseReady: false,
  _pendingFirebaseWrites: new Map(),
  _pendingCollectionUnsubscribe: null,

  // Inicializa o sistema
  init() {
    // Verifica se Firebase está disponível
    this._checkFirebase();

    // Inicializa dados locais como fallback
    this._initLocalData();

    // Migra senhas legadas em texto puro para hash+salt
    this.migrarSenhasLegadas();

    // Remove lavanderias padrão legadas para iniciar do zero.
    this._removerLavanderiasPadraoLegadas();

    // Migra conta legada do desenvolvedor para o e-mail principal
    this.migrarContaDevLegada();

    // Migra papéis legados e sincroniza o estado local
    this.migrarTiposAcessoLegados();

    // Corrige permissões antigas salvas no navegador
    this.getPermissoesAcesso();
  },

  _gerarSaltSenha() {
    const fallback = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') {
      return fallback;
    }

    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
  },

  _gerarSenhaTemporariaAdmin() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
    const length = 18;
    let senha = '';

    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(length);
      window.crypto.getRandomValues(bytes);
      for (let i = 0; i < length; i++) {
        senha += chars[bytes[i] % chars.length];
      }
      return senha;
    }

    for (let i = 0; i < length; i++) {
      senha += chars[Math.floor(Math.random() * chars.length)];
    }
    return senha;
  },

  obterSenhaBootstrapAdmin(forceNew = false) {
    if (!forceNew) {
      const existente = localStorage.getItem(this.ADMIN_BOOTSTRAP_PASSWORD_KEY);
      if (existente) {
        return existente;
      }
    }

    const senhaGerada = this._gerarSenhaTemporariaAdmin();
    localStorage.setItem(this.ADMIN_BOOTSTRAP_PASSWORD_KEY, senhaGerada);
    return senhaGerada;
  },

  _hashSenhaComSalt(senha, salt) {
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
  },

  _isSenhaHashObject(value) {
    return Boolean(
      value &&
      typeof value === 'object' &&
      value.scheme === this.PASSWORD_HASH_SCHEME &&
      typeof value.salt === 'string' &&
      typeof value.hash === 'string'
    );
  },

  _buildSenhaStorageValue(senha) {
    const senhaTexto = String(senha || '');
    if (!senhaTexto) {
      return null;
    }

    const salt = this._gerarSaltSenha();
    const hash = this._hashSenhaComSalt(senhaTexto, salt);
    return { scheme: this.PASSWORD_HASH_SCHEME, salt, hash };
  },

  hashPasswordForStorage(senha) {
    return this._buildSenhaStorageValue(senha);
  },

  _normalizarSenhaStorageValue(value) {
    if (this._isSenhaHashObject(value)) {
      return value;
    }

    if (typeof value === 'string') {
      return this._buildSenhaStorageValue(value);
    }

    return null;
  },

  _validarSenhaUsuario(senhaArmazenada, senhaDigitada) {
    const senhaTexto = String(senhaDigitada || '');
    if (!senhaTexto) {
      return false;
    }

    if (this._isSenhaHashObject(senhaArmazenada)) {
      const hashDigitado = this._hashSenhaComSalt(senhaTexto, senhaArmazenada.salt);
      return hashDigitado === senhaArmazenada.hash;
    }

    if (typeof senhaArmazenada === 'string') {
      return senhaArmazenada === senhaTexto;
    }

    return false;
  },

  migrarSenhasLegadas() {
    let usuariosAtualizados = false;
    let pendentesAtualizados = false;

    const usuarios = this._getUsuariosStorage();
    const usuariosMigrados = usuarios.map(usuario => {
      const senhaNormalizada = this._normalizarSenhaStorageValue(usuario?.senha);
      if (!senhaNormalizada || this._isSenhaHashObject(usuario?.senha)) {
        return usuario;
      }
      usuariosAtualizados = true;
      return { ...usuario, senha: senhaNormalizada };
    });

    if (usuariosAtualizados) {
      this._saveUsuarios(usuariosMigrados);
    }

    try {
      const pendentes = JSON.parse(localStorage.getItem('cadastros_pendentes') || '[]');
      const pendentesMigrados = (Array.isArray(pendentes) ? pendentes : []).map(item => {
        const senhaNormalizada = this._normalizarSenhaStorageValue(item?.senha);
        if (!senhaNormalizada || this._isSenhaHashObject(item?.senha)) {
          return item;
        }
        pendentesAtualizados = true;
        return { ...item, senha: senhaNormalizada };
      });

      if (pendentesAtualizados) {
        localStorage.setItem('cadastros_pendentes', JSON.stringify(pendentesMigrados));
        this._saveToFirebase('cadastros_pendentes', pendentesMigrados);
      }
    } catch (error) {
      console.warn('[UserSystem] Não foi possível migrar senhas dos cadastros pendentes.', error);
    }

    return usuariosAtualizados || pendentesAtualizados;
  },

  _removerLavanderiasPadraoLegadas() {
    const lavanderias = this._readLocalJSON('lavanderias_lavaja', []);
    const idsLegados = new Set([
      'default',
      'lav1',
      'lav2',
      'lav_1776044865071',
      'lav_1776044912751'
    ]);
    const nomesLegados = new Set(['IRANCASH Centro', 'IRANCASH Shopping']);
    const idsRemovidos = new Set();

    const filtradas = lavanderias.filter(lavanderia => {
      const id = String(lavanderia?.id || '');
      const nome = String(lavanderia?.nome || '');
      const importadaTemporaria = /^Lavanderia importada\s*\(/i.test(nome);
      const remover = idsLegados.has(id) || nomesLegados.has(nome) || importadaTemporaria;
      if (remover) idsRemovidos.add(id);
      return !remover;
    });

    if (filtradas.length === lavanderias.length) {
      return;
    }

    // Esta limpeza trata apenas o cache do navegador. Nao usa _saveLavanderias
    // para impedir que uma lista local antiga volte a criar cadastros apagados
    // no Supabase antes da primeira sincronizacao da sessao.
    this._writeLocalJSON('lavanderias_lavaja', filtradas);
    localStorage.removeItem('lavanderiaSelecionada');

    const usuariosAtualizados = this._getUsuariosStorage().map(usuario => {
      const lavanderiasUsuario = Array.isArray(usuario?.lavanderias) ? usuario.lavanderias : [];
      if (lavanderiasUsuario.includes('all')) {
        return usuario;
      }

      const filtradasUsuario = lavanderiasUsuario.filter(lavanderiaId => {
        const id = String(lavanderiaId || '');
        return !idsLegados.has(id) && !idsRemovidos.has(id);
      });
      if (filtradasUsuario.length === lavanderiasUsuario.length) {
        return usuario;
      }

      return { ...usuario, lavanderias: filtradasUsuario };
    });

    this._saveUsuarios(usuariosAtualizados);

    const currentUser = this.getCurrentUser();
    if (currentUser?.id) {
      const atualizado = usuariosAtualizados.find(user => user.id === currentUser.id);
      if (atualizado) {
        localStorage.setItem('currentUser', JSON.stringify(atualizado));
      }
    }
  },

  normalizarTipoAcesso(tipoAcesso) {
    const tipoNormalizado = String(tipoAcesso || '').trim().toLowerCase();

    if ([
      this.ROLES.ADMIN,
      this.ROLES.GERENTE,
      'administrador',
      'administrator',
      'adm',
      'cadastrador',
      'gestor',
      'manager'
    ].includes(tipoNormalizado)) {
      return this.ROLES.ADMIN;
    }

    if ([
      this.ROLES.DESENVOLVEDOR,
      'developer',
      'dev',
      'desenvolvimento'
    ].includes(tipoNormalizado)) {
      return this.ROLES.DESENVOLVEDOR;
    }

    if ([
      this.ROLES.VISUALIZADOR,
      'viewer',
      'leitor',
      'consulta',
      'readonly',
      'read-only'
    ].includes(tipoNormalizado)) {
      return this.ROLES.VISUALIZADOR;
    }

    return tipoNormalizado || this.ROLES.VISUALIZADOR;
  },

  _rankTipoAcesso(tipoAcesso) {
    const tipoNormalizado = this.normalizarTipoAcesso(tipoAcesso);
    if (tipoNormalizado === this.ROLES.DESENVOLVEDOR) return 3;
    if (tipoNormalizado === this.ROLES.ADMIN) return 2;
    if (tipoNormalizado === this.ROLES.VISUALIZADOR) return 1;
    return 0;
  },

  _contarLavanderiasUsuario(user) {
    if (!Array.isArray(user?.lavanderias)) return 0;
    if (user.lavanderias.includes('all')) return Number.MAX_SAFE_INTEGER;
    return user.lavanderias.filter(Boolean).length;
  },

  _escolherUsuarioPreferencial(usuarioAtual, usuarioCandidato) {
    const atual = this.normalizarUsuario(usuarioAtual);
    const candidato = this.normalizarUsuario(usuarioCandidato);

    if (!atual) return candidato;
    if (!candidato) return atual;

    const rankAtual = this._rankTipoAcesso(atual.tipoAcesso || atual.role);
    const rankCandidato = this._rankTipoAcesso(candidato.tipoAcesso || candidato.role);
    if (rankCandidato !== rankAtual) {
      return rankCandidato > rankAtual ? candidato : atual;
    }

    const aprovadoAtual = atual.aprovado === true || atual.aprovado === 1 || atual.active === true;
    const aprovadoCandidato = candidato.aprovado === true || candidato.aprovado === 1 || candidato.active === true;
    if (aprovadoCandidato !== aprovadoAtual) {
      return aprovadoCandidato ? candidato : atual;
    }

    const lavanderiasAtual = this._contarLavanderiasUsuario(atual);
    const lavanderiasCandidato = this._contarLavanderiasUsuario(candidato);
    if (lavanderiasCandidato !== lavanderiasAtual) {
      return lavanderiasCandidato > lavanderiasAtual ? candidato : atual;
    }

    return candidato;
  },

  normalizarUsuario(user) {
    if (!user || typeof user !== 'object') {
      return user;
    }

    const tipoAcesso = this.normalizarTipoAcesso(user.tipoAcesso || user.role);
    return tipoAcesso === user.tipoAcesso ? user : { ...user, tipoAcesso };
  },

  sanitizarUsuarioPublico(user) {
    const normalizado = this.normalizarUsuario(user);
    if (!normalizado || typeof normalizado !== 'object') {
      return null;
    }

    return {
      id: normalizado.id || '',
      uid: normalizado.uid || '',
      nome: normalizado.nome || normalizado.name || '',
      email: normalizado.email || '',
      telefone: normalizado.telefone || '',
      tipoAcesso: this.normalizarTipoAcesso(normalizado.tipoAcesso || normalizado.role),
      role: normalizado.role || '',
      lavanderias: Array.isArray(normalizado.lavanderias) ? [...normalizado.lavanderias] : [],
      aprovado: normalizado.aprovado === true || normalizado.aprovado === 1,
      active: normalizado.active !== false,
      googleOnly: Boolean(normalizado.googleOnly),
      criadoEm: normalizado.criadoEm || normalizado.createdAt || '',
      aprovadoEm: normalizado.aprovadoEm || ''
    };
  },

  sanitizarUsuariosPublicos(usuarios = []) {
    return this._normalizarColecao(Array.isArray(usuarios) ? usuarios : [], {
      normalize: this.sanitizarUsuarioPublico,
      getKey: user => this._normalizarEmail(user?.email) || user?.id,
      resolveDuplicate: this._escolherUsuarioPreferencial
    });
  },

  normalizarSociosLavanderia(socios = []) {
    if (!Array.isArray(socios)) {
      return [];
    }

    return socios
      .map((socio, index) => {
        if (!socio || typeof socio !== 'object') {
          return null;
        }

        const percentualRateio = Number.parseFloat(String(socio.percentualRateio ?? socio.percentual ?? 0).replace(',', '.'));
        const percentualInvestido = Number.parseFloat(String(socio.percentualInvestido ?? socio.percentualInvestimento ?? socio.percentual ?? 0).replace(',', '.'));
        const userId = socio.userId || socio.usuarioId || '';

        if (!userId) {
          return null;
        }

        return {
          id: socio.id || `soc_${userId}_${index}`,
          userId,
          nome: socio.nome || socio.userName || '',
          email: socio.email || socio.userEmail || '',
          percentual: Number.isFinite(percentualRateio) ? Math.max(0, Math.min(percentualRateio, 100)) : 0,
          percentualRateio: Number.isFinite(percentualRateio) ? Math.max(0, Math.min(percentualRateio, 100)) : 0,
          percentualInvestido: Number.isFinite(percentualInvestido) ? Math.max(0, Math.min(percentualInvestido, 100)) : 0,
          observacoes: socio.observacoes || '',
          criadoEm: socio.criadoEm || new Date().toISOString()
        };
      })
      .filter(Boolean);
  },

  normalizarLavanderia(lavanderia) {
    if (!lavanderia || typeof lavanderia !== 'object') {
      return lavanderia;
    }

    const socios = this.normalizarSociosLavanderia(lavanderia.socios);
    const normalizada = { ...lavanderia, socios };

    return JSON.stringify(normalizada) === JSON.stringify(lavanderia) ? lavanderia : normalizada;
  },

  _readLocalJSON(key, fallback = []) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
      return parsed ?? fallback;
    } catch (error) {
      console.warn(`[UserSystem] Nao foi possivel ler ${key} do localStorage.`, error);
      return fallback;
    }
  },

  _writeLocalJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  },

  _serializeForCompare(value) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return '';
    }
  },

  _mergeCollections(localItems = [], remoteItems = [], options = {}) {
    const normalize = typeof options.normalize === 'function' ? options.normalize : (item => item);
    const getKey = typeof options.getKey === 'function'
      ? options.getKey
      : (item => item?.id || '');
    const preferRemote = options.preferRemote === true;
    const resolveDuplicate = typeof options.resolveDuplicate === 'function' ? options.resolveDuplicate : null;
    const merged = new Map();

    const addItems = (items) => {
      (Array.isArray(items) ? items : []).forEach(item => {
        const normalized = normalize.call(this, item);
        if (!normalized || typeof normalized !== 'object') return;

        const key = String(getKey.call(this, normalized) || '').trim();
        if (!key) return;

        if (resolveDuplicate && merged.has(key)) {
          merged.set(key, resolveDuplicate.call(this, merged.get(key), normalized));
        } else {
          merged.set(key, normalized);
        }
      });
    };

    if (preferRemote) {
      addItems(localItems);
      addItems(remoteItems);
    } else {
      addItems(remoteItems);
      addItems(localItems);
    }

    return Array.from(merged.values());
  },

  _normalizarColecao(items = [], options = {}) {
    const normalize = typeof options.normalize === 'function' ? options.normalize : (item => item);
    const getKey = typeof options.getKey === 'function'
      ? options.getKey
      : (item => item?.id || '');
    const resolveDuplicate = typeof options.resolveDuplicate === 'function' ? options.resolveDuplicate : null;
    const normalizedItems = (Array.isArray(items) ? items : [])
      .map(item => normalize.call(this, item))
      .filter(item => item && typeof item === 'object');

    if (!resolveDuplicate) {
      return normalizedItems;
    }

    const merged = new Map();
    normalizedItems.forEach(item => {
      const key = String(getKey.call(this, item) || '').trim();
      if (!key) return;

      if (merged.has(key)) {
        merged.set(key, resolveDuplicate.call(this, merged.get(key), item));
      } else {
        merged.set(key, item);
      }
    });

    return Array.from(merged.values());
  },

  async _syncCloudCollectionDirect(key, options = {}, canWriteRemote = false) {
    const remoteValue = await window.FirebaseStore.getItem(key, null);
    if (remoteValue !== null && remoteValue !== undefined) {
      const remoteNormalized = this._normalizarColecao(remoteValue, options);
      const localNormalized = this._normalizarColecao(this._readLocalJSON(key, []), options);
      const shouldMergeLocalUsers = canWriteRemote
        && ['usuarios_lavaja', 'usuarios_lavaja_public'].includes(String(key || ''))
        && Array.isArray(localNormalized)
        && localNormalized.length > 0;
      const nextNormalized = shouldMergeLocalUsers
        ? this._normalizarColecao([...remoteNormalized, ...localNormalized], options)
        : remoteNormalized;

      this._writeLocalJSON(key, nextNormalized);
      this._pendingFirebaseWrites.delete(key);

      if (canWriteRemote && this._serializeForCompare(nextNormalized) !== this._serializeForCompare(remoteValue || [])) {
        await window.FirebaseStore.setItem(key, nextNormalized);
      }

      return nextNormalized;
    }

    const localNormalized = this._normalizarColecao(this._readLocalJSON(key, []), options);
    this._writeLocalJSON(key, localNormalized);
    if (canWriteRemote) {
      await window.FirebaseStore.setItem(key, localNormalized);
    }
    return localNormalized;
  },

  _normalizarCadastroPendente(item) {
    if (!item || typeof item !== 'object') return null;
    const email = this._normalizarEmail(item.email);
    const id = String(item.id || (email ? `sol_${email.replace(/[^a-z0-9]/g, '_')}` : '')).trim();
    const nome = String(item.nome || item.name || '').trim();

    if (!id || !email || !nome) return null;

    return {
      ...item,
      id,
      nome,
      email,
      telefone: String(item.telefone || item.phone || '').trim(),
      lavanderiaSolicitada: String(item.lavanderiaSolicitada || item.nomeLavanderia || '').trim(),
      status: item.status || 'pendente',
      dataRegistro: item.dataRegistro || item.createdAt || new Date().toISOString()
    };
  },

  _escolherCadastroPendentePreferencial(atual, candidato) {
    const atualTs = Date.parse(atual?.dataRegistro || atual?.createdAt || '') || 0;
    const candidatoTs = Date.parse(candidato?.dataRegistro || candidato?.createdAt || '') || 0;
    const base = candidatoTs >= atualTs ? candidato : atual;
    const anterior = base === candidato ? atual : candidato;

    return {
      ...anterior,
      ...base,
      senha: base?.senha || anterior?.senha || null,
      telefone: base?.telefone || anterior?.telefone || '',
      lavanderiaSolicitada: base?.lavanderiaSolicitada || anterior?.lavanderiaSolicitada || ''
    };
  },

  _mergeCadastrosPendentes(...fontes) {
    const itens = fontes.flatMap(fonte => Array.isArray(fonte) ? fonte : []);
    const normalizados = this._normalizarColecao(itens, {
      normalize: this._normalizarCadastroPendente,
      getKey: item => this._normalizarEmail(item?.email) || item?.id,
      resolveDuplicate: this._escolherCadastroPendentePreferencial
    });

    this._writeLocalJSON('cadastros_pendentes', normalizados);
    return normalizados;
  },

  async _syncPendingAccessRequestsFromCollection() {
    if (!this.isDeveloper() ||
        !window.FirebaseStore ||
        typeof window.FirebaseStore.getPendingAccessRequests !== 'function') {
      return this.getCadastrosPendentes();
    }

    try {
      const remotos = await window.FirebaseStore.getPendingAccessRequests();
      const locais = this._readLocalJSON('cadastros_pendentes', []);
      const mesclados = this._mergeCadastrosPendentes(locais, remotos);
      this._pendingFirebaseWrites.delete('cadastros_pendentes');

      try {
        await window.FirebaseStore.setItem('cadastros_pendentes', mesclados);
      } catch (error) {
        console.warn('[UserSystem] Não foi possível espelhar pendentes em data/cadastros_pendentes:', error);
      }

      this._setupPendingAccessRequestsSubscription();
      return mesclados;
    } catch (error) {
      console.warn('[UserSystem] Não foi possível ler cadastros pendentes da coleção pública:', error);
      return this.getCadastrosPendentes();
    }
  },

  _setupPendingAccessRequestsSubscription() {
    if (this._pendingCollectionUnsubscribe ||
        !this.isDeveloper() ||
        !window.FirebaseStore ||
        typeof window.FirebaseStore.subscribePendingAccessRequests !== 'function') {
      return;
    }

    this._pendingCollectionUnsubscribe = window.FirebaseStore.subscribePendingAccessRequests(async remotos => {
      const locais = this._readLocalJSON('cadastros_pendentes', []);
      const mesclados = this._mergeCadastrosPendentes(locais, remotos);

      try {
        await window.FirebaseStore.setItem('cadastros_pendentes', mesclados);
      } catch (error) {
        console.warn('[UserSystem] Não foi possível atualizar espelho de pendentes:', error);
      }

      this._emitUpdated('pending-requests');
    });
  },

  async _savePendingAccessRequestToCollection(solicitacao) {
    if (!window.FirebaseStore || typeof window.FirebaseStore.addPendingAccessRequest !== 'function') {
      return false;
    }

    try {
      await window.FirebaseStore.addPendingAccessRequest(solicitacao);
      return true;
    } catch (error) {
      console.warn('[UserSystem] Não foi possível salvar cadastro pendente na coleção pública:', error);
      return false;
    }
  },

  async _removePendingAccessRequestFromCollection(solicitacao) {
    if (!solicitacao || !window.FirebaseStore || typeof window.FirebaseStore.removePendingAccessRequest !== 'function') {
      return false;
    }

    try {
      await window.FirebaseStore.removePendingAccessRequest(solicitacao.id);
      return true;
    } catch (error) {
      console.warn('[UserSystem] Não foi possível remover cadastro pendente da coleção pública:', error);
      return false;
    }
  },

  async _syncCloudCollection(key, options = {}, remoteKeys = []) {
    const pendingValue = this._pendingFirebaseWrites.get(key);
    const hasPending = this._pendingFirebaseWrites.has(key);
    const hasRemote = Array.isArray(remoteKeys) ? remoteKeys.includes(key) : false;
    const localValue = this._readLocalJSON(key, []);

    if (hasRemote) {
      const remoteValue = await window.FirebaseStore.getItem(key, []);
      const remoteNormalized = this._normalizarColecao(remoteValue, options);
      this._writeLocalJSON(key, remoteNormalized);
      this._pendingFirebaseWrites.delete(key);

      if (this._serializeForCompare(remoteNormalized) !== this._serializeForCompare(remoteValue || [])) {
        await window.FirebaseStore.setItem(key, remoteNormalized);
      }

      return remoteNormalized;
    }

    if (hasPending) {
      const pendingNormalized = this._normalizarColecao(pendingValue, options);
      this._writeLocalJSON(key, pendingNormalized);
      await window.FirebaseStore.setItem(key, pendingNormalized);
      this._pendingFirebaseWrites.delete(key);
      return pendingNormalized;
    }

    const localNormalized = this._normalizarColecao(localValue, options);
    this._writeLocalJSON(key, localNormalized);
    await window.FirebaseStore.setItem(key, localNormalized);
    return localNormalized;
  },

  _getUsuariosStorage() {
    let usuarios = [];

    try {
      usuarios = JSON.parse(localStorage.getItem('usuarios_lavaja') || '[]');
    } catch (error) {
      console.warn('[UserSystem] Não foi possível ler usuários do localStorage.', error);
      return [];
    }

    const normalizados = usuarios.map(user => this.normalizarUsuario(user));

    if (JSON.stringify(usuarios) !== JSON.stringify(normalizados)) {
      localStorage.setItem('usuarios_lavaja', JSON.stringify(normalizados));
      if (this.isDeveloper()) {
        this._saveToFirebase('usuarios_lavaja', normalizados);
      }
      this._saveUsuariosPublicos(normalizados);
    }

    return normalizados;
  },

  _getUsuariosPublicosStorage() {
    const publicos = this._readLocalJSON('usuarios_lavaja_public', []);
    if (Array.isArray(publicos) && publicos.length) {
      return this.sanitizarUsuariosPublicos(publicos);
    }

    return this.sanitizarUsuariosPublicos(this._getUsuariosStorage());
  },

  getUsuariosPublicos() {
    return this._getUsuariosPublicosStorage();
  },

  _syncUserAccessDocs(usuarios = []) {
    if (!this.isDeveloper()) return;
    if (!window.FirebaseStore || typeof window.FirebaseStore.syncUserAccessDocs !== 'function') return;

    const publicos = this.sanitizarUsuariosPublicos(usuarios);
    window.FirebaseStore.isAvailable()
      .then(available => {
        if (!available) return null;
        return window.FirebaseStore.syncUserAccessDocs(publicos);
      })
      .catch(error => {
        console.warn('[UserSystem] NÃ£o foi possÃ­vel sincronizar acessos por usuÃ¡rio:', error);
      });
  },

  _saveUsuariosPublicos(usuarios, syncRemote = true) {
    const publicos = this.sanitizarUsuariosPublicos(usuarios);
    localStorage.setItem('usuarios_lavaja_public', JSON.stringify(publicos));
    if (syncRemote && this.isDeveloper()) {
      this._saveToFirebase('usuarios_lavaja_public', publicos);
      this._syncUserAccessDocs(publicos);
    }
    return publicos;
  },

  _saveUsuarios(usuarios) {
    const normalizados = usuarios.map(user => this.normalizarUsuario(user));
    localStorage.setItem('usuarios_lavaja', JSON.stringify(normalizados));
    if (this.isDeveloper()) {
      this._saveToFirebase('usuarios_lavaja', normalizados);
    }
    this._saveUsuariosPublicos(normalizados);
    return normalizados;
  },

  _saveLavanderias(lavanderias) {
    const normalizadas = lavanderias.map(lavanderia => this.normalizarLavanderia(lavanderia));
    localStorage.setItem('lavanderias_lavaja', JSON.stringify(normalizadas));
    this._saveToFirebase('lavanderias_lavaja', normalizadas);
    return normalizadas;
  },

  migrarTiposAcessoLegados() {
    let usuariosAtualizados = false;
    let currentUserAtualizado = false;

    try {
      const usuarios = JSON.parse(localStorage.getItem('usuarios_lavaja') || '[]');
      const usuariosNormalizados = usuarios.map(user => {
        const normalizado = this.normalizarUsuario(user);
        if (normalizado?.tipoAcesso !== user?.tipoAcesso) {
          usuariosAtualizados = true;
        }
        return normalizado;
      });

      if (usuariosAtualizados) {
        localStorage.setItem('usuarios_lavaja', JSON.stringify(usuariosNormalizados));
        if (this.isDeveloper()) {
          this._saveToFirebase('usuarios_lavaja', usuariosNormalizados);
        }
        this._saveUsuariosPublicos(usuariosNormalizados);
      }
    } catch (error) {
      console.warn('[UserSystem] Não foi possível migrar usuários legados.', error);
    }

    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
      const userNormalizado = this.normalizarUsuario(currentUser);

      if (userNormalizado && userNormalizado.tipoAcesso !== currentUser?.tipoAcesso) {
        localStorage.setItem('currentUser', JSON.stringify(userNormalizado));
        currentUserAtualizado = true;
      }
    } catch (error) {
      console.warn('[UserSystem] Não foi possível migrar o usuário atual.', error);
    }

    return usuariosAtualizados || currentUserAtualizado;
  },

  // Verifica se Firebase está disponível
  _checkFirebase() {
    if (window.FirebaseStore && typeof window.FirebaseStore.isAvailable === 'function') {
      window.FirebaseStore.isAvailable().then(async available => {
        this._useFirebase = available;
        this._firebaseReady = available;
        if (available) {
          console.log('[UserSystem] Firebase disponível - usando sincronização na nuvem');
          await this._syncFromFirebase();
          await this._flushPendingFirebaseWrites();
        }
      });
    }

    // Aguarda evento de inicialização do Firebase
    window.addEventListener('firebase:initialized', async () => {
      this._useFirebase = true;
      this._firebaseReady = true;
      console.log('[UserSystem] Firebase inicializado');
      await this._syncFromFirebase();
      await this._flushPendingFirebaseWrites();
    });

    window.addEventListener('firebase:auth-user', async () => {
      this._useFirebase = true;
      this._firebaseReady = true;
      await this._syncFromFirebase();
      await this._flushPendingFirebaseWrites();
    });
  },

  _emitUpdated(source = 'local') {
    try {
      window.dispatchEvent(new CustomEvent('usersystem:updated', {
        detail: { source }
      }));
    } catch (error) {}
  },

  _hasFirebaseAuthUser() {
    try {
      const auth = window.FirebaseStore && typeof window.FirebaseStore.getAuth === 'function'
        ? window.FirebaseStore.getAuth()
        : null;
      return Boolean(auth && auth.currentUser && localStorage.getItem('currentUser'));
    } catch (error) {
      return false;
    }
  },

  async _flushPendingFirebaseWrites() {
    if (!this._firebaseReady || !window.FirebaseStore) {
      return;
    }

    if (!this._hasFirebaseAuthUser()) {
      return;
    }

    const pendentes = Array.from(this._pendingFirebaseWrites.entries());
    for (const [key, value] of pendentes) {
      if (this._isPrivateUsersKey(key) && !this.isDeveloper()) {
        this._pendingFirebaseWrites.delete(key);
        continue;
      }

      try {
        await window.FirebaseStore.setItem(key, value);
        this._pendingFirebaseWrites.delete(key);
        console.log(`[UserSystem] Pendência sincronizada no Firebase: ${key}`);
      } catch (error) {
        console.error(`[UserSystem] Erro ao sincronizar pendência ${key}:`, error);
      }
    }
  },

  // Sincroniza dados do Firebase para localStorage
  async _syncFromFirebase() {
    if (!window.FirebaseStore || !this._hasFirebaseAuthUser()) return;

    try {
      if (this.isDeveloper()) {
        const usuariosPrivados = await this._syncCloudCollectionDirect('usuarios_lavaja', {
          normalize: this.normalizarUsuario,
          getKey: user => this._normalizarEmail(user?.email) || user?.id,
          resolveDuplicate: this._escolherUsuarioPreferencial
        }, true);
        this._saveUsuariosPublicos(usuariosPrivados);
      } else {
        const usuariosPublicos = await this._syncCloudCollectionDirect('usuarios_lavaja_public', {
          normalize: this.sanitizarUsuarioPublico,
          getKey: user => this._normalizarEmail(user?.email) || user?.id,
          resolveDuplicate: this._escolherUsuarioPreferencial
        }, false);
        this._writeLocalJSON('usuarios_lavaja_public', this.sanitizarUsuariosPublicos(usuariosPublicos));
      }

      await this._syncCloudCollectionDirect('lavanderias_lavaja', {
        normalize: this.normalizarLavanderia,
        getKey: lavanderia => lavanderia?.id
      }, this.isDeveloper());

      if (this.isDeveloper()) {
        await this._syncCloudCollectionDirect('cadastros_pendentes', {
          getKey: item => item?.id || this._normalizarEmail(item?.email)
        }, true);
        await this._syncPendingAccessRequestsFromCollection();

        const permissoesPendentes = this._pendingFirebaseWrites.get('permissoes_acesso');
        const permissoesLocais = this.getPermissoesAcesso();
        const permissoesRemotas = await window.FirebaseStore.getItem('permissoes_acesso', null);
        const temPermissoesRemotas = permissoesRemotas && typeof permissoesRemotas === 'object' && !Array.isArray(permissoesRemotas);
        const permissoesFonte = permissoesPendentes || (temPermissoesRemotas ? permissoesRemotas : permissoesLocais);
        const permissoesNormalizadas = this.normalizarPermissoesAcesso(permissoesFonte);

        this._writeLocalJSON('permissoes_acesso', permissoesNormalizadas);
        if (!temPermissoesRemotas || this._serializeForCompare(permissoesNormalizadas) !== this._serializeForCompare(permissoesRemotas)) {
          await window.FirebaseStore.setItem('permissoes_acesso', permissoesNormalizadas);
        }
      }

      this.getLavanderiaSelecionada();
      this.migrarTiposAcessoLegados();

      if (this.isDeveloper()) {
        this.migrarContaDevLegada();
      }

      console.log('[UserSystem] Dados sincronizados do Firebase');
      this._emitUpdated('firebase');
    } catch (error) {
      console.error('[UserSystem] Erro ao sincronizar do Firebase:', error);
    }
  },

  _normalizarEmail(email) {
    return String(email || '').trim().toLowerCase();
  },

  _mesclarLavanderiasUsuario(origem = [], destino = []) {
    const origemArr = Array.isArray(origem) ? origem : [];
    const destinoArr = Array.isArray(destino) ? destino : [];
    if (origemArr.includes('all') || destinoArr.includes('all')) {
      return ['all'];
    }
    return [...new Set([...destinoArr, ...origemArr])];
  },

  migrarContaDevLegada() {
    const emailOrigem = this._normalizarEmail(this.LEGACY_DEV_EMAIL);
    const emailDestino = this._normalizarEmail(this.PRIMARY_ADMIN_EMAIL);
    const usuarios = this._getUsuariosStorage();

    if (!Array.isArray(usuarios) || usuarios.length === 0) {
      return false;
    }

    const idxOrigem = usuarios.findIndex(user => this._normalizarEmail(user.email) === emailOrigem);
    if (idxOrigem === -1) {
      return false;
    }

    const idxDestino = usuarios.findIndex((user, index) => {
      return index !== idxOrigem && this._normalizarEmail(user.email) === emailDestino;
    });

    let mudouUsuarios = false;
    if (idxDestino === -1) {
      const usuarioOrigem = usuarios[idxOrigem];
      usuarios[idxOrigem] = this.normalizarUsuario({
        ...usuarioOrigem,
        email: this.PRIMARY_ADMIN_EMAIL,
        tipoAcesso: this.ROLES.DESENVOLVEDOR,
        aprovado: true,
        lavanderias: this._mesclarLavanderiasUsuario(usuarioOrigem?.lavanderias, ['all'])
      });
      mudouUsuarios = true;
    } else {
      const usuarioOrigem = usuarios[idxOrigem];
      const usuarioDestino = usuarios[idxDestino];

      usuarios[idxDestino] = this.normalizarUsuario({
        ...usuarioOrigem,
        ...usuarioDestino,
        email: this.PRIMARY_ADMIN_EMAIL,
        tipoAcesso: this.ROLES.DESENVOLVEDOR,
        aprovado: true,
        lavanderias: this._mesclarLavanderiasUsuario(usuarioOrigem?.lavanderias, usuarioDestino?.lavanderias)
      });

      usuarios.splice(idxOrigem, 1);
      mudouUsuarios = true;
    }

    if (mudouUsuarios) {
      this._saveUsuarios(usuarios);
    }

    let mudouCurrentUser = false;
    const currentUser = this.getCurrentUser();
    if (currentUser) {
      const currentEmail = this._normalizarEmail(currentUser.email);
      if (currentEmail === emailOrigem || currentEmail === emailDestino) {
        const usuarioAtualizado = usuarios.find(user => this._normalizarEmail(user.email) === emailDestino);
        if (usuarioAtualizado) {
          localStorage.setItem('currentUser', JSON.stringify(usuarioAtualizado));
          mudouCurrentUser = true;
        }
      }
    }

    let mudouPendentes = false;
    try {
      const pendentes = JSON.parse(localStorage.getItem('cadastros_pendentes') || '[]');
      const filtrados = (Array.isArray(pendentes) ? pendentes : []).filter(
        item => this._normalizarEmail(item?.email) !== emailOrigem
      );

      if (filtrados.length !== (Array.isArray(pendentes) ? pendentes.length : 0)) {
        localStorage.setItem('cadastros_pendentes', JSON.stringify(filtrados));
        this._saveToFirebase('cadastros_pendentes', filtrados);
        mudouPendentes = true;
      }
    } catch (error) {
      console.warn('[UserSystem] Não foi possível migrar cadastros pendentes da conta legada.', error);
    }

    return mudouUsuarios || mudouCurrentUser || mudouPendentes;
  },

  // Salva dados no Firebase (quando disponível)
  _isPrivateUsersKey(key) {
    return ['usuarios_lavaja', 'irancash_users_db'].includes(String(key || ''));
  },

  async _saveToFirebase(key, value) {
    if (this._isPrivateUsersKey(key) && !this.isDeveloper()) {
      return false;
    }

    if (!this._hasFirebaseAuthUser() && !this.getCurrentUser()) {
      return false;
    }

    this._pendingFirebaseWrites.set(key, value);

    if (this._useFirebase && this._firebaseReady && window.FirebaseStore && this._hasFirebaseAuthUser()) {
      try {
        await window.FirebaseStore.setItem(key, value);
        this._pendingFirebaseWrites.delete(key);
        console.log('[UserSystem] Salvo no Firebase: ' + key);
        return true;
      } catch (error) {
        console.error('[UserSystem] Erro ao salvar no Firebase:', error);
      }
    }

    return false;
  },

  // Inicializa dados locais
  _initLocalData() {
    // Começa sem lavanderias para permitir cadastro manual.
    if (!localStorage.getItem('lavanderias_lavaja')) {
      this._saveLavanderias([]);
    }

    // Verificar se o administrador principal existe
    let usuarios = this._getUsuariosStorage();
    const adminExists = usuarios.find(u => this._normalizarEmail(u.email) === this._normalizarEmail(this.PRIMARY_ADMIN_EMAIL));

    if (!adminExists) {
      const adminUser = {
        id: 'admin1',
        nome: 'Administrador',
        email: this.PRIMARY_ADMIN_EMAIL,
        senha: null, // Login exclusivo via Google
        tipoAcesso: 'desenvolvedor',
        lavanderias: ['all'],
        aprovado: true,
        googleOnly: true,
        criadoEm: new Date().toISOString()
      };
      usuarios.push(adminUser);
      this._saveUsuarios(usuarios);

      console.info('[UserSystem] Conta do desenvolvedor registrada. Acesso somente via Google.');
    } else if (!adminExists.googleOnly) {
      // Migra conta existente para Google-only (remove senha)
      const idx = usuarios.findIndex(u => this._normalizarEmail(u.email) === this._normalizarEmail(this.PRIMARY_ADMIN_EMAIL));
      if (idx >= 0) {
        usuarios[idx] = { ...usuarios[idx], senha: null, googleOnly: true };
        this._saveUsuarios(usuarios);
        localStorage.removeItem(this.ADMIN_BOOTSTRAP_PASSWORD_KEY);
      }
    }

    // Solicitações de cadastro pendentes
    if (!localStorage.getItem('cadastros_pendentes')) {
      localStorage.setItem('cadastros_pendentes', JSON.stringify([]));
    }
  },

  // Obter usuário atual
  getCurrentUser() {
    const user = localStorage.getItem('currentUser');
    if (!user) return null;

    try {
      const parsed = JSON.parse(user);
      const normalizado = this.normalizarUsuario(parsed);
      if (!normalizado || !normalizado.id || !normalizado.email) {
        localStorage.removeItem('currentUser');
        return null;
      }

      const usuariosPrivados = this._getUsuariosStorage();
      const usuariosPublicos = this.getUsuariosPublicos();
      const usuarios = [...usuariosPrivados, ...usuariosPublicos]
        .map(item => this.normalizarUsuario(item))
        .filter(Boolean);
      const emailAtual = String(normalizado.email || '').trim().toLowerCase();
      const usuarioPorId = usuarios.find(item => {
        return item?.id === normalizado.id && String(item?.email || '').trim().toLowerCase() === emailAtual;
      });
      const usuarioPorEmail = usuarios
        .filter(item => String(item?.email || '').trim().toLowerCase() === emailAtual)
        .reduce((preferido, candidato) => this._escolherUsuarioPreferencial(preferido, candidato), null);
      const usuarioValido = this._escolherUsuarioPreferencial(usuarioPorId, usuarioPorEmail || normalizado);

      const emailNormalizado = String(usuarioValido?.email || '').trim().toLowerCase();
      const isPrimaryAdmin = emailNormalizado === String(this.PRIMARY_ADMIN_EMAIL || '').trim().toLowerCase();
      const isDevRole = String(usuarioValido?.tipoAcesso || '').toLowerCase() === 'desenvolvedor';
      const isApproved = usuarioValido?.aprovado === true || usuarioValido?.aprovado === 1;

      if (!usuarioValido || (!isApproved && !isPrimaryAdmin && !isDevRole)) {
        localStorage.removeItem('currentUser');
        return null;
      }

      // Garantir que o desenvolvedor principal sempre tenha aprovado:true salvo
      if ((isPrimaryAdmin || isDevRole) && !isApproved) {
        const idx = usuariosPrivados.findIndex(u => u?.id === usuarioValido.id);
        if (idx !== -1) {
          usuariosPrivados[idx] = { ...usuarioValido, aprovado: true };
          this._saveUsuarios(usuariosPrivados);
        }
        Object.assign(usuarioValido, { aprovado: true });
      }

      const usuarioNormalizado = this.normalizarUsuario(usuarioValido);
      if (JSON.stringify(usuarioNormalizado) !== JSON.stringify(parsed)) {
        localStorage.setItem('currentUser', JSON.stringify(usuarioNormalizado));
      }

      return usuarioNormalizado;
    } catch (error) {
      localStorage.removeItem('currentUser');
      return null;
    }
  },

  // Verificar se é desenvolvedor
  isDeveloper() {
    const user = this.getCurrentUser();
    return Boolean(user && this.normalizarTipoAcesso(user.tipoAcesso || user.role) === this.ROLES.DESENVOLVEDOR);
  },

  // Verificar permissão para uma funcionalidade
  hasPermission(feature) {
    const user = this.getCurrentUser();
    if (!user) return false;

    const tipoAcesso = this.normalizarTipoAcesso(user.tipoAcesso);
    const permissions = this.ROLE_PERMISSIONS[tipoAcesso] || [];
    return permissions.includes('all') || permissions.includes(feature);
  },

  // Normaliza permissões de página salvas no localStorage
  normalizarPermissoesAcesso(permissoes = {}) {
    const defaults = this.PAGE_ACCESS_DEFAULTS;
    const adminSalvo = [];

    if (Array.isArray(permissoes.admin)) {
      adminSalvo.push(...permissoes.admin);
    }

    if (Array.isArray(permissoes.gerente)) {
      adminSalvo.push(...permissoes.gerente);
    }

    const visualizadorSalvo = Array.isArray(permissoes.visualizador)
      ? permissoes.visualizador
      : defaults.visualizador;

    const adminBase = adminSalvo.length ? adminSalvo : defaults.admin;
    const adminUnicas = [...new Set(adminBase.filter(Boolean))].filter(pagina => pagina !== 'all');
    const visualizadorUnicas = [...new Set(visualizadorSalvo.filter(Boolean))].filter(pagina => pagina !== 'all');

    const normalizadas = {
      visualizador: defaults.visualizador.filter(pagina => visualizadorUnicas.includes(pagina)),
      admin: adminUnicas,
      desenvolvedor: ['all']
    };

    return normalizadas;
  },

  // Retorna permissões já normalizadas e persiste correções quando necessário
  getPermissoesAcesso() {
    let permissoesSalvas = {};

    try {
      permissoesSalvas = JSON.parse(localStorage.getItem('permissoes_acesso') || '{}');
    } catch (error) {
      console.warn('[UserSystem] Permissões inválidas no localStorage. Restaurando padrão.', error);
    }

    const permissoesNormalizadas = this.normalizarPermissoesAcesso(permissoesSalvas);

    if (JSON.stringify(permissoesSalvas) !== JSON.stringify(permissoesNormalizadas)) {
      localStorage.setItem('permissoes_acesso', JSON.stringify(permissoesNormalizadas));
    }

    return permissoesNormalizadas;
  },

  // Aplica permissões aos links do sidebar
  salvarPermissoesAcesso(permissoes = {}) {
    const permissoesNormalizadas = this.normalizarPermissoesAcesso(permissoes);
    localStorage.setItem('permissoes_acesso', JSON.stringify(permissoesNormalizadas));
    this._saveToFirebase('permissoes_acesso', permissoesNormalizadas);
    this._emitUpdated('permissions');
    return permissoesNormalizadas;
  },

  aplicarPermissoesSidebar(root = document) {
    root.querySelectorAll('.sidebar-nav a[data-page]').forEach(link => {
      const pagina = link.getAttribute('data-page');
      link.style.display = this.verificarPermissao(pagina) ? '' : 'none';
    });
  },

  // Verificar se pode editar
  canEdit() {
    const user = this.getCurrentUser();
    if (!user) return false;
    return ['desenvolvedor', 'admin'].includes(this.normalizarTipoAcesso(user.tipoAcesso));
  },

  // Login
  login(email, senha) {
    const emailNormalizado = String(email || '').trim().toLowerCase();

    // Conta do desenvolvedor: acesso exclusivo via Google
    if (emailNormalizado === this._normalizarEmail(this.PRIMARY_ADMIN_EMAIL)) {
      throw new Error('Esta conta só pode ser acessada via Google. Use o botão "Entrar com Google".');
    }

    const usuarios = JSON.parse(localStorage.getItem('usuarios_lavaja') || '[]');
    const userIndex = usuarios.findIndex(u => {
      const userEmail = String(u?.email || '').trim().toLowerCase();
      return userEmail === emailNormalizado && this._validarSenhaUsuario(u?.senha, senha);
    });
    const user = userIndex >= 0 ? this.normalizarUsuario(usuarios[userIndex]) : null;

    if (!user) {
      throw new Error('E-mail ou senha incorretos!');
    }

    if (!user.aprovado) {
      throw new Error('Seu cadastro ainda está pendente de aprovação.');
    }

    if (userIndex >= 0 && user.tipoAcesso !== usuarios[userIndex].tipoAcesso) {
      usuarios[userIndex] = user;
      localStorage.setItem('usuarios_lavaja', JSON.stringify(usuarios));
      if (this.isDeveloper()) {
        this._saveToFirebase('usuarios_lavaja', usuarios);
      }
      this._saveUsuariosPublicos(usuarios);
    }

    // Se ainda havia senha em texto puro, converte para hash após login bem-sucedido.
    if (userIndex >= 0 && typeof usuarios[userIndex]?.senha === 'string') {
      const senhaHash = this._buildSenhaStorageValue(senha);
      if (senhaHash) {
        usuarios[userIndex] = { ...usuarios[userIndex], senha: senhaHash };
        localStorage.setItem('usuarios_lavaja', JSON.stringify(usuarios));
        if (this.isDeveloper()) {
          this._saveToFirebase('usuarios_lavaja', usuarios);
        }
        this._saveUsuariosPublicos(usuarios);
      }
    }

    localStorage.setItem('currentUser', JSON.stringify(user));
    return user;
  },

  // Logout
  logout() {
    localStorage.removeItem('currentUser');
    window.location.href = './index.html';
  },

  // Solicitar cadastro
  solicitarCadastro(dados, options = {}) {
    const { nome, email, telefone, lavanderiaSolicitada, senha } = dados;

    // Verificar se email já existe
    const usuarios = JSON.parse(localStorage.getItem('usuarios_lavaja') || '[]');
    const pendentes = JSON.parse(localStorage.getItem('cadastros_pendentes') || '[]');

    if (usuarios.find(u => u.email === email)) {
      throw new Error('Este e-mail já está cadastrado.');
    }

    if (pendentes.find(p => p.email === email)) {
      throw new Error('Já existe uma solicitação pendente para este e-mail.');
    }

    // Adicionar à lista de pendentes
    const solicitacao = {
      id: 'sol_' + Date.now(),
      nome,
      email,
      telefone,
      lavanderiaSolicitada,
      senha: this._buildSenhaStorageValue(senha),
      status: 'pendente',
      dataRegistro: new Date().toISOString()
    };

    pendentes.push(solicitacao);
    localStorage.setItem('cadastros_pendentes', JSON.stringify(pendentes));

    // Sincronizar com Firebase
    this._saveToFirebase('cadastros_pendentes', pendentes);
    if (!options.skipCloud) {
      this._savePendingAccessRequestToCollection(solicitacao);
    }

    return solicitacao;
  },

  // Aprovar cadastro (apenas desenvolvedor)
  aprovarCadastro(solicitacaoId, tipoAcesso, lavanderias) {
    if (!this.isDeveloper()) {
      return { success: false, message: 'Apenas desenvolvedores podem aprovar cadastros.' };
    }

    const pendentes = JSON.parse(localStorage.getItem('cadastros_pendentes') || '[]');
    const usuarios = JSON.parse(localStorage.getItem('usuarios_lavaja') || '[]');

    const idx = pendentes.findIndex(p => p.id === solicitacaoId);
    if (idx === -1) {
      return { success: false, message: 'Solicitação não encontrada.' };
    }

    const solicitacao = pendentes[idx];
    const tipoAcessoNormalizado = this.normalizarTipoAcesso(tipoAcesso);
    const senhaNormalizada = this._normalizarSenhaStorageValue(solicitacao.senha);

    // Criar usuário
    const novoUsuario = {
      id: 'user_' + Date.now(),
      nome: solicitacao.nome,
      email: solicitacao.email,
      telefone: solicitacao.telefone,
      senha: senhaNormalizada,
      tipoAcesso: tipoAcessoNormalizado,
      lavanderias: lavanderias,
      aprovado: true,
      aprovadoEm: new Date().toISOString(),
      criadoEm: solicitacao.dataRegistro
    };

    usuarios.push(novoUsuario);
    localStorage.setItem('usuarios_lavaja', JSON.stringify(usuarios));
    this._saveUsuariosPublicos(usuarios);

    // Remover da lista de pendentes
    pendentes.splice(idx, 1);
    localStorage.setItem('cadastros_pendentes', JSON.stringify(pendentes));

    // Sincronizar com Firebase
    this._saveToFirebase('usuarios_lavaja', usuarios);
    this._saveToFirebase('usuarios_lavaja_public', this.sanitizarUsuariosPublicos(usuarios));
    this._saveToFirebase('cadastros_pendentes', pendentes);
    this._removePendingAccessRequestFromCollection(solicitacao);

    return { success: true, user: novoUsuario };
  },

  // Rejeitar cadastro
  rejeitarCadastro(solicitacaoId) {
    if (!this.isDeveloper()) {
      return { success: false, message: 'Apenas desenvolvedores podem rejeitar cadastros.' };
    }

    const pendentes = JSON.parse(localStorage.getItem('cadastros_pendentes') || '[]');
    const idx = pendentes.findIndex(p => p.id === solicitacaoId);

    if (idx !== -1) {
      const solicitacao = pendentes[idx];
      pendentes.splice(idx, 1);
      localStorage.setItem('cadastros_pendentes', JSON.stringify(pendentes));

      // Sincronizar com Firebase
      this._saveToFirebase('cadastros_pendentes', pendentes);
      this._removePendingAccessRequestFromCollection(solicitacao);

      return { success: true };
    }

    return { success: false, message: 'Solicitação não encontrada.' };
  },

  // Obter solicitações pendentes
  getCadastrosPendentes() {
    if (!this.isDeveloper()) return [];
    return JSON.parse(localStorage.getItem('cadastros_pendentes') || '[]');
  },

  // Obter todos os usuários
  getUsuarios() {
    if (!this.isDeveloper()) return [];
    return this._getUsuariosStorage();
  },

  // Obter lavanderias
  getLavanderias() {
    let lavanderias = [];

    try {
      lavanderias = JSON.parse(localStorage.getItem('lavanderias_lavaja') || '[]');
    } catch (error) {
      console.warn('[UserSystem] Não foi possível ler lavanderias do localStorage.', error);
      return [];
    }

    const normalizadas = lavanderias.map(lavanderia => this.normalizarLavanderia(lavanderia));

    if (JSON.stringify(lavanderias) !== JSON.stringify(normalizadas)) {
      return this._saveLavanderias(normalizadas);
    }

    return normalizadas;
  },

  // Obter lavanderias do usuário atual
  getMinhasLavanderias() {
    const user = this.getCurrentUser();
    if (!user) return [];

    const todas = this.getLavanderias();
    const tipoAcesso = this.normalizarTipoAcesso(user.tipoAcesso);
    const lavanderiasUsuario = user.lavanderias || [];

    if (tipoAcesso === this.ROLES.DESENVOLVEDOR || lavanderiasUsuario.includes('all')) {
      return todas;
    }

    return todas.filter(l => lavanderiasUsuario.includes(l.id));
  },

  // Obter lavanderia selecionada
  getLavanderiaSelecionada() {
    const minhas = this.getMinhasLavanderias();
    if (!minhas.length) {
      localStorage.removeItem('lavanderiaSelecionada');
      return null;
    }

    const id = localStorage.getItem('lavanderiaSelecionada');
    const selecionada = id
      ? minhas.find(lavanderia => String(lavanderia?.id || '') === String(id))
      : null;

    if (selecionada) {
      return selecionada;
    }

    localStorage.setItem('lavanderiaSelecionada', minhas[0].id);
    return minhas[0];
  },

  // Selecionar lavanderia
  selecionarLavanderia(id) {
    const minhas = this.getMinhasLavanderias();
    const selecionada = minhas.find(lavanderia => String(lavanderia?.id || '') === String(id));

    if (selecionada) {
      localStorage.setItem('lavanderiaSelecionada', selecionada.id);
      return selecionada;
    }

    if (minhas.length > 0) {
      localStorage.setItem('lavanderiaSelecionada', minhas[0].id);
      return minhas[0];
    }

    localStorage.removeItem('lavanderiaSelecionada');
    return null;
  },

  // Adicionar lavanderia (apenas desenvolvedor)
  adicionarLavanderia(dados) {
    if (!this.isDeveloper()) {
      return { success: false, message: 'Apenas desenvolvedores podem adicionar lavanderias.' };
    }

    const lavanderias = this.getLavanderias();
    const nova = this.normalizarLavanderia({
      id: 'lav_' + Date.now(),
      ...dados,
      socios: [],
      ativa: true,
      criadoEm: new Date().toISOString()
    });

    lavanderias.push(nova);
    this._saveLavanderias(lavanderias);

    return { success: true, lavanderia: nova };
  },

  zerarLavanderias() {
    if (!this.isDeveloper()) {
      return { success: false, message: 'Apenas desenvolvedores podem zerar lavanderias.' };
    }

    this._saveLavanderias([]);
    localStorage.removeItem('lavanderiaSelecionada');

    const usuarios = this._getUsuariosStorage().map(usuario => {
      const normalizado = this.normalizarUsuario(usuario);
      if (!normalizado || typeof normalizado !== 'object') {
        return usuario;
      }

      const tipoAcesso = this.normalizarTipoAcesso(normalizado.tipoAcesso);
      if (tipoAcesso === this.ROLES.DESENVOLVEDOR) {
        return { ...normalizado, lavanderias: ['all'] };
      }

      return { ...normalizado, lavanderias: [] };
    });

    const usuariosAtualizados = this._saveUsuarios(usuarios);
    const currentUser = this.getCurrentUser();
    if (currentUser) {
      const userAtualizado = usuariosAtualizados.find(user => user.id === currentUser.id);
      if (userAtualizado) {
        localStorage.setItem('currentUser', JSON.stringify(userAtualizado));
      }
    }

    return { success: true };
  },

  // Atualizar usuário
  atualizarUsuario(userId, dados) {
    if (!this.isDeveloper()) {
      return { success: false, message: 'Apenas desenvolvedores podem atualizar usuários.' };
    }

    const usuarios = this._getUsuariosStorage();
    const idx = usuarios.findIndex(u => u.id === userId);

    if (idx !== -1) {
      const dadosAtualizados = { ...dados };
      if (dadosAtualizados.tipoAcesso) {
        dadosAtualizados.tipoAcesso = this.normalizarTipoAcesso(dadosAtualizados.tipoAcesso);
      }

      if (Object.prototype.hasOwnProperty.call(dadosAtualizados, 'senha')) {
        const senhaNormalizada = this._normalizarSenhaStorageValue(dadosAtualizados.senha);
        if (!senhaNormalizada) {
          delete dadosAtualizados.senha;
        } else {
          dadosAtualizados.senha = senhaNormalizada;
        }
      }

      if (dadosAtualizados.email) {
        const emailNormalizado = String(dadosAtualizados.email).trim().toLowerCase();
        const emailDuplicado = usuarios.some((user, userIndex) => {
          return userIndex !== idx && String(user.email || '').trim().toLowerCase() === emailNormalizado;
        });

        if (emailDuplicado) {
          return { success: false, message: 'Já existe outro usuário com este e-mail.' };
        }
      }

      usuarios[idx] = { ...usuarios[idx], ...dadosAtualizados };
      const usuariosAtualizados = this._saveUsuarios(usuarios);

      const currentUser = this.getCurrentUser();
      if (currentUser?.id === userId) {
        localStorage.setItem('currentUser', JSON.stringify(usuariosAtualizados[idx]));
      }

      return { success: true, user: usuariosAtualizados[idx] };
    }

    return { success: false, message: 'Usuário não encontrado.' };
  },

  criarUsuario(dados) {
    if (!this.isDeveloper()) {
      return { success: false, message: 'Apenas desenvolvedores podem criar usuários.' };
    }

    const usuarios = this._getUsuariosStorage();
    const email = String(dados.email || '').trim().toLowerCase();

    if (!email) {
      return { success: false, message: 'Informe um e-mail válido.' };
    }

    const emailDuplicado = usuarios.some(user => String(user.email || '').trim().toLowerCase() === email);
    if (emailDuplicado) {
      return { success: false, message: 'Este e-mail já está cadastrado.' };
    }

    const novoUsuario = this.normalizarUsuario({
      id: dados.id || 'user_' + Date.now(),
      nome: dados.nome,
      email: String(dados.email || '').trim(),
      senha: this._normalizarSenhaStorageValue(dados.senha),
      telefone: dados.telefone || '',
      tipoAcesso: dados.tipoAcesso,
      aprovado: Boolean(dados.aprovado),
      lavanderias: Array.isArray(dados.lavanderias) ? dados.lavanderias : [],
      criadoEm: dados.criadoEm || new Date().toISOString()
    });

    usuarios.push(novoUsuario);
    this._saveUsuarios(usuarios);

    return { success: true, user: novoUsuario };
  },

  removerUsuario(userId) {
    if (!this.isDeveloper()) {
      return { success: false, message: 'Apenas desenvolvedores podem remover usuários.' };
    }

    const usuarios = this._getUsuariosStorage();
    const idx = usuarios.findIndex(user => user.id === userId);

    if (idx === -1) {
      return { success: false, message: 'Usuário não encontrado.' };
    }

    if (this._normalizarEmail(usuarios[idx].email) === this._normalizarEmail(this.PRIMARY_ADMIN_EMAIL)) {
      return { success: false, message: 'O usuário desenvolvedor padrão não pode ser removido.' };
    }

    usuarios.splice(idx, 1);
    this._saveUsuarios(usuarios);

    const currentUser = this.getCurrentUser();
    if (currentUser?.id === userId) {
      localStorage.removeItem('currentUser');
    }

    return { success: true };
  },

  podeGerenciarLavanderia(lavanderiaId) {
    const user = this.getCurrentUser();
    if (!user || !lavanderiaId) {
      return false;
    }

    const tipoAcesso = this.normalizarTipoAcesso(user.tipoAcesso);
    if (tipoAcesso === this.ROLES.DESENVOLVEDOR) {
      return true;
    }

    return tipoAcesso === this.ROLES.ADMIN && this.temAcessoLavanderia(lavanderiaId);
  },

  atualizarLavanderia(lavanderiaId, dados) {
    if (!this.podeGerenciarLavanderia(lavanderiaId)) {
      return { success: false, message: 'Você não tem permissão para atualizar esta lavanderia.' };
    }

    const lavanderias = this.getLavanderias();
    const idx = lavanderias.findIndex(lavanderia => lavanderia.id === lavanderiaId);

    if (idx === -1) {
      return { success: false, message: 'Lavanderia não encontrada.' };
    }

    const lavanderiaAtual = lavanderias[idx];
    const lavanderiaAtualizada = this.normalizarLavanderia({
      ...lavanderiaAtual,
      ...dados,
      socios: Object.prototype.hasOwnProperty.call(dados, 'socios') ? dados.socios : lavanderiaAtual.socios
    });

    lavanderias[idx] = lavanderiaAtualizada;
    this._saveLavanderias(lavanderias);

    return { success: true, lavanderia: lavanderiaAtualizada };
  },

  removerLavanderia(lavanderiaId) {
    if (!this.isDeveloper()) {
      return { success: false, message: 'Apenas desenvolvedores podem excluir lavanderias.' };
    }

    const id = String(lavanderiaId || '').trim();
    if (!id) {
      return { success: false, message: 'Lavanderia inválida.' };
    }

    const lavanderias = this.getLavanderias();
    const idx = lavanderias.findIndex(lavanderia => String(lavanderia.id) === id);

    if (idx === -1) {
      return { success: false, message: 'Lavanderia não encontrada.' };
    }

    const lavanderiaRemovida = lavanderias[idx];
    const lavanderiasAtualizadas = lavanderias.filter(lavanderia => String(lavanderia.id) !== id);
    this._saveLavanderias(lavanderiasAtualizadas);

    const usuariosAtualizados = this._getUsuariosStorage().map(usuario => {
      const normalizado = this.normalizarUsuario(usuario);
      if (!normalizado || !Array.isArray(normalizado.lavanderias) || normalizado.lavanderias.includes('all')) {
        return normalizado || usuario;
      }

      return {
        ...normalizado,
        lavanderias: normalizado.lavanderias.filter(lavId => String(lavId) !== id)
      };
    });

    this._saveUsuarios(usuariosAtualizados);

    if (String(localStorage.getItem('lavanderiaSelecionada') || '') === id) {
      localStorage.removeItem('lavanderiaSelecionada');
      this.getLavanderiaSelecionada();
    }

    const currentUser = this.getCurrentUser();
    if (currentUser) {
      const usuarioAtualizado = usuariosAtualizados.find(user => user.id === currentUser.id);
      if (usuarioAtualizado) {
        localStorage.setItem('currentUser', JSON.stringify(usuarioAtualizado));
      }
    }

    this._emitUpdated('laundry-removed');
    return { success: true, lavanderia: lavanderiaRemovida };
  },

  getUsuariosComAcessoLavanderia(lavanderiaId) {
    const user = this.getCurrentUser();

    if (!lavanderiaId || !user || !this.temAcessoLavanderia(lavanderiaId)) {
      return [];
    }

    return this.getUsuariosPublicos()
      .filter(usuario => {
        if (!usuario.aprovado) {
          return false;
        }

        const lavanderiasUsuario = usuario.lavanderias || [];
        return lavanderiasUsuario.includes('all') || lavanderiasUsuario.includes(lavanderiaId);
      })
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
  },

  // Forçar sincronização manual
  async forceSync() {
    if (this._useFirebase) {
      await this._flushPendingFirebaseWrites();
      await this._syncFromFirebase();
      await this._flushPendingFirebaseWrites();
      return { success: true, message: 'Dados sincronizados com a nuvem.' };
    }
    return { success: false, message: 'Firebase não disponível.' };
  },

  /**
   * Verifica se o usuário atual tem permissão para acessar uma página
   * @param {string} pagina - Nome da página (ex: 'configuracoes', 'receitas', 'dashboard')
   * @returns {boolean} - true se tem permissão, false caso contrário
   */
  verificarPermissao(pagina) {
    const user = this.getCurrentUser();
    if (!user) return false;

    const tipoAcesso = this.normalizarTipoAcesso(user.tipoAcesso);

    if (tipoAcesso === this.ROLES.DESENVOLVEDOR) {
      return true;
    }

    const permissoes = this.getPermissoesAcesso();
    const paginasPermitidas = permissoes[tipoAcesso] || [];
    return paginasPermitidas.includes(pagina);
  },

  /**
   * Retorna array de IDs das lavanderias que o usuário atual tem permissão para acessar
   * @returns {string[]} - Array de IDs de lavanderias
   */
  getLavanderiasPermitidas() {
    const user = this.getCurrentUser();
    if (!user) return [];
    const tipoAcesso = this.normalizarTipoAcesso(user.tipoAcesso);

    // Desenvolvedor e 'all' têm acesso a todas
    if (tipoAcesso === 'desenvolvedor' || user.lavanderias?.includes('all')) {
      return this.getLavanderias().map(l => l.id);
    }

    // Retornar apenas lavanderias atribuídas
    return user.lavanderias || [];
  },

  /**
   * Verifica se o usuário atual tem acesso a uma lavanderia específica
   * @param {string} lavanderiaId - ID da lavanderia
   * @returns {boolean} - true se tem acesso, false caso contrário
   */
  temAcessoLavanderia(lavanderiaId) {
    const user = this.getCurrentUser();
    if (!user) return false;
    const tipoAcesso = this.normalizarTipoAcesso(user.tipoAcesso);

    // Desenvolvedor tem acesso total
    if (tipoAcesso === 'desenvolvedor') return true;

    // Usuários com 'all' têm acesso a todas
    if (user.lavanderias?.includes('all')) return true;

    // Verificar se lavanderia está na lista do usuário
    return user.lavanderias?.includes(lavanderiaId) || false;
  },

  /**
   * Filtra array de dados para incluir apenas itens das lavanderias permitidas
   * @param {Array} dados - Array de dados para filtrar
   * @param {string} campoLavanderia - Nome do campo que contém o ID da lavanderia (padrão: 'lavanderiaId')
   * @returns {Array} - Array filtrado
   */
  filtrarPorLavanderiaPermitida(dados, campoLavanderia = 'lavanderiaId') {
    const lavanderiasPermitidas = this.getLavanderiasPermitidas();

    // Se tem acesso a todas ou é desenvolvedor, retorna tudo
    const user = this.getCurrentUser();
    if (this.normalizarTipoAcesso(user?.tipoAcesso) === 'desenvolvedor' || user?.lavanderias?.includes('all')) {
      return dados;
    }

    // Filtrar apenas dados das lavanderias permitidas
    return dados.filter(item => {
      const lavId = typeof item === 'object' ? item[campoLavanderia] : item;
      return lavanderiasPermitidas.includes(lavId);
    });
  }
};

// Inicializar sistema
UserSystem.init();

// Expor funções de permissão globalmente para compatibilidade
window.UserSystem = UserSystem;
window.verificarPermissao = (pagina) => UserSystem.verificarPermissao(pagina);
window.getLavanderiasPermitidas = () => UserSystem.getLavanderiasPermitidas();
window.temAcessoLavanderia = (lavId) => UserSystem.temAcessoLavanderia(lavId);
window.filtrarPorLavanderiaPermitida = (dados, campo) => UserSystem.filtrarPorLavanderiaPermitida(dados, campo);
