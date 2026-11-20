import test from "node:test";
import assert from "node:assert/strict";
import {
  configuracaoInicial,
  diasSemana,
  somarDias,
  jornada,
  validarEscala,
  gerarEscala,
  coberturaDia,
  escalaPublica,
  modelosEm,
} from "../js/escalas-core.js";

export const semana = "2027-01-04";
export function pessoa(id = "ana", semanais = 2400, inicio = "2026-01-01") {
  return {
    id,
    nome: id,
    uid: id,
    contratos: [
      {
        inicio,
        fim: null,
        principal: "caixa",
        funcoes: ["caixa", "atendimento"],
        categoria: "comercio",
        semanais,
        limiteDiario: 600,
        podeAbrir: true,
        podeFechar: true,
        disponibilidade: [1, 2, 3, 4, 5, 6].map((dia) => ({
          dia,
          entrada: "00:00",
          saida: "23:59",
        })),
      },
    ],
    eventos: [],
  };
}
export function config() {
  const c = configuracaoInicial();
  c.calendarioConferidoAte = "2030-12-31";
  c.coberturaConfirmada = true;
  c.cobertura = [1, 2, 3, 4, 5, 6].map((dia) => ({
    dia,
    entrada: "08:00",
    saida: dia === 6 ? "16:00" : "18:30",
    quantidade: 1,
    funcao: "caixa",
    indispensavel: true,
    inicio: "2026-01-01",
    fim: null,
  }));
  c.turnos = [
    {
      id: "padrao",
      nome: "Padrão",
      inicio: "2026-01-01",
      fim: null,
      dias: [1, 2, 3, 4, 5, 6],
      entrada: "08:00",
      almoco: "12:00",
      retorno: "13:00",
      saida: "17:00",
    },
  ];
  return c;
}
export function turno(data, pessoaId = "ana", campos = {}) {
  return {
    id: pessoaId + "_" + data,
    pessoaId,
    data,
    tipo: "trabalho",
    funcao: "caixa",
    entrada: "08:00",
    almoco: "12:00",
    retorno: "13:00",
    saida: "17:00",
    fixado: false,
    ...campos,
  };
}
export function folgas(inicio, pessoaId = "ana") {
  return diasSemana(inicio).map((data) =>
    turno(data, pessoaId, { tipo: "folga" }),
  );
}
function dados(turnos = [], pessoas = [pessoa()], inicio = semana) {
  return {
    semana: inicio,
    config: config(),
    pessoas,
    turnos,
    contexto: {
      turnos: pessoas.flatMap((p) => folgas(somarDias(inicio, -7), p.id)),
    },
  };
}
test("sábado líquido 7h, quatro dias de 8h totalizam 39h e deixam 1h a programar", () => {
  const lista = folgas(semana);
  [0, 1, 2, 3].forEach((i) => (lista[i] = turno(lista[i].data)));
  lista[5] = turno(lista[5].data, "ana", { saida: "16:00" });
  assert.equal(jornada(lista[5]).liquidos, 420);
  const resultado = validarEscala(dados(lista));
  assert.equal(resultado.resumos[0].planejadas, 2340);
  assert.equal(resultado.resumos[0].diferenca, 60);
});
test("cinco jornadas de 8h24 geram cinco excessos sem instrumento, mesmo somando 42h", () => {
  const lista = folgas(semana).map((t, i) =>
    i < 5 ? turno(t.data, "ana", { saida: "17:24" }) : t,
  );
  const resultado = validarEscala(dados(lista, [pessoa("ana", 2520)]));
  assert.equal(resultado.resumos[0].planejadas, 2520);
  assert.equal(
    resultado.alertas.filter((a) => a.codigo === "diaria").length,
    5,
  );
  assert.equal(
    resultado.alertas.filter((a) => a.codigo === "semanal").length,
    0,
  );
});
test("ampliação exige instrumento aplicável e deixa de valer na etapa definitiva", () => {
  const d = dados(
    [turno(semana, "ana", { saida: "17:24" })],
    [pessoa("ana", 2520)],
  );
  d.config.instrumentos = [
    {
      id: "cct",
      nome: "CCT",
      inicio: "2026-12-16",
      fim: "2027-12-15",
      tipo: "ampliacao",
      municipio: "Luziânia",
      uf: "GO",
      categoria: "comercio",
      documento: "https://example.test/cct",
      sindicatos: "A e B",
      clausula: "Cláusula 1",
      confirmado: true,
      minutos: 504,
    },
  ];
  assert.equal(
    validarEscala(d).alertas.some((a) => a.codigo === "diaria"),
    false,
  );
  d.config.instrumentos[0].fim = "2027-01-03";
  assert.equal(
    validarEscala(d).alertas.some((a) => a.codigo === "diaria"),
    true,
  );
});
test("contrato de 36h continua em 36h nas duas etapas", () => {
  for (const inicio of ["2027-01-04", "2028-01-03"]) {
    const r = validarEscala(
      dados(folgas(inicio), [pessoa("ana", 2160)], inicio),
    );
    assert.equal(r.resumos[0].limite, 2160);
  }
});
test("sexto dia bloqueia e uma troca recalcula origem e destino", () => {
  const lista = folgas(semana).map((t, i) =>
    i < 6 ? turno(t.data, "ana", { saida: "15:00" }) : t,
  );
  assert.ok(
    validarEscala(dados(lista)).alertas.some((a) => a.codigo === "dias"),
  );
  lista[2] = { ...lista[2], tipo: "folga" };
  const r = validarEscala(dados(lista));
  assert.equal(
    r.alertas.some((a) => a.codigo === "dias"),
    false,
  );
  assert.ok(
    r.alertas.some((a) => a.codigo === "cobertura" && a.data === lista[2].data),
  );
});
test("cobertura encontra lacuna exata de 12:10 a 12:20", () => {
  const c = config();
  c.cobertura = [{ ...c.cobertura[0], entrada: "12:00", saida: "12:30" }];
  const lista = [
    turno(semana, "ana", { almoco: "12:00", retorno: "12:20" }),
    turno(semana, "bia", { almoco: "12:10", retorno: "13:00" }),
  ];
  const lacunas = coberturaDia(
    c,
    [pessoa(), pessoa("bia")],
    lista,
    semana,
  ).filter((f) => f.funcoes.some((r) => r.faltam));
  assert.deepEqual(
    lacunas.map((f) => [f.entrada, f.saida]),
    [["12:10", "12:20"]],
  );
});
test("uma pessoa com duas habilitações nunca conta em duas funções simultâneas", () => {
  const c = config();
  c.cobertura = [c.cobertura[0], { ...c.cobertura[0], funcao: "atendimento" }];
  const r = coberturaDia(
    c,
    [pessoa()],
    [turno(semana), turno(semana, "ana", { funcao: "atendimento" })],
    semana,
  );
  assert.ok(
    r.every(
      (f) => f.funcoes.filter((c) => c.presentes.includes("ana")).length <= 1,
    ),
  );
});
test("troca de função no turno divide a cobertura no minuto exato", () => {
  const c = config();
  c.cobertura = [c.cobertura[0], { ...c.cobertura[0], funcao: "atendimento" }];
  const t = turno(semana, "ana", {
    trocas: [{ hora: "10:13", funcao: "atendimento" }],
  });
  const antes = coberturaDia(c, [pessoa()], [t], semana).find(
    (f) => f.saida === "10:13",
  );
  const depois = coberturaDia(c, [pessoa()], [t], semana).find(
    (f) => f.entrada === "10:13",
  );
  assert.deepEqual(antes.funcoes.find((f) => f.funcao === "caixa").presentes, [
    "ana",
  ]);
  assert.deepEqual(
    depois.funcoes.find((f) => f.funcao === "atendimento").presentes,
    ["ana"],
  );
  assert.deepEqual(
    depois.funcoes.find((f) => f.funcao === "caixa").presentes,
    [],
  );
});
for (const [liquidos, intervalo, erro] of [
  [240, 0, false],
  [241, 0, true],
  [360, 0, true],
  [360, 15, false],
  [361, 15, true],
  [361, 60, false],
]) {
  test(`intervalo com ${liquidos} minutos líquidos e ${intervalo} de pausa`, () => {
    const saida = 480 + liquidos + intervalo;
    const hora = (m) =>
      String(Math.floor(m / 60)).padStart(2, "0") +
      ":" +
      String(m % 60).padStart(2, "0");
    const t = turno(semana, "ana", {
      almoco: intervalo ? "10:00" : "",
      retorno: intervalo ? hora(600 + intervalo) : "",
      saida: hora(saida),
    });
    assert.equal(jornada(t).liquidos, liquidos);
    assert.equal(
      validarEscala(dados([t])).alertas.some((a) => a.codigo === "intervalo"),
      erro,
    );
  });
}
test("redução de intervalo depende de cláusula vigente e mínimo de 30 minutos", () => {
  const d = dados([turno(semana, "ana", { retorno: "12:30", saida: "16:30" })]);
  assert.ok(validarEscala(d).alertas.some((a) => a.codigo === "intervalo"));
  d.config.instrumentos = [
    {
      inicio: "2027-01-01",
      fim: null,
      tipo: "intervalo",
      municipio: "Luziânia",
      uf: "GO",
      categoria: "comercio",
      documento: "https://example.test/cct",
      sindicatos: "A e B",
      clausula: "Cláusula 2",
      confirmado: true,
      minutos: 30,
    },
  ];
  assert.equal(
    validarEscala(d).alertas.some((a) => a.codigo === "intervalo"),
    false,
  );
});
test("descanso de 11h passa; 10h59 é bloqueado", () => {
  for (const [entrada, erro] of [
    ["08:00", false],
    ["07:59", true],
  ]) {
    const d = dados([turno(semana, "ana", { entrada })]);
    d.contexto.turnos = [
      turno(somarDias(semana, -1), "ana", {
        entrada: "13:00",
        almoco: "17:00",
        retorno: "18:00",
        saida: "21:00",
      }),
    ];
    assert.equal(
      validarEscala(d).alertas.some((a) => a.codigo === "interjornada"),
      erro,
    );
  }
});
test("horários incompletos, retorno invertido, almoço fora e sobreposições são pendências", () => {
  for (const campos of [
    { entrada: "" },
    { almoco: "07:00" },
    { retorno: "11:00" },
    { saida: "12:30" },
  ])
    assert.equal(jornada(turno(semana, "ana", campos)).valida, false);
  assert.ok(
    validarEscala(
      dados([turno(semana), turno(semana, "ana", { id: "outro" })]),
    ).alertas.some((a) => a.codigo === "sobreposicao"),
  );
});
test("férias, feriado, admissão e implantação não viram débito de horas", () => {
  const p = pessoa("ana", 2400, "2027-01-06");
  p.eventos = [
    {
      tipo: "ferias",
      inicio: "2027-01-06",
      fim: "2027-01-08",
      descricao: "Dado pessoal reservado",
    },
  ];
  const r = validarEscala(dados([], [p]));
  assert.equal(r.resumos[0].diferenca, null);
  assert.equal("debito" in r.resumos[0], false);
  const d = dados([], [pessoa()], "2026-12-14");
  const primeira = gerarEscala(d);
  assert.equal(
    primeira.turnos.some((t) => t.data === "2026-12-14"),
    false,
  );
  assert.ok(primeira.alertas.some((a) => a.codigo === "transicao"));
  assert.equal(primeira.resumos[0].diferenca, null);
});
test("sábado feriado com convenção vencida é bloqueado; ponto facultativo não é feriado", () => {
  const data = "2027-01-09",
    d = dados([turno(data)]);
  d.config.datas = [
    {
      data,
      tipo: "feriado",
      nome: "Feriado municipal",
      fonte: "https://example.test/lei",
    },
  ];
  d.config.instrumentos = [
    {
      tipo: "feriado",
      especie: "CCT",
      inicio: "2026-01-01",
      fim: "2027-01-08",
      municipio: "Luziânia",
      uf: "GO",
      categoria: "comercio",
      documento: "https://example.test/cct",
      sindicatos: "A e B",
      clausula: "1",
      confirmado: true,
      regraMunicipal: "https://example.test/lei",
      datasAutorizadas: [data],
      condicoes: "Condições",
    },
  ];
  assert.ok(validarEscala(d).alertas.some((a) => a.codigo === "feriado"));
  d.config.datas[0].tipo = "facultativo";
  assert.equal(
    validarEscala(d).alertas.some((a) => a.codigo === "feriado"),
    false,
  );
});
test("virada de semana não apaga sete dias consecutivos nem ausência do histórico", () => {
  const d = dados(
    diasSemana(semana).map((data, i) =>
      i < 3 ? turno(data) : turno(data, "ana", { tipo: "folga" }),
    ),
  );
  d.contexto.turnos = diasSemana(somarDias(semana, -7)).map((data, i) =>
    turno(data, "ana", { tipo: i >= 3 ? "trabalho" : "folga" }),
  );
  assert.ok(
    validarEscala(d).alertas.some((a) => a.codigo === "repouso-continuo"),
  );
  d.contexto.turnos = [];
  assert.ok(validarEscala(d).alertas.some((a) => a.codigo === "historico"));
});
test("gerador preserva cartões fixados, descarta excessos e não inventa horas para completar contrato", () => {
  const d = dados([turno(semana, "ana", { tipo: "folga", fixado: true })]);
  const r = gerarEscala(d);
  assert.equal(r.turnos.find((t) => t.data === semana).tipo, "folga");
  assert.ok(r.resumos[0].dias <= 5);
  assert.ok(r.resumos[0].planejadas <= 2400);
  assert.ok(r.alertas.some((a) => a.codigo === "cobertura"));
});
test("rodízio de sábado considera histórico e disponibilidade", () => {
  const d = dados([], [pessoa("ana"), pessoa("bia")]);
  d.config.cobertura = d.config.cobertura
    .filter((c) => c.dia === 6)
    .map((c) => ({ ...c, saida: "12:00" }));
  d.config.turnos = [
    { ...d.config.turnos[0], almoco: "", retorno: "", saida: "12:00" },
  ];
  d.contexto.sabados = { ana: 8, bia: 0 };
  const r = gerarEscala(d);
  assert.equal(
    r.turnos.find((t) => t.tipo === "trabalho" && diaSabado(t.data)).pessoaId,
    "bia",
  );
});
function diaSabado(d) {
  return new Date(d + "T12:00:00Z").getUTCDay() === 6;
}
test("modelo novo mantém histórico e substitui a vigência aplicável", () => {
  const c = config();
  c.turnos.push({
    ...c.turnos[0],
    id: "nova",
    inicio: "2027-02-01",
    saida: "16:00",
  });
  assert.equal(modelosEm(c, "2027-01-04")[0].saida, "17:00");
  assert.equal(modelosEm(c, "2027-02-01")[0].saida, "16:00");
});
test("publicação e impressão compartilhada removem motivo e tipo de afastamento", () => {
  const t = turno(semana, "ana", {
    tipo: "afastamento",
    atividadeInterna: "Dado privado",
    condicoesFeriado: "Dado privado",
  });
  const publico = escalaPublica(
    {
      semana,
      versao: 1,
      revisao: 1,
      publicadoEm: "agora",
      publicadoPor: "gestor",
      turnos: [t],
    },
    [pessoa()],
  );
  assert.equal(publico.turnos[0].tipo, "indisponivel");
  assert.equal(JSON.stringify(publico).includes("Dado privado"), false);
});
