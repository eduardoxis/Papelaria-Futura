import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const origem = "https://papelaria.test";
const urlModulo = origem + "/js/firestore-operacoes.js";
const eventos = new Map();
const arquivos = new Map();
let rede;
let acessosCache = 0;
const cache = {
  async addAll(caminhos) {
    for (const caminho of caminhos) arquivos.set(new URL(caminho, origem).href, new Response("versão em cache"));
  },
  async put(request, resposta) {
    arquivos.set(request.url, resposta);
  }
};

vm.runInNewContext(readFileSync(new URL("../service-worker.js", import.meta.url), "utf8"), {
  URL,
  Response,
  console,
  fetch: request => rede(request),
  self: {
    location: { origin: origem },
    addEventListener: (nome, callback) => eventos.set(nome, callback),
    skipWaiting: async () => {}
  },
  caches: {
    open: async () => cache,
    async match(request) {
      acessosCache++;
      return arquivos.get(request.url)?.clone();
    }
  }
});

let instalacao;
eventos.get("install")({ waitUntil: promessa => { instalacao = promessa; } });
await instalacao;
assert.ok(arquivos.has(urlModulo), "O módulo local deve ser pré-carregado");

function solicitar(url) {
  let resposta;
  eventos.get("fetch")({
    request: new Request(url),
    respondWith: promessa => { resposta = promessa; }
  });
  return resposta;
}

rede = async () => { throw new TypeError("Rede indisponível"); };
assert.equal(await (await solicitar(urlModulo)).text(), "versão em cache");
rede = async () => new Response("Serviço indisponível", { status: 503 });
assert.equal(await (await solicitar(urlModulo)).text(), "versão em cache");
assert.equal((await solicitar(origem + "/js/sem-cache.js")).status, 503);
rede = async () => new Response(null, { status: 404 });
assert.equal((await solicitar(urlModulo)).status, 404);

rede = async () => new Response("versão nova");
assert.equal(await (await solicitar(urlModulo)).text(), "versão nova");
const firebase = "https://firestore.googleapis.com/v1/projects/teste";
arquivos.set(firebase, new Response("dados antigos"));
const antes = acessosCache;
rede = async () => { throw new TypeError("Rede indisponível"); };
assert.equal((await solicitar(firebase)).status, 503);
assert.equal(acessosCache, antes, "Dados do Firebase não devem passar pelo cache");
console.log("OK: módulo local usa o cache em falha de rede e HTTP 503, sem cachear dados do Firebase.");
