// Valores monetários em centavos; percentuais em centésimos de ponto percentual.
export const COL_COM = {
  vendedores: "pf_comissao_vendedores",
  config: "pf_comissao_config",
  registros: "pf_comissoes_vendas",
  pagamentos: "pf_comissao_pagamentos",
  auditoria: "pf_comissao_auditoria",
};
export function centavos(valor) {
  const numero =
    typeof valor === "string" ? Number(valor.replace(",", ".")) : Number(valor);
  const resultado = Math.round((numero + Number.EPSILON) * 100);
  if (
    !Number.isSafeInteger(resultado) ||
    resultado < 0 ||
    resultado > 10000000000
  )
    throw Error("Valor monetário inválido.");
  return resultado;
}
export function percentualBps(valor) {
  if (String(valor).trim() === "") throw Error("Informe o percentual.");
  const n = Number(String(valor).replace(",", "."));
  if (
    !Number.isFinite(n) ||
    n < 0 ||
    n > 100 ||
    Math.abs(n * 100 - Math.round(n * 100)) > 0.000001
  )
    throw Error(
      "Informe um percentual de 0 a 100, com até duas casas decimais.",
    );
  return Math.round(n * 100);
}
export function elegivel(v) {
  const status = String(v.status || "concluida").toLowerCase();
  return (
    ["concluida", "concluída", "finalizada", "paga"].includes(status) &&
    (v.pago === true ||
      (v.pago == null && !["Fiado", "Convênio"].includes(v.formaPagamento)))
  );
}
export function totalCentavos(v) {
  return v.totalCentavos ?? centavos(v.total || 0);
}
export function receita(v) {
  return elegivel(v)
    ? Math.max(0, totalCentavos(v) - (v.estornoCentavos || 0))
    : 0;
}
export function baseCalculo(v, regra = { excluirFrete: true }) {
  return Math.max(
    0,
    receita(v) - (regra.excluirFrete ? v.freteCentavos || 0 : 0),
  );
}
export function calcularComissao(venda, bps, regra, pago = 0) {
  const base = baseCalculo(venda, regra);
  const gerada = Math.floor((base * bps + 5000) / 10000);
  return {
    baseCentavos: base,
    valorCentavos: gerada,
    pagoCentavos: pago,
    pendenteCentavos: Math.max(0, gerada - pago),
    recuperarCentavos: Math.max(0, pago - gerada),
    status:
      !elegivel(venda) || base === 0
        ? "cancelada"
        : pago >= gerada
          ? "paga"
          : "pendente",
  };
}
export function validarPagamento(registro, venda, valor) {
  const atual = calcularComissao(
    venda,
    registro.percentualBps,
    { excluirFrete: registro.excluirFrete },
    registro.pagoCentavos,
  );
  if (
    !elegivel(venda) ||
    !Number.isSafeInteger(valor) ||
    valor <= 0 ||
    valor > atual.pendenteCentavos
  )
    throw Error(
      "Pagamento excede o saldo pendente ou a venda não está paga. Atualize e confira.",
    );
  return calcularComissao(
    venda,
    registro.percentualBps,
    { excluirFrete: registro.excluirFrete },
    registro.pagoCentavos + valor,
  );
}
export function dataLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function intervalo(tipo, inicio, fim, agora = new Date()) {
  let a = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  let b = new Date(a);
  b.setDate(b.getDate() + 1);
  if (tipo === "ontem") {
    a.setDate(a.getDate() - 1);
    b.setDate(b.getDate() - 1);
  }
  if (tipo === "semana") a.setDate(a.getDate() - 6);
  if (tipo === "mes") a.setDate(1);
  if (tipo === "anterior") {
    a.setDate(1);
    b = new Date(a);
    a.setMonth(a.getMonth() - 1);
  }
  if (tipo === "ano") {
    a.setMonth(0, 1);
  }
  if (tipo === "personalizado") {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(inicio || "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fim || "")
    )
      throw Error("Informe as duas datas.");
    a = new Date(inicio + "T00:00:00");
    b = new Date(fim + "T00:00:00");
    if (dataLocal(a) !== inicio || dataLocal(b) !== fim)
      throw Error("Data inválida.");
    b.setDate(b.getDate() + 1);
    if (
      !Number.isFinite(a.getTime()) ||
      !Number.isFinite(b.getTime()) ||
      b <= a
    )
      throw Error("Período inválido.");
  }
  return { inicio: a, fim: b };
}
export function montarRelatorio(
  vendas,
  registros,
  usuarios,
  configs,
  filtro = "",
) {
  const mapa = new Map();
  for (const u of usuarios)
    mapa.set(u.id, {
      id: u.id,
      nome: u.nome || u.email || u.id,
      vendas: 0,
      faturamento: 0,
      comissao: 0,
      pago: 0,
      pendente: 0,
      recuperar: 0,
      bps: configs.get(u.id)?.percentualBps || 0,
      semComissao: 0,
    });
  for (const v of vendas) {
    const id = v.vendedorId || "__sem_vendedor__";
    if (filtro && filtro !== id) continue;
    if (!mapa.has(id))
      mapa.set(id, {
        id,
        nome:
          id === "__sem_vendedor__"
            ? "Vendedor não identificado"
            : v.vendedorNome || id,
        vendas: 0,
        faturamento: 0,
        comissao: 0,
        pago: 0,
        pendente: 0,
        recuperar: 0,
        bps: configs.get(id)?.percentualBps || 0,
        semComissao: 0,
      });
    const linha = mapa.get(id);
    const r = registros.get(v.id);
    if (elegivel(v)) {
      linha.vendas++;
      linha.faturamento += receita(v);
      if (!r) linha.semComissao++;
    }
    if (r) {
      const c = calcularComissao(
        v,
        r.percentualBps,
        { excluirFrete: r.excluirFrete },
        r.pagoCentavos,
      );
      linha.comissao += c.valorCentavos;
      linha.pago += c.pagoCentavos;
      linha.pendente += c.pendenteCentavos;
      linha.recuperar += c.recuperarCentavos;
    }
  }
  return [...mapa.values()].filter((l) => !filtro || l.id === filtro);
}
