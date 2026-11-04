export const STATUS_OS = {
  aguardando: "Aguardando",
  em_producao: "Em produção",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};
export const PRIORIDADES_OS = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};
export const COL_OS = {
  ordens: "pf_os",
  controle: "pf_os_controle",
  eventos: "pf_os_eventos",
  painel: "pf_os_painel",
};
export const ativoOs = (o) =>
  ["aguardando", "em_producao", "pronto"].includes(o.status);
export const normalizarOs = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
export const milisOs = (v) =>
  v?.toMillis?.() ??
  v?.toDate?.().getTime() ??
  (v ? new Date(v).getTime() : NaN);
export function prazoOs(o, agora = Date.now()) {
  const previsto = milisOs(o.previsaoConclusao),
    feito = milisOs(o.dataConclusao);
  if (o.status === "cancelado") return { texto: "Cancelado", classe: "neutro" };
  if (Number.isFinite(feito))
    return feito <= previsto
      ? { texto: "Concluído no prazo", classe: "ok" }
      : { texto: "Concluído com atraso", classe: "atrasado" };
  if (!Number.isFinite(previsto))
    return { texto: "Sem previsão", classe: "neutro" };
  if (previsto < agora) return { texto: "Atrasado", classe: "atrasado" };
  if (previsto - agora <= 3600000)
    return { texto: "Próximo do prazo", classe: "proximo" };
  return { texto: "Dentro do prazo", classe: "ok" };
}
export function nomePainelOs(nome) {
  const partes = String(nome).trim().split(/\s+/);
  return (
    partes[0] + (partes.length > 1 ? " " + partes.at(-1)[0] + "." : "")
  ).slice(0, 40);
}
export const numeroOs = (n) => "OS-" + String(n).padStart(6, "0");
export function validarDadosOs(d) {
  const texto = (ch, max, obrigatorio = false) => {
    const s = String(d[ch] ?? "").trim();
    if ((obrigatorio && !s) || s.length > max)
      throw Error("Confira o campo " + ch + ".");
    return s;
  };
  const r = {
    clienteId: texto("clienteId", 128),
    clienteNome: texto("clienteNome", 120, true),
    clienteTelefone: texto("clienteTelefone", 40),
    servicoId: texto("servicoId", 128, true),
    descricao: texto("descricao", 2000, true),
    responsavelId: texto("responsavelId", 128, true),
    material: texto("material", 250),
    dimensao: texto("dimensao", 150),
    acabamento: texto("acabamento", 250),
    observacoes: texto("observacoes", 2000),
    prioridade: d.prioridade || "normal",
    quantidade: Number(d.quantidade ?? 1),
  };
  if (
    !PRIORIDADES_OS[r.prioridade] ||
    !Number.isFinite(r.quantidade) ||
    r.quantidade <= 0 ||
    r.quantidade > 1000000
  )
    throw Error("Informe quantidade e prioridade válidas.");
  for (const k of ["previsaoConclusao", "previsaoEntrega"]) {
    const t = milisOs(d[k]);
    if (!Number.isFinite(t))
      throw Error("Informe as duas previsões com data e horário.");
    r[k] = new Date(t);
  }
  if (r.previsaoEntrega < r.previsaoConclusao)
    throw Error("A entrega não pode ser prevista antes da conclusão.");
  return r;
}
export function transicaoOs(antes, depois) {
  return (
    {
      aguardando: ["em_producao", "cancelado"],
      em_producao: ["pronto", "cancelado"],
      pronto: ["entregue", "cancelado"],
      entregue: [],
      cancelado: [],
    }[antes]?.includes(depois) || false
  );
}
export function filtrarOs(lista, f = {}, agora = Date.now()) {
  const busca = normalizarOs(f.busca);
  return lista.filter((o) => {
    const texto = normalizarOs(
      [o.numero, o.clienteNome, o.servicoNome, o.responsavelNome].join(" "),
    );
    const dia = (v) => {
      const d = new Date(milisOs(v));
      return Number.isNaN(+d)
        ? ""
        : d.getFullYear() +
            "-" +
            String(d.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(d.getDate()).padStart(2, "0");
    };
    return (
      (!busca || texto.includes(busca)) &&
      (!f.status || o.status === f.status) &&
      (!f.responsavel || o.responsavelId === f.responsavel) &&
      (!f.servico || o.servicoId === f.servico) &&
      (!f.prioridade || o.prioridade === f.prioridade) &&
      (!f.atrasado || prazoOs(o, agora).classe === "atrasado") &&
      (!f.entradaDe || dia(o.dataEntrada) >= f.entradaDe) &&
      (!f.entradaAte || dia(o.dataEntrada) <= f.entradaAte) &&
      (!f.previsaoDe || dia(o.previsaoConclusao) >= f.previsaoDe) &&
      (!f.previsaoAte || dia(o.previsaoConclusao) <= f.previsaoAte)
    );
  });
}
export function paginasOs(itens, tamanho = 8) {
  return Array.from(
    { length: Math.max(1, Math.ceil(itens.length / tamanho)) },
    (_, i) => itens.slice(i * tamanho, (i + 1) * tamanho),
  );
}
export function projecaoOs(id, o) {
  return {
    osId: id,
    numero: o.numero,
    cliente: o.clienteExibicao,
    servico: o.servicoNome,
    responsavel: o.responsavelNome,
    previsaoConclusao: o.previsaoConclusao,
    status: o.status,
    prioridade: o.prioridade,
    posicaoFila: o.posicaoFila,
    ativo: o.ativo,
    dataConclusao: o.dataConclusao,
    revisao: o.revisao,
  };
}

export function compararFilaOs(a, b) {
  const posicao = (o) =>
    Number.isFinite(Number(o.posicaoFila))
      ? Number(o.posicaoFila)
      : Number.MAX_SAFE_INTEGER;
  const diferenca = posicao(a) - posicao(b);
  if (diferenca) return diferenca;
  const x = String(a.id || a.osId || ""),
    y = String(b.id || b.osId || "");
  return x < y ? -1 : x > y ? 1 : 0;
}

export function erroConsultaOs(erro) {
  const codigo = String(erro?.code || "").replace(/^firestore\//, "");
  const texto = String(erro?.message || "");
  if(codigo==='resource-exhausted')return {mensagem:'O Firebase atingiu a cota de operações do projeto. Aguarde a liberação da cota antes de tentar novamente.',indice:null};
  if (codigo === "failed-precondition" && /index|índice/i.test(texto)) {
    const encontrado = texto.match(
      /https:\/\/console\.firebase\.google\.com\/[^\s<>"')]+/,
    );
    return {
      mensagem:
        "Esta consulta precisa de um índice no Firebase. O administrador deve criá-lo e aguardar a ativação.",
      indice: encontrado?.[0] || null,
    };
  }
  if (codigo === "permission-denied" || codigo === "unauthenticated")
    return {
      mensagem:
        "Seu usuário não tem permissão para consultar estes dados. Peça ao administrador para conferir seu acesso.",
      indice: null,
    };
  if (codigo === "unavailable" || codigo === "deadline-exceeded")
    return {
      mensagem:
        "Não foi possível conectar ao servidor. Confira a conexão e tente novamente.",
      indice: null,
    };
  return {
    mensagem: texto || "Não foi possível concluir a consulta. Tente novamente.",
    indice: null,
  };
}
