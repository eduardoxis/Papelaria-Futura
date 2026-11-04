import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";
const require = createRequire(
  path.resolve(process.env.VC_TEST_DEPENDENCIES || "package.json"),
);
const sdk = pathToFileURL(require.resolve("firebase/firestore")).href;
const { initializeTestEnvironment, assertFails, assertSucceeds } = await import(
  pathToFileURL(require.resolve("@firebase/rules-unit-testing")).href
);
const {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  setLogLevel,
} = await import(sdk);
setLogLevel("silent");
const env = await initializeTestEnvironment({
  projectId: "demo-futura-test",
  firestore: {
    host: "127.0.0.1",
    port: 8089,
    rules: fs.readFileSync(
      new URL("../firebase/firestore.rules", import.meta.url),
      "utf8",
    ),
  },
});
const url = (s) =>
    "data:text/javascript;base64," + Buffer.from(s).toString("base64"),
  ler = (n) => fs.readFileSync(new URL("../js/" + n, import.meta.url), "utf8");
const cfg = url(
    "export let db;export const auth={currentUser:null};export function usar(b,id){db=b;auth.currentUser={uid:id};}",
  ),
  coreUrl = url(ler("os-core.js"));
const core = await import(coreUrl);
const code = ler("os-db.js")
  .replaceAll(
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js",
    sdk,
  )
  .replaceAll("./firebase-config.js", cfg)
  .replaceAll("./os-core.js", coreUrl);
const api = await import(url(code)),
  config = await import(cfg);
const bancos = {};
const usar = (id) => {
  const b =
    bancos[id] || (bancos[id] = env.authenticatedContext(id).firestore());
  config.usar(b, id);
  return b;
};
const timestamp = (min) => Timestamp.fromMillis(Date.now() + min * 60000);
const dados = {
  clienteId: "cliente",
  clienteNome: "Cliente escolhido",
  clienteTelefone: "31999999999",
  servicoId: "servico",
  descricao: "Produzir material personalizado",
  responsavelId: "ana",
  quantidade: 50,
  previsaoConclusao: timestamp(60),
  previsaoEntrega: timestamp(120),
  prioridade: "normal",
  observacoes: "Informação interna privada",
  material: "Papel adesivo",
  dimensao: "A4",
  acabamento: "Recorte",
};
async function snapshotEsperado(q, predicado) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      off();
      reject(Error("Atualização em tempo real não recebida"));
    }, 6000);
    const off = onSnapshot(
      q,
      (s) => {
        if (predicado(s)) {
          clearTimeout(t);
          off();
          resolve(s);
        }
      },
      reject,
    );
  });
}
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const b = c.firestore();
    for (const [id, roles, nome] of [
      ["admin", ["admin"], "Administrador"],
      ["ana", ["operador_os"], "Ana Silva"],
      ["pedro", ["operador_os"], "Pedro Souza"],
      ["tv", ["painel_os"], "Painel"],
      ["comum", ["user"], "Comum"],
    ])
      await setDoc(doc(b, "usuarios", id), { nome, roles });
    await setDoc(doc(b, "pf_servicos", "servico"), {
      nome: "Etiquetas personalizadas",
      ativo: true,
    });
    await setDoc(doc(b, "pf_servicos", "inativo"), {
      nome: "Antigo",
      ativo: false,
    });
    await setDoc(doc(b, "clientes_cadastro", "cliente"), {
      nome: "Maria Aparecida Oliveira",
      nomeBusca: "maria aparecida oliveira",
      telefone: "31999999999",
    });
  });
  const admin = usar("admin");
  await api.salvarOs(dados, { id: "a", eventoId: "criar-a" });
  let a = await api.buscarOs("a");
  assert.equal(a.numero, "OS-000001");
  assert.equal(a.clienteNome, "Maria Aparecida Oliveira");
  assert.equal(a.clienteExibicao, "Maria O.");
  assert.equal(a.responsavelNome, "Ana Silva");
  assert.equal(a.servicoNome, "Etiquetas personalizadas");
  await api.salvarOs(dados, { id: "a", eventoId: "criar-a" });
  assert.equal(
    (await getDoc(doc(admin, "pf_os_controle", "fila"))).data().sequencia,
    1,
  );
  await Promise.all([
    api.salvarOs(
      { ...dados, clienteId: "", clienteNome: "Cliente 2" },
      { id: "b", eventoId: "criar-b" },
    ),
    api.salvarOs(
      { ...dados, clienteId: "", clienteNome: "Cliente 3" },
      { id: "c", eventoId: "criar-c" },
    ),
  ]);
  let b = await api.buscarOs("b"),
    c = await api.buscarOs("c");
  assert.notEqual(b.numero, c.numero);
  assert.notEqual(b.posicaoFila, c.posicaoFila);
  await assert.rejects(() =>
    api.salvarOs({ ...dados, servicoId: "inativo" }, { id: "invalida" }),
  );
  await api.salvarOs(
    {
      ...dados,
      responsavelId: "pedro",
      previsaoConclusao: timestamp(180),
      previsaoEntrega: timestamp(240),
      prioridade: "alta",
    },
    {
      id: "a",
      revisao: a.revisao,
      motivo: "Novo prazo combinado",
      eventoId: "editar-a",
    },
  );
  a = await api.buscarOs("a");
  assert.equal(a.responsavelId, "pedro");
  assert.notDeepEqual(a.previsaoConclusao, a.previsaoOriginalConclusao);
  assert.equal(a.revisao, 2);
  await assert.rejects(() => api.salvarOs(dados, { id: "a", revisao: 1 }));
  const verAtualizacao = snapshotEsperado(
    query(
      collection(admin, "pf_os_painel"),
      where("ativo", "==", true),
      orderBy("posicaoFila"),
    ),
    (s) =>
      s.docs.find((d) => d.id === "a")?.data().posicaoFila === b.posicaoFila,
  );
  await api.moverOs("a", "b", a.revisao, b.revisao, { eventoId: "mover-ab" });
  await verAtualizacao;
  a = await api.buscarOs("a");
  b = await api.buscarOs("b");
  assert.equal(b.posicaoFila, 1);
  const concorrentes = await Promise.allSettled([
    api.moverOs("a", "b", a.revisao, b.revisao),
    api.moverOs("b", "c", b.revisao, c.revisao),
  ]);
  assert.equal(concorrentes.filter((x) => x.status === "fulfilled").length, 1);
  const fila = (
    await getDocs(
      query(
        collection(admin, "pf_os"),
        where("ativo", "==", true),
        orderBy("posicaoFila"),
      ),
    )
  ).docs.map((d) => d.data());
  assert.equal(new Set(fila.map((o) => o.posicaoFila)).size, 3);
  usar("ana");
  await assert.rejects(() => api.buscarOs("a"));
  await assertFails(
    updateDoc(doc(bancos.ana, "pf_os", "b"), { responsavelId: "pedro" }),
  );
  await assert.rejects(() => api.salvarOs(dados, { id: "proibida" }));
  await assert.rejects(async () =>
    api.mudarStatusOs("b", "cancelado", (await api.buscarOs("b")).revisao, {
      motivo: "Sem permissão",
    }),
  );
  usar("pedro");
  a = await api.buscarOs("a");
  await api.mudarStatusOs("a", "em_producao", a.revisao, {
    eventoId: "iniciar-a",
  });
  a = await api.buscarOs("a");
  assert.ok(a.dataInicio);
  assert.equal(a.status, "em_producao");
  assert.ok(
    (await api.eventosOs("a")).itens.some(
      (e) => e.usuarioNome === "Pedro Souza",
    ),
  );
  assert.ok(
    (await api.historicoOs({ uid: "pedro" })).itens.every(
      (o) => o.responsavelId === "pedro",
    ),
  );
  await api.mudarStatusOs("a", "pronto", a.revisao, { eventoId: "pronto-a" });
  a = await api.buscarOs("a");
  assert.ok(a.dataConclusao);
  assert.equal(a.ativo, true);
  assert.equal(a.dataEntrega, null);
  const entrega = () =>
    api.mudarStatusOs("a", "entregue", a.revisao, { eventoId: "entrega-a" });
  await entrega();
  await entrega();
  a = await api.buscarOs("a");
  assert.equal(a.ativo, false);
  assert.equal(a.entregaId, "os_a");
  assert.ok(a.dataEntrega);
  await assertFails(
    updateDoc(doc(bancos.pedro, "pf_entregas", "os_a"), {
      cliente: "Alterado",
    }),
  );
  await assertFails(deleteDoc(doc(bancos.pedro, "pf_entregas", "os_a")));
  await assertFails(
    updateDoc(doc(bancos.pedro, "pf_os", "a"), { status: "pronto" }),
  );
  await assertFails(deleteDoc(doc(bancos.pedro, "pf_os", "a")));
  usar("tv");
  const painel = await assertSucceeds(
    getDocs(
      query(
        collection(bancos.tv, "pf_os_painel"),
        where("ativo", "==", true),
        orderBy("posicaoFila"),
      ),
    ),
  );
  assert.equal(painel.size, 2);
  for (const d of painel.docs) {
    assert.ok(!("observacoes" in d.data()));
    assert.ok(!("clienteTelefone" in d.data()));
  }
  await assertFails(getDoc(doc(bancos.tv, "pf_os", "a")));
  await assertFails(
    updateDoc(doc(bancos.tv, "pf_os_painel", "b"), {
      cliente: "Nome alterado",
    }),
  );
  usar("comum");
  await assertFails(
    setDoc(doc(bancos.comum, "pf_entregas", "os_reservada"), {
      criadoPor: "comum",
    }),
  );
  await assertFails(getDocs(collection(bancos.comum, "pf_os_painel")));
  await assertFails(getDocs(collection(bancos.comum, "pf_os")));
  await assertFails(
    getDocs(
      collection(env.unauthenticatedContext().firestore(), "pf_os_painel"),
    ),
  );
  usar("admin");
  const hist = await api.historicoOs({ admin: true });
  assert.equal(hist.itens.length, 3);
  const eventos = await api.eventosOs("a");
  assert.ok(eventos.itens.some((e) => e.tipo === "edicao"));
  assert.ok(
    eventos.itens.some(
      (e) =>
        e.antes?.responsavelId === "ana" && e.depois.responsavelId === "pedro",
    ),
  );
  assert.equal(
    (
      await getDocs(
        query(collection(admin, "pf_entregas"), where("osId", "==", "a")),
      )
    ).size,
    1,
  );
  await assertFails(
    updateDoc(doc(admin, "pf_os_eventos", "criar-a"), { motivo: "Adulterado" }),
  );
  await assertFails(deleteDoc(doc(admin, "pf_os_eventos", "criar-a")));
  await assertFails(updateDoc(doc(admin, "pf_os", "b"), { posicaoFila: 999 }));
  await assertFails(
    updateDoc(doc(admin, "pf_os_controle", "fila"), { sequencia: 0 }),
  );
  await assertFails(
    setDoc(doc(admin, "pf_os_painel", "forjada"), {
      cliente: "Nome completo indevido",
    }),
  );
  c = await api.buscarOs("c");
  await api.mudarStatusOs("c", "cancelado", c.revisao, {
    motivo: "Cancelado a pedido do cliente",
  });
  assert.equal((await api.buscarOs("c")).ativo, false);
  assert.ok((await api.clientesOs("maria")).some((c) => c.id === "cliente"));
  const refs = await api.referenciasOs();
  assert.ok(refs.funcionarios.some((u) => u.id === "ana"));
  assert.ok(!refs.funcionarios.some((u) => u.id === "comum"));
  const antiga = {
    ...c,
    previsaoConclusao: Timestamp.fromMillis(Date.now() - 86400000),
  };
  assert.equal(core.prazoOs(antiga).classe, "atrasado");
  assert.equal(core.ativoOs(antiga), true);
  for (let i = 0; i < 8; i++)
    await api.salvarOs(
      { ...dados, clienteId: "", clienteNome: "Cliente de teste " + (i + 1) },
      { id: "painel-" + i, eventoId: "criar-painel-" + i },
    );
  await env.withSecurityRulesDisabled(async (contexto) => {
    for (let i = 0; i < 35; i++)
      await setDoc(doc(contexto.firestore(), "pf_os", "historico-" + i), {
        ...a,
        numero: "OS-HIST-" + i,
        dataEntrada: Timestamp.fromMillis(Date.now() - (i + 1) * 86400000),
      });
  });
  const primeira = await api.historicoOs({ admin: true });
  const segunda = await api.historicoOs({
    admin: true,
    cursor: primeira.cursor,
  });
  assert.equal(primeira.itens.length, 40);
  assert.equal(segunda.itens.length, 6);
  assert.equal(
    new Set([...primeira.itens, ...segunda.itens].map((o) => o.id)).size,
    46,
  );
  const buscaAntiga = await api.historicoOs({
    admin: true,
    filtros: { busca: "OS-HIST-34" },
  });
  assert.equal(buscaAntiga.itens.length, 1);
  const combinado = await api.historicoOs({
    admin: true,
    filtros: {
      busca: "Maria",
      responsavel: "pedro",
      status: "entregue",
      prioridade: "alta",
    },
  });
  assert.equal(combinado.itens.length, 36);
  console.log(
    "OK OS/FIRESTORE: sequência concorrente, cliente/serviço/funcionário existentes, idempotência, edição e previsão original, fila sem posições duplicadas, atualização em tempo real, permissões, fluxo até entrega única, projeção privada, histórico auditado e preservação após virada do dia.",
  );
} finally {
  await env.cleanup();
}
