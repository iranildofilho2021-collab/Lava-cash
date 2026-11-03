/**
 * Camada de dados Supabase com autenticação Firebase.
 *
 * Mantém o nome global FirebaseStore para que as telas antigas continuem
 * funcionando durante a troca definitiva do banco, mas nenhuma operação deste
 * arquivo lê ou grava no Firestore.
 */
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { supabaseConfig } from './supabase-config.js?v=20260903-owner-only-v1';

let auth = null;
let initialized = false;
let authReadyPromise = null;
const inFlightReads = new Map();
const PENDING_WRITES_KEY = 'irancash_pending_supabase_writes';
const PENDING_ENTRY_PREFIX = 'irancash_supabase_operation_v2:';
let pendingFlushPromise = null;
const PAGE_SIZE = 1000;
const WRITE_BATCH_SIZE = 250;
// O sistema agora tem um único proprietário. Uma verificação a cada dois
// minutos mantém as telas atualizadas sem consultar o banco a cada 15 segundos.
const SUBSCRIPTION_POLL_MS = 120000;
const PROTECTED_FINANCE_CATEGORIES = new Set(['receitas', 'despesas']);
const FINANCE_TABLES = Object.freeze({
  receitas: 'receitas',
  despesas: 'despesas',
  investimento: 'investimentos',
  maquininhas_cadastradas: 'maquininhas',
  categorias_despesa: 'categorias_despesa'
});
const IMPORT_CATEGORIES = new Set([
  'historico_importacao_vendas',
  'ultima_importacao_vendas',
  'import_history',
  'last_import_batch'
]);
const SYSTEM_KEYS = new Set([
  'usuarios_lavaja',
  'usuarios_lavaja_public',
  'irancash_users_db',
  'lavanderias_lavaja',
  'cadastros_pendentes',
  'permissoes_acesso',
  'config_notificacoes',
  'irancash_theme',
  'categorias_despesa',
  'irancash_metas_mensais'
]);
const LOCAL_ONLY_KEYS = new Set([
  PENDING_WRITES_KEY,
  'irancash_pending_firebase_writes',
  'currentUser',
  'irancash_session',
  'irancash_last_activity',
  'lavanderiaSelecionada',
  'irancash_debug',
  'irancash_admin_bootstrap_password'
]);
const LAUNDRY_SUFFIXES = [
  'historico_importacao_vendas',
  'ultima_importacao_vendas',
  'maquininhas_cadastradas',
  'categorias_despesa',
  'rateio_socios_status',
  'irancash_metas_mensais',
  'last_import_batch',
  'import_history',
  'investimento',
  'receitas',
  'despesas'
];

const debugEnabled = typeof window !== 'undefined'
  && window.localStorage
  && localStorage.getItem('irancash_debug') === 'true';
const log = debugEnabled ? console.log.bind(console) : function() {};

function safeParseJSON(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch (error) { return fallback; }
}

function localValue(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function saveLocalValue(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {}
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function cleanNumber(value, fallback = null) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let normalized = String(value ?? '').trim().replace(/[^0-9,.-]/g, '');
  if (!normalized) return fallback;
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
      ? normalized.replaceAll('.', '').replace(',', '.')
      : normalized.replaceAll(',', '');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function cleanInteger(value) {
  const number = cleanNumber(value);
  return number === null ? null : Math.trunc(number);
}

function cleanBoolean(value, fallback = false) {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', 'sim', 'yes'].includes(normalized)) return true;
  if (['false', 'nao', 'não', 'no'].includes(normalized)) return false;
  return fallback;
}

function cleanDate(value) {
  const text = cleanText(value);
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const brazilian = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (brazilian) {
    return `${brazilian[3]}-${brazilian[2].padStart(2, '0')}-${brazilian[1].padStart(2, '0')}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function cleanTimestamp(value) {
  const text = cleanText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function withoutNulls(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null && item !== undefined)
  );
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (['desenvolvedor', 'developer', 'dev'].includes(role)) return 'desenvolvedor';
  if (['admin', 'administrador', 'administrator', 'adm', 'gerente', 'gestor', 'manager', 'cadastrador'].includes(role)) return 'admin';
  return 'visualizador';
}

function stripSensitive(value) {
  if (Array.isArray(value)) return value.map(stripSensitive);
  if (!value || typeof value !== 'object') return value;
  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    if (/senha|password|passwd|credential|secret|token|salt|(^|_)hash($|_)/i.test(key)) continue;
    clean[key] = stripSensitive(item);
  }
  return clean;
}

function hashText(value) {
  let hash = 0x811c9dc5;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function deterministicUuid(value) {
  const text = String(value || 'lavacash');
  const raw = [0, 1, 2, 3].map(index => hashText(`${index}:${text}`)).join('').split('');
  raw[12] = '5';
  raw[16] = ['8', '9', 'a', 'b'][parseInt(raw[16], 16) % 4];
  const hex = raw.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function stableItemId(prefix, item, index) {
  const explicit = cleanText(item && (item.id ?? item.id_legado));
  if (explicit) return explicit;
  return `${prefix}-${hashText(JSON.stringify(item ?? null))}-${index}`;
}

function classifyStorageKey(key) {
  const storageKey = String(key || '').trim();
  for (const category of LAUNDRY_SUFFIXES) {
    const suffix = `_${category}`;
    if (storageKey.endsWith(suffix)) {
      return {
        storageKey,
        scopeType: 'laundry',
        scopeLaundryId: storageKey.slice(0, -suffix.length),
        scopeCategory: category,
        configKey: category
      };
    }
  }
  const configMarker = '_config_';
  const configIndex = storageKey.indexOf(configMarker);
  if (configIndex > 0) {
    return {
      storageKey,
      scopeType: 'laundry',
      scopeLaundryId: storageKey.slice(0, configIndex),
      scopeCategory: 'config',
      configKey: storageKey.slice(configIndex + configMarker.length)
    };
  }
  if (storageKey.startsWith('user_')) {
    return { storageKey, scopeType: 'user', scopeLaundryId: null, scopeCategory: 'profile' };
  }
  if (SYSTEM_KEYS.has(storageKey)) {
    return { storageKey, scopeType: 'system', scopeLaundryId: null, scopeCategory: storageKey };
  }
  return { storageKey, scopeType: 'legacy', scopeLaundryId: null, scopeCategory: 'legacy' };
}

function shouldKeepLocalStorageCopy(key) {
  const helper = typeof window !== 'undefined' ? window.LavaCashFinanceDedupe : null;
  if (typeof helper?.shouldKeepLocalStorageCopy === 'function') {
    return helper.shouldKeepLocalStorageCopy(key);
  }
  return classifyStorageKey(key).scopeCategory !== 'receitas';
}

function cacheValueForKey(key, value) {
  if (shouldKeepLocalStorageCopy(key)) {
    saveLocalValue(key, value);
    return;
  }

  const indexedStore = typeof window !== 'undefined' ? window.IndexedDBStore : null;
  if (indexedStore?.setItem) {
    Promise.resolve(indexedStore.setItem(key, value))
      .then(saved => {
        if (saved === false) {
          saveLocalValue(key, value);
          return;
        }
        try { localStorage.removeItem(key); } catch (error) {}
      })
      .catch(() => saveLocalValue(key, value));
    return;
  }
  saveLocalValue(key, value);
}

async function cachedValueForKey(key, fallback) {
  if (!shouldKeepLocalStorageCopy(key)) {
    const indexedStore = typeof window !== 'undefined' ? window.IndexedDBStore : null;
    if (indexedStore?.getItem) {
      try {
        const value = await indexedStore.getItem(key, undefined);
        if (value !== undefined && value !== null) return value;
      } catch (error) {}
    }
  }
  return localValue(key, fallback);
}

function readPendingWrites() {
  const legacy = safeParseJSON(localStorage.getItem(PENDING_WRITES_KEY), []);
  const result = (Array.isArray(legacy) ? legacy : []).map(item => ({ ...item, legacy: true }));
  for (let index = 0; index < localStorage.length; index += 1) {
    const storageKey = localStorage.key(index);
    if (!storageKey?.startsWith(PENDING_ENTRY_PREFIX)) continue;
    const item = safeParseJSON(localStorage.getItem(storageKey), null);
    if (item?.id) result.push({ ...item, storageKey });
  }
  return result.sort((a, b) => String(a.queuedAt || '').localeCompare(String(b.queuedAt || '')));
}

function enqueuePendingWrite(key, operation = 'set', options = {}, value) {
  const id = crypto.randomUUID();
  const item = {
    id, key: String(key), operation,
    uid: auth?.currentUser?.uid || window.LavaCashOwnerMode?.uid || null,
    allowDecrease: options.allowDecrease === true,
    deletedIds: Array.isArray(options.deletedIds) ? options.deletedIds.map(String) : [],
    queuedAt: new Date().toISOString(),
    ...(value === undefined ? {} : { value: JSON.parse(JSON.stringify(value)) })
  };
  // Each operation owns a storage key: acknowledging it cannot erase newer
  // operations, including those enqueued by another tab while a request runs.
  localStorage.setItem(PENDING_ENTRY_PREFIX + id, JSON.stringify(item));
  return id;
}

async function waitForAuthStateReady(timeoutMs = 8000) {
  // initStore fica disponível antes de o Firebase terminar de restaurar a
  // sessão persistida. Esperar esse estado evita que a primeira consulta ao
  // Supabase seja tratada incorretamente como uma sessão expirada.
  if (!auth || auth.currentUser) return;
  if (!authReadyPromise) {
    authReadyPromise = new Promise(resolve => {
      let finished = false;
      let unsubscribe = () => {};
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        unsubscribe();
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      unsubscribe = onAuthStateChanged(auth, finish, finish);
    });
  }
  await authReadyPromise;
}

async function getAccessToken(forceRefresh = false) {
  await waitForAuthStateReady();
  if (!auth || !auth.currentUser) {
    const error = new Error('Entre novamente no sistema para acessar o banco de dados.');
    error.code = 'supabase/auth-required';
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('supabase:auth-required'));
    }
    throw error;
  }
  const ownerMode = typeof window !== 'undefined' ? window.LavaCashOwnerMode : null;
  if (!ownerMode || !ownerMode.isOwnerUser(auth.currentUser)) {
    const error = new Error('Este sistema é de uso exclusivo do proprietário.');
    error.code = 'supabase/owner-required';
    throw error;
  }
  let token = await auth.currentUser.getIdTokenResult(forceRefresh);
  if (token.claims.role !== 'authenticated' && !forceRefresh) {
    token = await auth.currentUser.getIdTokenResult(true);
  }
  if (token.claims.role !== 'authenticated') {
    const error = new Error('O Firebase autenticou a conta, mas o token não possui role: authenticated. Corrija a claim no servidor Firebase e entre novamente.');
    error.code = 'supabase/role-mismatch';
    throw error;
  }
  return token.token;
}

function buildUrl(table, query = {}) {
  const url = new URL(`${supabaseConfig.url}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function request(table, options = {}, forceRefresh = false) {
  const token = options.anonymous ? null : await getAccessToken(forceRefresh);
  const headers = {
    apikey: supabaseConfig.publishableKey,
    Accept: 'application/json',
    ...(options.headers || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.prefer) headers.Prefer = options.prefer;
  if (options.range) headers.Range = options.range;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(buildUrl(table, options.query), {
      method: options.method || 'GET', headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store', signal: controller.signal
    });
  } catch (cause) {
    const error = new Error(cause?.name === 'AbortError'
      ? 'O Supabase não respondeu em 20 segundos. A gravação não foi confirmada; atualize da nuvem antes de tentar novamente.'
      : 'Não foi possível comunicar com o Supabase. Verifique a conexão e tente novamente.');
    error.code = cause?.name === 'AbortError' ? 'supabase/timeout' : 'supabase/network';
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 && !forceRefresh && !options.anonymous) return request(table, options, true);
  if (!response.ok) {
    const details = await response.text();
    const error = new Error(`Supabase respondeu ${response.status}: ${details || response.statusText}`);
    error.code = `supabase/http-${response.status}`;
    throw error;
  }

  const text = options.method === 'HEAD' || response.status === 204 ? '' : await response.text();
  return {
    data: text ? JSON.parse(text) : null,
    count: Number(response.headers.get('content-range')?.split('/').at(-1))
  };
}

async function paginate(table, query = {}) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await request(table, {
      query,
      range: `${offset}-${offset + PAGE_SIZE - 1}`
    });
    const page = Array.isArray(response.data) ? response.data : [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function callRpc(functionName, parameters = {}) {
  const response = await request(`rpc/${functionName}`, {
    method: 'POST',
    body: parameters
  });
  return response.data;
}

async function upsertRows(table, rows, conflictFields) {
  for (let offset = 0; offset < rows.length; offset += WRITE_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + WRITE_BATCH_SIZE);
    const columns = [...new Set(batch.flatMap(row => Object.keys(row)))];
    const timestamp = new Date().toISOString();
    const normalizedBatch = batch.map(row => Object.fromEntries(columns.map(column => [
      column,
      Object.hasOwn(row, column)
        ? row[column]
        : ['criado_em', 'atualizado_em'].includes(column) ? timestamp : null
    ])));
    await request(table, {
      method: 'POST',
      query: { on_conflict: conflictFields.join(',') },
      body: normalizedBatch,
      prefer: 'resolution=merge-duplicates,return=minimal'
    });
  }
}

function postgrestList(values) {
  return `in.(${values.map(value => `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(',')})`;
}

async function deleteRows(table, query) {
  await request(table, { method: 'DELETE', query, prefer: 'return=minimal' });
}

function mergeByIdentity(remote, local) {
  const merged = new Map();
  (Array.isArray(remote) ? remote : []).forEach((item, index) => {
    merged.set(stableItemId('item', item, index), item);
  });
  (Array.isArray(local) ? local : []).forEach((item, index) => {
    merged.set(stableItemId('item', item, index), item);
  });
  return [...merged.values()];
}

function originalFromRow(row) {
  const source = row && row.dados_origem && typeof row.dados_origem === 'object'
    ? { ...row.dados_origem }
    : {};
  if (!source.id && row?.id_legado) source.id = row.id_legado;
  return source;
}

function receiptFromRow(row) {
  const imported = cleanBoolean(row?.importado_stone);
  return withoutNulls({
    id: cleanText(row?.id_legado),
    data: cleanDate(row?.data),
    horarioVenda: cleanText(row?.horario_venda),
    valor: cleanNumber(row?.valor, 0),
    valorLiquido: cleanNumber(row?.valor_liquido),
    descricao: cleanText(row?.descricao),
    categoria: cleanText(row?.categoria),
    pagamento: cleanText(row?.pagamento),
    bandeira: cleanText(row?.bandeira),
    codigoVenda: cleanText(row?.codigo_venda || row?.nsu),
    maquininhaId: cleanText(row?.maquininha_id),
    maquinhaNome: cleanText(row?.maquininha_nome),
    importBatchId: cleanText(row?.importacao_id),
    importadoStone: imported,
    obs: imported ? null : cleanText(row?.observacoes),
    criadoEm: cleanTimestamp(row?.criado_em),
    atualizadoEm: cleanTimestamp(row?.atualizado_em)
  });
}

function financeItemFromRow(category, row) {
  return category === 'receitas' ? receiptFromRow(row) : originalFromRow(row);
}

function financeSelect(category) {
  if (category !== 'receitas') return 'id_legado,dados_origem,atualizado_em';
  return [
    'id_legado', 'data', 'horario_venda', 'valor', 'valor_liquido',
    'descricao', 'categoria', 'pagamento', 'bandeira', 'codigo_venda', 'nsu',
    'maquininha_id', 'maquininha_nome', 'importacao_id', 'importado_stone',
    'criado_em', 'atualizado_em'
  ].join(',');
}

async function loadFinanceRows(category, laundryId) {
  const table = FINANCE_TABLES[category];
  const rows = await paginate(table, {
    select: financeSelect(category),
    lavanderia_id: `eq.${laundryId}`,
    order: category === 'receitas' ? 'data.desc,id.asc' : 'id.asc'
  });

  if (category !== 'receitas') return rows;

  // Observações são necessárias para lançamentos manuais, mas são redundantes
  // nas milhares de vendas importadas. Buscamos somente as poucas observações
  // manuais em uma consulta separada.
  const manualNotes = await paginate(table, {
    select: 'id_legado,observacoes',
    lavanderia_id: `eq.${laundryId}`,
    importado_stone: 'eq.false',
    observacoes: 'not.is.null'
  });
  const notesById = new Map(manualNotes.map(row => [String(row.id_legado), row.observacoes]));
  rows.forEach(row => {
    const note = notesById.get(String(row.id_legado));
    if (note) row.observacoes = note;
  });
  return rows;
}

function compactFinanceItem(category, item) {
  if (category !== 'receitas') return item;
  const helper = typeof window !== 'undefined' ? window.LavaCashFinanceDedupe : null;
  if (typeof helper?.compactReceita === 'function') return helper.compactReceita(item);
  return withoutNulls({
    id: cleanText(item?.id || item?.id_legado),
    data: cleanDate(item?.data),
    horarioVenda: cleanText(item?.horarioVenda),
    valor: cleanNumber(item?.valor, 0),
    valorLiquido: cleanNumber(item?.valorLiquido),
    descricao: cleanText(item?.descricao),
    categoria: cleanText(item?.categoria),
    pagamento: cleanText(item?.pagamento),
    bandeira: cleanText(item?.bandeira),
    codigoVenda: cleanText(item?.codigoVenda || item?.nsu),
    maquininhaId: cleanText(item?.maquininhaId),
    maquinhaNome: cleanText(item?.maquinhaNome || item?.maquininhaNome),
    importBatchId: cleanText(item?.importBatchId),
    importadoStone: cleanBoolean(item?.importadoStone),
    obs: cleanBoolean(item?.importadoStone) ? null : cleanText(item?.obs || item?.observacoes),
    criadoEm: cleanTimestamp(item?.criadoEm || item?.createdAt),
    atualizadoEm: cleanTimestamp(item?.atualizadoEm || item?.updatedAt)
  });
}

function financeRow(category, laundryId, item, index) {
  const base = {
    id_legado: stableItemId(category, item, index),
    lavanderia_id: laundryId,
    ...(category === 'receitas' ? {} : { dados_origem: item }),
    criado_em: cleanTimestamp(item?.criadoEm),
    atualizado_em: cleanTimestamp(item?.atualizadoEm)
  };
  if (category === 'receitas') {
    return withoutNulls({
      ...base,
      data: cleanDate(item?.data),
      horario_venda: cleanText(item?.horarioVenda),
      valor: cleanNumber(item?.valor, 0),
      valor_liquido: cleanNumber(item?.valorLiquido),
      descricao: cleanText(item?.descricao),
      categoria: cleanText(item?.categoria),
      pagamento: cleanText(item?.pagamento),
      bandeira: cleanText(item?.bandeira),
      codigo_venda: cleanText(item?.codigoVenda || item?.nsu),
      maquininha_id: cleanText(item?.maquininhaId),
      maquininha_nome: cleanText(item?.maquinhaNome || item?.maquininhaNome),
      importacao_id: cleanText(item?.importBatchId),
      importado_stone: cleanBoolean(item?.importadoStone),
      observacoes: cleanBoolean(item?.importadoStone) ? null : cleanText(item?.obs || item?.observacoes)
    });
  }
  if (category === 'despesas') {
    return withoutNulls({
      ...base,
      data: cleanDate(item?.data),
      competencia: cleanText(item?.competencia),
      valor: cleanNumber(item?.valor, 0),
      descricao: cleanText(item?.descricao),
      categoria: cleanText(item?.categoria),
      pagamento: cleanText(item?.pagamento),
      tipo_despesa: cleanText(item?.tipoDespesa),
      observacoes: cleanText(item?.obs || item?.observacoes),
      importado_stone: cleanBoolean(item?.importadoStone),
      forma_pagamento_mdr: cleanText(item?.formaPagamentoMdr),
      resumo_mdr: cleanBoolean(item?.resumoMdr || item?.resumoMdrPersistido),
      quantidade_lancamentos: cleanInteger(item?.quantidadeLancamentos),
      primeira_data: cleanDate(item?.primeiraData),
      ultima_data: cleanDate(item?.ultimaData),
      grupo_recorrente_id: cleanText(item?.grupoRecorrenteId),
      recorrente: cleanBoolean(item?.recorrente),
      recorrencia_ativa: item?.recorrenciaAtiva == null ? null : cleanBoolean(item.recorrenciaAtiva),
      recorrencia_chave: cleanText(item?.recorrenciaChave),
      recorrencia_dia: cleanInteger(item?.recorrenciaDia),
      recorrencia_inicio: cleanDate(item?.recorrenciaInicio),
      recorrencia_fim: cleanDate(item?.recorrenciaFim),
      recorrencia_periodicidade: cleanText(item?.recorrenciaPeriodicidade),
      recorrencia_origem_id: cleanText(item?.recorrenciaOrigemId),
      recorrencia_excecao: item?.recorrenciaExcecao == null ? null : cleanBoolean(item.recorrenciaExcecao),
      recorrente_gerada: item?.recorrenteGerada == null ? null : cleanBoolean(item.recorrenteGerada)
    });
  }
  if (category === 'investimento') {
    return withoutNulls({
      ...base,
      data: cleanDate(item?.data),
      competencia: cleanText(item?.competencia),
      valor: cleanNumber(item?.valor, 0),
      valor_nao_vinculado: cleanNumber(item?.valorNaoVinculado),
      percentual_investido: cleanNumber(item?.percentualInvestidoConfigurado),
      percentual_nao_vinculado: cleanNumber(item?.percentualNaoVinculado),
      descricao: cleanText(item?.descricao),
      categoria: cleanText(item?.categoria),
      fornecedor: cleanText(item?.fornecedor),
      socio_id: cleanText(item?.socioId),
      tipo_movimentacao: cleanText(item?.tipoMovimentacao),
      observacoes: cleanText(item?.observacoes || item?.obs),
      rateio_socios: Array.isArray(item?.rateioSocios) ? item.rateioSocios : []
    });
  }
  if (category === 'maquininhas_cadastradas') {
    return withoutNulls({
      ...base,
      nome: cleanText(item?.nome) || `Maquininha ${index + 1}`,
      tipo: cleanText(item?.tipo),
      ativa: cleanBoolean(item?.ativa, true),
      preset: cleanText(item?.preset),
      auto_mdr: cleanBoolean(item?.autoMDR),
      categoria_mdr: cleanText(item?.categoriaMDR),
      formato_data: cleanText(item?.formatoData),
      linha_cabecalho: cleanInteger(item?.linhaHeader),
      mapeamento: item?.mapeamento && typeof item.mapeamento === 'object' ? item.mapeamento : {}
    });
  }
  return withoutNulls({
    ...base,
    nome: cleanText(item?.nome) || `Categoria ${index + 1}`,
    descricao: cleanText(item?.descricao)
  });
}

async function readFinance(classification) {
  const category = classification.scopeCategory;
  const rows = await loadFinanceRows(category, classification.scopeLaundryId);
  return rows.map(row => compactFinanceItem(category, financeItemFromRow(category, row)));
}

async function writeFinance(classification, input, options = {}) {
  const category = classification.scopeCategory;
  const table = FINANCE_TABLES[category];
  if (options.allowDecrease === true && !Array.isArray(options.deletedIds)) {
    throw new Error('Exclusão por lista completa bloqueada. Informe os IDs selecionados ou use deleteFinanceItems.');
  }
  let value = Array.isArray(input) ? input : [];
  if (category === 'despesas' && typeof window.despesasUtils?.compactarMdrMensalParaPersistencia === 'function') {
    value = window.despesasUtils.compactarMdrMensalParaPersistencia(value);
  }

  const currentRows = await loadFinanceRows(category, classification.scopeLaundryId);
  if (PROTECTED_FINANCE_CATEGORIES.has(category) && options.allowDecrease !== true) {
    value = mergeByIdentity(currentRows.map(row => financeItemFromRow(category, row)), value);
  }

  const compactValue = value.map(item => compactFinanceItem(category, item));
  const nextRows = compactValue.map((item, index) => financeRow(category, classification.scopeLaundryId, item, index));
  const currentById = new Map(currentRows.map(row => [
    String(row.id_legado),
    compactFinanceItem(category, financeItemFromRow(category, row))
  ]));
  const changedRows = nextRows.filter((row, index) => {
    const current = currentById.get(String(row.id_legado));
    return !current || JSON.stringify(current) !== JSON.stringify(compactValue[index]);
  });
  await upsertRows(table, changedRows, ['lavanderia_id', 'id_legado']);

  if (options.allowDecrease === true) {
    const nextIds = new Set(nextRows.map(row => String(row.id_legado)));
    const selected = new Set(options.deletedIds.map(String));
    const missing = currentRows.map(row => String(row.id_legado)).filter(id => selected.has(id) && !nextIds.has(id));
    for (let offset = 0; offset < missing.length; offset += 100) {
      await deleteFinanceItems(classification.storageKey, missing.slice(offset, offset + 100));
    }
  }
  return true;
}

async function upsertFinanceItems(classification, input) {
  const category = classification.scopeCategory;
  const table = FINANCE_TABLES[category];
  if (!table) throw new Error('A chave informada não representa dados financeiros.');

  let values = Array.isArray(input) ? input : [];
  if (category === 'despesas' && typeof window.despesasUtils?.compactarMdrMensalParaPersistencia === 'function') {
    values = window.despesasUtils.compactarMdrMensalParaPersistencia(values);
  }
  const rows = values
    .map(item => compactFinanceItem(category, item))
    .map((item, index) => financeRow(category, classification.scopeLaundryId, item, index));
  await upsertRows(table, rows, ['lavanderia_id', 'id_legado']);
  return true;
}

function buildFinancePageFilters(category, options = {}) {
  const query = {};
  const year = Number(options.year);
  const month = Number(options.month);
  let startDate = cleanDate(options.startDate);
  let endDate = cleanDate(options.endDate);

  if (Number.isInteger(year) && year >= 2000 && year <= 2200) {
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      const mm = String(month).padStart(2, '0');
      const lastDay = new Date(year, month, 0).getDate();
      startDate = `${year}-${mm}-01`;
      endDate = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
    } else {
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
    }
  }

  if (startDate) query.data = `gte.${startDate}`;
  if (endDate) query.data = query.data ? `${query.data}&data=lte.${endDate}` : `lte.${endDate}`;
  if (category === 'receitas' && cleanText(options.payment)) {
    query.pagamento = `eq.${cleanText(options.payment)}`;
  }
  return { query, startDate, endDate };
}

async function getFinancePage(key, options = {}) {
  const classification = classifyStorageKey(key);
  const category = classification.scopeCategory;
  const table = FINANCE_TABLES[category];
  if (!table) throw new Error('A chave informada não representa dados financeiros.');

  const pageSize = Math.min(250, Math.max(10, Number(options.pageSize) || 100));
  const page = Math.max(1, Number(options.page) || 1);
  const offset = (page - 1) * pageSize;
  const filters = buildFinancePageFilters(category, options);
  const select = category === 'receitas'
    ? `${financeSelect(category)},observacoes`
    : financeSelect(category);
  const query = {
    select,
    lavanderia_id: `eq.${classification.scopeLaundryId}`,
    ...filters.query,
    order: category === 'receitas' ? 'data.desc,id_legado.desc' : 'data.desc,id_legado.desc'
  };

  // URLSearchParams não aceita duas chaves "data" no mesmo objeto. Quando há
  // início e fim usamos a sintaxe PostgREST "and" para manter ambos os limites.
  if (filters.startDate && filters.endDate) {
    delete query.data;
    query.and = `(data.gte.${filters.startDate},data.lte.${filters.endDate})`;
  }

  const response = await request(table, {
    query,
    range: `${offset}-${offset + pageSize - 1}`,
    prefer: 'count=exact'
  });
  const rows = Array.isArray(response.data) ? response.data : [];
  const items = rows.map(row => compactFinanceItem(category, financeItemFromRow(category, row)));
  const totalCount = Number.isFinite(response.count) ? response.count : items.length;

  let summary = {
    totalCount,
    totalValue: items.reduce((total, item) => total + Number(item?.valor || 0), 0),
    averageValue: 0,
    years: []
  };
  if (category === 'receitas') {
    summary = await callRpc('resumo_receitas_periodo', {
      p_lavanderia_id: classification.scopeLaundryId,
      p_inicio: filters.startDate,
      p_fim: filters.endDate,
      p_pagamento: cleanText(options.payment)
    }) || summary;
  }

  return {
    items,
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    summary
  };
}

async function deleteFinanceItems(key, ids) {
  const classification = classifyStorageKey(key);
  const table = FINANCE_TABLES[classification.scopeCategory];
  const normalizedIds = [...new Set((Array.isArray(ids) ? ids : [ids]).map(cleanText).filter(Boolean))];
  if (!table || !normalizedIds.length) return 0;
  let removed = 0;
  for (let offset = 0; offset < normalizedIds.length; offset += 100) {
    const query = { lavanderia_id: `eq.${classification.scopeLaundryId}`, id_legado: postgrestList(normalizedIds.slice(offset, offset + 100)) };
    const response = await request(table, { method: 'DELETE', query: { ...query, select: 'id_legado' }, prefer: 'return=representation' });
    if (!Array.isArray(response.data)) throw new Error('O Supabase não confirmou a exclusão. Atualize da nuvem.');
    removed += response.data.length;
    const remaining = await request(table, { query: { ...query, select: 'id_legado' } });
    if (!Array.isArray(remaining.data) || remaining.data.length) {
      throw new Error('A exclusão não foi concluída. Verifique as permissões de exclusão (RLS).');
    }
  }
  return removed;
}

async function createFullBackup() {
  const tables = [
    'lavanderias',
    'receitas',
    'despesas',
    'investimentos',
    'maquininhas',
    'categorias_despesa',
    'importacoes_vendas',
    'configuracoes',
    'verificacoes_integridade'
  ];
  const data = {};
  for (const table of tables) {
    try {
      data[table] = await paginate(table, { select: '*', order: 'criado_em.asc' });
    } catch (error) {
      // A primeira execução do site pode ocorrer antes da migration de
      // integridade. O backup dos demais dados continua válido.
      if (table === 'verificacoes_integridade' && /404|PGRST205/.test(String(error?.message || error))) {
        data[table] = [];
        continue;
      }
      throw error;
    }
  }
  return {
    format: 'lavacash-supabase-backup-v1',
    createdAt: new Date().toISOString(),
    backend: 'supabase',
    data
  };
}

async function readConfig(scope, scopeId, key, fallback) {
  const rows = await request('configuracoes', {
    query: {
      select: 'valor',
      escopo: `eq.${scope}`,
      escopo_id: `eq.${scopeId}`,
      chave: `eq.${key}`,
      limit: 1
    }
  });
  return rows.data?.[0]?.valor ?? fallback;
}

async function writeConfig(scope, scopeId, key, value) {
  await upsertRows('configuracoes', [{ escopo: scope, escopo_id: scopeId, chave: key, valor: value }], [
    'escopo', 'escopo_id', 'chave'
  ]);
  return true;
}

async function membershipsForProfiles(profileIds) {
  if (!profileIds.length) return [];
  const memberships = [];
  for (let offset = 0; offset < profileIds.length; offset += 100) {
    memberships.push(...await paginate('usuarios_lavanderias', {
      select: '*',
      perfil_id: postgrestList(profileIds.slice(offset, offset + 100))
    }));
  }
  return memberships;
}

function legacyProfile(profile, memberships = []) {
  const laundries = memberships
    .filter(item => item.perfil_id === profile.id && item.ativo !== false)
    .map(item => item.lavanderia_id);
  const role = normalizeRole(profile.tipo_acesso);
  const source = stripSensitive(profile.dados_origem || {});
  return {
    ...source,
    perfilId: profile.id,
    id: source.id || profile.id,
    uid: profile.uid_firebase || source.uid || '',
    nome: profile.nome || source.nome || source.name || '',
    name: profile.nome || source.name || source.nome || '',
    email: profile.email || source.email || '',
    telefone: profile.telefone || source.telefone || '',
    tipoAcesso: role,
    role: role === 'desenvolvedor' ? 'developer' : role === 'admin' ? 'cadastrador' : 'visualizador',
    aprovado: profile.aprovado !== false,
    active: profile.ativo !== false,
    lavanderias: role === 'desenvolvedor' ? ['all'] : laundries,
    criadoEm: profile.criado_em || source.criadoEm || source.createdAt,
    createdAt: profile.criado_em || source.createdAt || source.criadoEm
  };
}

async function readProfiles(filters = {}) {
  const query = { select: '*', order: 'criado_em.asc', ...filters };
  const profiles = await paginate('perfis', query);
  const memberships = await membershipsForProfiles(profiles.map(profile => profile.id));
  return profiles.map(profile => legacyProfile(profile, memberships));
}

async function findProfile(user) {
  const uid = cleanText(user?.uid || user?.uid_firebase);
  const email = normalizeEmail(user?.email);
  if (uid) {
    const result = await readProfiles({ uid_firebase: `eq.${uid}`, limit: 1 });
    if (result.length) return result[0];
  }
  if (email) {
    const result = await readProfiles({ email: `eq.${email}`, limit: 1 });
    if (result.length) return result[0];
  }
  return null;
}

async function setUserAccess(user) {
  const clean = stripSensitive(user && typeof user === 'object' ? user : {});
  const email = normalizeEmail(clean.email);
  if (!email) return null;
  const existing = await findProfile(clean);
  const profileId = existing?.perfilId && /^[0-9a-f-]{36}$/i.test(existing.perfilId)
    ? existing.perfilId
    : deterministicUuid(clean.uid || email);
  const role = normalizeRole(clean.tipoAcesso || clean.role);
  const profile = withoutNulls({
    id: profileId,
    uid_firebase: cleanText(clean.uid),
    nome: cleanText(clean.nome || clean.name),
    email,
    telefone: cleanText(clean.telefone || clean.phone),
    tipo_acesso: role,
    ativo: clean.active !== false,
    aprovado: clean.aprovado !== false && clean.active !== false,
    dados_origem: clean
  });
  await upsertRows('perfis', [profile], ['id']);

  const laundryIds = Array.isArray(clean.lavanderias)
    ? clean.lavanderias.map(item => String(item || '').trim()).filter(item => item && item !== 'all')
    : [];
  if (laundryIds.length) {
    await upsertRows('usuarios_lavanderias', laundryIds.map(laundryId => ({
      perfil_id: profileId,
      lavanderia_id: laundryId,
      tipo_acesso: role === 'visualizador' ? 'visualizador' : 'admin',
      ativo: true
    })), ['perfil_id', 'lavanderia_id']);
  }
  return legacyProfile(profile, laundryIds.map(lavanderia_id => ({ perfil_id: profileId, lavanderia_id, ativo: true })));
}

async function readLaundries() {
  const rows = await paginate('lavanderias', { select: '*', order: 'nome.asc' });
  return rows.map(row => ({
    ...(row.dados_origem || {}),
    id: row.id,
    nome: row.nome,
    ativa: row.ativa,
    telefone: row.telefone || row.dados_origem?.telefone || '',
    endereco: row.endereco || row.dados_origem?.endereco || '',
    socios: row.socios || []
  }));
}

async function writeLaundries(value) {
  const rows = (Array.isArray(value) ? value : []).map((item, index) => withoutNulls({
    id: cleanText(item?.id) || `lav-${hashText(JSON.stringify(item))}-${index}`,
    nome: cleanText(item?.nome) || `Lavanderia ${index + 1}`,
    ativa: cleanBoolean(item?.ativa, true),
    telefone: cleanText(item?.telefone),
    endereco: cleanText(item?.endereco),
    socios: Array.isArray(item?.socios) ? item.socios : [],
    dados_origem: item,
    criado_em: cleanTimestamp(item?.criadoEm),
    atualizado_em: cleanTimestamp(item?.atualizadoEm)
  }));
  await upsertRows('lavanderias', rows, ['id']);
  return true;
}

function pendingRow(request) {
  const source = stripSensitive(request && typeof request === 'object' ? request : {});
  const legacyId = cleanText(source.id) || `sol_${normalizeEmail(source.email)}`;
  return withoutNulls({
    id: deterministicUuid(legacyId),
    nome: cleanText(source.nome || source.name),
    email: normalizeEmail(source.email),
    telefone: cleanText(source.telefone || source.phone),
    lavanderia_solicitada: cleanText(source.lavanderiaSolicitada || source.nomeLavanderia),
    provedor: cleanText(source.origem || source.provedor) || 'firebase',
    status: cleanText(source.status) || 'pendente',
    dados_origem: { ...source, id: legacyId },
    criado_em: cleanTimestamp(source.dataRegistro || source.createdAt)
  });
}

async function addPendingAccessRequest(requestValue) {
  const row = pendingRow(requestValue);
  if (!row.nome || !row.email) throw new Error('Solicitação de cadastro sem nome ou e-mail.');
  await request('cadastros_pendentes', {
    method: 'POST',
    body: row,
    prefer: 'return=minimal',
    anonymous: true
  });
  return { ...row.dados_origem, id: row.dados_origem.id };
}

async function getPendingAccessRequests() {
  const rows = await paginate('cadastros_pendentes', { select: '*', order: 'criado_em.asc' });
  return rows.map(row => ({
    ...(row.dados_origem || {}),
    id: row.dados_origem?.id || row.id,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone || '',
    lavanderiaSolicitada: row.lavanderia_solicitada || '',
    status: row.status,
    dataRegistro: row.criado_em
  }));
}

async function removePendingAccessRequest(id) {
  await deleteRows('cadastros_pendentes', { id: `eq.${deterministicUuid(String(id || ''))}` });
  return true;
}

async function readImport(classification, fallback) {
  const rows = await paginate('importacoes_vendas', {
    select: 'id_legado,detalhes,criado_em,atualizado_em',
    lavanderia_id: `eq.${classification.scopeLaundryId}`,
    order: 'criado_em.desc'
  });
  const values = rows.map(row => ({ ...(row.detalhes || {}), id: row.detalhes?.id || row.id_legado }));
  return ['ultima_importacao_vendas', 'last_import_batch'].includes(classification.scopeCategory)
    ? (values[0] ?? fallback)
    : values;
}

async function writeImport(classification, input) {
  const values = Array.isArray(input) ? input : input ? [input] : [];
  const rows = values.map((item, index) => withoutNulls({
    id_legado: stableItemId('importacao', item, index),
    lavanderia_id: classification.scopeLaundryId,
    maquininha_id: cleanText(item?.maquininhaId),
    maquininha_nome: cleanText(item?.maquininhaNome),
    arquivos_origem: Array.isArray(item?.sourceFiles) ? item.sourceFiles : [],
    periodos: Array.isArray(item?.periods) ? item.periods : [],
    resumo: item?.summary && typeof item.summary === 'object' ? item.summary : {},
    avisos: Array.isArray(item?.warnings) ? item.warnings : [],
    auditoria: item?.audit && typeof item.audit === 'object' ? item.audit : {},
    detalhes: item,
    criado_em: cleanTimestamp(item?.createdAt || item?.criadoEm),
    atualizado_em: cleanTimestamp(item?.updatedAt || item?.atualizadoEm)
  }));
  await upsertRows('importacoes_vendas', rows, ['lavanderia_id', 'id_legado']);
  return true;
}

async function readRemoteItem(key, fallback = null) {
  const classification = classifyStorageKey(key);
  if (FINANCE_TABLES[classification.scopeCategory]) return readFinance(classification);
  if (IMPORT_CATEGORIES.has(classification.scopeCategory)) return readImport(classification, fallback);
  if (classification.scopeType === 'laundry') {
    return readConfig('lavanderia', classification.scopeLaundryId, classification.configKey, fallback);
  }
  if (key === 'lavanderias_lavaja') return readLaundries();
  if (['usuarios_lavaja', 'usuarios_lavaja_public', 'irancash_users_db'].includes(key)) return readProfiles();
  if (key === 'cadastros_pendentes') return getPendingAccessRequests();
  if (classification.scopeType === 'user') {
    const uid = key.slice('user_'.length);
    return (await readProfiles({ uid_firebase: `eq.${uid}`, limit: 1 }))[0] ?? fallback;
  }
  if (classification.scopeType === 'system') return readConfig('sistema', 'sistema', key, fallback);
  const rows = await request('dados_legados', {
    query: { select: 'valor', chave: `eq.${key}`, limit: 1 }
  });
  return rows.data?.[0]?.valor ?? fallback;
}

async function writeRemoteItem(key, value, options = {}) {
  const classification = classifyStorageKey(key);
  if (FINANCE_TABLES[classification.scopeCategory]) return writeFinance(classification, value, options);
  if (IMPORT_CATEGORIES.has(classification.scopeCategory)) return writeImport(classification, value);
  if (classification.scopeType === 'laundry') {
    return writeConfig('lavanderia', classification.scopeLaundryId, classification.configKey, value);
  }
  if (key === 'lavanderias_lavaja') return writeLaundries(value);
  if (['usuarios_lavaja', 'usuarios_lavaja_public', 'irancash_users_db'].includes(key)) {
    for (const user of Array.isArray(value) ? value : []) await setUserAccess(user);
    return true;
  }
  if (key === 'cadastros_pendentes') {
    for (const item of Array.isArray(value) ? value : []) await addPendingAccessRequest(item);
    return true;
  }
  if (classification.scopeType === 'user') return Boolean(await setUserAccess(value));
  if (classification.scopeType === 'system') return writeConfig('sistema', 'sistema', key, value);
  await upsertRows('dados_legados', [{
    chave: key,
    lavanderia_id: null,
    categoria: 'legacy',
    valor: value,
    metadados: { origem: 'supabase-store' }
  }], ['chave']);
  return true;
}

async function removeRemoteItem(key) {
  const classification = classifyStorageKey(key);
  if (FINANCE_TABLES[classification.scopeCategory]) {
    await deleteRows(FINANCE_TABLES[classification.scopeCategory], {
      lavanderia_id: `eq.${classification.scopeLaundryId}`
    });
    return true;
  }
  if (IMPORT_CATEGORIES.has(classification.scopeCategory)) {
    await deleteRows('importacoes_vendas', { lavanderia_id: `eq.${classification.scopeLaundryId}` });
    return true;
  }
  if (classification.scopeType === 'laundry') {
    await deleteRows('configuracoes', {
      escopo: 'eq.lavanderia',
      escopo_id: `eq.${classification.scopeLaundryId}`,
      chave: `eq.${classification.configKey}`
    });
    return true;
  }
  if (classification.scopeType === 'user') {
    await deleteRows('perfis', { uid_firebase: `eq.${key.slice('user_'.length)}` });
    return true;
  }
  if (classification.scopeType === 'system') {
    await deleteRows('configuracoes', { escopo: 'eq.sistema', escopo_id: 'eq.sistema', chave: `eq.${key}` });
    return true;
  }
  await deleteRows('dados_legados', { chave: `eq.${key}` });
  return true;
}

async function keyVersion(key) {
  const classification = classifyStorageKey(key);
  const table = FINANCE_TABLES[classification.scopeCategory]
    || (IMPORT_CATEGORIES.has(classification.scopeCategory) ? 'importacoes_vendas' : null);
  if (table) {
    const response = await request(table, {
      query: {
        select: 'atualizado_em',
        lavanderia_id: `eq.${classification.scopeLaundryId}`,
        order: 'atualizado_em.desc',
        limit: 1
      },
      range: '0-0',
      prefer: 'count=exact'
    });
    return `${response.count}:${response.data?.[0]?.atualizado_em || ''}`;
  }
  return JSON.stringify(await readRemoteItem(key, null));
}

async function flushPendingWrites() {
  if (pendingFlushPromise) return pendingFlushPromise;
  const run = async () => {
    if (!initialized || !auth?.currentUser) return { success: false, flushed: 0, pending: readPendingWrites().length };
    let flushed = 0;
    const blocked = new Set();
    for (const item of readPendingWrites()) {
      // Old queue entries contain no immutable payload or selected deletion IDs.
      // Preserve them for recovery instead of guessing from a changed cache.
      if (item.legacy || !item.uid || item.uid !== auth.currentUser.uid) {
        blocked.add(item.key);
        continue;
      }
      if (blocked.has(item.key)) continue;
      // A second tab may already have acknowledged this exact operation.
      if (!localStorage.getItem(item.storageKey)) continue;
      try {
        if (item.operation === 'remove') {
          await removeRemoteItem(item.key);
        } else if (item.operation === 'upsert') {
          await upsertFinanceItems(classifyStorageKey(item.key), item.value);
        } else {
          if (!Object.hasOwn(item, 'value')) throw new Error('Pendência sem conteúdo preservado.');
          await writeRemoteItem(item.key, item.value, { allowDecrease: item.allowDecrease, deletedIds: item.deletedIds });
        }
        localStorage.removeItem(item.storageKey);
        flushed += 1;
      } catch (error) {
        blocked.add(item.key);
        console.warn('[SupabaseStore] Pendência preservada:', item.key, error);
      }
    }
    const pending = readPendingWrites().length;
    return { success: pending === 0, flushed, pending };
  };
  pendingFlushPromise = (navigator.locks?.request
    ? navigator.locks.request('lavacash-supabase-flush-v2', run)
    : run()).finally(() => { pendingFlushPromise = null; });
  return pendingFlushPromise;
}

function reconcileFinanceSnapshot(key, local, remote) {
  if (!Array.isArray(remote)) throw new Error('Resposta financeira inválida do servidor.');
  const byId = new Map(remote.map(item => [String(item.id), item]));
  const divergent = (Array.isArray(local) ? local : []).filter(item =>
    JSON.stringify(item) !== JSON.stringify(byId.get(String(item.id))));
  if (divergent.length) {
    const backupKey = 'lavacash_recovery_' + key;
    const saved = JSON.parse(localStorage.getItem(backupKey) || 'null');
    const snapshots = Array.isArray(saved?.snapshots) ? saved.snapshots :
      (saved?.dados ? [{ savedAt: saved.savedAt, dados: saved.dados }] : []);
    if (!snapshots.some(snapshot => JSON.stringify(snapshot.dados) === JSON.stringify(divergent))) {
      snapshots.push({ savedAt: new Date().toISOString(), dados: divergent });
      localStorage.setItem(backupKey, JSON.stringify({ snapshots }));
    }
  }
  return JSON.parse(JSON.stringify(remote));
}

function expenseConflict(message) {
  const error = new Error(message || 'Esta despesa foi alterada em outro aparelho. Atualize da nuvem antes de editar.');
  error.code = 'supabase/conflict';
  return error;
}

async function saveExpenseChanges(key, changes) {
  const classification = classifyStorageKey(key);
  if (classification.scopeCategory !== 'despesas') throw new Error('Operação exclusiva de despesas.');
  await getAccessToken();
  if (readPendingWrites().some(item => item.key === key)) {
    throw new Error('Há alterações locais pendentes desta lavanderia. Exporte a cópia local e revise as pendências antes de gravar novas alterações.');
  }
  const current = await loadFinanceRows('despesas', classification.scopeLaundryId);
  const byId = new Map(current.map(row => [String(row.id_legado), row]));
  const completed = [];
  try {
    for (const change of changes) {
      const id = cleanText(change.after?.id);
      if (!id) throw new Error('Despesa sem identificador.');
      const row = byId.get(id);
      const body = financeRow('despesas', classification.scopeLaundryId, change.after, 0);
      if (change.before) {
        if (!row) throw expenseConflict('Esta despesa foi excluída em outro aparelho. Atualize da nuvem; ela não será recriada automaticamente.');
        const previous = change.before.atualizadoEm || change.before.criadoEm || null;
        const remote = row.dados_origem?.atualizadoEm || row.dados_origem?.criadoEm || null;
        if (previous !== remote) throw expenseConflict();
        if (!previous && JSON.stringify(compactFinanceItem('despesas', change.before)) !==
            JSON.stringify(compactFinanceItem('despesas', financeItemFromRow('despesas', row)))) {
          throw expenseConflict();
        }
        const response = await request('despesas', {
          method: 'PATCH',
          query: {
            lavanderia_id: `eq.${classification.scopeLaundryId}`, id_legado: `eq.${id}`,
            atualizado_em: row.atualizado_em ? `eq.${row.atualizado_em}` : 'is.null'
          }, body, prefer: 'return=representation'
        });
        if (!Array.isArray(response.data) || response.data.length !== 1) throw expenseConflict();
      } else {
        if (row) {
          const business = value => JSON.stringify(Object.fromEntries(Object.entries(value || {})
            .filter(([field]) => !['criadoEm', 'atualizadoEm'].includes(field)).sort(([a], [b]) => a.localeCompare(b))));
          if (business(row.dados_origem) === business(change.after)) {
            change.after = { ...row.dados_origem, id };
            completed.push(id); continue;
          }
          throw expenseConflict('Já existe uma despesa com esse identificador. Atualize da nuvem.');
        }
        const response = await request('despesas', {
          method: 'POST', query: { on_conflict: 'lavanderia_id,id_legado' },
          body: [body], prefer: 'resolution=ignore-duplicates,return=representation'
        });
        if (!Array.isArray(response.data) || response.data.length !== 1) throw expenseConflict();
      }
      completed.push(id);
    }
    return true;
  } catch (error) {
    error.completedIds = completed;
    if (completed.length) error.message = `${completed.length} alteração(ões) confirmada(s); as demais não foram confirmadas. ${error.message}`;
    throw error;
  }
}

async function migrateFromLocalStorage(store) {
  if (!auth?.currentUser) return { migrated: 0, skipped: true };
  let migrated = 0;
  const keys = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && !LOCAL_ONLY_KEYS.has(key) && !key.startsWith(PENDING_ENTRY_PREFIX) && !key.startsWith('lavacash_recovery_')) keys.push(key);
    }
  } catch (error) {}
  for (const key of keys) {
    const classification = classifyStorageKey(key);
    if (!['laundry', 'user', 'system'].includes(classification.scopeType)) continue;
    if (FINANCE_TABLES[classification.scopeCategory]) continue; // Financial recovery requires explicit review.
    try {
      const remote = await store.getItemFromServer(key, undefined);
      const empty = remote == null || (Array.isArray(remote) && remote.length === 0)
        || (typeof remote === 'object' && !Array.isArray(remote) && Object.keys(remote).length === 0);
      if (empty) {
        await store.setItem(key, localValue(key, null));
        migrated += 1;
      } else {
        cacheValueForKey(key, remote);
      }
    } catch (error) {}
  }
  return { migrated };
}

const FirebaseStore = {
  reconcileFinanceSnapshot,
  async setItem(key, value, options = {}) {
    if (!initialized) throw new Error('SupabaseStore não inicializado');
    if (options.allowDecrease === true && !Array.isArray(options.deletedIds)) {
      throw new Error('Exclusão por lista completa bloqueada. Use os IDs explicitamente selecionados.');
    }
    const id = enqueuePendingWrite(key, 'set', options, value);
    cacheValueForKey(key, value);
    await waitForAuthStateReady();
    await flushPendingWrites();
    return localStorage.getItem(PENDING_ENTRY_PREFIX + id) === null;
  },

  async upsertItems(key, items) {
    if (!initialized) throw new Error('SupabaseStore não inicializado');
    const classification = classifyStorageKey(key);
    if (!FINANCE_TABLES[classification.scopeCategory]) throw new Error('Chave financeira inválida.');
    const id = enqueuePendingWrite(key, 'upsert', {}, items);
    await waitForAuthStateReady();
    await flushPendingWrites();
    return localStorage.getItem(PENDING_ENTRY_PREFIX + id) === null;
  },

  async saveExpenseChanges(key, changes) {
    if (!initialized) throw new Error('SupabaseStore não inicializado');
    return saveExpenseChanges(key, changes);
  },

  async checkConnection() {
    await getAccessToken();
    await request('despesas', { query: { select: 'id_legado', limit: 0 } });
    return true;
  },

  async getItem(key, defaultValue = null) {
    if (!initialized) throw new Error('SupabaseStore não inicializado');
    await waitForAuthStateReady();
    if (!auth?.currentUser) return localValue(key, defaultValue);
    if (inFlightReads.has(key)) return inFlightReads.get(key);
    const task = readRemoteItem(key, defaultValue)
      .then(value => {
        if (value !== undefined && value !== null) cacheValueForKey(key, value);
        return value;
      })
      .catch(error => {
        console.error(`[SupabaseStore] Erro ao ler ${key}:`, error);
        return localValue(key, defaultValue);
      });
    inFlightReads.set(key, task);
    try { return await task; } finally { inFlightReads.delete(key); }
  },

  async getItemFromServer(key, defaultValue = null) {
    return readRemoteItem(key, defaultValue);
  },

  async getItemFromRestServer(key, defaultValue = null) {
    return readRemoteItem(key, defaultValue);
  },

  async getFinancePage(key, options = {}) {
    if (!initialized) throw new Error('SupabaseStore não inicializado');
    await getAccessToken();
    return getFinancePage(key, options);
  },

  async getDashboardSummary(laundryId, year) {
    if (!initialized) throw new Error('SupabaseStore não inicializado');
    await getAccessToken();
    return callRpc('resumo_dashboard_financeiro', {
      p_lavanderia_id: cleanText(laundryId),
      p_ano: Number(year) || new Date().getFullYear()
    });
  },

  async deleteFinanceItems(key, ids) {
    if (!initialized) throw new Error('SupabaseStore não inicializado');
    await getAccessToken();
    const removed = await deleteFinanceItems(key, ids);
    try {
      const cached = await cachedValueForKey(key, null);
      if (Array.isArray(cached)) {
        const removedIds = new Set((Array.isArray(ids) ? ids : [ids]).map(String));
        cacheValueForKey(key, cached.filter(item => !removedIds.has(String(item?.id))));
      }
    } catch (error) {}
    return removed;
  },

  async createFullBackup() {
    if (!initialized) throw new Error('SupabaseStore não inicializado');
    await getAccessToken();
    return createFullBackup();
  },

  async runDailyIntegrityCheck(laundryId) {
    if (!initialized) throw new Error('SupabaseStore não inicializado');
    await getAccessToken();
    return callRpc('registrar_verificacao_integridade', {
      p_lavanderia_id: cleanText(laundryId)
    });
  },

  async getLatestIntegrityCheck(laundryId) {
    if (!initialized) throw new Error('SupabaseStore não inicializado');
    const response = await request('verificacoes_integridade', {
      query: {
        select: 'data_verificacao,metricas,atualizado_em',
        lavanderia_id: `eq.${cleanText(laundryId)}`,
        order: 'data_verificacao.desc',
        limit: 1
      }
    });
    return response.data?.[0] || null;
  },

  async removeItem(key) {
    if (!initialized) throw new Error('SupabaseStore não inicializado');
    if (FINANCE_TABLES[classifyStorageKey(key).scopeCategory]) {
      throw new Error('Remoção de coleção financeira bloqueada. Selecione os registros explicitamente.');
    }
    const id = enqueuePendingWrite(key, 'remove');
    await waitForAuthStateReady();
    await flushPendingWrites();
    if (localStorage.getItem(PENDING_ENTRY_PREFIX + id) !== null) return false;
    localStorage.removeItem(key);
    if (window.IndexedDBStore?.removeItem) await window.IndexedDBStore.removeItem(key);
    return true;
  },

  async getAllKeys() {
    const configs = await paginate('configuracoes', { select: 'escopo,escopo_id,chave' });
    return configs.map(item => item.escopo === 'lavanderia'
      ? `${item.escopo_id}_config_${item.chave}`
      : item.chave);
  },

  async getAll() {
    const result = {};
    for (const key of await this.getAllKeys()) result[key] = await this.getItem(key, null);
    return result;
  },

  async clear() {
    console.warn('[SupabaseStore] Limpeza total bloqueada por segurança.');
    return false;
  },

  subscribe(key, callback, options = {}) {
    if (!initialized || typeof callback !== 'function') return () => {};
    let active = true;
    let checking = false;
    let version = '';
    const check = async (initial = false) => {
      if (!active || checking || !auth?.currentUser) return;
      checking = true;
      try {
        const nextVersion = await keyVersion(key);
        if (initial || nextVersion !== version) {
          const value = await readRemoteItem(key, null);
          if (active) await callback(value, { writeIntent: 'replace', itemCount: Array.isArray(value) ? value.length : null, fromCache: false });
          version = nextVersion;
        }
      } catch (error) {
        console.error(`[SupabaseStore] Erro ao acompanhar ${key}:`, error);
      } finally {
        checking = false;
      }
    };
    if (options.initial !== false) check(true);
    const timer = setInterval(() => check(false), SUBSCRIPTION_POLL_MS);
    return () => { active = false; clearInterval(timer); };
  },

  async migrateFromLocalStorage() { return migrateFromLocalStorage(this); },
  isAvailable: async () => initialized,
  isAuthenticated: () => Boolean(auth?.currentUser),
  getDB: () => null,
  getAuth: () => auth,
  addPendingAccessRequest,
  getPendingAccessRequests,
  subscribePendingAccessRequests(callback) {
    return this.subscribe('cadastros_pendentes', callback);
  },
  removePendingAccessRequest,
  setUserAccess,
  async syncUserAccessDocs(users = []) {
    let synced = 0;
    for (const user of Array.isArray(users) ? users : []) {
      if (await setUserAccess(user)) synced += 1;
    }
    return { success: true, synced };
  },
  async getUserAccess(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    return (await readProfiles({ email: `eq.${normalized}`, limit: 1 }))[0] || null;
  },
  flushPendingWrites,
  getPendingWrites: () => readPendingWrites(),
  _classifyStorageKey: classifyStorageKey,
  initialized: () => initialized,
  backend: 'supabase'
};

function exposeGlobalAPI() {
  window.FirebaseStore = FirebaseStore;
  const flush = () => flushPendingWrites().catch(error => {
    console.warn('[SupabaseStore] Não foi possível sincronizar pendências:', error);
  });
  window.addEventListener('firebase:auth-user', flush);
  window.addEventListener('firebase:claims-synced', flush);
  window.addEventListener('online', flush);
  setInterval(flush, 30000);
  setTimeout(flush, 2500);
}

export async function initStore(firebaseApp) {
  if (initialized) return true;
  if (!supabaseConfig.url || !supabaseConfig.publishableKey) {
    throw new Error('Configuração do Supabase incompleta.');
  }
  auth = getAuth(firebaseApp);
  initialized = true;
  exposeGlobalAPI();
  onAuthStateChanged(auth, user => {
    if (!user) return;
    log('[SupabaseStore] Sessão Firebase pronta para o Supabase.');
    flushPendingWrites().catch(() => {});
  });
  log('[SupabaseStore] Banco Supabase inicializado.');
  return true;
}
