// Motor compartilhado pelo editor e pela API. Datas civis em America/Sao_Paulo.
// Nenhum resultado desta área lança ponto, folha, salário ou banco de horas.
export const FUSO_ESCALAS = "America/Sao_Paulo";
const CLT = "https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm";
const EC =
  "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc141.htm";
const COMERCIO = "https://www.planalto.gov.br/ccivil_03/leis/l10101.htm";
export const REGRAS_ESCALAS = [
  {
    id: "feriado-remuneracao",
    nome: "Previsão de trabalho em feriado",
    artigo: "Lei 605/1949 art. 9º; CLT art. 59; política Futura 2:1 para banco",
    fonte:
      "https://www2.camara.leg.br/legin/fed/lei/1940-1949/lei-605-5-janeiro-1949-367115-normaatualizada-pl.html",
    inicio: "1949-01-05",
    fim: null,
    abrangencia:
      "Papelaria Futura; banco condicionado ao instrumento aplicável",
  },
  {
    id: "diaria",
    nome: "Jornada normal e política interna de 8h",
    artigo:
      "CF art. 7º XIII; EC 141/2026 arts. 1º e 7º; política interna Futura",
    fonte: EC,
    inicio: "2026-12-15",
    fim: null,
    abrangencia: "Regime comum da Papelaria Futura",
    minutos: 480,
  },
  {
    id: "semanal44",
    nome: "Teto semanal anterior à transição",
    artigo: "CF art. 7º XIII",
    fonte:
      "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm",
    inicio: "1988-10-05",
    fim: "2026-12-15",
    minutos: 2640,
    abrangencia: "Brasil, regime comum",
  },
  {
    id: "semanal42",
    nome: "Etapa de 42h",
    artigo: "EC 141/2026 arts. 3º, 6º I, 7º e 10",
    fonte: EC,
    inicio: "2026-12-16",
    fim: "2027-12-15",
    minutos: 2520,
    abrangencia: "Brasil, regime comum",
  },
  {
    id: "semanal40",
    nome: "Etapa de 40h",
    artigo: "EC 141/2026 arts. 1º, 4º e 6º II",
    fonte: EC,
    inicio: "2027-12-16",
    fim: null,
    minutos: 2400,
    abrangencia: "Brasil, regime comum",
  },
  {
    id: "intervalo",
    nome: "Intervalo intrajornada",
    artigo: "CLT art. 71 e art. 611-A III",
    fonte: CLT,
    inicio: "2017-11-11",
    fim: null,
    abrangencia: "Brasil, regime comum",
  },
  {
    id: "interjornada",
    nome: "11h entre jornadas",
    artigo: "CLT art. 66",
    fonte: CLT,
    inicio: "1943-11-10",
    fim: null,
    minutos: 660,
    abrangencia: "Brasil, regime comum",
  },
  {
    id: "repouso",
    nome: "Repouso semanal e adoção interna 5×2",
    artigo:
      "CLT arts. 66 e 67; EC 141/2026 arts. 1º e 10; política interna de 15/12/2026",
    fonte: EC,
    inicio: "2026-12-15",
    fim: null,
    abrangencia: "Papelaria Futura, Luziânia–GO",
  },
  {
    id: "feriado",
    nome: "Trabalho no comércio em feriado",
    artigo: "Lei 10.101/2000 arts. 6º e 6º-A",
    fonte: COMERCIO,
    inicio: "2007-12-05",
    fim: null,
    abrangencia: "Comércio em Luziânia–GO",
  },
  {
    id: "salario",
    nome: "Preservação salarial e dos contratos mais curtos",
    artigo: "EC 141/2026 arts. 2º e 4º",
    fonte: EC,
    inicio: "2026-10-16",
    fim: null,
    abrangencia: "Brasil",
  },
  {
    id: "stf-transicao",
    nome: "Decisão a conferir com a assessoria; política interna continua em 8h",
    artigo:
      "ADI 8041/8042, dispositivo I. Exceção judicial não ativada pela Futura",
    fonte:
      "https://portal.stf.jus.br/processos/downloadPeca.asp?ext=.pdf&id=15392248509",
    inicio: "2026-12-16",
    fim: "2027-12-15",
    abrangencia: "Registro informativo, sem liberar ampliação automática",
  },
];

export function minutos(hora) {
  if (typeof hora !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora))
    return null;
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}
export function hora(min) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
export function duracao(min) {
  return `${Math.floor(Math.abs(min) / 60)}h${String(Math.abs(min) % 60).padStart(2, "0")}`;
}
export function dataValida(data) {
  return (
    typeof data === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(data) &&
    !Number.isNaN(Date.parse(data + "T12:00:00Z")) &&
    new Date(data + "T12:00:00Z").toISOString().slice(0, 10) === data
  );
}
export function somarDias(data, dias) {
  const d = new Date(data + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
export function diaSemana(data) {
  return new Date(data + "T12:00:00Z").getUTCDay();
}
export function segunda(data) {
  return somarDias(data, -((diaSemana(data) + 6) % 7));
}
export function diasSemana(data) {
  return Array.from({ length: 7 }, (_, i) => somarDias(segunda(data), i));
}
const vigente = (v, data) => v.inicio <= data && (!v.fim || v.fim >= data);
export function contratoEm(pessoa, data) {
  return (pessoa?.contratos || [])
    .filter((c) => vigente(c, data))
    .sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
}
export function tetoEm(data) {
  return REGRAS_ESCALAS.find(
    (r) => r.id.startsWith("semanal") && vigente(r, data),
  );
}
export function configuracaoInicial() {
  return {
    revisao: 0,
    adocao: "2026-12-15",
    fuso: FUSO_ESCALAS,
    municipio: "Luziânia",
    uf: "GO",
    categoria: "",
    calendarioConferidoAte: "",
    coberturaConfirmada: false,
    compensacaoMensal: false,
    funcionamento: [1, 2, 3, 4, 5, 6].map((d) => ({
      dia: d,
      entrada: "08:00",
      saida: d === 6 ? "16:00" : "18:30",
    })),
    datas: [],
    cobertura: [],
    turnos: [],
    instrumentos: [],
    regras: [],
    criterioTransicao: [],
  };
}
export function funcionamentoEm(config, data) {
  const especial = (config.datas || []).find((d) => d.data === data);
  const decisao = (config.decisoesCalendario || []).find(
    (d) => d.data === data,
  );
  const padrao = (config.funcionamento || []).find(
    (d) => d.dia === diaSemana(data),
  );
  const entrada = decisao?.entrada || especial?.entrada || padrao?.entrada;
  const saida = decisao?.saida || especial?.saida || padrao?.saida;
  return {
    ...especial,
    decisao,
    data,
    entrada,
    saida,
    aberto:
      decisao?.situacao === "fechado" ||
      (!decisao && especial?.fechado === true)
        ? false
        : (diaSemana(data) !== 0 || !!decisao) &&
          minutos(entrada) !== null &&
          minutos(saida) !== null,
  };
}
export function feriadoEm(config, data) {
  const oficial = (config.feriadosOficiais || []).find(
    (e) =>
      e.data === data &&
      e.natureza === "feriado" &&
      e.aplicabilidade !== "nao_aplicavel" &&
      e.vigente !== false,
  );
  if (oficial) return { ...oficial, oficial: true };
  const cadastro = (config.datas || []).find(
    (d) => d.data === data && d.tipo === "feriado",
  );
  return cadastro || null;
}
export function jornada(turno) {
  if (turno.tipo !== "trabalho")
    return { valida: true, liquidos: 0, intervalo: 0, periodos: [] };
  const entrada = minutos(turno.entrada),
    saida = minutos(turno.saida);
  const temAlmoco = !!turno.almoco || !!turno.retorno;
  const almoco = minutos(turno.almoco),
    retorno = minutos(turno.retorno);
  if (
    entrada === null ||
    saida === null ||
    saida <= entrada ||
    (temAlmoco &&
      (almoco === null ||
        retorno === null ||
        almoco <= entrada ||
        retorno <= almoco ||
        retorno >= saida))
  ) {
    return { valida: false, liquidos: 0, intervalo: 0, periodos: [] };
  }
  const periodos = temAlmoco
    ? [
        [entrada, almoco],
        [retorno, saida],
      ]
    : [[entrada, saida]];
  return {
    valida: true,
    entrada,
    saida,
    intervalo: temAlmoco ? retorno - almoco : 0,
    liquidos: periodos.reduce((n, [a, b]) => n + b - a, 0),
    periodos,
  };
}
export function preverFeriado(minutosTrabalhados, modo = "pagamento") {
  if (!Number.isInteger(minutosTrabalhados) || minutosTrabalhados < 0)
    throw Error("Duração de trabalho inválida.");
  return {
    trabalhados: minutosTrabalhados,
    equivalentes: minutosTrabalhados * 2,
    multiplicador: 2,
    modo,
    origem: "Previsão de escala; conferir execução antes de lançamento",
    base: "Lei 605/1949 art. 9º; política Futura 2:1 para banco condicionada ao instrumento aplicável",
  };
}

function instrumento(config, pessoa, data, tipo) {
  const c = contratoEm(pessoa, data);
  return [...(config.instrumentos || [])]
    .sort((a, b) => b.inicio.localeCompare(a.inicio))
    .find(
      (i) =>
        vigente(i, data) &&
        i.confirmado === true &&
        i.municipio === config.municipio &&
        i.uf === config.uf &&
        i.categoria === c?.categoria &&
        i.documento &&
        i.sindicatos &&
        i.clausula &&
        i.tipo === tipo &&
        (!i.pessoas?.length || i.pessoas.includes(pessoa.id)),
    );
}
function disponibilidade(pessoa, turno) {
  const c = contratoEm(pessoa, turno.data),
    j = jornada(turno);
  const faixas = (c?.disponibilidade || []).filter(
    (f) => f.dia === diaSemana(turno.data),
  );
  return (
    j.valida &&
    j.periodos.every(([a, b]) =>
      faixas.some((f) => minutos(f.entrada) <= a && minutos(f.saida) >= b),
    )
  );
}
export function eventoEm(pessoa, data) {
  return (pessoa.eventos || []).find(
    (e) =>
      e.inicio <= data &&
      e.fim >= data &&
      ["ferias", "afastamento"].includes(e.tipo),
  );
}
export function modelosEm(config, data) {
  const porNome = new Map();
  for (const t of [...config.turnos].sort((a, b) =>
    a.inicio.localeCompare(b.inicio),
  )) {
    if (vigente(t, data) && t.dias.includes(diaSemana(data)))
      porNome.set(t.nome, t);
  }
  return [...porNome.values()];
}
const instante = (data, m) => Date.parse(data + "T00:00:00-03:00") / 60000 + m;
const chave = (t) => `${t.pessoaId}/${t.data}`;
export function funcaoNoInstante(t, minuto) {
  const troca = [...(t.trocas || [])]
    .sort((a, b) => minutos(a.hora) - minutos(b.hora))
    .filter((v) => minutos(v.hora) <= minuto)
    .at(-1);
  return troca?.funcao || t.funcao;
}
const regraPorId = (id) =>
  REGRAS_ESCALAS.find((r) => r.id === id) || {
    id,
    nome: "Regra operacional",
    artigo: "Configuração da Futura",
    fonte: "",
    inicio: "2026-12-15",
    fim: null,
    abrangencia: "Luziânia–GO",
  };
function alerta(
  lista,
  codigo,
  mensagem,
  turno = {},
  regra = codigo,
  nivel = "erro",
  extra = {},
) {
  lista.push({
    codigo,
    mensagem,
    pessoaId: turno.pessoaId || null,
    data: turno.data || null,
    entrada: turno.entrada || null,
    saida: turno.saida || null,
    nivel,
    regra: regraPorId(regra),
    ...extra,
  });
}

// Eventos de entrada/saída/almoço/cobertura definem intervalos exatos, sem arredondar.
export function coberturaDia(config, pessoas, turnos, data) {
  const loja = funcionamentoEm(config, data);
  if (!loja.aberto) return [];
  const inicio = minutos(loja.entrada),
    fim = minutos(loja.saida);
  const exigencias = (config.cobertura || []).filter(
    (c) =>
      vigente(c, data) &&
      (c.data === data || (!c.data && c.dia === diaSemana(data))),
  );
  const trabalho = turnos.filter(
    (t) => t.data === data && t.tipo === "trabalho" && jornada(t).valida,
  );
  const pontos = new Set([inicio, fim]);
  exigencias.forEach((c) => {
    pontos.add(Math.max(inicio, minutos(c.entrada)));
    pontos.add(Math.min(fim, minutos(c.saida)));
  });
  trabalho.forEach((t) =>
    jornada(t)
      .periodos.flat()
      .forEach((m) => {
        if (m > inicio && m < fim) pontos.add(m);
      }),
  );
  trabalho.forEach((t) =>
    (t.trocas || []).forEach((v) => {
      const m = minutos(v.hora);
      if (m > inicio && m < fim) pontos.add(m);
    }),
  );
  const limites = [...pontos]
    .filter((m) => m >= inicio && m <= fim)
    .sort((a, b) => a - b);
  const resultado = [];
  for (let n = 0; n < limites.length - 1; n++) {
    const a = limites[n],
      b = limites[n + 1];
    if (a === b) continue;
    const ativos = trabalho.filter((t) =>
      jornada(t).periodos.some(([x, y]) => x <= a && y >= b),
    );
    // Sobreposições nunca dão duas posições à mesma pessoa, nem em funções distintas.
    const porPessoa = new Map();
    ativos.forEach((t) => {
      if (!porPessoa.has(t.pessoaId)) porPessoa.set(t.pessoaId, t);
    });
    const funcoes = [...new Set(exigencias.map((e) => e.funcao))];
    const faltas = funcoes.map((funcao) => {
      const requisitos = exigencias.filter(
        (e) =>
          e.funcao === funcao &&
          minutos(e.entrada) <= a &&
          minutos(e.saida) >= b,
      );
      const minimo = Math.max(0, ...requisitos.map((e) => e.quantidade));
      const presentes = [...porPessoa.values()]
        .filter(
          (t) =>
            funcaoNoInstante(t, a) === funcao &&
            contratoEm(
              pessoas.find((p) => p.id === t.pessoaId),
              data,
            )?.funcoes.includes(funcao),
        )
        .map((t) => t.pessoaId);
      return {
        funcao,
        minimo,
        presentes,
        faltam: Math.max(0, minimo - presentes.length),
        indispensavel: requisitos.some((e) => e.indispensavel),
      };
    });
    resultado.push({
      data,
      entrada: hora(a),
      saida: hora(b),
      trabalhando: [...porPessoa.keys()],
      almocando: trabalho
        .filter(
          (t) => minutos(t.almoco) <= a && minutos(t.retorno) >= b && t.almoco,
        )
        .map((t) => t.pessoaId),
      funcoes: faltas,
    });
  }
  return resultado;
}

export function validarEscala({
  config,
  pessoas,
  semana,
  turnos,
  contexto = {},
}) {
  const alertas = [],
    datas = diasSemana(semana),
    fim = datas[6];
  const equipe = new Map(pessoas.map((p) => [p.id, p]));
  const locais = turnos.filter((t) => datas.includes(t.data));
  const externos = (contexto.turnos || []).filter(
    (t) => !datas.includes(t.data),
  );
  const todos = [...externos, ...locais];
  const previsoesFeriados = [];
  const ids = new Set(),
    celulas = new Set();
  if (!config.coberturaConfirmada || !config.cobertura?.length)
    alerta(
      alertas,
      "cobertura-config",
      "Cadastre e confirme a cobertura mínima indispensável.",
    );
  if (
    !config.feriadosOficiais &&
    (!config.calendarioConferidoAte || config.calendarioConferidoAte < fim)
  )
    alerta(
      alertas,
      "calendario",
      "Confira feriados estaduais e municipais, pontos facultativos e horários especiais até " +
        fim +
        ".",
      {},
      "feriado",
    );
  for (const data of datas) {
    const feriado = feriadoEm(config, data);
    const decisao = (config.decisoesCalendario || []).find(
      (d) => d.data === data,
    );
    if (feriado?.oficial && !decisao)
      alerta(
        alertas,
        "feriado-decisao",
        `${feriado.nome} em ${data} aguarda a decisão de funcionamento no Calendário da Loja.`,
        { data },
        "feriado",
      );
    if (decisao?.revisaoPendente)
      alerta(
        alertas,
        "feriado-retificacao",
        "Houve retificação oficial. Revise a decisão de funcionamento em " +
          data +
          ".",
        { data },
        "feriado",
      );
  }
  for (const anual of config.calendarioStatus || [])
    for (const [esfera, estado] of Object.entries(anual.esferas || {})) {
      if (estado.cobertura !== "completa")
        alerta(
          alertas,
          "fonte-pendente",
          `${anual.ano}: fonte ${esfera} com cobertura ${estado.cobertura}. Confira as pendências no Calendário da Loja.`,
          {},
          "feriado",
          "aviso",
        );
    }
  if (config.compensacaoMensal)
    alerta(
      alertas,
      "compensacao",
      "A compensação mensal excepcional está desativada nesta implementação.",
      {},
      "repouso",
    );
  for (const t of locais) {
    const p = equipe.get(t.pessoaId),
      c = contratoEm(p, t.data),
      j = jornada(t);
    if (ids.has(t.id))
      alerta(alertas, "id", "Identificador de cartão repetido.", t);
    ids.add(t.id);
    if (celulas.has(chave(t)))
      alerta(
        alertas,
        "sobreposicao",
        "Há mais de um cartão da pessoa no mesmo dia. Reúna a jornada em um único cartão.",
        t,
      );
    celulas.add(chave(t));
    if (!p || !c) {
      alerta(alertas, "contrato", "Pessoa sem contrato vigente nesta data.", t);
      continue;
    }
    const evento = eventoEm(p, t.data);
    if (evento && t.tipo !== evento.tipo && t.tipo !== "trabalho")
      alerta(
        alertas,
        "evento",
        "Classifique o cartão conforme o período cadastrado de férias ou afastamento.",
        t,
      );
    if (evento && t.tipo === "trabalho")
      alerta(alertas, "indisponivel", "Pessoa em férias ou afastamento.", t);
    if (["ferias", "afastamento"].includes(t.tipo) && evento?.tipo !== t.tipo)
      alerta(
        alertas,
        "evento",
        "Cadastre o período de férias ou afastamento na ficha da pessoa antes de classificar este dia.",
        t,
      );
    if (t.tipo === "feriado" && !feriadoEm(config, t.data))
      alerta(
        alertas,
        "evento",
        "Esta data não está cadastrada como feriado.",
        t,
        "feriado",
      );
    if (t.tipo !== "trabalho") continue;
    if (!j.valida) {
      alerta(
        alertas,
        "horario",
        "Horário incompleto ou fora de ordem. Confira entrada, almoço, retorno e saída.",
        t,
      );
      continue;
    }
    if (!c.funcoes.includes(t.funcao))
      alerta(
        alertas,
        "funcao",
        "Pessoa não habilitada para a função " + t.funcao + ".",
        t,
      );
    const horariosTroca = new Set();
    for (const troca of t.trocas || []) {
      const m = minutos(troca.hora);
      if (
        m === null ||
        horariosTroca.has(m) ||
        !j.periodos.some(([a, b]) => m >= a && m < b) ||
        !c.funcoes.includes(troca.funcao)
      )
        alerta(
          alertas,
          "funcao",
          "Mudança de função fora da jornada, repetida ou para função não habilitada.",
          t,
        );
      horariosTroca.add(m);
    }
    if (!disponibilidade(p, t))
      alerta(
        alertas,
        "disponibilidade",
        "Jornada fora da disponibilidade obrigatória.",
        t,
      );
    const ampliacao = instrumento(config, p, t.data, "ampliacao");
    const transicao = t.data >= "2026-12-16" && t.data <= "2027-12-15";
    const limite = Math.min(
      c.limiteDiario,
      transicao && ampliacao ? Math.min(600, ampliacao.minutos) : 480,
    );
    if (j.liquidos > limite)
      alerta(
        alertas,
        "diaria",
        `Jornada de ${duracao(j.liquidos)} ultrapassa ${duracao(limite)}. A política interna exige instrumento coletivo vigente para ampliação na transição.`,
        t,
        "diaria",
      );
    const reducao = instrumento(config, p, t.data, "intervalo");
    const minimo =
      j.liquidos > 360
        ? reducao
          ? Math.max(30, reducao.minutos)
          : 60
        : j.liquidos > 240
          ? 15
          : 0;
    if (j.intervalo < minimo || (j.liquidos > 360 && j.intervalo > 120))
      alerta(
        alertas,
        "intervalo",
        `Intervalo de ${duracao(j.intervalo)} inadequado para ${duracao(j.liquidos)} de trabalho. Mínimo aplicável ${duracao(minimo)}${j.liquidos > 360 ? ", máximo 2h" : ""}.`,
        t,
        "intervalo",
      );
    const loja = funcionamentoEm(config, t.data);
    if (diaSemana(t.data) === 0 && !loja.decisao)
      alerta(
        alertas,
        "domingo",
        "A loja fecha aos domingos no regime cadastrado.",
        t,
        "repouso",
      );
    if (loja.decisao?.situacao === "fechado")
      alerta(
        alertas,
        "loja-fechada",
        "A loja foi marcada como fechada. Revise o turno e a publicação desta data.",
        t,
        "feriado",
      );
    if (
      (!loja.aberto ||
        j.entrada < minutos(loja.entrada) ||
        j.saida > minutos(loja.saida)) &&
      !(t.atividadeInterna?.trim() && t.autorizadoPor?.trim())
    )
      alerta(
        alertas,
        "atividade",
        "Trabalho fora do horário ao público exige atividade real e autorização registradas.",
        t,
      );
    const feriado = feriadoEm(config, t.data);
    if (feriado) {
      const norma = instrumento(config, p, t.data, "feriado");
      if (feriado.oficial && feriado.aplicabilidade !== "confirmada")
        alerta(
          alertas,
          "feriado-aplicabilidade",
          "Aplicabilidade ao comércio pendente para " +
            feriado.nome +
            ". Consulte a norma instituidora no calendário.",
          t,
          "feriado",
        );
      const modo =
        t.compensacaoFeriado || loja.decisao?.compensacaoFeriado || "pagamento";
      previsoesFeriados.push({
        pessoaId: p.id,
        data: t.data,
        feriado: feriado.nome,
        ...preverFeriado(j.liquidos, modo),
      });
      if (
        modo === "banco" &&
        !(
          norma?.permiteBancoFeriado === true &&
          norma.fatorBancoFeriado === 2 &&
          norma.clausulaBancoFeriado?.trim()
        )
      )
        alerta(
          alertas,
          "feriado-banco",
          "Banco de feriado em 2:1 exige cláusula vigente cadastrada e aplicável. A equivalência exibida é uma previsão.",
          t,
          "feriado-remuneracao",
        );
      if (
        !norma ||
        norma.especie !== "CCT" ||
        !norma.regraMunicipal ||
        !norma.datasAutorizadas?.includes(t.data) ||
        !norma.condicoes ||
        !t.condicoesFeriado?.trim()
      )
        alerta(
          alertas,
          "feriado",
          "Feriado " +
            feriado.nome +
            ": cadastre CCT aplicável vigente, regra municipal, data autorizada e atendimento das condições da cláusula.",
          t,
          "feriado",
        );
    }
    for (const e of p.eventos || []) {
      if (
        !["obrigatoria", "preferencia"].includes(e.tipo) ||
        !vigente(e, t.data)
      )
        continue;
      const a = minutos(e.entrada) ?? 0,
        b = minutos(e.saida) ?? 1440;
      if (j.periodos.some(([x, y]) => x < b && y > a))
        alerta(
          alertas,
          e.tipo,
          "Restrição " +
            (e.tipo === "preferencia" ? "negociável" : "obrigatória") +
            ": " +
            (e.descricao || "horário indisponível"),
          t,
          "disponibilidade",
          e.tipo === "preferencia" ? "aviso" : "erro",
        );
    }
    for (const r of config.regras || []) {
      if (!vigente(r, t.data)) continue;
      if (r.tipo === "diaria" && j.liquidos > r.minutos)
        alerta(alertas, "regra-local", r.nome, t, r.id, "erro", { regra: r });
    }
  }
  const resumos = [];
  for (const p of pessoas) {
    const ativos = datas.filter((d) => contratoEm(p, d));
    if (!ativos.length) continue;
    const trabalho = locais.filter(
      (t) => t.pessoaId === p.id && t.tipo === "trabalho" && jornada(t).valida,
    );
    const planejadas = trabalho.reduce((n, t) => n + jornada(t).liquidos, 0);
    const limites = [
      ...new Set(
        ativos.map((d) =>
          Math.min(contratoEm(p, d).semanais, tetoEm(d).minutos),
        ),
      ),
    ];
    const contratadas = Math.min(
      ...ativos.map((d) => contratoEm(p, d).semanais),
    );
    let limite = Math.min(...limites);
    const etapas = [...new Set(ativos.map((d) => tetoEm(d).id))];
    const criterios = config.criterioTransicao || [];
    const criterio = criterios.find(
      (c) =>
        c.semana === datas[0] && c.pessoaId === p.id && c.motivo && c.fonte,
    );
    if (limites.length > 1 || etapas.length > 1) {
      if (!criterio)
        alerta(
          alertas,
          "transicao",
          "Semana atravessa vigências. Registre o critério de transição e sua fonte; não há rateio automático.",
          { pessoaId: p.id },
          "semanal42",
        );
      else limite = Math.min(limite, criterio.minutos);
    }
    if (planejadas > limite)
      alerta(
        alertas,
        "semanal",
        `${duracao(planejadas)} planejadas superam o limite de ${duracao(limite)}.`,
        { pessoaId: p.id },
        tetoEm(fim).id,
      );
    const diasTrabalho = new Set(trabalho.map((t) => t.data)).size;
    if (diasTrabalho > 5)
      alerta(
        alertas,
        "dias",
        "Há " +
          diasTrabalho +
          " dias de trabalho. O regime da Futura permite até cinco.",
        { pessoaId: p.id },
        "repouso",
      );
    const eventos = ativos.filter(
      (d) => eventoEm(p, d) || feriadoEm(config, d),
    );
    const parcial =
      ativos.length < 7 ||
      eventos.length > 0 ||
      ativos.some((d) => d < config.adocao);
    const diferenca = Math.max(0, limite - planejadas);
    if (diferenca > 0)
      alerta(
        alertas,
        "a-programar",
        parcial
          ? "Período com evento, admissão/desligamento ou implantação. Confira as horas aplicáveis; sem débito automático."
          : `${duracao(diferenca)} a programar. Cinco turnos de 8h somam 40h; o teto não obriga completar 42h.`,
        { pessoaId: p.id },
        "salario",
        "aviso",
      );
    const faltando = ativos.filter(
      (d) => !celulas.has(`${p.id}/${d}`) && !eventoEm(p, d),
    );
    if (faltando.length)
      alerta(
        alertas,
        "dia-pendente",
        "Classifique os dias sem cartão, inclusive folgas e histórico: " +
          faltando.join(", "),
        { pessoaId: p.id },
        "repouso",
      );
    const registros = todos.filter((t) => t.pessoaId === p.id);
    const anteriores = Array.from({ length: 7 }, (_, i) =>
      somarDias(datas[0], i - 7),
    ).filter((d) => contratoEm(p, d));
    const faltasHistorico = anteriores.filter(
      (d) => !registros.some((t) => t.data === d) && !eventoEm(p, d),
    );
    if (faltasHistorico.length)
      alerta(
        alertas,
        "historico",
        "Histórico insuficiente para validar o descanso. Informe os dias " +
          faltasHistorico.join(", "),
        { pessoaId: p.id },
        "repouso",
      );
    const jornadas = registros
      .filter((t) => t.tipo === "trabalho" && jornada(t).valida)
      .sort((a, b) => a.data.localeCompare(b.data));
    for (let i = 1; i < jornadas.length; i++) {
      const a = jornadas[i - 1],
        b = jornadas[i];
      if (!datas.includes(a.data) && !datas.includes(b.data)) continue;
      const repouso =
        instante(b.data, jornada(b).entrada) -
        instante(a.data, jornada(a).saida);
      if (repouso < 660)
        alerta(
          alertas,
          "interjornada",
          `Descanso de ${duracao(repouso)} entre ${a.data} e ${b.data}; mínimo 11h.`,
          b,
          "interjornada",
        );
    }
    // A janela móvel atravessa a semana: a virada de domingo não reinicia descansos.
    for (let offset = -6; offset <= 6; offset++) {
      const janela = Array.from({ length: 7 }, (_, i) =>
        somarDias(datas[0], offset + i),
      );
      const diasAtivos = janela.filter((d) => contratoEm(p, d));
      const conhecida = diasAtivos.every(
        (d) => registros.some((t) => t.data === d) || eventoEm(p, d),
      );
      if (!conhecida) continue;
      const js = jornadas.filter((t) => janela.includes(t.data));
      if (new Set(js.map((t) => t.data)).size > 6)
        alerta(
          alertas,
          "repouso-continuo",
          "Sete dias consecutivos de trabalho na janela " +
            janela[0] +
            " a " +
            janela[6] +
            ".",
          { pessoaId: p.id, data: janela[6] },
          "repouso",
        );
      const inicio = instante(janela[0], 0),
        final = instante(somarDias(janela[6], 1), 0);
      const limitesDescanso = [
        inicio,
        ...js.flatMap((t) => [
          instante(t.data, jornada(t).entrada),
          instante(t.data, jornada(t).saida),
        ]),
        final,
      ];
      let maior = 0;
      for (let i = 0; i < limitesDescanso.length - 1; i += 2)
        maior = Math.max(maior, limitesDescanso[i + 1] - limitesDescanso[i]);
      if (maior < 2100)
        alerta(
          alertas,
          "repouso35",
          "Não há repouso de 24h acrescido das 11h entre jornadas na janela " +
            janela[0] +
            " a " +
            janela[6] +
            ".",
          { pessoaId: p.id },
          "repouso",
        );
    }
    const posterior = jornadas.find((t) => t.data > fim);
    if (!posterior && !p.contratos.every((c) => c.fim && c.fim <= fim))
      alerta(
        alertas,
        "futuro",
        "Semana seguinte ainda sem turno conhecido. A publicação futura voltará a conferir a fronteira.",
        { pessoaId: p.id },
        "repouso",
        "aviso",
      );
    resumos.push({
      pessoaId: p.id,
      nome: p.nome,
      contratadas,
      limite,
      planejadas,
      diferenca: parcial ? null : diferenca,
      dias: diasTrabalho,
      repousos: locais.filter((t) => t.pessoaId === p.id && t.tipo === "folga")
        .length,
      eventos: eventos.length,
      sabados: trabalho.filter((t) => diaSemana(t.data) === 6).length,
      sabadosHistorico: (contexto.sabados || {})[p.id] || 0,
      minutosFeriado: previsoesFeriados
        .filter((v) => v.pessoaId === p.id)
        .reduce((n, v) => n + v.trabalhados, 0),
      equivalenciaFeriado: previsoesFeriados
        .filter((v) => v.pessoaId === p.id)
        .reduce((n, v) => n + v.equivalentes, 0),
    });
  }
  const cobertura = datas.flatMap((data) =>
    coberturaDia(config, pessoas, locais, data),
  );
  for (const data of datas) {
    if (
      funcionamentoEm(config, data).aberto &&
      !(config.cobertura || []).some(
        (c) =>
          vigente(c, data) &&
          (c.data === data || (!c.data && c.dia === diaSemana(data))),
      )
    )
      alerta(
        alertas,
        "cobertura-config",
        "Defina a cobertura mínima para " + data + ".",
        { data },
        "cobertura",
      );
  }
  for (const faixa of cobertura) {
    for (const f of faixa.funcoes.filter((f) => f.faltam > 0))
      alerta(
        alertas,
        "cobertura",
        `${faixa.data}, ${faixa.entrada}–${faixa.saida}: falta(m) ${f.faltam} pessoa(s) habilitada(s) para ${f.funcao}${faixa.almocando.length ? " durante o almoço de parte da equipe" : ""}.`,
        faixa,
        "cobertura",
        f.indispensavel ? "erro" : "aviso",
        { funcao: f.funcao, faltam: f.faltam },
      );
    const loja = funcionamentoEm(config, faixa.data);
    if (
      faixa.entrada === loja.entrada &&
      !faixa.trabalhando.some(
        (id) => contratoEm(equipe.get(id), faixa.data)?.podeAbrir,
      )
    )
      alerta(
        alertas,
        "abertura",
        "Não há pessoa autorizada a abrir a loja.",
        faixa,
      );
    if (
      faixa.saida === loja.saida &&
      !faixa.trabalhando.some(
        (id) => contratoEm(equipe.get(id), faixa.data)?.podeFechar,
      )
    )
      alerta(
        alertas,
        "fechamento",
        "Não há pessoa autorizada a fechar a loja.",
        faixa,
      );
  }
  return {
    alertas,
    resumos,
    cobertura,
    previsoesFeriados,
    podePublicar: !alertas.some((a) => a.nivel === "erro"),
    regras: REGRAS_ESCALAS,
    fuso: FUSO_ESCALAS,
  };
}

function candidatoPermitido(dados, turnos, t) {
  const pessoa = dados.pessoas.find((p) => p.id === t.pessoaId);
  const teste = validarEscala({
    ...dados,
    pessoas: [pessoa],
    turnos: [...turnos.filter((v) => v.pessoaId === t.pessoaId), t],
  });
  return !teste.alertas.some(
    (a) =>
      a.nivel === "erro" &&
      a.pessoaId === t.pessoaId &&
      !["historico", "dia-pendente", "transicao"].includes(a.codigo),
  );
}
function minutosDescobertos(dados, turnos, data) {
  return coberturaDia(dados.config, dados.pessoas, turnos, data).reduce(
    (n, f) =>
      n +
      f.funcoes.reduce((s, r) => s + r.faltam, 0) *
        (minutos(f.saida) - minutos(f.entrada)),
    0,
  );
}
function variantesDeHorario(modelo, loja) {
  if (!loja.decisao) return [modelo];
  const inicio = Math.max(minutos(modelo.entrada), minutos(loja.entrada));
  const fim = Math.min(minutos(modelo.saida), minutos(loja.saida));
  if (fim <= inicio) return [];
  const intervalo = fim - inicio > 375 ? 60 : fim - inicio > 240 ? 15 : 0;
  const base = { ...modelo, entrada: hora(inicio), saida: hora(fim) };
  if (!intervalo) return [{ ...base, almoco: "", retorno: "" }];
  const alvo = Math.min(
    fim - intervalo - 1,
    Math.max(inicio + 1, minutos(modelo.almoco) ?? inicio + 120),
  );
  return [...new Set([alvo, alvo - 30, alvo + 30, alvo - 15, alvo + 15])]
    .filter((a) => a > inicio && a + intervalo < fim)
    .map((a) => ({ ...base, almoco: hora(a), retorno: hora(a + intervalo) }));
}
export function gerarEscala(dados) {
  const { config, pessoas, semana, contexto = {} } = dados,
    datas = diasSemana(semana);
  const semanaAnteriorAdocao = datas[6] < config.adocao;
  const hoje =
    config.dataReferencia ||
    new Date().toLocaleDateString("en-CA", { timeZone: FUSO_ESCALAS });
  const historicoObrigatorio = (data) =>
    data < config.adocao && (!semanaAnteriorAdocao || data < hoje);
  const turnos = (dados.turnos || [])
    .filter((t) => t.fixado || historicoObrigatorio(t.data))
    .map((t) => ({ ...t }));
  const sabados = contexto.sabados || {};
  const ordem = [...datas].sort(
    (a, b) => (diaSemana(b) === 6) - (diaSemana(a) === 6) || a.localeCompare(b),
  );
  for (const data of ordem) {
    if (historicoObrigatorio(data)) continue;
    const loja = funcionamentoEm(config, data);
    if (!loja.aberto) continue;
    let base = minutosDescobertos(dados, turnos, data);
    for (let passo = 0; passo < pessoas.length && base > 0; passo++) {
      const opcoes = [];
      for (const p of pessoas) {
        const c = contratoEm(p, data);
        if (
          !c ||
          eventoEm(p, data) ||
          turnos.some((t) => t.data === data && t.pessoaId === p.id)
        )
          continue;
        for (const modelo of modelosEm(config, data).flatMap((m) =>
          variantesDeHorario(m, loja),
        )) {
          for (const funcao of c.funcoes) {
            const t = {
              id: `${p.id}_${data}`,
              pessoaId: p.id,
              data,
              tipo: "trabalho",
              funcao,
              entrada: modelo.entrada,
              almoco: modelo.almoco || "",
              retorno: modelo.retorno || "",
              saida: modelo.saida,
              fixado: false,
              condicoesFeriado: loja.decisao?.condicoesFeriado || "",
            };
            if (!candidatoPermitido(dados, turnos, t)) continue;
            const reducao =
              base - minutosDescobertos(dados, [...turnos, t], data);
            if (reducao <= 0) continue;
            const horas = turnos
              .filter((x) => x.pessoaId === p.id)
              .reduce((n, x) => n + jornada(x).liquidos, 0);
            const preferencias = (p.eventos || []).filter(
              (e) => e.tipo === "preferencia" && vigente(e, data),
            ).length;
            opcoes.push({
              t,
              reducao,
              sabados: sabados[p.id] || 0,
              horas,
              preferencias,
              padrao: modelo.nome === c.modeloPadrao ? 0 : 1,
            });
          }
        }
      }
      opcoes.sort(
        (a, b) =>
          b.reducao - a.reducao ||
          (diaSemana(data) === 6 ? a.sabados - b.sabados : 0) ||
          a.preferencias - b.preferencias ||
          a.padrao - b.padrao ||
          a.horas - b.horas ||
          a.t.pessoaId.localeCompare(b.t.pessoaId),
      );
      if (!opcoes.length) break;
      turnos.push(opcoes[0].t);
      base -= opcoes[0].reducao;
    }
  }
  for (const p of pessoas)
    for (const data of datas) {
      if (
        !contratoEm(p, data) ||
        turnos.some((t) => t.pessoaId === p.id && t.data === data)
      )
        continue;
      const anterior = (contexto.turnos || []).find(
        (t) => t.pessoaId === p.id && t.data === data,
      );
      if (historicoObrigatorio(data)) {
        if (anterior) turnos.push({ ...anterior, id: `${p.id}_${data}` });
        continue;
      }
      const evento = eventoEm(p, data);
      const feriado = feriadoEm(config, data);
      turnos.push({
        id: `${p.id}_${data}`,
        pessoaId: p.id,
        data,
        tipo: evento?.tipo || (feriado ? "feriado" : "folga"),
        fixado: false,
      });
    }
  return { turnos, ...validarEscala({ ...dados, turnos }) };
}

// Sugestões são simulações reais do mesmo motor, nunca promessas de solução ótima.
export function sugerirTrocas(dados, resultado) {
  const sugestoes = [];
  for (const falha of resultado.alertas
    .filter((a) => a.codigo === "cobertura")
    .slice(0, 8)) {
    for (const p of dados.pessoas) {
      const c = contratoEm(p, falha.data);
      if (!c?.funcoes.includes(falha.funcao)) continue;
      const atual = dados.turnos.find(
        (t) => t.pessoaId === p.id && t.data === falha.data,
      );
      if (atual?.fixado) continue;
      const modelo = modelosEm(dados.config, falha.data).find((m) =>
        jornada({ ...m, tipo: "trabalho" }).periodos.some(
          ([a, b]) => a <= minutos(falha.entrada) && b >= minutos(falha.saida),
        ),
      );
      if (!modelo) continue;
      const trabalho = dados.turnos.filter(
        (t) => t.pessoaId === p.id && t.tipo === "trabalho" && !t.fixado,
      );
      const origem =
        atual?.tipo === "trabalho"
          ? [null]
          : trabalho.length >= 5
            ? trabalho
            : [null];
      for (const remover of origem) {
        const novos = dados.turnos.filter(
          (t) => t.id !== atual?.id && t.id !== remover?.id,
        );
        const destino = {
          ...modelo,
          id: `${p.id}_${falha.data}`,
          pessoaId: p.id,
          data: falha.data,
          funcao: falha.funcao,
          tipo: "trabalho",
          fixado: false,
        };
        novos.push(destino);
        if (remover)
          novos.push({
            id: remover.id,
            pessoaId: p.id,
            data: remover.data,
            tipo: "folga",
            fixado: false,
          });
        const calculo = validarEscala({ ...dados, turnos: novos });
        if (
          calculo.alertas.some(
            (a) =>
              a.nivel === "erro" &&
              a.pessoaId === p.id &&
              a.codigo !== "historico" &&
              a.codigo !== "transicao",
          )
        )
          continue;
        const coberturaOriginal = resultado.alertas.filter(
          (a) => a.codigo === "cobertura" && a.nivel === "erro",
        ).length;
        const coberturaNova = calculo.alertas.filter(
          (a) => a.codigo === "cobertura" && a.nivel === "erro",
        ).length;
        if (coberturaNova >= coberturaOriginal) continue;
        sugestoes.push({
          pessoaId: p.id,
          origem: remover?.data || null,
          destino: falha.data,
          mensagem: `Simular ${p.nome} em ${falha.data} (${modelo.entrada}–${modelo.saida}) para ${falha.funcao}${remover ? ", com folga em " + remover.data : ""}.`,
          turnos: novos,
        });
        break;
      }
      if (sugestoes.length >= 4) return sugestoes;
    }
  }
  return sugestoes;
}

export function escalaPublica(escala, pessoas) {
  const equipe = new Map(pessoas.map((p) => [p.id, p]));
  return {
    semana: escala.semana,
    versao: escala.versao,
    revisao: escala.revisao,
    publicadoEm: escala.publicadoEm,
    publicadoPor: escala.publicadoPor,
    feriados: (escala.feriados || escala.config?.feriadosOficiais || []).map(
      (e) => ({
        data: e.data,
        nome: e.nome,
        natureza: e.natureza,
        abrangencia: e.abrangencia,
        aplicabilidade: e.aplicabilidade,
        fontes: (e.fontes || []).map((f) => ({
          url: f.url,
          orgao: f.orgao,
          ato: f.ato,
          artigo: f.artigo,
        })),
      }),
    ),
    turnos: escala.turnos.map((t) => ({
      id: t.id,
      pessoaId: t.pessoaId,
      uid: equipe.get(t.pessoaId)?.uid || null,
      nome: equipe.get(t.pessoaId)?.nome || "Colaborador",
      data: t.data,
      tipo: ["ferias", "afastamento"].includes(t.tipo)
        ? "indisponivel"
        : t.tipo,
      funcao: t.tipo === "trabalho" ? t.funcao : "",
      trocas: t.tipo === "trabalho" ? t.trocas || [] : [],
      entrada: t.entrada || "",
      almoco: t.almoco || "",
      retorno: t.retorno || "",
      saida: t.saida || "",
      liquidos: jornada(t).liquidos,
    })),
  };
}
