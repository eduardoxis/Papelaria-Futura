import assert from "node:assert/strict";
import {
  calcularTotaisOrcamento,
  lerTotaisOrcamento,
} from "../js/orcamento-totais.js";

const itens = [
  { quantidade: 2, valorUnitario: 25.15, valorTotal: 50.3 },
  { quantidade: 1, valorUnitario: 49.7, valorTotal: 49.7 },
];
const real = calcularTotaisOrcamento(itens, { tipo: "real", valor: 12.34 });
assert.equal(real.subtotalCentavos, 10000);
assert.equal(real.descontoCentavos, 1234);
assert.equal(real.totalCentavos, 8766);
assert.equal(real.valorTotal, 87.66);
assert.equal(real.subtotal, 100);
assert.deepEqual(real.desconto, { tipo: "real", valor: 12.34 });
const percentual = calcularTotaisOrcamento(itens, {
  tipo: "percentual",
  valor: 12.5,
});
assert.equal(percentual.descontoCentavos, 1250);
assert.equal(percentual.totalCentavos, 8750);
assert.deepEqual(percentual.desconto, { tipo: "percentual", valor: 12.5 });
const total = calcularTotaisOrcamento(itens, {
  tipo: "percentual",
  valor: 100,
});
assert.equal(total.totalCentavos, 0);
assert.equal(total.descontoCentavos, 10000);
const arredondado = calcularTotaisOrcamento(
  [{ quantidade: 1, valorUnitario: 0.3, valorTotal: 0.3 }],
  { tipo: "percentual", valor: 5 },
);
assert.equal(
  arredondado.descontoCentavos,
  2,
  "Arredondamento monetário deve ocorrer em centavos",
);
assert.equal(arredondado.totalCentavos, 28);
for (const desconto of [
  undefined,
  { tipo: "real", valor: 0 },
  { tipo: "percentual", valor: 0 },
]) {
  const zero = calcularTotaisOrcamento(itens, desconto);
  assert.equal(zero.totalCentavos, 10000);
  assert.equal(zero.descontoCentavos, 0);
  assert.deepEqual(zero.desconto, { tipo: "real", valor: 0 });
}
for (const desconto of [
  { tipo: "real", valor: -1 },
  { tipo: "percentual", valor: -1 },
  { tipo: "real", valor: 100.01 },
  { tipo: "percentual", valor: 100.01 },
  { tipo: "real", valor: NaN },
  { tipo: "real", valor: Infinity },
])
  assert.throws(
    () => calcularTotaisOrcamento(itens, desconto),
    "Desconto inválido deve impedir gravação e PDF",
  );
assert.equal(lerTotaisOrcamento({ itens, valorTotal: 100 }).valorTotal, 100);
assert.equal(
  lerTotaisOrcamento({
    itens,
    valorTotal: 87.66,
    desconto: { tipo: "real", valor: 12.34 },
  }).totalCentavos,
  8766,
);
assert.equal(
  lerTotaisOrcamento({ itens, valorTotal: 99.99 }).valorTotal,
  99.99,
  "Sem desconto, orçamento legado preserva seu total salvo",
);
assert.equal(
  calcularTotaisOrcamento([], { tipo: "real", valor: 0 }).totalCentavos,
  0,
);
console.log(
  "OK ORÇAMENTO/DESCONTO: R$, percentual, centavos, 100%, zero, valores inválidos e compatibilidade com totais antigos.",
);
