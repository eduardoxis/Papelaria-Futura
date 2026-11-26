import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const origem = "https://papelaria.test";
const urlModulo = origem + "/js/operacoes-banco.js";
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
    respondWith: promessa => { resposta = promessa; },
    waitUntil: promessa => promessa.catch(() => {})
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
await assert.rejects(() => solicitar(firebase), /Rede indisponível/);
assert.equal(acessosCache, antes, "Dados do Firebase não devem passar pelo cache");
const apiEscalas = origem + '/api/escalas';
arquivos.set(apiEscalas, new Response('escala antiga de outra sessão'));
rede = async () => new Response('escala atual');
const antesApi = acessosCache;
assert.equal(await (await solicitar(apiEscalas)).text(), 'escala atual');
assert.equal(acessosCache, antesApi, 'A API autenticada não deve consultar o cache');
rede = async () => { throw new TypeError('Rede indisponível'); };
await assert.rejects(() => solicitar(apiEscalas), /Rede indisponível/);
const fonte = 'https://fonts.gstatic.com/s/inter/teste.woff2';
arquivos.set(fonte, new Response('falha antiga', {status:503}));
rede = async () => new Response('fonte recuperada');
assert.equal(await (await solicitar(fonte)).text(), 'fonte recuperada');
assert.equal(await arquivos.get(fonte).clone().text(), 'fonte recuperada');
rede = async () => new Response('falha temporária', {status:503});
assert.equal(await (await solicitar(fonte)).text(), 'fonte recuperada');
await new Promise(r=>setTimeout(r,0));
assert.equal(await arquivos.get(fonte).clone().text(), 'fonte recuperada', 'Não sobrescrever fonte válida com HTTP 503');
arquivos.delete(fonte);
assert.equal((await solicitar(fonte)).status,503);
assert.ok(!arquivos.has(fonte),'Erro HTTP não pode entrar no cache');
rede = async () => { throw new TypeError('Rede indisponível'); };
await assert.rejects(()=>solicitar(fonte), /Rede indisponível/);
assert.equal(solicitar('https://ext-cdn.cuponomia.com.br/recurso.js'),undefined);
assert.equal(solicitar('https://outro-servico.test/recurso'),undefined);
const csp = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url),'utf8')).headers
  .flatMap(h=>h.headers).find(h=>h.key==='Content-Security-Policy').value;
assert.match(csp,/font-src 'self' data: https:\/\/fonts.gstatic.com;/);
assert.ok(!csp.match(/script-src[^;]*data:/),'A permissão de dados deve ficar restrita às fontes');
console.log("OK: recuperação de recurso e fonte após erro 503; cache rejeita erros; dados autenticados sem cache; extensões sem interceptação; fontes incorporadas permitidas apenas em font-src.");
