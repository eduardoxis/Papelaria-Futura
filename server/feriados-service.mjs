import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { consultarFontesOficiais, hashConteudo } from "./feriados-fontes.mjs";
import { ErroEscala, ehGestorEscalas } from "./escalas-acesso.mjs";
import {
  consolidarEventos,
  identidadeEvento,
  validarDecisao,
  horarioHabitual,
} from "../js/calendario-core.js";
import {
  segunda,
  somarDias,
  configuracaoInicial,
  dataValida,
} from "../js/escalas-core.js";

const chaveAno = (ano) => `BR_GO_luziania_${ano}`;
const copiar = (v) => JSON.parse(JSON.stringify(v));
const agora = () => new Date().toISOString();
const exigir = (ok, texto, status = 400, detalhes = null) => {
  if (!ok) throw new ErroEscala(texto, status, detalhes);
};
const emAndamento = new WeakMap();
let inicial;
export async function calendarioInicial(ano) {
  if (!inicial)
    inicial = fs
      .readFile(
        new URL("../data/feriados-inicial-2026.json", import.meta.url),
        "utf8",
      )
      .then(JSON.parse)
      .catch(() => null);
  const original = await inicial;
  if (!original) return { ano, eventos: [], esferas: {}, revisao: 0 };
  if (ano === 2026) return { ...copiar(original), revisao: 0 };
  const eventos = original.eventos
    .filter((e) => e.recorrente && e.aplicabilidade === "confirmada")
    .map((e) => ({ ...e, data: ano + e.data.slice(4) }));
  const esferas = Object.fromEntries(
    ["uniao", "goias", "luziania"].map((esfera) => [
      esfera,
      {
        eventos: esfera === "uniao" ? eventos : [],
        status: {
          esfera,
          cobertura: "aguardando_publicacao",
          ultimaConsulta: null,
          ultimoSucesso: null,
          fontes: esfera === "uniao" ? eventos.flatMap((e) => e.fontes) : [],
          pendencias: [
            {
              erro: "Calendário anual ainda não sincronizado para " + ano + ".",
            },
          ],
          aplicabilidadesPendentes: [],
          calendarioAnualEncontrado: false,
        },
      },
    ]),
  );
  return { ano, eventos, esferas, revisao: 0, cargaInicial: true };
}
function semTempo(evento) {
  return {
    data: evento.data,
    nome: evento.nomeOficial,
    natureza: evento.natureza,
    abrangencia: evento.abrangencia,
    publico: evento.publico,
    aplicabilidade: evento.aplicabilidade,
    periodo: evento.periodo,
    vigente: evento.vigente,
    fontes: evento.fontes.map((f) => ({
      url: f.url,
      ato: f.ato,
      artigo: f.artigo,
    })),
  };
}
function consolidarEsferas(esferas) {
  const eventos = consolidarEventos(
    Object.values(esferas).flatMap((e) => e.eventos || []),
  );
  return eventos.map((e) => ({
    ...e,
    id: hashConteudo(e.data + "|" + identidadeEvento(e)).slice(0, 32),
    assinatura: hashConteudo(JSON.stringify(semTempo(e))),
  }));
}
function alteracoes(antes, depois) {
  const antigas = new Map(antes.map((e) => [identidadeEvento(e), e]));
  const novas = new Map(depois.map((e) => [identidadeEvento(e), e]));
  const lista = [];
  for (const [id, novo] of novas) {
    const anterior = antigas.get(id);
    if (
      anterior &&
      JSON.stringify(semTempo(anterior)) !== JSON.stringify(semTempo(novo))
    )
      lista.push({
        identidade: id,
        antes: anterior,
        depois: novo,
        datas: [...new Set([anterior.data, novo.data])],
        tipo:
          anterior.data !== novo.data ? "data_alterada" : "fundamento_alterado",
      });
  }
  for (const [id, anterior] of antigas)
    if (!novas.has(id))
      lista.push({
        identidade: id,
        antes: anterior,
        depois: null,
        datas: [anterior.data],
        tipo: "retirado_da_versao_vigente",
      });
  return lista;
}
async function gestorTx(tx, db, uid) {
  const perfil = await tx.get(db.doc("usuarios/" + uid));
  exigir(
    perfil.exists &&
      perfil.data().ativo !== false &&
      ehGestorEscalas(perfil.data()),
    "Somente o gestor pode atualizar o calendário ou decidir o funcionamento.",
    403,
  );
  return perfil.data();
}
export async function sincronizarAno(
  db,
  ano,
  { consultar = consultarFontesOficiais } = {},
) {
  exigir(Number.isInteger(ano) && ano >= 2026 && ano <= 2100, "Ano inválido.");
  if (!emAndamento.has(db)) emAndamento.set(db, new Map());
  const porAno = emAndamento.get(db);
  if (porAno.has(ano)) return porAno.get(ano);
  const promessa = (async () => {
    const inicio = agora(),
      novas = await consultar(ano);
    return db.runTransaction(async (tx) => {
      const ref = db.doc("pf_feriados_anos/" + chaveAno(ano)),
        snap = await tx.get(ref);
      const anterior = snap.exists ? snap.data() : await calendarioInicial(ano);
      if (
        anterior.sincronizacaoIniciadaEm &&
        anterior.sincronizacaoIniciadaEm > inicio
      )
        return anterior;
      const esferas = {};
      for (const esfera of ["uniao", "goias", "luziania"]) {
        const atual = novas[esfera],
          antiga = anterior.esferas?.[esfera];
        const completa = atual?.status?.cobertura === "completa";
        const preservados = (antiga?.eventos || []).filter(
          (e) =>
            !atual.eventos.some(
              (n) =>
                identidadeEvento(n) === identidadeEvento(e) &&
                n.data !== e.data,
            ),
        );
        const eventos = completa
          ? atual.eventos
          : consolidarEventos([...preservados, ...(atual?.eventos || [])]);
        // Uma nova versão completa do anexo municipal substitui suas datas antigas,
        // mesmo quando a aplicabilidade privada de uma lei continua pendente.
        const substituirAnual =
          esfera === "luziania" &&
          atual?.status?.calendarioAnualEncontrado &&
          atual.eventos.length >= 5;
        esferas[esfera] = {
          eventos: substituirAnual ? atual.eventos : eventos,
          status: {
            ...atual.status,
            ultimoSucesso:
              atual.status.ultimoSucesso ||
              antiga?.status?.ultimoSucesso ||
              null,
            fontes: atual.status.fontes.length
              ? atual.status.fontes
              : antiga?.status?.fontes || [],
            dadosAnterioresPreservados:
              !atual.eventos.length && !!antiga?.eventos?.length,
          },
        };
      }
      const eventos = consolidarEsferas(esferas),
        mudancas = alteracoes(anterior.eventos || [], eventos);
      const hash = hashConteudo(JSON.stringify(eventos.map(semTempo)));
      const mudou = hash !== anterior.hash;
      const atualizado = {
        ano,
        eventos,
        esferas,
        hash,
        revisao: (anterior.revisao || 0) + (mudou ? 1 : 0),
        ultimaConsulta: agora(),
        sincronizacaoIniciadaEm: inicio,
        cargaInicial: false,
      };
      const datas = [...new Set(mudancas.flatMap((m) => m.datas))];
      const escolhas = await Promise.all(
        datas.map((data) => tx.get(db.doc("pf_calendario_decisoes/" + data))),
      );
      const semanas = [...new Set(datas.map(segunda))];
      const publicacoes = await Promise.all(
        semanas.map((s) => tx.get(db.doc("pf_escala_publicacoes/" + s))),
      );
      const snapshots = await Promise.all(
        publicacoes
          .filter((s) => s.exists)
          .map((s) => tx.get(db.doc("pf_escalas_publicadas/" + s.data().id))),
      );
      const trava = await tx.get(db.doc("pf_escala_controle/revisao"));
      tx.set(ref, atualizado);
      if (mudou)
        tx.create(
          db.doc(
            "pf_feriados_versoes/" +
              chaveAno(ano) +
              "_" +
              String(atualizado.revisao).padStart(6, "0") +
              "_" +
              hash.slice(0, 20),
          ),
          {
            ...atualizado,
            criadoEm: agora(),
            antes: anterior.eventos || [],
            alteracoes: mudancas,
          },
        );
      for (const m of mudancas) {
        const afetados = snapshots
          .filter((s) => s.exists)
          .flatMap((s) =>
            s
              .data()
              .turnos.filter((t) => m.datas.includes(t.data))
              .map((t) => ({
                ...t,
                semana: s.data().semana,
                versaoPublicada: s.data().versao,
              })),
          );
        tx.set(
          db.doc(
            "pf_calendario_avisos/" +
              hashConteudo(ano + "|" + m.identidade + "|" + hash).slice(0, 48),
          ),
          {
            ano,
            ...m,
            turnosAtingidos: afetados,
            criadoEm: agora(),
            revisado: false,
          },
        );
      }
      escolhas.forEach((s) => {
        if (s.exists)
          tx.set(db.doc("pf_calendario_decisoes/" + s.id), {
            ...s.data(),
            revisao: s.data().revisao + 1,
            revisaoPendente: true,
            motivoRevisao:
              "Publicação oficial alterou a data ou fundamento. Confira as datas envolvidas.",
            atualizadoEm: agora(),
          });
      });
      tx.set(db.doc("pf_escala_controle/revisao"), {
        revisao: (trava.data()?.revisao || 0) + 1,
      });
      return atualizado;
    });
  })().finally(() => porAno.delete(ano));
  porAno.set(ano, promessa);
  return promessa;
}
export async function garantirCalendario(db, anos) {
  for (const ano of anos) {
    exigir(
      Number.isInteger(ano) && ano >= 2026 && ano <= 2100,
      "Ano inválido.",
    );
    const existe = await db.runTransaction(
      async (tx) =>
        (await tx.get(db.doc("pf_feriados_anos/" + chaveAno(ano)))).exists,
    );
    if (!existe) {
      const seed = await calendarioInicial(ano);
      if (seed.eventos.length)
        await db.runTransaction(async (tx) => {
          const ref = db.doc("pf_feriados_anos/" + chaveAno(ano)),
            snap = await tx.get(ref);
          if (!snap.exists) tx.set(ref, seed);
        });
      await sincronizarAno(db, ano);
    }
  }
}
export async function lerCalendarioTx(tx, db, inicio, fim) {
  const anos = Array.from(
    { length: Number(fim.slice(0, 4)) - Number(inicio.slice(0, 4)) + 1 },
    (_, i) => Number(inicio.slice(0, 4)) + i,
  );
  const anuais = await Promise.all(
    anos.map(async (ano) => {
      const snap = await tx.get(db.doc("pf_feriados_anos/" + chaveAno(ano)));
      return snap.exists ? snap.data() : await calendarioInicial(ano);
    }),
  );
  const decisoesSnap = await tx.get(
    db
      .collection("pf_calendario_decisoes")
      .where("data", ">=", inicio)
      .where("data", "<=", fim)
      .orderBy("data")
      .limit(401),
  );
  const avisosSnap = await tx.get(
    db.collection("pf_calendario_avisos").where("ano", "in", anos).limit(201),
  );
  return {
    eventos: consolidarEventos(anuais.flatMap((a) => a.eventos || [])).filter(
      (e) => e.data >= inicio && e.data <= fim,
    ),
    decisoes: decisoesSnap.docs.map((d) => d.data()),
    status: anuais.map((a) => ({
      ano: a.ano,
      esferas: Object.fromEntries(
        Object.entries(a.esferas || {}).map(([k, v]) => [k, v.status]),
      ),
      ultimaConsulta: a.ultimaConsulta || null,
    })),
    avisos: avisosSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter(
        (a) => !a.revisado && a.datas.some((d) => d >= inicio && d <= fim),
      ),
  };
}
export async function consultarCalendario(
  db,
  { inicio, fim, tipo, abrangencia },
) {
  exigir(
    dataValida(inicio) &&
      dataValida(fim) &&
      inicio <= fim &&
      inicio >= "2026-01-01" &&
      fim <= "2100-12-31" &&
      Date.parse(fim) - Date.parse(inicio) <= 370 * 86400000,
    "Consulte um período de até 370 dias, a partir de 2026.",
  );
  const anos = Array.from(
    { length: Number(fim.slice(0, 4)) - Number(inicio.slice(0, 4)) + 1 },
    (_, i) => Number(inicio.slice(0, 4)) + i,
  );
  await garantirCalendario(db, anos);
  const calendario = await db.runTransaction((tx) =>
    lerCalendarioTx(tx, db, inicio, fim),
  );
  return {
    ...calendario,
    eventos: calendario.eventos.filter(
      (e) =>
        (!tipo || e.natureza === tipo) &&
        (!abrangencia || e.abrangencia === abrangencia),
    ),
  };
}
async function impactoTx(tx, db, data) {
  const semana = segunda(data),
    [atual, indice] = await Promise.all([
      tx.get(db.doc("pf_escalas/" + semana)),
      tx.get(db.doc("pf_escala_publicacoes/" + semana)),
    ]);
  const publicado = indice.exists
    ? await tx.get(db.doc("pf_escalas_publicadas/" + indice.data().id))
    : null;
  return {
    semana,
    rascunho: atual.exists
      ? atual
          .data()
          .turnos.filter((t) => t.data === data && t.tipo === "trabalho")
      : [],
    publicados: publicado?.exists
      ? publicado
          .data()
          .turnos.filter((t) => t.data === data && t.tipo === "trabalho")
      : [],
    versaoPublicada: publicado?.exists ? publicado.data().versao : null,
  };
}
export async function decidirFuncionamento(
  db,
  uid,
  entrada,
  { simular = false } = {},
) {
  const decisao = copiar(entrada.decisao || {});
  exigir(dataValida(decisao.data), "Data inválida.");
  decisao.compensacaoFeriado ||= "pagamento";
  return db.runTransaction(async (tx) => {
    const perfil = await gestorTx(tx, db, uid);
    const [configSnap, atual] = await Promise.all([
      tx.get(db.doc("pf_escala_config/loja")),
      tx.get(db.doc("pf_calendario_decisoes/" + decisao.data)),
    ]);
    const config = configSnap.exists
      ? configSnap.data()
      : configuracaoInicial();
    if (decisao.situacao === "normal") {
      const habitual = horarioHabitual(config, decisao.data);
      if (habitual) {
        decisao.entrada = habitual.entrada;
        decisao.saida = habitual.saida;
      }
    }
    validarDecisao(decisao);
    const impacto = await impactoTx(tx, db, decisao.data);
    const calendario = await lerCalendarioTx(
      tx,
      db,
      decisao.data,
      decisao.data,
    );
    if (simular)
      return {
        impacto,
        eventos: calendario.eventos,
        decisao,
        configRevisao: config.revisao,
      };
    if (entrada.configRevisao !== undefined)
      exigir(
        entrada.configRevisao === config.revisao,
        "O horário habitual mudou. Confira a decisão novamente.",
        409,
      );
    exigir(
      entrada.revisao === (atual.exists ? atual.data().revisao : 0),
      "Esta decisão foi alterada. Reabra a data para revisar.",
      409,
    );
    if (impacto.publicados.length)
      exigir(
        entrada.confirmarImpacto === true,
        "Revise os colaboradores e turnos atingidos antes de salvar.",
        422,
        impacto,
      );
    const trava = await tx.get(db.doc("pf_escala_controle/revisao"));
    const salvo = {
      ...decisao,
      loja: "Papelaria Futura",
      revisao: (atual.exists ? atual.data().revisao : 0) + 1,
      revisaoPendente: false,
      assinaturasOficiais: calendario.eventos.map(
        (e) => e.assinatura || e.id || identidadeEvento(e),
      ),
      atualizadoEm: agora(),
      atualizadoPor: uid,
      impactoPendente: impacto.publicados.length > 0,
      versaoPublicadaAfetada: impacto.versaoPublicada,
    };
    tx.set(db.doc("pf_calendario_decisoes/" + decisao.data), salvo);
    for (const aviso of calendario.avisos) {
      const datasRevisadas = [
        ...new Set([...(aviso.datasRevisadas || []), decisao.data]),
      ];
      tx.set(db.doc("pf_calendario_avisos/" + aviso.id), {
        ...aviso,
        datasRevisadas,
        revisado: aviso.datas.every((d) => datasRevisadas.includes(d)),
      });
    }
    tx.create(db.doc("pf_escala_auditoria/" + randomUUID()), {
      tipo: "calendario",
      alvo: "pf_calendario_decisoes/" + decisao.data,
      antes: atual.exists ? atual.data() : null,
      depois: salvo,
      usuario: uid,
      nome: perfil.nome || uid,
      criadoEm: agora(),
      motivo: entrada.motivo || "Decisão de funcionamento por data",
      impacto,
    });
    tx.set(db.doc("pf_escala_controle/revisao"), {
      revisao: (trava.data()?.revisao || 0) + 1,
    });
    return { decisao: salvo, impacto };
  });
}
export async function autorizarGestorCalendario(db, uid) {
  return db.runTransaction((tx) => gestorTx(tx, db, uid));
}
