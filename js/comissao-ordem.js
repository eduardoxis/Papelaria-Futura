// Datas dos campos HTML usam AAAA-MM-DD; registros sem data ficam no final.
export function compararRegistrosComissao(a, b) {
  const dataA = a.data || "9999-12-31";
  const dataB = b.data || "9999-12-31";
  return dataA.localeCompare(dataB) || (Number(a.ordem) || 0) - (Number(b.ordem) || 0);
}
