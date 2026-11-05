import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { fachadaFirebaseTeste } from "./firebase-test-modulos.mjs";
const require = createRequire(
  path.resolve(process.env.VC_TEST_DEPENDENCIES || "package.json"),
);
const sdkUrl = pathToFileURL(require.resolve("firebase/firestore")).href;
const sdk = await import(sdkUrl);
sdk.setLogLevel("silent");
const { initializeTestEnvironment, assertFails } = await import(
  pathToFileURL(require.resolve("@firebase/rules-unit-testing")).href
);
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
  "data:text/javascript;base64," + Buffer.from(s).toString("base64");
const cfgUrl = url('export const auth={currentUser:{uid:"admin"}};');
const cfg = await import(cfgUrl);
const apiUrl = fachadaFirebaseTeste(
  sdkUrl,
  pathToFileURL(require.resolve("firebase/auth")).href,
  cfgUrl,
);
const api = await import(apiUrl);
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore(),
      batch = sdk.writeBatch(db);
    batch.set(sdk.doc(db, "usuarios", "admin"), {
      roles: ["admin"],
      nome: "Admin",
    });
    for (let i = 0; i < 75; i++)
      batch.set(sdk.doc(db, "pf_servicos", String(i).padStart(3, "0")), {
        nome: "Serviço " + String(i).padStart(3, "0"),
        ativo: true,
      });
    batch.set(sdk.doc(db, "pf_produtos", "produto"), {
      nome: "Produto",
      estoque: 5,
    });
    await batch.commit();
  });
  const db = env.authenticatedContext("admin").firestore();
  const base = api.query(
    api.collection(db, "pf_servicos"),
    api.orderBy("nome"),
  );
  const consulta = () => api.query(base, api.limit(31));
  const inicio = api.estatisticasLeituras().consultas;
  const resultados = await Promise.all(
    Array.from({ length: 12 }, () => api.getDocs(consulta())),
  );
  assert.equal(resultados[0].size, 31);
  assert.equal(api.estatisticasLeituras().consultas - inicio, 1);
  await api.updateDoc(api.doc(db, "pf_produtos", "produto"), { estoque: 6 });
  await api.getDocs(consulta());
  assert.equal(api.estatisticasLeituras().consultas - inicio, 1);
  await api.updateDoc(api.doc(db, "pf_servicos", "000"), {
    nome: "Serviço 000 alterado",
  });
  let s = await api.getDocs(consulta());
  assert.match(s.docs[0].data().nome, /alterado/);
  assert.equal(api.estatisticasLeituras().consultas - inicio, 2);
  const batch = api.writeBatch(db);
  batch.update(api.doc(db, "pf_servicos", "000"), { nome: "Serviço 000 lote" });
  await batch.commit();
  s = await api.getDocs(consulta());
  assert.match(s.docs[0].data().nome, /lote/);
  await api.runTransaction(db, async (tx) => {
    const r = api.doc(db, "pf_servicos", "000");
    await tx.get(r);
    tx.update(r, { nome: "Serviço 000 transação" });
  });
  s = await api.getDocs(consulta());
  assert.match(s.docs[0].data().nome, /transação/);
  const pagUrl = url(
    fs
      .readFileSync(new URL("../js/paginacao.js", import.meta.url), "utf8")
      .replaceAll("./operacoes-banco.js", apiUrl),
  );
  const { criarPaginador } = await import(pagUrl),
    pag = criarPaginador();
  let estado = await pag.iniciar(base);
  assert.equal(estado.itens.length, 30);
  const ids = estado.itens.map((i) => i.id);
  while (estado.proxima) {
    estado = await pag.mover(1);
    ids.push(...estado.itens.map((i) => i.id));
  }
  assert.equal(ids.length, 75);
  assert.equal(new Set(ids).size, 75);
  const qt = api.estatisticasLeituras().consultas;
  await pag.mover(-1);
  assert.equal(api.estatisticasLeituras().consultas, qt);

  const planilhas = api.collection(db, "comissoes");
  const registrosA = api.collection(db, "comissoes", "a", "registros");
  const registrosB = api.collection(db, "comissoes", "b", "registros");
  await api.setDoc(api.doc(planilhas, "a"), { criadoPor: "admin", titulo: "A" });
  await api.setDoc(api.doc(planilhas, "b"), { criadoPor: "admin", titulo: "B" });
  const lerRegistros = origem => api.memorizarResumo(origem.path, origem.path, () => api.getDocs(origem));
  await Promise.all([api.getDocs(planilhas), lerRegistros(registrosA), lerRegistros(registrosB)]);
  const antesDoLancamento = api.estatisticasLeituras().consultas;
  await api.addDoc(registrosA, { descricao: "Venda confirmada" });
  const [cabecalhos, a, b] = await Promise.all([
    api.getDocs(planilhas), lerRegistros(registrosA), lerRegistros(registrosB)
  ]);
  assert.equal(cabecalhos.size, 2);
  assert.equal(a.size, 1);
  assert.equal(b.size, 0);
  assert.equal(api.estatisticasLeituras().consultas - antesDoLancamento, 1);

  cfg.auth.currentUser = { uid: "anonimo" };
  await assertFails(
    api.getDocs(
      api.collection(env.unauthenticatedContext().firestore(), "pf_servicos"),
    ),
  );
  console.log(
    "OK LEITURAS/FIRESTORE: cache de consultas equivalentes, gravação seletiva, lote, transação, paginação real de 75 serviços sem perda, retorno sem leitura e bloqueio de acesso anônimo.",
  );
} finally {
  await env.cleanup();
}
