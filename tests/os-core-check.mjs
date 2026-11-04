import assert from "node:assert/strict";
import fs from "node:fs";
const ler = (n) => fs.readFileSync(new URL("../" + n, import.meta.url), "utf8");
const m = await import(
  "data:text/javascript;base64," +
    Buffer.from(ler("js/os-core.js")).toString("base64")
);
const t = "2026-11-04T15:00:00-03:00",
  o = { status: "aguardando", previsaoConclusao: t };
assert.equal(
  m.prazoOs(o, Date.parse("2026-11-04T12:00:00-03:00")).texto,
  "Dentro do prazo",
);
assert.equal(
  m.prazoOs(o, Date.parse("2026-11-04T14:30:00-03:00")).texto,
  "Próximo do prazo",
);
assert.equal(
  m.prazoOs(o, Date.parse("2026-11-05T01:00:00-03:00")).texto,
  "Atrasado",
);
assert.ok(m.ativoOs(o));
assert.equal(
  m.prazoOs({
    ...o,
    status: "pronto",
    dataConclusao: "2026-11-04T14:59:00-03:00",
  }).texto,
  "Concluído no prazo",
);
assert.equal(
  m.prazoOs({
    ...o,
    status: "entregue",
    dataConclusao: "2026-11-04T15:01:00-03:00",
  }).texto,
  "Concluído com atraso",
);
assert.ok(!m.ativoOs({ ...o, status: "entregue" }));
assert.ok(!m.ativoOs({ ...o, status: "cancelado" }));
assert.equal(m.nomePainelOs("Maria Aparecida Oliveira"), "Maria O.");
assert.equal(m.numeroOs(125), "OS-000125");
assert.ok(m.transicaoOs("aguardando", "em_producao"));
assert.ok(m.transicaoOs("em_producao", "pronto"));
assert.ok(m.transicaoOs("pronto", "entregue"));
assert.ok(!m.transicaoOs("aguardando", "entregue"));
assert.ok(!m.transicaoOs("entregue", "pronto"));
const d = {
  clienteNome: "Cliente",
  servicoId: "s",
  responsavelId: "u",
  descricao: "Descrição",
  previsaoConclusao: t,
  previsaoEntrega: "2026-11-04T17:00:00-03:00",
  quantidade: 1,
};
assert.equal(m.validarDadosOs(d).prioridade, "normal");
assert.throws(() => m.validarDadosOs({ ...d, quantidade: 0 }));
assert.throws(() => m.validarDadosOs({ ...d, descricao: "" }));
assert.throws(() => m.validarDadosOs({ ...d, previsaoEntrega: "2026-11-03" }));
const lista = [
  {
    ...o,
    numero: "OS-000001",
    clienteNome: "João",
    servicoNome: "Impressão",
    responsavelNome: "Ana",
    responsavelId: "ana",
    servicoId: "s",
    prioridade: "alta",
    dataEntrada: t,
  },
];
assert.equal(
  m.filtrarOs(lista, {
    busca: "joao",
    status: "aguardando",
    responsavel: "ana",
    prioridade: "alta",
    entradaDe: "2026-11-04",
    entradaAte: "2026-11-04",
  }).length,
  1,
);
assert.equal(m.filtrarOs(lista, { busca: "outra" }).length, 0);
assert.equal(
  m.paginasOs(
    Array.from({ length: 21 }, (_, i) => i),
    8,
  ).length,
  3,
);
assert.deepEqual(m.paginasOs([], 8), [[]]);
const html = ler("index.html");
const menu = [
  ...html.slice(0, html.indexOf("</nav>")).matchAll(/data-page="([^"]+)"/g),
].map((m) => m[1]);
assert.deepEqual(menu.slice(0, 9), [
  "dashboard",
  "cotacoes",
  "cotacoes-fw3",
  "cotacoes-avenida",
  "nova-cotacao",
  "caixa",
  "os",
  "comissao",
  "entrega",
]);
const painel = ler("js/os-painel.js");
assert.ok(painel.includes("15000"));
assert.ok(painel.includes("requestFullscreen"));
assert.ok(!painel.includes("clienteTelefone"));
assert.ok(!painel.includes("observacoes"));
const rotas = JSON.parse(ler("vercel.json"));
assert.ok(
  rotas.rewrites.some(
    (r) => r.source === "/os/painel" && r.destination === "/os/painel.html",
  ),
);
const backup = await import(
  "data:text/javascript;base64," +
    Buffer.from(ler("js/backup.js")).toString("base64")
);
for (const c of Object.values(m.COL_OS))
  assert.ok(backup.COLECOES_BACKUP.includes(c));
console.log(
  "OK OS/CORE: status, atrasos e virada do dia, previsões, nomes abreviados, filtros combinados, paginação, menu oficial, rota, painel 15 segundos e backup.",
);
