// Simula uma função sem as dependências nativas opcionais do leitor de PDF.
// Execute em processo novo para verificar também a inicialização dos módulos.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

let tentativasPdf = 0;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^(pdf-parse|pdfjs-dist|@napi-rs\/canvas)(\/|$)/.test(specifier)) {
      tentativasPdf++;
      throw new Error("Leitor de PDF indisponível nesta simulação");
    }
    return nextResolve(specifier, context);
  },
});
try {
  const { default: feriados } = await import("../api/feriados.js");
  const { default: escalas } = await import("../api/escalas.js");
  const resposta = () => ({
    setHeader() {},
    status(n) {
      this.codigo = n;
      return this;
    },
    json(v) {
      this.valor = v;
      return this;
    },
  });
  for (const [handler, req] of [
    [feriados, { method: "GET", url: "/api/feriados?ano=2026", headers: {} }],
    [
      escalas,
      {
        method: "POST",
        url: "/api/escalas",
        headers: {},
        body: { acao: "carregar" },
      },
    ],
  ]) {
    const res = resposta();
    await handler(req, res);
    assert.equal(res.codigo, 401);
    assert.equal(typeof res.valor.erro, "string");
  }
  const { calendarioInicial, consultarCalendario } =
    await import("../server/feriados-service.mjs");
  const inicial = await calendarioInicial(2026);
  assert.ok(inicial.eventos.some((e) => e.data === "2026-11-30"));
  const { fixtures } = await import("./escalas-fixture.mjs");
  const { db } = fixtures();
  const carregado = await consultarCalendario(db, {
    inicio: "2026-11-01",
    fim: "2026-11-30",
  });
  assert.ok(carregado.eventos.some((e) => e.nome === "Dia do Evangélico"));
  assert.equal(
    tentativasPdf,
    0,
    "Abrir APIs e calendário não deve carregar PDFs nem consultar portais",
  );
  const { lerDocumento } = await import("../server/feriados-fontes.mjs");
  await assert.rejects(
    () =>
      lerDocumento({ tipo: "application/pdf", bytes: Buffer.from("%PDF-1.7") }),
    /Leitor de PDF/,
  );
  assert.equal(
    tentativasPdf,
    1,
    "O leitor só deve carregar ao processar um PDF",
  );
  console.log(
    "OK INICIALIZAÇÃO: APIs respondem JSON e primeira carga funciona mesmo sem leitor PDF; parser isolado da consulta.",
  );
} finally {
  hooks.deregister();
}
