import { diaSemana, minutos, somarDias, dataValida } from "./escalas-core.js";

export const LOCALIDADE_FUTURA = {
  pais: "BR",
  uf: "GO",
  municipio: "luziania",
  nomeMunicipio: "Luziânia",
  fuso: "America/Sao_Paulo",
};
export const normalizar = (texto) =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function identidadeEvento(evento) {
  return [
    normalizar(evento.nomeOficial || evento.nome),
    evento.natureza,
    evento.abrangencia,
    normalizar(evento.localidade || "Brasil"),
  ].join("|");
}
export function feriadoDaLoja(evento) {
  return (
    evento.natureza === "feriado" &&
    evento.aplicabilidade !== "nao_aplicavel" &&
    evento.vigente !== false
  );
}
export function eventosDoDia(eventos, data) {
  return eventos.filter((e) => e.data === data && e.vigente !== false);
}
export function textoDecisao(decisao) {
  if (!decisao) return "Aguardando decisão";
  if (decisao.revisaoPendente) return "Revisão necessária";
  if (decisao.situacao === "fechado") return "Fechado";
  return `Aberto das ${decisao.entrada} às ${decisao.saida}`;
}
export function horarioHabitual(config, data) {
  const padrao = config.funcionamento.find((p) => p.dia === diaSemana(data));
  return padrao ? { entrada: padrao.entrada, saida: padrao.saida } : null;
}
export function montarMes(ano, mes) {
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  if (!dataValida(inicio)) throw Error("Mês inválido.");
  const primeira = somarDias(inicio, -((diaSemana(inicio) + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => somarDias(primeira, i));
}
export function consolidarEventos(lista) {
  const unicos = new Map();
  for (const evento of lista) {
    if (!dataValida(evento.data)) continue;
    const identidade = identidadeEvento(evento),
      chave = evento.data + "|" + identidade;
    const anterior = unicos.get(chave);
    if (!anterior) {
      unicos.set(chave, {
        ...evento,
        identidade,
        fontes: [...(evento.fontes || [])],
      });
      continue;
    }
    const fontes = new Map(
      [...anterior.fontes, ...(evento.fontes || [])].map((f) => [
        f.url + "|" + f.artigo,
        f,
      ]),
    );
    const forte = evento.aplicabilidade === "confirmada" ? evento : anterior;
    unicos.set(chave, {
      ...anterior,
      ...forte,
      identidade,
      fontes: [...fontes.values()],
      ultimaVerificacao:
        [anterior.ultimaVerificacao, evento.ultimaVerificacao]
          .filter(Boolean)
          .sort()
          .at(-1) || null,
    });
  }
  return [...unicos.values()].sort(
    (a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome),
  );
}
export function validarDecisao(decisao) {
  if (
    !dataValida(decisao.data) ||
    !["normal", "especial", "fechado"].includes(decisao.situacao)
  )
    throw Error("Data ou decisão inválida.");
  if (
    decisao.situacao !== "fechado" &&
    (minutos(decisao.entrada) === null ||
      minutos(decisao.saida) === null ||
      minutos(decisao.saida) <= minutos(decisao.entrada))
  )
    throw Error(
      "Informe abertura e fechamento válidos. No domingo, o horário deve ser informado.",
    );
  if (!["pagamento", "banco"].includes(decisao.compensacaoFeriado))
    throw Error("Escolha pagamento ou banco para a previsão do feriado.");
}
