import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  criarControleCotaFirebase,
  ehCotaFirebase,
} from "../js/firebase-limites.js";
let agora = 1000;
const dados = new Map();
const storage = {
  getItem: (k) => dados.get(k) || null,
  setItem: (k, v) => dados.set(k, v),
};
const config = { agora: () => agora, armazenamento: () => storage };
const a = criarControleCotaFirebase(config);
let chamadas = 0;
await assert.rejects(
  () =>
    a.executar(async () => {
      chamadas++;
      throw Object.assign(Error("Quota exceeded."), {
        code: "resource-exhausted",
      });
    }),
  (e) => ehCotaFirebase(e) && e.message.includes("cota"),
);
await assert.rejects(() => a.executar(async () => chamadas++), /cota/);
assert.equal(chamadas, 1);
const outraAba = criarControleCotaFirebase(config);
await assert.rejects(() => outraAba.executar(async () => chamadas++), /cota/);
assert.equal(chamadas, 1);
agora += 60001;
assert.equal(await outraAba.executar(async () => 42), 42);
assert.equal(outraAba.pausado(), false);
const b = criarControleCotaFirebase({
  agora: () => agora,
  armazenamento: () => {
    throw Error("bloqueado");
  },
});
await assert.rejects(
  () =>
    b.executar(async () => {
      throw { code: "firestore/resource-exhausted" };
    }),
  /cota/,
);
assert.ok(b.pausado());
const c = criarControleCotaFirebase({
  agora: () => agora,
  armazenamento: () => null,
});
await assert.rejects(
  () =>
    c.executar(async () => {
      throw Object.assign(Error("Acesso negado"), {
        code: "permission-denied",
      });
    }),
  /negado/,
);
assert.equal(c.pausado(), false);
const notificacoes = fs.readFileSync(
  new URL("../js/notificacoes.js", import.meta.url),
  "utf8",
);
const inicio = notificacoes.indexOf(
    "async function atualizarBadgeNotificacoes()",
  ),
  fim = notificacoes.indexOf("\nlet _abaAtiva", inicio);
let consultas = 0;
const contexto = {
  _carregando: false,
  _cache: [],
  _ultimaAtualizacao: 0,
  document: { hidden: false, querySelectorAll: () => [] },
  firebaseEmPausa: () => false,
  calcularNotificacoes: async () => {
    consultas++;
    return [{ tipo: "cotacao" }];
  },
  Date,
  console,
};
vm.createContext(contexto);
vm.runInContext(notificacoes.slice(inicio, fim), contexto);
await contexto.atualizarBadgeNotificacoes();
await contexto.atualizarBadgeNotificacoes();
await contexto.atualizarBadgeNotificacoes();
assert.equal(consultas, 1);
contexto._ultimaAtualizacao = 0;
contexto.firebaseEmPausa = () => true;
await contexto.atualizarBadgeNotificacoes();
assert.equal(consultas, 1);
const fonteDashboard = fs.readFileSync(
  new URL("../js/index.js", import.meta.url),
  "utf8",
);
const trechoDashboard = fonteDashboard.slice(
  fonteDashboard.indexOf("async function carregarDashboard("),
  fonteDashboard.indexOf("async function carregarDadosDashboard("),
);
let concluir;
const pendente = new Promise((r) => (concluir = r));
let cargas = 0;
const contextoDash = {
  _dashboardEmCarregamento: false,
  _dashboardAtualizadoEm: 0,
  firebaseEmPausa: () => false,
  MENSAGEM_COTA_FIREBASE: "Cota excedida",
  window: { mostrarToast() {} },
  Date,
  carregarDadosDashboard: async () => {
    cargas++;
    await pendente;
    contextoDash._dashboardAtualizadoEm = Date.now();
  },
};
vm.createContext(contextoDash);
vm.runInContext(trechoDashboard, contextoDash);
const d1 = contextoDash.carregarDashboard(),
  d2 = contextoDash.carregarDashboard();
assert.equal(cargas, 1);
concluir();
await Promise.all([d1, d2]);
await contextoDash.carregarDashboard();
assert.equal(cargas, 1);
await contextoDash.carregarDashboard(true);
assert.equal(cargas, 2);
contextoDash.firebaseEmPausa = () => true;
await contextoDash.carregarDashboard(true);
assert.equal(cargas, 2);
console.log(
  "OK COTA: erro 429 classificado, pausa entre abas, retomada sem gravação fictícia, armazenamento indisponível, permissões preservadas, dashboard sem carga duplicada e notificações sem releitura ao alternar abas.",
);
