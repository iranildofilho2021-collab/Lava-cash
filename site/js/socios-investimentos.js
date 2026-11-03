(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.LavaCashSocios = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const TIPOS_MOVIMENTACAO = {
    investimento_inicial: { label: 'Investimento inicial', capital: true, retirada: false },
    aporte_adicional: { label: 'Aporte adicional', capital: true, retirada: false },
    retirada_lucro: { label: 'Retirada de lucro', capital: false, retirada: true, pagamentoLucro: true, rateioLucro: true },
    pagamento_lucro: { label: 'Pagamento de lucros', capital: false, retirada: true, pagamentoLucro: true, rateioLucro: true },
    reembolso: { label: 'Reembolso', capital: false, retirada: true },
    ajuste_manual: { label: 'Ajuste manual', capital: true, retirada: false }
  };

  const STATUS_RATEIO = {
    pendente: 'Pendente',
    pago: 'Pago',
    compensado: 'Compensado'
  };

  function round2(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  function normalizarTipoMovimentacao(tipo) {
    return TIPOS_MOVIMENTACAO[tipo] ? tipo : 'investimento_inicial';
  }

  function getTipoMovimentacaoLabel(tipo) {
    return TIPOS_MOVIMENTACAO[normalizarTipoMovimentacao(tipo)].label;
  }

  function getTipoMovimentacaoMeta(tipo) {
    return TIPOS_MOVIMENTACAO[normalizarTipoMovimentacao(tipo)];
  }

  function normalizarStatusRateio(status) {
    return STATUS_RATEIO[status] ? status : '';
  }

  function getStatusRateioLabel(status) {
    return STATUS_RATEIO[normalizarStatusRateio(status)] || '';
  }

  function getSocioPercentualInvestido(socio) {
    return round2(Number(socio?.percentualInvestido ?? socio?.percentualInvestimento ?? socio?.percentual ?? 0));
  }

  function getSocioPercentualRateio(socio) {
    return round2(Number(socio?.percentualRateio ?? socio?.percentual ?? 0));
  }

  function getSocioNome(socio) {
    return socio?.nome || socio?.userName || 'Sócio';
  }

  function getSocioEmail(socio) {
    return socio?.email || socio?.userEmail || '';
  }

  function getCompetenciaFromDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 7) return '';
    return dateStr.slice(0, 7);
  }

  function getCompetenciaMovimentacao(movimentacao) {
    const competencia = String(movimentacao?.competencia || '');
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return competencia;
    return getCompetenciaFromDate(movimentacao?.data || '');
  }

  function getSnapshotMovimentacao(movimentacao, socios) {
    const valor = round2(Number(movimentacao?.valor || 0));
    if (Array.isArray(movimentacao?.rateioSocios) && movimentacao.rateioSocios.length) {
      return movimentacao.rateioSocios.map(item => ({
        socioId: item.socioId || item.id || '',
        nome: item.nome || 'Sócio',
        percentual: round2(Number(item.percentual ?? item.percentualInvestido ?? item.percentualRateio ?? 0)),
        valor: round2(Number(item.valor ?? item.valorPago ?? 0))
      })).filter(item => item.socioId || item.nome);
    }

    const sociosValidos = Array.isArray(socios) ? socios : [];
    const socioDireto = movimentacao?.socioId
      ? sociosValidos.find(socio => socio.id === movimentacao.socioId || socio.userId === movimentacao.socioId)
      : null;

    if (socioDireto) {
      return [{
        socioId: socioDireto.id,
        nome: getSocioNome(socioDireto),
        percentual: 100,
        valor
      }];
    }

    const tipo = normalizarTipoMovimentacao(movimentacao?.tipoMovimentacao);
    const usarRateio = Boolean(getTipoMovimentacaoMeta(tipo).rateioLucro);
    return sociosValidos.map(socio => {
      const percentual = usarRateio ? getSocioPercentualRateio(socio) : getSocioPercentualInvestido(socio);
      return {
        socioId: socio.id,
        nome: getSocioNome(socio),
        percentual,
        valor: round2(valor * (percentual / 100))
      };
    }).filter(item => item.valor !== 0 || item.percentual !== 0);
  }

  function calcularResumoSocios({ socios, movimentacoes, resultadosMensais, statusRateio }) {
    const sociosValidos = Array.isArray(socios) ? socios : [];
    const resumoMap = new Map();
    const retiradasPorSocioMes = new Map();

    sociosValidos.forEach(socio => {
      resumoMap.set(socio.id, {
        socioId: socio.id,
        userId: socio.userId || '',
        nome: getSocioNome(socio),
        email: getSocioEmail(socio),
        percentualInvestidoConfigurado: getSocioPercentualInvestido(socio),
        percentualRateioConfigurado: getSocioPercentualRateio(socio),
        totalAportado: 0,
        percentualInvestidoReal: 0,
        lucroPrejuizoDevido: 0,
        valorRetirado: 0,
        pagamentosLucro: 0,
        saldo: 0,
        extrato: []
      });
    });

    (Array.isArray(movimentacoes) ? movimentacoes : []).forEach(movimentacao => {
      const tipo = normalizarTipoMovimentacao(movimentacao?.tipoMovimentacao);
      const meta = getTipoMovimentacaoMeta(tipo);
      const label = getTipoMovimentacaoLabel(tipo);
      const snapshot = getSnapshotMovimentacao(movimentacao, sociosValidos);

      snapshot.forEach(item => {
        const resumo = resumoMap.get(item.socioId);
        if (!resumo) return;
        const valor = round2(Number(item.valor || 0));
        if (meta.capital) resumo.totalAportado = round2(resumo.totalAportado + valor);
        if (meta.retirada) {
          resumo.valorRetirado = round2(resumo.valorRetirado + valor);
          if (meta.pagamentoLucro) resumo.pagamentosLucro = round2(resumo.pagamentosLucro + valor);
          const competencia = getCompetenciaMovimentacao(movimentacao);
          if (competencia) {
            const retiradaKey = `${competencia}::${item.socioId}`;
            retiradasPorSocioMes.set(retiradaKey, round2((retiradasPorSocioMes.get(retiradaKey) || 0) + valor));
          }
        }
        resumo.extrato.push({
          data: movimentacao?.data || '',
          tipo,
          tipoLabel: label,
          descricao: movimentacao?.descricao || label,
          valor,
          origem: 'movimentacao'
        });
      });
    });

    (Array.isArray(resultadosMensais) ? resultadosMensais : []).forEach(mes => {
      sociosValidos.forEach(socio => {
        const resumo = resumoMap.get(socio.id);
        if (!resumo) return;
        const valor = round2(Number(mes.lucroPrejuizo || 0) * (getSocioPercentualRateio(socio) / 100));
        const retiradaKey = `${mes.key}::${socio.id}`;
        const retiradoNoMes = round2(retiradasPorSocioMes.get(retiradaKey) || 0);
        const status = getStatusRateio(statusRateio, mes.key, socio.id, valor, retiradoNoMes);
        resumo.lucroPrejuizoDevido = round2(resumo.lucroPrejuizoDevido + valor);
        if (valor > 0 && status === 'pago' && retiradoNoMes < valor) {
          const pagoPorStatus = round2(valor - retiradoNoMes);
          resumo.valorRetirado = round2(resumo.valorRetirado + pagoPorStatus);
          resumo.extrato.push({
            data: mes.key || '',
            tipo: 'pagamento_rateio',
            tipoLabel: 'Pagamento de rateio',
            descricao: `Rateio pago ${mes.key || ''}`,
            valor: pagoPorStatus,
            status,
            origem: 'status'
          });
        }
        resumo.extrato.push({
          data: mes.key || '',
          tipo: 'rateio_mensal',
          tipoLabel: 'Rateio mensal',
          descricao: `Lucro/prejuízo ${mes.key || ''}`,
          valor,
          status,
          origem: 'rateio'
        });
      });
    });

    const totalAportadoGeral = round2(Array.from(resumoMap.values()).reduce((sum, item) => sum + item.totalAportado, 0));
    const totalPagamentosLucro = round2(Array.from(resumoMap.values()).reduce((sum, item) => sum + item.pagamentosLucro, 0));
    resumoMap.forEach(resumo => {
      resumo.percentualInvestidoReal = totalAportadoGeral > 0 ? round2((resumo.totalAportado / totalAportadoGeral) * 100) : 0;
      resumo.saldo = round2(resumo.lucroPrejuizoDevido - resumo.valorRetirado);
      resumo.extrato.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
    });

    return {
      totalAportadoGeral,
      totalPagamentosLucro,
      socios: Array.from(resumoMap.values())
    };
  }

  function getStatusRateio(statusRateio, mesKey, socioId, valorRateio, retiradoNoMes) {
    const explicit = normalizarStatusRateio(statusRateio?.[`${mesKey}::${socioId}`]);
    if (explicit) return explicit;
    const valor = Number(valorRateio || 0);
    if (valor <= 0) return 'compensado';
    if (Number(retiradoNoMes || 0) >= valor) return 'pago';
    return 'pendente';
  }

  return {
    TIPOS_MOVIMENTACAO,
    STATUS_RATEIO,
    round2,
    normalizarTipoMovimentacao,
    getTipoMovimentacaoLabel,
    getTipoMovimentacaoMeta,
    normalizarStatusRateio,
    getStatusRateioLabel,
    getSocioPercentualInvestido,
    getSocioPercentualRateio,
    getCompetenciaMovimentacao,
    getSnapshotMovimentacao,
    calcularResumoSocios,
    getStatusRateio
  };
});
