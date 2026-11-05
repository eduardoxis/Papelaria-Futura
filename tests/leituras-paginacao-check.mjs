import assert from "node:assert/strict";
import fs from "node:fs";
import { criarCacheLeituras } from "../js/leituras-cache.js";
let instante = 1000,
  chamadas = 0;
const c = criarCacheLeituras({ agora: () => instante });
const ler = () =>
  c.ler(
    "lista",
    async () => {
      chamadas++;
      return { itens: [1] };
    },
    { dono: "ana", colecao: "produtos" },
  );
await Promise.all(Array.from({ length: 100 }, ler));
assert.equal(chamadas, 1);
await ler();
assert.equal(chamadas, 1);
c.invalidar(["outra"]);
await ler();
assert.equal(chamadas, 1);
c.invalidar(["produtos"]);
await ler();
assert.equal(chamadas, 2);
instante += 60001;
await ler();
assert.equal(chamadas, 3);
await c.ler(
  "lista",
  async () => {
    chamadas++;
  },
  { dono: "bia", colecao: "produtos" },
);
assert.equal(chamadas, 4);
for (let i = 0; i < 2; i++)
  await assert.rejects(
    c.ler("erro", () => {
      throw Error("rede");
    }),
    /rede/,
  );
let resolver,
  redes = 0;
const resposta = c.ler(
  "corrida",
  () => {
    redes++;
    return new Promise((r) => (resolver = r));
  },
  { colecao: "produtos" },
);
await Promise.resolve();
c.invalidar(["produtos"]);
resolver({ valor: "antigo" });
await resposta;
await c.ler(
  "corrida",
  async () => {
    redes++;
  },
  { colecao: "produtos" },
);
assert.equal(redes, 2);
let offline = 0;
for (let i = 0; i < 2; i++)
  await c.ler("offline", async () => {
    offline++;
    return { metadata: { fromCache: true } };
  });
assert.equal(offline, 2);
let falhas = 0;
for (let i = 0; i < 2; i++)
  await c.ler("falha-tratada", async () => {
    falhas++;
    return { sucesso: false, erro: "rede" };
  });
assert.equal(falhas, 2);

const url = (s) =>
  "data:text/javascript;base64," + Buffer.from(s).toString("base64");
const stub = url(`export let leituras=0,documentos=0;
export const limit=n=>({limite:n}),startAfter=d=>({apos:d.id});
export const query=(q,...f)=>({...q,f});
export function invalidarLeituras(){}
export async function getDocs(q){leituras++;const n=q.f.find(f=>f.limite)?.limite||10000;const apos=q.f.find(f=>f.apos)?.apos;
const inicio=apos?Number(apos):0;const docs=q.itens.slice(inicio,inicio+n).map((d,i)=>({id:String(inicio+i+1),data:()=>d}));documentos+=docs.length;return {docs,size:docs.length};}`);
const fonte = fs
  .readFileSync(new URL("../js/paginacao.js", import.meta.url), "utf8")
  .replaceAll("./operacoes-banco.js", stub);
const { criarPaginador } = await import(url(fonte)),
  sdk = await import(stub);
const itens = Array.from({ length: 450 }, (_, i) => ({
  nome: "Produto " + (i + 1),
}));
const p = criarPaginador();
let pagina = await p.iniciar({ itens });
assert.equal(pagina.itens.length, 30);
assert.equal(sdk.documentos, 31);
assert.equal(pagina.anterior, false);
assert.equal(pagina.proxima, true);
const vistos = pagina.itens.map((i) => i.id);
const antes = sdk.leituras;
await Promise.all([p.mover(1), p.mover(1)]);
assert.equal(sdk.leituras, antes + 1);
assert.equal(p.estado().pagina, 2);
vistos.push(...p.estado().itens.map((i) => i.id));
await p.mover(-1);
assert.equal(sdk.leituras, antes + 1);
await p.mover(1);
assert.equal(sdk.leituras, antes + 1);
while (p.estado().proxima) {
  pagina = await p.mover(1);
  vistos.push(...pagina.itens.map((i) => i.id));
}
assert.equal(vistos.length, 450);
assert.equal(new Set(vistos).size, 450);
assert.equal(p.estado().itens.at(-1).id, "450");
const filtro = criarPaginador();
pagina = await filtro.iniciar({ itens }, (i) => Number(i.id) % 17 === 0);
assert.equal(pagina.itens.length, 7);
assert.equal(pagina.proxima, true);
const achados = [...pagina.itens];
while (filtro.estado().proxima) achados.push(...(await filtro.mover(1)).itens);
assert.equal(achados.length, 26);
assert.equal(new Set(achados.map((i) => i.id)).size, 26);
const vazio = criarPaginador();
pagina = await vazio.iniciar({ itens: [] });
assert.equal(pagina.proxima, false);
pagina = await vazio.iniciar({ itens }, () => false);
assert.equal(pagina.itens.length, 0);
assert.equal(pagina.proxima, true);
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.doesNotMatch(
  html,
  /btnNotificacoes|iniciarNotificacoes|notificacoesPainel/,
);
assert.equal(
  fs.existsSync(new URL("../js/notificacoes.js", import.meta.url)),
  false,
);
console.log(
  "OK LEITURAS/PAGINAÇÃO: 100 solicitações iguais = 1 consulta; 450 produtos = 31 documentos na abertura; voltar = 0 consultas; todas as páginas sem perda/duplicação, buscas limitadas, cache por usuário, expiração, invalidação e notificações removidas.",
);
