import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const code = readFileSync(
  new URL("../js/vendas-comissoes-core.js", import.meta.url),
  "utf8",
);
const m = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
const base = { excluirFrete: true },
  v = {
    total: 1000,
    totalCentavos: 100000,
    freteCentavos: 1000,
    estornoCentavos: 0,
    status: "concluida",
    pago: true,
    vendedorId: "joao",
  };
assert.equal(m.centavos("10,35"), 1035);
assert.equal(m.centavos(1.005), 101);
assert.equal(m.percentualBps("2,5"), 250);
assert.equal(m.percentualBps("100"), 10000);
assert.equal(m.percentualBps("0"), 0);
for (const n of ["-1", "100.01", "NaN", "5.555"])
  assert.throws(() => m.percentualBps(n));
assert.equal(m.calcularComissao(v, 500, base).valorCentavos, 4950);
assert.equal(
  m.calcularComissao(v, 500, { excluirFrete: false }).valorCentavos,
  5000,
);
assert.equal(
  m.calcularComissao({ ...v, totalCentavos: 1, freteCentavos: 0 }, 5000, base)
    .valorCentavos,
  1,
);
assert.equal(
  m.calcularComissao({ ...v, status: "cancelada" }, 500, base).valorCentavos,
  0,
);
assert.equal(
  m.calcularComissao({ ...v, pago: false }, 500, base).valorCentavos,
  0,
);
assert.equal(
  m.calcularComissao({ ...v, estornoCentavos: 40000 }, 500, base).valorCentavos,
  2950,
);
const r = { percentualBps: 500, excluirFrete: true, pagoCentavos: 0 };
assert.equal(m.validarPagamento(r, v, 2000).pendenteCentavos, 2950);
assert.equal(
  m.validarPagamento({ ...r, pagoCentavos: 2000 }, v, 2950).status,
  "paga",
);
assert.throws(() => m.validarPagamento({ ...r, pagoCentavos: 4950 }, v, 1));
assert.throws(() => m.validarPagamento(r, v, 4951));
assert.throws(() => m.validarPagamento(r, v, 0));
assert.throws(() => m.validarPagamento(r, { ...v, status: "cancelada" }, 1));
const estorno = m.calcularComissao(
  { ...v, status: "devolvida" },
  500,
  base,
  4950,
);
assert.equal(estorno.pagoCentavos, 4950);
assert.equal(estorno.recuperarCentavos, 4950);
assert.equal(estorno.pendenteCentavos, 0);
assert.equal(m.elegivel({ total: 10, formaPagamento: "Fiado" }), false);
assert.equal(m.elegivel({ total: 10, formaPagamento: "Dinheiro" }), true);
const antigo = {
    id: "a",
    total: 100,
    criadoEm: new Date(),
    vendedorId: "joao",
  },
  novo = { id: "b", total: 200, criadoEm: new Date(), vendedorId: "joao" },
  sem = { id: "c", total: 10 };
const rel = m.montarRelatorio(
  [antigo, novo, sem],
  new Map([
    ["a", { percentualBps: 500, excluirFrete: true, pagoCentavos: 0 }],
    ["b", { percentualBps: 1000, excluirFrete: true, pagoCentavos: 1000 }],
  ]),
  [
    { id: "joao", nome: "João" },
    { id: "maria", nome: "Maria" },
  ],
  new Map([["joao", { percentualBps: 1500 }]]),
);
assert.equal(rel.find((l) => l.id === "joao").comissao, 2500);
assert.equal(rel.find((l) => l.id === "joao").bps, 1500);
assert.equal(rel.find((l) => l.id === "maria").vendas, 0);
assert.equal(rel.find((l) => l.id === "__sem_vendedor__").vendas, 1);
const antes = m.intervalo("anterior", null, null, new Date(2026, 0, 10));
assert.equal(m.dataLocal(antes.inicio), "2025-12-01");
assert.equal(m.dataLocal(antes.fim), "2026-01-01");
const semana = m.intervalo("semana", null, null, new Date(2026, 10, 4));
assert.equal(m.dataLocal(semana.inicio), "2026-10-29");
assert.throws(() => m.intervalo("personalizado", "2026-11-05", "2026-11-04"));
console.log(
  "OK: centavos e arredondamento, percentuais, frete, estornos, elegibilidade, pagamento parcial, saldo, histórico e filtros.",
);
