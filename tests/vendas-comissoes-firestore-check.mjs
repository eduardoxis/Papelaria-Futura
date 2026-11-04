import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(
  path.resolve(process.env.VC_TEST_DEPENDENCIES || "package.json"),
);
const { initializeTestEnvironment, assertFails, assertSucceeds } = await import(
  pathToFileURL(require.resolve("@firebase/rules-unit-testing")).href
);
const firestoreUrl = pathToFileURL(require.resolve("firebase/firestore")).href;
const {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  serverTimestamp,
  query,
  where,
} = await import(firestoreUrl);
import fs from "node:fs";
import assert from "node:assert/strict";

const { setLogLevel, writeBatch, deleteDoc } = await import(firestoreUrl);
setLogLevel("silent");
const rules = fs.readFileSync(
  new URL("../firebase/firestore.rules", import.meta.url),
  "utf8",
);
const env = await initializeTestEnvironment({
  projectId: "demo-futura-test",
  firestore: { host: "127.0.0.1", port: 8089, rules },
});
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "usuarios", "admin"), {
      roles: ["admin"],
      nome: "Administrador",
    });
    await setDoc(doc(db, "usuarios", "vendedor"), {
      roles: ["vendedor"],
      nome: "João",
    });
  });
  const admin = env.authenticatedContext("admin").firestore(),
    vendedor = env.authenticatedContext("vendedor").firestore(),
    anon = env.unauthenticatedContext().firestore();
  globalThis.__vcTestDb = admin;
  let source = fs.readFileSync(
    new URL("../js/vendas-comissoes-db.js", import.meta.url),
    "utf8",
  );
  const configUrl =
    "data:text/javascript;base64," +
    Buffer.from(
      "export const db=globalThis.__vcTestDb;export const auth={currentUser:{uid:'admin'}};",
    ).toString("base64");
  const dataUrl = (s) =>
    "data:text/javascript;base64," + Buffer.from(s).toString("base64");
  const coreUrl = new URL("../js/vendas-comissoes-core.js", import.meta.url)
    .href;
  const pdvCoreUrl = dataUrl(
    fs
      .readFileSync(new URL("../js/pdv-core.js", import.meta.url), "utf8")
      .replaceAll("./vendas-comissoes-core.js", coreUrl),
  );
  const pdvDbUrl = dataUrl(
    fs
      .readFileSync(new URL("../js/pdv-db.js", import.meta.url), "utf8")
      .replaceAll(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js",
        firestoreUrl,
      )
      .replaceAll("./firebase-config.js", configUrl)
      .replaceAll("./vendas-comissoes-core.js", coreUrl)
      .replaceAll("./pdv-core.js", pdvCoreUrl)
      .replaceAll(
        "./firebase-limites.js",
        new URL("../js/firebase-limites.js", import.meta.url).href,
      ),
  );
  source = source.replaceAll("./pdv-db.js", pdvDbUrl);
  source = source
    .replace(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js",
      firestoreUrl,
    )
    .replace("./firebase-config.js", configUrl)
    .replace(
      "./vendas-comissoes-core.js",
      new URL("../js/vendas-comissoes-core.js", import.meta.url).href,
    );
  const app = await import(
    "data:text/javascript;base64," + Buffer.from(source).toString("base64")
  );
  delete globalThis.__vcTestDb;
  await assertSucceeds(
    app.salvarPercentual({ id: "vendedor", nome: "João" }, "5"),
  );
  await assertSucceeds(app.salvarBase(true));
  const pdv = await import(pdvDbUrl);
  const sessaoId = await pdv.abrirSessaoPdv({
    numero: "CX-TESTE-COMISSAO",
    inicial: 0,
    nome: "Administrador",
  });
  const venda = {
    sessaoId,
    subtotal: 1000,
    descontoItens: 0,
    descontoTotal: 0,
    acrescimo: 0,
    total: 1000,
    vendedorId: "vendedor",
    vendedorNome: "João",
    operadorUid: "admin",
    formaPagamento: "Pix",
    criadoEm: serverTimestamp(),
    itens: [
      {
        produtoId: "teste",
        codigo: "T1",
        nome: "Produto",
        qtd: 1,
        unitario: 1000,
        total: 1000,
        descontoValor: 0,
      },
    ],
  };
  await assertSucceeds(app.salvarVendaComComissao(venda, "venda1"));
  let c = (await getDoc(doc(admin, "pf_comissoes_vendas", "venda1"))).data();
  assert.equal(c.valorCentavos, 5000);
  assert.equal(c.percentualBps, 500);
  await assertSucceeds(
    app.salvarPercentual({ id: "vendedor", nome: "João" }, "7,5"),
  );
  await app.salvarVendaComComissao(venda, "venda2");
  assert.equal(
    (await getDoc(doc(admin, "pf_comissoes_vendas", "venda1"))).data()
      .percentualBps,
    500,
  );
  assert.equal(
    (await getDoc(doc(admin, "pf_comissoes_vendas", "venda2"))).data()
      .valorCentavos,
    7500,
  );
  await app.salvarVendaComComissao(venda, "venda1");
  assert.equal(
    (await getDocs(collection(admin, "pf_comissoes_vendas"))).size,
    2,
  );
  for (const col of [
    "pf_comissao_vendedores",
    "pf_comissao_config",
    "pf_comissoes_vendas",
    "pf_comissao_pagamentos",
    "pf_comissao_auditoria",
  ]) {
    await assertFails(getDocs(collection(vendedor, col)));
    await assertFails(getDocs(collection(anon, col)));
    await assertFails(
      setDoc(doc(vendedor, col, "forjado"), { percentualBps: 10000 }),
    );
  }
  await assertFails(
    updateDoc(doc(admin, "pf_comissoes_vendas", "venda1"), {
      valorCentavos: 999999,
    }),
  );
  await assertFails(
    setDoc(doc(admin, "pf_comissao_vendedores", "vendedor"), {
      vendedorId: "vendedor",
      percentualBps: 10001,
      atualizadoPor: "admin",
      atualizadoEm: serverTimestamp(),
      auditoriaId: "inexistente",
    }),
  );
  await assertFails(setDoc(doc(admin, "pf_vendas", "sem-comissao"), venda));
  const pagar = (lote, valor) =>
    app.registrarPagamento({
      loteId: lote,
      vendedorId: "vendedor",
      itens: [{ id: "venda1", valor }],
      dataPagamento: "2026-11-04",
      forma: "PIX",
    });
  await assertSucceeds(pagar("parcial", 2000));
  await pagar("parcial", 2000);
  c = (await getDoc(doc(admin, "pf_comissoes_vendas", "venda1"))).data();
  assert.equal(c.pagoCentavos, 2000);
  assert.equal(c.pendenteCentavos, 3000);
  const concorrentes = await Promise.allSettled([
    pagar("concorrente-a", 2500),
    pagar("concorrente-b", 2500),
  ]);
  assert.equal(concorrentes.filter((r) => r.status === "fulfilled").length, 1);
  c = (await getDoc(doc(admin, "pf_comissoes_vendas", "venda1"))).data();
  assert.equal(c.pagoCentavos, 4500);
  assert.equal(c.pendenteCentavos, 500);
  await assert.rejects(() => pagar("excesso", 501));
  await pagar("final", 500);
  await assert.rejects(() => pagar("duplo", 1));
  await assertFails(
    updateDoc(doc(admin, "pf_comissao_pagamentos", "final_venda1"), {
      valorCentavos: 1,
    }),
  );
  await assertSucceeds(
    app.ajustarVenda("venda1", {
      status: "cancelada",
      pago: true,
      estornoCentavos: 0,
      motivo: "Teste de cancelamento",
    }),
  );
  c = (await getDoc(doc(admin, "pf_comissoes_vendas", "venda1"))).data();
  assert.equal(c.valorCentavos, 0);
  assert.equal(c.pagoCentavos, 5000);
  assert.equal(c.recuperarCentavos, 5000);
  await assertFails(
    updateDoc(doc(admin, "pf_vendas", "venda2"), { status: "cancelada" }),
  );
  await app.ajustarVenda("venda2", {
    status: "concluida",
    pago: true,
    estornoCentavos: 40000,
    motivo: "Devolução parcial",
  });
  c = (await getDoc(doc(admin, "pf_comissoes_vendas", "venda2"))).data();
  assert.equal(c.valorCentavos, 4500);
  await app.salvarVendaComComissao(
    { ...venda, formaPagamento: "Fiado" },
    "fiado",
  );
  c = (await getDoc(doc(admin, "pf_comissoes_vendas", "fiado"))).data();
  assert.equal(c.valorCentavos, 0);
  await app.ajustarVenda("fiado", {
    status: "concluida",
    pago: true,
    estornoCentavos: 0,
    motivo: "Recebimento confirmado",
  });
  c = (await getDoc(doc(admin, "pf_comissoes_vendas", "fiado"))).data();
  assert.equal(c.valorCentavos, 7500);
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), "pf_vendas", "antiga"), {
      ...venda,
      criadoEm: new Date("2026-10-14T12:00:00Z"),
    }),
  );
  assert.equal(
    await app.gerarRetroativa({
      id: "antiga",
      bps: 250,
      total: 100000,
      estorno: 0,
      excluirFrete: true,
    }),
    true,
  );
  assert.equal(
    await app.gerarRetroativa({
      id: "antiga",
      bps: 250,
      total: 100000,
      estorno: 0,
      excluirFrete: true,
    }),
    false,
  );
  c = (await getDoc(doc(admin, "pf_comissoes_vendas", "antiga"))).data();
  assert.equal(c.valorCentavos, 2500);
  await app.registrarPagamento({
    loteId: "lote3",
    vendedorId: "vendedor",
    itens: [
      { id: "venda2", valor: 100 },
      { id: "fiado", valor: 100 },
      { id: "antiga", valor: 100 },
    ],
    dataPagamento: "2026-11-04",
    forma: "Dinheiro",
  });
  await assertFails(
    updateDoc(doc(admin, "pf_comissoes_vendas", "antiga"), {
      percentualBps: 9999,
    }),
  );
  await assertFails(deleteDoc(doc(admin, "pf_comissoes_vendas", "antiga")));
  const fraud = writeBatch(admin);
  fraud.update(doc(admin, "pf_comissoes_vendas", "venda1"), {
    pagoCentavos: 6000,
    pendenteCentavos: 0,
    recuperarCentavos: 0,
    status: "paga",
    ultimoPagamentoId: "fraude",
    atualizadoPor: "admin",
    atualizadoEm: serverTimestamp(),
  });
  fraud.set(doc(admin, "pf_comissao_pagamentos", "fraude"), {
    vendaId: "venda1",
    vendedorId: "vendedor",
    valorCentavos: 1000,
    dataPagamento: "2026-11-04",
    forma: "PIX",
    registradoPor: "admin",
    criadoEm: serverTimestamp(),
  });
  await assertFails(fraud.commit());
  const historico = await app.consultarHistorico(
    "pf_comissao_pagamentos",
    "dataPagamento",
    "2026-11-01",
    "2026-12-01",
    null,
    "vendedor",
  );
  assert.ok(historico.itens.length > 0);
  const pendentes = await app.listarPendentes("vendedor");
  assert.ok(pendentes.itens.every((c) => c.pendenteCentavos > 0));
  console.log(
    "OK EMULADOR: regras compiladas; acesso admin/vendedor/anônimo; venda e comissão atômicas; percentuais históricos; pagamento parcial e concorrente; idempotência; bloqueios de excesso e adulteração; cancelamento pago; estorno; fiado; retroativa; lote de 3.",
  );
} finally {
  await env.cleanup();
}
