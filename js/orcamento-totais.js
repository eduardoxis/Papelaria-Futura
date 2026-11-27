// Valores finais em centavos; o desconto geral não altera os preços dos itens.
function centavos(valor) {
  const numero = Number(valor);
  const resultado = Math.round((numero + Number.EPSILON) * 100);
  if (
    !Number.isFinite(numero) ||
    numero < 0 ||
    !Number.isSafeInteger(resultado)
  )
    throw Error("Valor inválido no orçamento.");
  return resultado;
}

export function calcularTotaisOrcamento(itens = [], desconto = {}) {
  let subtotalCentavos = 0;
  for (const item of itens) {
    subtotalCentavos += centavos(
      item.valorTotal ??
        Number(item.quantidade || 0) * Number(item.valorUnitario || 0),
    );
    if (!Number.isSafeInteger(subtotalCentavos))
      throw Error("Total do orçamento excede o limite permitido.");
  }
  const tipo = desconto?.tipo || "real";
  const valor =
    desconto?.valor === "" || desconto?.valor == null
      ? 0
      : Number(desconto.valor);
  if (
    !["real", "percentual"].includes(tipo) ||
    !Number.isFinite(valor) ||
    valor < 0
  )
    throw Error("Informe um desconto válido em R$ ou %. ");
  const normalizado = Math.round((valor + Number.EPSILON) * 100) / 100;
  if (tipo === "percentual" && valor > 100)
    throw Error("O desconto percentual não pode ultrapassar 100%.");
  const descontoCentavos =
    tipo === "percentual"
      ? Math.round(subtotalCentavos * (normalizado / 100))
      : centavos(normalizado);
  if (descontoCentavos > subtotalCentavos)
    throw Error("O desconto não pode ultrapassar o subtotal do orçamento.");
  const totalCentavos = subtotalCentavos - descontoCentavos;
  return {
    subtotalCentavos,
    descontoCentavos,
    totalCentavos,
    subtotal: subtotalCentavos / 100,
    valorTotal: totalCentavos / 100,
    desconto:
      normalizado > 0
        ? { tipo, valor: normalizado }
        : { tipo: "real", valor: 0 },
  };
}

export function lerTotaisOrcamento(cotacao = {}) {
  const totais = calcularTotaisOrcamento(cotacao.itens || [], cotacao.desconto);
  // PDFs de orçamentos antigos mantêm o total salvo quando não há desconto.
  if (!totais.descontoCentavos && cotacao.valorTotal != null) {
    const totalCentavos = centavos(cotacao.valorTotal);
    return { ...totais, totalCentavos, valorTotal: totalCentavos / 100 };
  }
  return totais;
}
