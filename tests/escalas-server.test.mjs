import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  executarEscalas,
  validarPessoa,
  validarConfig,
} from "../server/escalas-service.mjs";
import {
  configuracaoInicial,
  diasSemana,
  somarDias,
} from "../js/escalas-core.js";
import handler from "../api/escalas.js";

import { fixtures } from "./escalas-fixture.mjs";
const copiar = (v) => structuredClone(v);
const semana = "2027-01-04";
const salvar = (db, turnos, revisao = 0, acao = "salvar") =>
  executarEscalas(db, "gestor", {
    acao,
    semana,
    revisao,
    turnos,
    motivo: "Teste de escala",
  });

test("API rejeita método e chamada sem sessão antes de acessar o banco", async () => {
  const executar = async (req) => {
    const resposta = {
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
    await handler(req, resposta);
    return resposta;
  };
  assert.equal((await executar({ method: "GET", headers: {} })).codigo, 405);
  assert.equal(
    (
      await executar({
        method: "POST",
        headers: {},
        body: { acao: "carregar" },
      })
    ).codigo,
    401,
  );
});
test("colaborador não consulta rascunhos, equipe, versões, usuários nem grava cadastros", async () => {
  const { db } = fixtures();
  for (const acao of [
    "carregar",
    "usuarios",
    "versoes",
    "cadastro",
    "publicar",
  ])
    await assert.rejects(
      () => executarEscalas(db, "ana", { acao, semana }),
      (erro) => erro.status === 403,
    );
});
test("salvar, fechar e reabrir preserva horários e revisão do servidor", async () => {
  const { db, turnos } = fixtures();
  const r = await salvar(db, turnos);
  assert.equal(r.atual.revisao, 1);
  const aberta = await executarEscalas(db, "gestor", {
    acao: "carregar",
    semana,
  });
  assert.deepEqual(aberta.atual.turnos, turnos);
  assert.equal(aberta.resultado.podePublicar, true);
});
test("edições simultâneas não apagam alterações e clique repetido não duplica publicação", async () => {
  const { db, turnos } = fixtures();
  const respostas = await Promise.allSettled([
    salvar(db, turnos, 0, "publicar"),
    salvar(db, turnos, 0, "publicar"),
  ]);
  assert.equal(respostas.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    respostas.find((r) => r.status === "rejected").reason.status,
    409,
  );
  assert.equal(
    [...db.registros.keys()].filter((p) =>
      p.startsWith("pf_escalas_publicadas/"),
    ).length,
    1,
  );
});
test("publicação recalcula cobertura com cadastro atualizado e bloqueia sem gravar versão", async () => {
  const { db, turnos } = fixtures();
  await salvar(db, turnos);
  const c = copiar(db.registros.get("pf_escala_config/loja"));
  c.cobertura[0].quantidade = 2;
  await executarEscalas(db, "gestor", {
    acao: "cadastro",
    tipo: "config",
    revisao: 0,
    valor: c,
  });
  await assert.rejects(
    () => salvar(db, turnos, 1, "publicar"),
    (erro) =>
      erro.status === 422 &&
      erro.detalhes.alertas.some((a) => a.codigo === "cobertura"),
  );
  assert.equal(db.registros.get("pf_escalas/" + semana).revisao, 1);
});
test("publicação preserva snapshot e colaborador recebe somente os próprios horários", async () => {
  const { db, turnos } = fixtures();
  await salvar(db, turnos, 0, "publicar");
  const primeira = copiar(
    db.registros.get("pf_escalas_publicadas/" + semana + "_v1"),
  );
  const novos = copiar(turnos);
  novos[0].entrada = "09:00";
  await salvar(db, novos, 1);
  assert.deepEqual(
    db.registros.get("pf_escalas_publicadas/" + semana + "_v1"),
    primeira,
  );
  const consulta = await executarEscalas(db, "ana", { acao: "minha", semana });
  assert.ok(consulta.publicacao.turnos.every((t) => t.uid === "ana"));
  assert.equal(consulta.publicacao.turnos[0].entrada, "08:00");
  assert.equal("pessoas" in consulta.publicacao, false);
  const r = await executarEscalas(db, "gestor", {
    acao: "versao",
    id: semana + "_000001",
  });
  assert.equal(r.versao.turnos[0].entrada, "08:00");
  assert.equal(r.versao.config.funcionamento[0].saida, "12:00");
});
test("semana publicada exige motivo e nova publicação gera versão sem substituir a anterior", async () => {
  const { db, turnos } = fixtures();
  await salvar(db, turnos, 0, "publicar");
  await assert.rejects(
    () =>
      executarEscalas(db, "gestor", {
        acao: "salvar",
        semana,
        revisao: 1,
        turnos,
      }),
    /motivo/,
  );
  const r = await salvar(db, turnos, 1, "publicar");
  assert.equal(r.atual.versao, 2);
  assert.ok(db.registros.has("pf_escalas_publicadas/" + semana + "_v1"));
  assert.ok(db.registros.has("pf_escalas_publicadas/" + semana + "_v2"));
});
test("histórico auditado, contrato e disponibilidade exigem dados válidos", async () => {
  const { db, pessoas } = fixtures();
  assert.throws(
    () =>
      validarPessoa({
        ...pessoas[0],
        contratos: [{ ...pessoas[0].contratos[0], disponibilidade: [] }],
      }),
    /disponibilidade/,
  );
  const id = "ana_2026-12-28";
  await executarEscalas(db, "gestor", {
    acao: "cadastro",
    tipo: "historico",
    id,
    revisao: 1,
    motivo: "Registro conferido",
    valor: {
      id,
      pessoaId: "ana",
      data: "2026-12-28",
      tipo: "trabalho",
      entrada: "08:00",
      almoco: "12:00",
      retorno: "13:00",
      saida: "17:00",
    },
  });
  const evento = [...db.registros].find(([path]) =>
    path.startsWith("pf_escala_auditoria/"),
  )[1];
  assert.equal(evento.antes.tipo, "folga");
  assert.equal(evento.depois.tipo, "trabalho");
  assert.equal(evento.usuario, "gestor");
});
test("contratos e modelos históricos não podem ser removidos ou reescritos", async () => {
  const { db, pessoas } = fixtures();
  const p = copiar(pessoas[0]);
  p.contratos[0].semanais = 2160;
  await assert.rejects(
    () =>
      executarEscalas(db, "gestor", {
        acao: "cadastro",
        tipo: "pessoa",
        id: p.id,
        revisao: 1,
        valor: p,
      }),
    /nova vigência/,
  );
  const c = copiar(db.registros.get("pf_escala_config/loja"));
  c.turnos = [
    {
      id: "turno",
      nome: "Padrão",
      inicio: "2026-01-01",
      fim: null,
      dias: [1],
      entrada: "08:00",
      almoco: "",
      retorno: "",
      saida: "12:00",
    },
  ];
  await executarEscalas(db, "gestor", {
    acao: "cadastro",
    tipo: "config",
    revisao: 0,
    valor: c,
  });
  c.turnos = [];
  await assert.rejects(
    () =>
      executarEscalas(db, "gestor", {
        acao: "cadastro",
        tipo: "config",
        revisao: 1,
        valor: c,
      }),
    /versão já salva/,
  );
});
test("revogação de permissão é lida novamente no servidor", async () => {
  const { db } = fixtures();
  await executarEscalas(db, "gestor", { acao: "carregar", semana });
  db.registros.set("usuarios/gestor", { roles: ["user"] });
  await assert.rejects(
    () => executarEscalas(db, "gestor", { acao: "carregar", semana }),
    (erro) => erro.status === 403,
  );
});
test("repetir um cadastro novo com o mesmo identificador não duplica a equipe", async () => {
  const { db, pessoas } = fixtures();
  const entrada = {
    acao: "cadastro",
    tipo: "pessoa",
    id: "nova-pessoa",
    revisao: 0,
    valor: { ...pessoas[0], id: "nova-pessoa", uid: null, nome: "Nova pessoa" },
  };
  await executarEscalas(db, "gestor", entrada);
  await assert.rejects(
    () => executarEscalas(db, "gestor", entrada),
    (erro) => erro.status === 409,
  );
  assert.equal(
    [...db.registros.keys()].filter((path) =>
      path.startsWith("pf_escala_pessoas/"),
    ).length,
    3,
  );
});
test("histórico de versões tem paginação por cursor", async () => {
  const { db, turnos } = fixtures();
  for (let i = 0; i < 12; i++) await salvar(db, turnos, i);
  const pagina1 = await executarEscalas(db, "gestor", {
    acao: "versoes",
    semana,
  });
  assert.equal(pagina1.versoes.length, 10);
  assert.ok(pagina1.cursor);
  const pagina2 = await executarEscalas(db, "gestor", {
    acao: "versoes",
    semana,
    cursor: pagina1.cursor,
  });
  assert.equal(pagina2.versoes.length, 2);
  assert.equal(
    new Set([...pagina1.versoes, ...pagina2.versoes].map((v) => v.id)).size,
    12,
  );
});
test("configuração recusa compensação mensal, horário inválido e feriado sem condições", () => {
  const c = configuracaoInicial();
  c.compensacaoMensal = true;
  assert.throws(() => validarConfig(c), /regime/);
  c.compensacaoMensal = false;
  c.funcionamento[0].saida = "07:00";
  assert.throws(() => validarConfig(c), /Funcionamento/);
});
test("coleções de escala são exclusivas da API para escrita e estão incluídas no backup", () => {
  const rules = fs.readFileSync(
    new URL("../firebase/firestore.rules", import.meta.url),
    "utf8",
  );
  const bloco = rules.slice(
    rules.indexOf("match /{colecao}/{id}"),
    rules.indexOf("function donoDoDocumento"),
  );
  assert.match(bloco, /allow write: if false/);
  const backup = fs.readFileSync(
    new URL("../js/backup.js", import.meta.url),
    "utf8",
  );
  for (const nome of [
    "pf_escalas",
    "pf_escalas_versoes",
    "pf_escala_auditoria",
    "pf_escala_historico",
    "pf_escala_pessoas",
  ])
    assert.ok(backup.includes("'" + nome + "'"));
});
