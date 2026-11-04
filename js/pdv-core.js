import {
  centavos,
  totalCentavos,
  calcularComissao,
} from "./vendas-comissoes-core.js";
export const FORMAS_PDV = [
  "dinheiro",
  "pix",
  "debito",
  "credito",
  "outros",
  "fiado",
];
export const CAMPOS_RESUMO = [
  "vendas",
  "itens",
  "bruto",
  "descontos",
  "acrescimos",
  "liquido",
  "canceladas",
  "estornos",
  "dinheiro",
  "pix",
  "debito",
  "credito",
  "outros",
  "fiado",
  "baseComissao",
  "comissaoGerada",
  "comissaoValida",
  "suprimentos",
  "sangrias",
  "devolucoesDinheiro",
  "pagamentosComissaoDinheiro",
];
export const FORMAS_NOMES = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  outros: "Outras formas",
  fiado: "Fiado / Convênio",
};
export function resumoVazio() {
  return Object.fromEntries(CAMPOS_RESUMO.map((k) => [k, 0]));
}
export function pagamentosVenda(v) {
  if (v.pagamentos) {
    const p = Object.fromEntries(
      FORMAS_PDV.map((f) => [f, v.pagamentos[f] || 0]),
    );
    if (
      Object.values(p).some((n) => !Number.isSafeInteger(n) || n < 0) ||
      Object.values(p).reduce((a, b) => a + b, 0) !== totalCentavos(v)
    )
      throw Error(
        "As parcelas de pagamento precisam somar exatamente o total da venda.",
      );
    return p;
  }
  const mapa = {
    Dinheiro: "dinheiro",
    Pix: "pix",
    PIX: "pix",
    "Cartão de Débito": "debito",
    "Cartão de Crédito": "credito",
    Fiado: "fiado",
    Convênio: "fiado",
  };
  const p = Object.fromEntries(FORMAS_PDV.map((f) => [f, 0]));
  p[mapa[v.formaPagamento] || "outros"] = totalCentavos(v);
  return p;
}
export function contribuicaoVenda(v, c) {
  const s = resumoVazio(),
    total = totalCentavos(v),
    cancelada = ["cancelada", "devolvida", "estornada"].includes(v.status),
    estorno = Math.min(total, v.estornoCentavos || 0);
  s.vendas = cancelada ? 0 : 1;
  s.itens = cancelada
    ? 0
    : (v.itens || []).reduce((n, i) => n + Number(i.qtd || 0), 0);
  s.bruto = centavos(
    v.subtotal ??
      (v.itens || []).reduce(
        (n, i) => n + Number(i.unitario || 0) * Number(i.qtd || 0),
        0,
      ),
  );
  s.acrescimos = centavos(v.acrescimo || 0);
  s.descontos = centavos((v.descontoItens || 0) + (v.descontoTotal || 0));
  s.liquido = cancelada ? 0 : Math.max(0, total - estorno);
  s.canceladas = cancelada ? total : 0;
  s.estornos = cancelada ? 0 : estorno;
  Object.assign(s, pagamentosVenda(v));
  if (c) {
    const atual = calcularComissao(
      v,
      c.percentualBps,
      { excluirFrete: c.excluirFrete },
      c.pagoCentavos || 0,
    );
    s.baseComissao = atual.baseCentavos;
    s.comissaoValida = atual.valorCentavos;
    s.comissaoGerada = calcularComissao(
      { ...v, status: "concluida", estornoCentavos: 0 },
      c.percentualBps,
      { excluirFrete: c.excluirFrete },
    ).valorCentavos;
  }
  return s;
}
export function aplicarContribuicao(sessao, v, c, anterior = null) {
  const novo = contribuicaoVenda(v, c),
    resumo = { ...resumoVazio(), ...sessao.resumo },
    vendedores = { ...sessao.vendedores },
    id = v.vendedorId || "sem-vendedor";
  const vendedor = {
    ...resumoVazio(),
    ...(vendedores[id] || {}),
    nome: v.vendedorNome || "Vendedor não identificado",
    percentuais: { ...(vendedores[id]?.percentuais || {}) },
  };
  if (c) vendedor.percentuais[String(c.percentualBps)] = true;
  for (const k of CAMPOS_RESUMO) {
    const delta = novo[k] - (anterior?.[k] || 0);
    resumo[k] += delta;
    vendedor[k] = (vendedor[k] || 0) + delta;
  }
  vendedores[id] = vendedor;
  return { resumo, vendedores, contribuicao: novo };
}
export function dinheiroEsperado(s) {
  const r = s.resumo || resumoVazio();
  return (
    (s.inicialCentavos ?? centavos(s.valorAbertura || 0)) +
    r.dinheiro +
    r.suprimentos -
    r.sangrias -
    r.devolucoesDinheiro -
    r.pagamentosComissaoDinheiro
  );
}
export function conferirFechamento(s, contado) {
  if (!Number.isSafeInteger(contado) || contado < 0)
    throw Error("Informe o dinheiro contado.");
  const esperado = dinheiroEsperado(s),
    diferenca = contado - esperado;
  return {
    esperadoCentavos: esperado,
    contadoCentavos: contado,
    diferencaCentavos: diferenca,
    situacao:
      diferenca === 0 ? "Sem diferença" : diferenca > 0 ? "Sobra" : "Falta",
  };
}
export function validarMovimento(tipo, valor, motivo) {
  if (
    !["suprimento", "sangria", "devolucao"].includes(tipo) ||
    !Number.isSafeInteger(valor) ||
    valor <= 0 ||
    !motivo?.trim()
  )
    throw Error("Informe tipo, valor positivo e motivo da movimentação.");
  return {
    suprimento: "suprimentos",
    sangria: "sangrias",
    devolucao: "devolucoesDinheiro",
    pagamento_comissao: "pagamentosComissaoDinheiro",
  }[tipo];
}
export function dadosComprovante(v, empresa, emissao) {
  return {
    versao: 2,
    vendaId: v.id,
    numero: v.numero || v.id,
    empresa: { nome: "Papelaria Futura", ...empresa },
    emitidoEm: emissao,
    vendedor: v.vendedorNome || "Vendedor não identificado",
    operador: v.operadorNome || "",
    cliente: v.clienteNome || v.cpfCnpj || "",
    itens: (v.itens || []).map((i) => ({
      nome: i.nome || "Produto",
      codigo: i.codigo || i.produtoId || "",
      qtd: Number(i.qtd || 0),
      unitarioCentavos: centavos(i.unitario || 0),
      descontoCentavos: centavos(i.descontoValor || 0),
      totalCentavos: centavos(
        i.total ??
          Number(i.unitario || 0) * Number(i.qtd || 0) - (i.descontoValor || 0),
      ),
    })),
    subtotalCentavos: centavos(
      v.subtotal ??
        (v.itens || []).reduce(
          (s, i) => s + Number(i.unitario || 0) * Number(i.qtd || 0),
          0,
        ),
    ),
    descontoCentavos: centavos((v.descontoItens || 0) + (v.descontoTotal || 0)),
    acrescimoCentavos: centavos(v.acrescimo || 0),
    totalCentavos: totalCentavos(v),
    pagamentos: pagamentosVenda(v),
    recebidoCentavos:
      v.recebidoCentavos ??
      (v.valorRecebido ? centavos(v.valorRecebido) : totalCentavos(v)),
    trocoCentavos: v.trocoCentavos ?? centavos(v.troco || 0),
    observacao: v.observacao || "",
  };
}
