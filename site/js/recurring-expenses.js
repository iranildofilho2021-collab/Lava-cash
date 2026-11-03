(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.LavaCashRecurring = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const TIPOS_DESPESA = {
    fixa: 'Fixa',
    variavel: 'Variável',
    eventual: 'Eventual'
  };

  function removerAcentos(valor) {
    return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function normalizarTipoDespesa(tipo) {
    const token = removerAcentos(tipo).toLowerCase().trim();
    if (['fixa', 'fixo', 'fixed'].includes(token)) return 'fixa';
    if (['variavel', 'variable'].includes(token)) return 'variavel';
    if (['eventual', 'pontual', 'oneoff', 'unica'].includes(token)) return 'eventual';
    return 'eventual';
  }

  function getTipoDespesaLabel(tipo) {
    return TIPOS_DESPESA[normalizarTipoDespesa(tipo)] || TIPOS_DESPESA.eventual;
  }

  function getCompetenciaFromDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 7) return '';
    return dateStr.slice(0, 7);
  }

  function formatCompetencia(year, monthIndex) {
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  }

  function getCompetenciaFromDateObject(dateObj) {
    const date = dateObj instanceof Date ? dateObj : new Date();
    return formatCompetencia(date.getFullYear(), date.getMonth());
  }

  function addMonthsToCompetencia(competencia, offset) {
    if (!competencia) return '';
    const [year, month] = competencia.split('-').map(Number);
    if (!year || !month) return '';
    const date = new Date(year, month - 1 + Number(offset || 0), 1);
    return formatCompetencia(date.getFullYear(), date.getMonth());
  }

  function buildDateForMonth(baseDay, competencia) {
    if (!competencia) return '';
    const [year, month] = competencia.split('-').map(Number);
    if (!year || !month) return '';
    const lastDay = new Date(year, month, 0).getDate();
    const day = Math.max(1, Math.min(Number(baseDay) || 1, lastDay));
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function getMonthLabel(competencia) {
    if (!competencia) return '';
    const [year, month] = competencia.split('-').map(Number);
    if (!year || !month) return competencia;
    const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
      month: 'short',
      year: 'numeric'
    });
    return label.replace('.', '');
  }

  function getRecorrenciaGroupId(despesa) {
    return String(despesa?.grupoRecorrenteId || despesa?.recorrenciaOrigemId || despesa?.id || '');
  }

  function getRecorrenciaStart(despesa) {
    return despesa?.recorrenciaInicio || despesa?.data || '';
  }

  function isCompetenciaWithinRange(competencia, despesa) {
    const inicio = getCompetenciaFromDate(getRecorrenciaStart(despesa));
    const fim = getCompetenciaFromDate(despesa?.recorrenciaFim || '');
    if (inicio && competencia < inicio) return false;
    if (fim && competencia > fim) return false;
    return true;
  }

  function getExistingOccurrenceKeys(despesas) {
    const keys = new Set();
    (Array.isArray(despesas) ? despesas : []).forEach(despesa => {
      const groupId = getRecorrenciaGroupId(despesa);
      if (!groupId) return;
      const competencia = despesa?.competencia || getCompetenciaFromDate(despesa?.data);
      if (competencia) keys.add(`${groupId}:${competencia}`);
      if (despesa?.recorrenciaChave) keys.add(String(despesa.recorrenciaChave));
    });
    return keys;
  }

  function getRecurringTemplates(despesas) {
    const templatesByGroup = new Map();
    (Array.isArray(despesas) ? despesas : []).forEach(despesa => {
      if (!despesa || despesa.recorrente !== true || despesa.recorrenciaAtiva === false) return;
      if ((despesa.recorrenciaPeriodicidade || 'mensal') !== 'mensal') return;

      const groupId = getRecorrenciaGroupId(despesa);
      if (!groupId) return;

      const current = templatesByGroup.get(groupId);
      const isOrigin = despesa.recorrenciaOrigemId === despesa.id || despesa.id === groupId;
      const currentIsOrigin = current && (current.recorrenciaOrigemId === current.id || current.id === groupId);

      if (!current || (isOrigin && !currentIsOrigin)) {
        templatesByGroup.set(groupId, despesa);
      }
    });
    return Array.from(templatesByGroup.values());
  }

  function createOccurrence(template, competencia, nowIso) {
    const groupId = getRecorrenciaGroupId(template);
    const origemId = String(template.recorrenciaOrigemId || template.id || groupId);
    const recorrenciaDia = Number(template.recorrenciaDia) || Number((template.data || '').slice(8, 10)) || 1;
    const data = buildDateForMonth(recorrenciaDia, competencia);
    const safeGroup = groupId.replace(/[^\w-]/g, '_');

    return {
      ...template,
      id: `rec_${safeGroup}_${competencia.replace('-', '')}`,
      data,
      tipoDespesa: normalizarTipoDespesa(template.tipoDespesa),
      recorrente: false,
      recorrenteGerada: true,
      recorrenciaAtiva: true,
      grupoRecorrenteId: groupId,
      recorrenciaOrigemId: origemId,
      recorrenciaDia,
      recorrenciaPeriodicidade: 'mensal',
      recorrenciaInicio: getRecorrenciaStart(template),
      recorrenciaFim: template.recorrenciaFim || '',
      recorrenciaChave: `${groupId}:${competencia}`,
      competencia,
      criadoEm: nowIso,
      atualizadoEm: nowIso
    };
  }

  function generateOccurrencesForCompetencia(despesas, competencia, nowIso = new Date().toISOString()) {
    const lista = Array.isArray(despesas) ? [...despesas] : [];
    const existingKeys = getExistingOccurrenceKeys(lista);
    const generated = [];

    getRecurringTemplates(lista).forEach(template => {
      const groupId = getRecorrenciaGroupId(template);
      const chave = `${groupId}:${competencia}`;
      if (existingKeys.has(chave)) return;
      if (!isCompetenciaWithinRange(competencia, template)) return;

      const occurrence = createOccurrence(template, competencia, nowIso);
      lista.push(occurrence);
      existingKeys.add(chave);
      generated.push(occurrence);
    });

    return { despesas: lista, generated };
  }

  async function syncCurrentMonth(options = {}) {
    const targetDate = options.targetDate instanceof Date ? options.targetDate : new Date();
    const competencia = getCompetenciaFromDateObject(targetDate);
    const result = generateOccurrencesForCompetencia(options.despesas || [], competencia);

    if (result.generated.length && typeof options.persist === 'function') {
      await options.persist(result.despesas);
    }

    return result;
  }

  function getFixedExpenseForecast(despesas, startDate = new Date(), quantidadeMeses = 3) {
    const baseCompetencia = getCompetenciaFromDateObject(startDate);
    const templates = getRecurringTemplates(despesas).filter(template => normalizarTipoDespesa(template.tipoDespesa) === 'fixa');
    const forecast = [];

    for (let offset = 1; offset <= quantidadeMeses; offset += 1) {
      const competencia = addMonthsToCompetencia(baseCompetencia, offset);
      const total = templates.reduce((sum, template) => {
        if (!isCompetenciaWithinRange(competencia, template)) return sum;
        return sum + Number(template.valor || 0);
      }, 0);

      forecast.push({
        competencia,
        label: getMonthLabel(competencia),
        total
      });
    }

    return forecast;
  }

  function calcularProgressoMetas({ metas, despesas, categorias }) {
    const metasValidas = metas && typeof metas === 'object' ? metas : {};
    const gastosPorCategoria = {};

    (Array.isArray(despesas) ? despesas : []).forEach(despesa => {
      const categoriaId = despesa?.categoria;
      if (!categoriaId) return;
      gastosPorCategoria[categoriaId] = (gastosPorCategoria[categoriaId] || 0) + Number(despesa.valor || 0);
    });

    return (Array.isArray(categorias) ? categorias : [])
      .map(categoria => {
        const meta = Number(metasValidas[categoria.id] || 0);
        if (meta <= 0) return null;

        const usado = Number(gastosPorCategoria[categoria.id] || 0);
        const percentualReal = meta > 0 ? (usado / meta) * 100 : 0;
        const percentualBarra = Math.min(percentualReal, 100);
        const disponivel = Math.max(meta - usado, 0);
        const excedente = Math.max(usado - meta, 0);
        const status = percentualReal > 100 ? 'excedida' : percentualReal >= 100 ? 'limite' : percentualReal >= 80 ? 'atencao' : 'ok';

        return {
          categoriaId: categoria.id,
          nome: categoria.nome || categoria.id,
          meta,
          usado,
          disponivel,
          excedente,
          percentualReal,
          percentualBarra,
          status
        };
      })
      .filter(Boolean);
  }

  return {
    normalizarTipoDespesa,
    getTipoDespesaLabel,
    getCompetenciaFromDate,
    getCompetenciaFromDateObject,
    addMonthsToCompetencia,
    buildDateForMonth,
    getMonthLabel,
    getRecorrenciaGroupId,
    generateOccurrencesForCompetencia,
    syncCurrentMonth,
    getFixedExpenseForecast,
    calcularProgressoMetas
  };
});
