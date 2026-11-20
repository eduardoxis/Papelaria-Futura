import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  lerDocumento,
  extrairAnexoMunicipal,
  extrairPortariaMgi,
  extrairLeiFederal,
  dataDoAto,
  urlOficial,
} from "../server/feriados-fontes.mjs";
import {
  calendarioInicial,
  sincronizarAno,
  decidirFuncionamento,
  consultarCalendario,
} from "../server/feriados-service.mjs";
import { fixtures } from "./escalas-fixture.mjs";
import { consolidarEventos, montarMes } from "../js/calendario-core.js";
import {
  funcionamentoEm,
  coberturaDia,
  minutos,
  preverFeriado,
  validarEscala,
  gerarEscala,
} from "../js/escalas-core.js";
import handler from "../api/feriados.js";

const base = JSON.parse(
  await fs.readFile(
    new URL("../data/feriados-inicial-2026.json", import.meta.url),
    "utf8",
  ),
);
const clonar = structuredClone;
async function docFixture(nome, url, tipo) {
  return lerDocumento({
    url,
    tipo,
    bytes: await fs.readFile(
      new URL("./fixtures/feriados/" + nome, import.meta.url),
    ),
    verificadoEm: "2026-11-20T12:00:00Z",
  });
}
function instalarCalendario(db) {
  db.registros.set("pf_feriados_anos/BR_GO_luziania_2026", clonar(base));
}
function entradaDecisao(data = "2026-11-30", extra = {}) {
  return {
    revisao: 0,
    confirmarImpacto: true,
    decisao: {
      data,
      situacao: "especial",
      entrada: "08:00",
      saida: "13:00",
      compensacaoFeriado: "pagamento",
      ...extra,
    },
  };
}

test("PDF oficial de janeiro identifica 22/05, 30/11 e 13/12 sem mover o domingo", async () => {
  const doc = await docFixture(
    "anexo-luziania-2026.pdf",
    "https://www.luziania.go.gov.br/wp-content/uploads/2026/01/DECRETO-No-005-DE-12-DE-JANEIRO-DE-2026-ANEXO.pdf",
    "application/pdf",
  );
  const eventos = extrairAnexoMunicipal(doc, 2026);
  assert.equal(
    eventos.find((e) => e.nome === "Folia de Rua").data,
    "2026-05-22",
  );
  assert.equal(
    eventos.find((e) => e.nome === "Dia do Evangélico").data,
    "2026-11-30",
  );
  assert.equal(
    eventos.find((e) => e.nome === "Aniversário de Luziânia").data,
    "2026-12-13",
  );
  assert.equal(
    eventos.some((e) => e.data === "2026-12-14"),
    false,
  );
  assert.equal(dataDoAto(doc), "2026-01-12");
});
test("portaria MGI real preserva pontos facultativos e intervalos parciais", async () => {
  const doc = await docFixture(
    "mgi-2026.html",
    "https://www.in.gov.br/en/web/dou/-/portaria-mgi-n-11.460-de-29-de-dezembro-de-2025-678388627",
    "text/html; charset=utf-8",
  );
  const lista = extrairPortariaMgi(doc, 2026);
  assert.equal(lista.length, 19);
  const natalVespera = lista.find((e) => e.data === "2026-12-24");
  assert.equal(natalVespera.natureza, "ponto_facultativo");
  assert.equal(natalVespera.publico, "administracao_publica");
  assert.equal(natalVespera.aplicabilidade, "nao_aplicavel");
  assert.equal(natalVespera.periodo.inicio, "13:00");
  assert.equal(lista.find((e) => e.data === "2026-02-18").periodo.fim, "14:00");
});
test("leis federais lidas confirmam os nove feriados fixos, sem calendário fixo no código", async () => {
  const nomes = base.esferas.uniao.eventos;
  const listas = [];
  for (const nome of [
    "federal-lei662",
    "federal-lei6802",
    "federal-lei14759",
  ]) {
    const url =
      nome === "federal-lei662"
        ? "https://www.planalto.gov.br/ccivil_03/leis/l0662.htm"
        : nome === "federal-lei6802"
          ? "https://www.planalto.gov.br/ccivil_03/leis/l6802.htm"
          : "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm";
    const doc = await docFixture(nome + ".html", url, "text/html");
    listas.push(...extrairLeiFederal(doc, 2026, nomes));
  }
  assert.equal(consolidarEventos(listas).length, 9);
  assert.ok(
    listas.every(
      (e) => e.aplicabilidade === "confirmada" && e.publico === "geral",
    ),
  );
});
test("Natal é um evento nacional com fundamentos federal e municipal associados", () => {
  const natal = base.eventos.filter(
    (e) => e.data === "2026-12-25" && e.natureza === "feriado",
  );
  assert.equal(natal.length, 1);
  assert.equal(natal[0].abrangencia, "nacional");
  assert.ok(natal[0].fontes.some((f) => f.url.includes("planalto.gov.br")));
  assert.ok(natal[0].fontes.some((f) => f.url.includes("luziania.go.gov.br")));
});
test("carga inicial mantém os anexos anteriores e a fonte municipal de alcance privado pendente", () => {
  const folia = base.eventos.find((e) => e.nome === "Folia de Rua");
  assert.equal(folia.data, "2026-05-22");
  assert.ok(folia.historicoOficial.some((v) => v.data === "2026-05-15"));
  assert.equal(
    base.eventos.find((e) => e.nome === "Dia do Evangélico").aplicabilidade,
    "pendente",
  );
});
test("pontos facultativos de servidores e datas restritas não fecham automaticamente a loja", () => {
  const { config } = fixtures();
  config.feriadosOficiais = base.eventos;
  config.decisoesCalendario = [];
  assert.equal(funcionamentoEm(config, "2026-12-24").aberto, true);
  const data = base.eventos.find(
    (e) => e.abrangencia === "estadual" && e.aplicabilidade === "nao_aplicavel",
  ).data;
  const r = validarEscala({
    config,
    pessoas: [],
    turnos: [],
    semana: data,
    contexto: {},
  });
  assert.equal(
    r.alertas.some((a) => a.codigo === "feriado-decisao" && a.data === data),
    false,
  );
});
test("duas sincronizações idênticas mantêm IDs, contagem e apenas uma versão semântica", async () => {
  const { db } = fixtures();
  const consultar = async () => clonar(base.esferas);
  const a = await sincronizarAno(db, 2026, { consultar }),
    b = await sincronizarAno(db, 2026, { consultar });
  assert.deepEqual(
    a.eventos.map((e) => e.id),
    b.eventos.map((e) => e.id),
  );
  assert.equal(new Set(b.eventos.map((e) => e.id)).size, b.eventos.length);
  assert.equal(
    [...db.registros.keys()].filter((k) => k.startsWith("pf_feriados_versoes/"))
      .length,
    1,
  );
});
test("falha municipal e extração vazia preservam os dados confirmados e o último sucesso", async () => {
  const { db } = fixtures();
  await sincronizarAno(db, 2026, {
    consultar: async () => clonar(base.esferas),
  });
  const comFalha = clonar(base.esferas);
  comFalha.luziania.eventos = [];
  Object.assign(comFalha.luziania.status, {
    ultimoSucesso: null,
    calendarioAnualEncontrado: false,
    cobertura: "aguardando_publicacao",
    pendencias: [{ erro: "Portal indisponível" }],
  });
  const r = await sincronizarAno(db, 2026, { consultar: async () => comFalha });
  assert.ok(
    r.eventos.some(
      (e) => e.nome === "Dia do Evangélico" && e.data === "2026-11-30",
    ),
  );
  assert.ok(r.esferas.luziania.status.ultimoSucesso);
  assert.equal(r.esferas.luziania.status.dadosAnterioresPreservados, true);
});
test("decisão especial de 30/11 persiste e a cobertura usa exatamente 08:00–13:00", async () => {
  const { db, pessoas, config } = fixtures();
  instalarCalendario(db);
  const r = await decidirFuncionamento(db, "gestor", entradaDecisao());
  const lista = await consultarCalendario(db, {
    inicio: "2026-11-01",
    fim: "2026-11-30",
  });
  assert.equal(lista.decisoes[0].saida, "13:00");
  config.feriadosOficiais = lista.eventos;
  config.decisoesCalendario = lista.decisoes;
  const faixas = coberturaDia(config, pessoas, [], "2026-11-30");
  assert.equal(
    faixas.reduce((n, f) => n + minutos(f.saida) - minutos(f.entrada), 0),
    300,
  );
  assert.equal(faixas[0].entrada, "08:00");
  assert.equal(faixas.at(-1).saida, "13:00");
  assert.equal(r.decisao.revisao, 1);
});
test("fechado impede turnos novos; feriado sem decisão permite rascunho e bloqueia publicação", async () => {
  const { db, config, pessoas } = fixtures();
  instalarCalendario(db);
  const r = await decidirFuncionamento(
    db,
    "gestor",
    entradaDecisao("2027-01-09", {
      situacao: "fechado",
      entrada: "",
      saida: "",
    }),
  );
  config.decisoesCalendario = [r.decisao];
  config.dataReferencia = "2026-11-20";
  config.feriadosOficiais = [
    {
      data: "2027-01-09",
      nome: "Feriado de teste",
      natureza: "feriado",
      aplicabilidade: "confirmada",
      abrangencia: "municipal",
    },
  ];
  const escala = gerarEscala({
    config,
    pessoas,
    semana: "2027-01-04",
    turnos: [],
    contexto: {},
  });
  assert.equal(
    escala.turnos.some((t) => t.data === "2027-01-09" && t.tipo === "trabalho"),
    false,
  );
  config.decisoesCalendario = [];
  assert.ok(
    validarEscala({
      config,
      pessoas,
      semana: "2027-01-04",
      turnos: [],
      contexto: {},
    }).alertas.some((a) => a.codigo === "feriado-decisao"),
  );
});
test("geração antes da adoção interna usa o horário especial sem inventar histórico passado", () => {
  const { config, pessoas } = fixtures();
  config.dataReferencia = "2026-11-20";
  config.decisoesCalendario = [entradaDecisao().decisao];
  config.feriadosOficiais = base.eventos;
  const r = gerarEscala({
    config,
    pessoas,
    semana: "2026-11-30",
    turnos: [],
    contexto: {},
  });
  const faixas = r.cobertura.filter((f) => f.data === "2026-11-30");
  assert.equal(
    faixas.reduce((n, f) => n + minutos(f.saida) - minutos(f.entrada), 0),
    300,
  );
  assert.ok(r.alertas.some((a) => a.codigo === "historico"));
});
test("retificação preserva escolha, marca revisão nas duas datas e conserva publicação anterior", async () => {
  const { db } = fixtures();
  await sincronizarAno(db, 2026, {
    consultar: async () => clonar(base.esferas),
  });
  await decidirFuncionamento(db, "gestor", entradaDecisao());
  const publica = {
    semana: "2026-11-30",
    versao: 1,
    turnos: [
      {
        pessoaId: "ana",
        nome: "Ana",
        data: "2026-11-30",
        tipo: "trabalho",
        entrada: "08:00",
        saida: "13:00",
      },
    ],
  };
  db.registros.set("pf_escala_publicacoes/2026-11-30", { id: "2026-11-30_v1" });
  db.registros.set("pf_escalas_publicadas/2026-11-30_v1", clonar(publica));
  const alterado = clonar(base.esferas);
  alterado.luziania.eventos.find((e) => e.nome === "Dia do Evangélico").data =
    "2026-11-29";
  await sincronizarAno(db, 2026, { consultar: async () => alterado });
  assert.equal(
    db.registros.get("pf_calendario_decisoes/2026-11-30").saida,
    "13:00",
  );
  assert.equal(
    db.registros.get("pf_calendario_decisoes/2026-11-30").revisaoPendente,
    true,
  );
  assert.equal(db.registros.has("pf_calendario_decisoes/2026-11-29"), false);
  assert.deepEqual(
    db.registros.get("pf_escalas_publicadas/2026-11-30_v1"),
    publica,
  );
  const aviso = [...db.registros.values()].find(
    (v) => v.tipo === "data_alterada" && v.antes?.nome === "Dia do Evangélico",
  );
  assert.deepEqual(aviso.datas, ["2026-11-30", "2026-11-29"]);
  assert.equal(aviso.turnosAtingidos[0].nome, "Ana");
});
test("mudança de funcionamento com publicação exige revisão dos turnos atingidos", async () => {
  const { db } = fixtures();
  instalarCalendario(db);
  db.registros.set("pf_escala_publicacoes/2026-11-30", { id: "pub" });
  db.registros.set("pf_escalas_publicadas/pub", {
    semana: "2026-11-30",
    versao: 1,
    turnos: [
      {
        nome: "Ana",
        data: "2026-11-30",
        tipo: "trabalho",
        entrada: "08:00",
        saida: "17:00",
      },
    ],
  });
  const entrada = entradaDecisao();
  entrada.confirmarImpacto = false;
  await assert.rejects(
    () => decidirFuncionamento(db, "gestor", entrada),
    (erro) => erro.status === 422 && erro.detalhes.publicados[0].nome === "Ana",
  );
  entrada.confirmarImpacto = true;
  const r = await decidirFuncionamento(db, "gestor", entrada);
  assert.equal(r.decisao.impactoPendente, true);
});
test("decisões de 2026 não são copiadas para o Natal de 2027; consulta atravessa os dois anos", async () => {
  const { db } = fixtures();
  instalarCalendario(db);
  db.registros.set(
    "pf_feriados_anos/BR_GO_luziania_2027",
    await calendarioInicial(2027),
  );
  await decidirFuncionamento(
    db,
    "gestor",
    entradaDecisao("2026-12-25", {
      situacao: "fechado",
      entrada: "",
      saida: "",
    }),
  );
  const r = await consultarCalendario(db, {
    inicio: "2026-12-28",
    fim: "2027-01-03",
  });
  assert.equal(r.status.length, 2);
  assert.ok(r.eventos.some((e) => e.data === "2027-01-01"));
  const proximo = await consultarCalendario(db, {
    inicio: "2027-12-25",
    fim: "2027-12-25",
  });
  assert.equal(proximo.decisoes.length, 0);
  assert.ok(proximo.eventos.some((e) => e.nome === "Natal"));
});
test("domingo exige horário explícito; normal usa o cadastro habitual atualizado", async () => {
  const { db } = fixtures();
  instalarCalendario(db);
  await assert.rejects(
    () =>
      decidirFuncionamento(
        db,
        "gestor",
        entradaDecisao("2026-12-13", {
          situacao: "normal",
          entrada: "",
          saida: "",
        }),
      ),
    /abertura/,
  );
  const r = await decidirFuncionamento(db, "gestor", {
    revisao: 0,
    decisao: { data: "2026-11-30", situacao: "normal" },
  });
  assert.equal(r.decisao.entrada, "08:00");
  assert.equal(r.decisao.saida, "12:00");
});
test("duas decisões simultâneas não se sobrescrevem e o colaborador não altera a loja", async () => {
  const { db } = fixtures();
  instalarCalendario(db);
  const r = await Promise.allSettled([
    decidirFuncionamento(db, "gestor", entradaDecisao()),
    decidirFuncionamento(db, "gestor", entradaDecisao()),
  ]);
  assert.equal(r.filter((v) => v.status === "fulfilled").length, 1);
  assert.equal(r.find((v) => v.status === "rejected").reason.status, 409);
  await assert.rejects(
    () => decidirFuncionamento(db, "ana", entradaDecisao()),
    (e) => e.status === 403,
  );
});
test("dobro considera horas líquidas e não dobra artificialmente a jornada contratual", () => {
  const { config, pessoas } = fixtures();
  config.feriadosOficiais = [
    {
      data: "2027-01-09",
      nome: "Feriado",
      natureza: "feriado",
      aplicabilidade: "confirmada",
    },
  ];
  config.decisoesCalendario = [entradaDecisao("2027-01-09").decisao];
  const t = {
    id: "ana_2027-01-09",
    data: "2027-01-09",
    pessoaId: "ana",
    tipo: "trabalho",
    funcao: "caixa",
    entrada: "08:00",
    almoco: "11:00",
    retorno: "11:15",
    saida: "13:00",
    fixado: false,
  };
  const r = validarEscala({
    config,
    pessoas,
    turnos: [t],
    semana: "2027-01-04",
    contexto: {},
  });
  assert.equal(r.resumos.find((p) => p.pessoaId === "ana").planejadas, 285);
  assert.equal(r.previsoesFeriados[0].trabalhados, 285);
  assert.equal(r.previsoesFeriados[0].equivalentes, 570);
  assert.equal(preverFeriado(300, "banco").equivalentes, 600);
  t.compensacaoFeriado = "banco";
  assert.ok(
    validarEscala({
      config,
      pessoas,
      turnos: [t],
      semana: "2027-01-04",
      contexto: {},
    }).alertas.some((a) => a.codigo === "feriado-banco"),
  );
  config.instrumentos = [
    {
      tipo: "feriado",
      especie: "CCT",
      inicio: "2026-01-01",
      fim: "2027-12-31",
      municipio: "Luziânia",
      uf: "GO",
      categoria: "comercio",
      documento: "https://example.test/cct",
      sindicatos: "Partes de teste",
      clausula: "Cláusula de feriados",
      confirmado: true,
      regraMunicipal: "https://example.test/lei",
      datasAutorizadas: [t.data],
      condicoes: "Condições da cláusula",
      permiteBancoFeriado: true,
      fatorBancoFeriado: 2,
      clausulaBancoFeriado: "Crédito de duas horas por hora efetiva",
    },
  ];
  t.condicoesFeriado = "Condições conferidas";
  const banco = validarEscala({
    config,
    pessoas,
    turnos: [t],
    semana: "2027-01-04",
    contexto: {},
  });
  assert.equal(
    banco.alertas.some((a) => ["feriado", "feriado-banco"].includes(a.codigo)),
    false,
  );
  assert.equal(banco.previsoesFeriados[0].modo, "banco");
  assert.equal(banco.previsoesFeriados[0].equivalentes, 570);
  config.instrumentos[0].fim = "2027-01-08";
  assert.ok(
    validarEscala({
      config,
      pessoas,
      turnos: [t],
      semana: "2027-01-04",
      contexto: {},
    }).alertas.some((a) => a.codigo === "feriado-banco"),
  );
});
test("API recusa atualização sem login e cron sem segredo; leitores bloqueiam domínios arbitrários", async () => {
  for (const req of [
    {
      method: "POST",
      url: "/api/feriados?acao=sincronizar",
      headers: {},
      body: { ano: 2026 },
    },
    { method: "GET", url: "/api/feriados?acao=cron", headers: {} },
  ]) {
    const res = {
      setHeader() {},
      status(n) {
        this.codigo = n;
        return this;
      },
      json(v) {
        this.valor = v;
        return this;
      },
    };
    await handler(req, res);
    assert.equal(res.codigo, 401);
  }
  assert.equal(urlOficial("https://www.luziania.go.gov.br/arquivo.pdf"), true);
  assert.equal(
    urlOficial("https://www.luziania.go.gov.br.evil.test/arquivo.pdf"),
    false,
  );
  assert.equal(urlOficial("http://127.0.0.1/"), false);
  assert.equal(montarMes(2026, 11).length, 42);
});
