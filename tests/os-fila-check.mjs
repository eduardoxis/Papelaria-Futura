import assert from "node:assert/strict";
import fs from "node:fs";
const ler = (n) =>
  fs.readFileSync(new URL("../js/" + n, import.meta.url), "utf8");
const url = (s) =>
  "data:text/javascript;base64," + Buffer.from(s).toString("base64");
const coreUrl = url(ler("os-core.js")),
  core = await import(coreUrl);
const sdkUrl = url(
  [
    "export const estado={consultas:[],ouvintes:[]};",
    "export const collection=(db,nome)=>nome;",
    "export const where=(campo,op,valor)=>({tipo:'where',campo,op,valor});",
    "export const orderBy=(campo)=>({tipo:'orderBy',campo});",
    "export function query(colecao,...filtros){if(filtros.some(f=>f.tipo==='orderBy'))throw Object.assign(Error('The query requires an index.'),{code:'failed-precondition'});const q={colecao,filtros};estado.consultas.push(q);return q;}",
    "export function onSnapshot(q,opcoes,sucesso,erro){const ouvinte={q,sucesso,erro,ativo:true};estado.ouvintes.push(ouvinte);return()=>ouvinte.ativo=false;}",
    "export const doc=()=>({id:'novo'}),getDoc=()=>{},getDocs=()=>{},limit=()=>{},startAfter=()=>{},runTransaction=()=>{},serverTimestamp=()=>{},Timestamp={};",
  ].join("\n"),
);
const cfgUrl = url(
  "export const db={};export const auth={currentUser:{uid:'ana'}};",
);
const api = await import(
  url(
    ler("os-db.js")
      .replaceAll(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js",
        sdkUrl,
      )
      .replaceAll("./firebase-config.js", cfgUrl)
      .replaceAll("./os-core.js", coreUrl),
  )
);
const { estado } = await import(sdkUrl);
const ordens = [
  { id: "c", ativo: true, responsavelId: "ana", posicaoFila: 3 },
  { id: "a", ativo: true, responsavelId: "ana", posicaoFila: 1 },
  { id: "b", ativo: true, responsavelId: "pedro", posicaoFila: 2 },
  { id: "encerrada", ativo: false, responsavelId: "ana", posicaoFila: 4 },
];
function emitir(ouvinte, dados = ordens) {
  const itens = dados.filter((o) =>
    ouvinte.q.filtros.every((f) => o[f.campo] === f.valor),
  );
  ouvinte.sucesso({
    docs: itens.map((o) => ({ id: o.id, data: () => o })),
    metadata: { fromCache: false },
  });
}
for (const [opcoes, esperados, colecao] of [
  [{ admin: true }, ["a", "b", "c"], "pf_os"],
  [{ uid: "ana" }, ["a", "c"], "pf_os"],
  [{ painel: true }, ["a", "b", "c"], "pf_os_painel"],
]) {
  let recebido, metadados;
  const off = api.observarFilaOs(
    opcoes,
    (itens, meta) => {
      recebido = itens;
      metadados = meta;
    },
    (e) => assert.fail(e.message),
  );
  const ouvinte = estado.ouvintes.at(-1);
  assert.equal(ouvinte.q.colecao, colecao);
  assert.ok(ouvinte.q.filtros.every((f) => f.tipo === "where"));
  emitir(ouvinte);
  assert.deepEqual(
    recebido.map((o) => o.id),
    esperados,
  );
  assert.equal(metadados.fromCache, false);
  emitir(
    ouvinte,
    ordens.map((o) => ({
      ...o,
      posicaoFila: o.id === "c" ? 1 : o.id === "a" ? 3 : o.posicaoFila,
    })),
  );
  assert.equal(recebido[0].id, "c");
  off();
  assert.equal(ouvinte.ativo, false);
}
assert.deepEqual(
  [{ id: "b", posicaoFila: 2 }, { id: "a", posicaoFila: 2 }, { id: "x" }]
    .sort(core.compararFilaOs)
    .map((o) => o.id),
  ["a", "b", "x"],
);
const indice = core.erroConsultaOs({
  code: "failed-precondition",
  message:
    "The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/test/firestore/indexes?create_composite=abc",
});
assert.ok(indice.mensagem.includes("índice"));
assert.equal(
  indice.indice,
  "https://console.firebase.google.com/v1/r/project/test/firestore/indexes?create_composite=abc",
);
assert.ok(!indice.mensagem.includes("conexão"));
assert.equal(
  core.erroConsultaOs({
    code: "failed-precondition",
    message: "index https://site-invalido.example/",
  }).indice,
  null,
);
assert.ok(
  core
    .erroConsultaOs({ code: "permission-denied" })
    .mensagem.includes("permissão"),
);
assert.ok(
  core.erroConsultaOs({ code: "unavailable" }).mensagem.includes("conexão"),
);
assert.equal(
  core.erroConsultaOs({ message: "Informe a descrição." }).mensagem,
  "Informe a descrição.",
);
console.log(
  "OK FILA: consulta sem orderBy composto, ordenação manual consistente, atualização recebida em tempo real, filtros de acesso preservados e erros de índice/permissão/rede diferenciados.",
);
