import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import assert from "node:assert/strict";
import { fachadaFirebaseTeste } from './firebase-test-modulos.mjs';
const require = createRequire(
    path.resolve(process.env.VC_TEST_DEPENDENCIES || "package.json"),
  ),
  sdk = pathToFileURL(require.resolve("firebase/firestore")).href;
const { initializeTestEnvironment, assertFails, assertSucceeds } = await import(
  pathToFileURL(require.resolve("@firebase/rules-unit-testing")).href
);
const {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  setLogLevel,
} = await import(sdk);
setLogLevel("silent");
const env = await initializeTestEnvironment({
  projectId: "demo-futura-test",
  firestore: {
    host: "127.0.0.1",
    port: 8089,
    rules: fs.readFileSync(
      new URL("../firebase/firestore.rules", import.meta.url),
      "utf8",
    ),
  },
});
const url = (s) =>
  "data:text/javascript;base64," + Buffer.from(s).toString("base64");
const cfg = url(
  "export let db;export const auth={currentUser:null};export function usar(b,id){db=b;auth.currentUser={uid:id};}",
);
const ler = (p) =>
  fs.readFileSync(new URL("../js/" + p, import.meta.url), "utf8");
const fachada = fachadaFirebaseTeste(sdk,pathToFileURL(require.resolve('firebase/auth')).href,cfg);
const vcCore = url(ler("vendas-comissoes-core.js"));
const pdvCore = url(
  ler("pdv-core.js").replaceAll("./vendas-comissoes-core.js", vcCore),
);
const preparar = (s) =>
  s
    .replaceAll(
      "./firestore-operacoes.js",
      fachada,
    )
    .replaceAll("./firebase-config.js", cfg)
    .replaceAll("./vendas-comissoes-core.js", vcCore)
    .replaceAll("./pdv-core.js", pdvCore);
const prepararComLimite = (s) =>
  preparar(s).replaceAll(
    "./firebase-limites.js",
    url(ler("firebase-limites.js")),
  );
const pdvUrl = url(prepararComLimite(ler("pdv-db.js"))),
  vcUrl = url(
    preparar(ler("vendas-comissoes-db.js")).replaceAll("./pdv-db.js", pdvUrl),
  );
const pdv = await import(pdvUrl),
  vc = await import(vcUrl),
  config = await import(cfg),
  core = await import(pdvCore);
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const [id, roles] of [
      ["admin", ["admin"]],
      ["op1", ["operador_caixa"]],
      ["op2", ["operador_caixa"]],
      ["joao", ["vendedor"]],
      ["maria", ["vendedor"]],
    ])
      await setDoc(doc(db, "usuarios", id), { nome: id, roles });
    await setDoc(doc(db, "comissoes", "planilha"), {
      titulo: "Planilha protegida",
      criadoPor: "admin",
      senha: "hash-protegido",
    });
  });
  const admin = env.authenticatedContext("admin").firestore(),
    op1 = env.authenticatedContext("op1").firestore(),
    op2 = env.authenticatedContext("op2").firestore(),
    vend = env.authenticatedContext("joao").firestore(),
    anon = env.unauthenticatedContext().firestore();
  const usar = (db, id) => config.usar(db, id);
  usar(admin, "admin");
  await vc.salvarPercentual({ id: "joao", nome: "João" }, "5");
  await vc.salvarPercentual({ id: "maria", nome: "Maria" }, "7,5");
  await vc.salvarBase(true);
  console.log("Etapa: abertura");
  usar(op1, "op1");
  const sid = await assertSucceeds(
    pdv.abrirSessaoPdv({ numero: "CX-01", inicial: 20000, nome: "Operador 1" }),
  );
  assert.equal((await pdv.sessaoAtual()).id, sid);
  await env.withSecurityRulesDisabled(async (contexto) => {
    const db = contexto.firestore();
    await deleteDoc(doc(db, "pf_caixa_operadores", "op1"));
  });
  assert.equal(
    (await pdv.sessaoAtual()).id,
    sid,
    "sessão real continua sendo encontrada sem o controle antigo",
  );
  await env.withSecurityRulesDisabled(async (contexto) => {
    const db = contexto.firestore();
    await setDoc(doc(db, "pf_caixa_operadores", "op1"), { sessaoId: sid });
    const s = (await getDoc(doc(db, "pf_caixa_sessoes", sid))).data();
    await setDoc(doc(db, "pf_caixa_sessoes", "sessao-duplicada-teste"), s);
  });
  await assert.rejects(() => pdv.sessaoAtual(), /mais de um caixa/);
  await env.withSecurityRulesDisabled((contexto) =>
    deleteDoc(
      doc(contexto.firestore(), "pf_caixa_sessoes", "sessao-duplicada-teste"),
    ),
  );
  usar(op2, "op2");
  assert.equal(
    await pdv.sessaoAtual(),
    null,
    "não utiliza a sessão de outro operador",
  );
  await assert.rejects(() =>
    pdv.abrirSessaoPdv({ numero: "CX-01", inicial: 0, nome: "Operador 2" }),
  );
  const sid2 = await pdv.abrirSessaoPdv({
    numero: "CX-02",
    inicial: 0,
    nome: "Operador 2",
  });
  const venda = (extra = {}) => ({
    sessaoId: sid,
    numero: 1,
    total: 100,
    subtotal: 100,
    descontoItens: 0,
    descontoTotal: 0,
    acrescimo: 0,
    formaPagamento: "Dinheiro",
    vendedorId: "joao",
    vendedorNome: "João",
    operadorNome: "Operador 1",
    itens: [
      {
        produtoId: "p1",
        codigo: "SKU1",
        nome: "Caderno com nome completo muito longo para testar quebras de linha e preservação histórica",
        qtd: 2,
        unitario: 50,
        descontoValor: 0,
        total: 100,
      },
    ],
    ...extra,
  });
  console.log("Etapa: vendas");
  usar(op1, "op1");
  await assertSucceeds(
    pdv.salvarVendaPdv(
      venda({ recebidoCentavos: 12000, comissaoId: "planilha" }),
      "v1",
    ),
  );
  const recibo = (await pdv.buscarVenda("v1")).comprovante;
  assert.equal(recibo.trocoCentavos, 2000);
  assert.equal(recibo.itens[0].codigo, "SKU1");
  // Reenvio da mesma venda não repete a linha da planilha nem a comissão.
  await pdv.salvarVendaPdv(venda({ comissaoId: "planilha" }), "v1");
  await pdv.salvarVendaPdv(
    venda({
      total: 80,
      subtotal: 80,
      formaPagamento: "Misto",
      vendedorId: "maria",
      vendedorNome: "Maria",
      pagamentos: {
        dinheiro: 3000,
        pix: 5000,
        debito: 0,
        credito: 0,
        outros: 0,
        fiado: 0,
      },
    }),
    "mista",
  );
  await pdv.salvarVendaPdv(
    venda({
      total: 50,
      subtotal: 60,
      descontoTotal: 10,
      formaPagamento: "Pix",
      itens: [
        {
          nome: "Caneta",
          produtoId: "p2",
          codigo: "C2",
          qtd: 2,
          unitario: 30,
          total: 60,
          descontoValor: 0,
        },
      ],
    }),
    "pix",
  );
  await pdv.salvarVendaPdv(
    venda({ total: 40, subtotal: 40, formaPagamento: "Cartão de Débito" }),
    "debito",
  );
  await pdv.salvarVendaPdv(
    venda({ total: 30, subtotal: 30, formaPagamento: "Cartão de Crédito" }),
    "credito",
  );
  await assert.rejects(() =>
    pdv.salvarVendaPdv(
      venda({
        formaPagamento: "Misto",
        pagamentos: { dinheiro: 100, pix: 100 },
      }),
      "misto-invalido",
    ),
  );
  usar(op2, "op2");
  await pdv.salvarVendaPdv(
    venda({ sessaoId: sid2, total: 900, subtotal: 900 }),
    "outra-sessao",
  );
  await assertFails(getDoc(doc(op2, "pf_vendas", "v1")));
  await assertFails(getDoc(doc(op2, "pf_caixa_sessoes", sid)));
  console.log("Etapa: cancelamento");
  usar(admin, "admin");
  await vc.ajustarVenda("v1", {
    status: "cancelada",
    pago: true,
    estornoCentavos: 0,
    motivo: "Cancelamento de teste",
  });
  usar(op1, "op1");
  await pdv.registrarMovimento(
    {
      sessaoId: sid,
      tipo: "devolucao",
      valor: 10000,
      motivo: "Devolução ao cliente",
      vendaId: "v1",
    },
    "refund1",
  );
  await pdv.registrarMovimento(
    {
      sessaoId: sid,
      tipo: "devolucao",
      valor: 10000,
      motivo: "Reenvio idempotente",
      vendaId: "v1",
    },
    "refund1",
  );
  await assert.rejects(() =>
    pdv.registrarMovimento(
      {
        sessaoId: sid,
        tipo: "devolucao",
        valor: 1,
        motivo: "Excesso",
        vendaId: "v1",
      },
      "refund2",
    ),
  );
  await pdv.registrarMovimento(
    { sessaoId: sid, tipo: "suprimento", valor: 10000, motivo: "Reforço" },
    "suprimento",
  );
  await pdv.registrarMovimento(
    { sessaoId: sid, tipo: "sangria", valor: 5000, motivo: "Retirada" },
    "sangria",
  );
  let sessao = await pdv.conferirSessao(sid);
  assert.equal(sessao.resumo.dinheiro, 13000);
  assert.equal(sessao.resumo.pix, 10000);
  assert.equal(sessao.resumo.debito, 4000);
  assert.equal(sessao.resumo.credito, 3000);
  assert.equal(sessao.resumo.devolucoesDinheiro, 10000);
  assert.equal(sessao.resumo.comissaoValida, 1200);
  assert.equal(core.dinheiroEsperado(sessao), 28000);
  await assertFails(
    updateDoc(doc(op1, "pf_caixa_sessoes", sid), { "resumo.dinheiro": 999999 }),
  );
  const revisaoAntiga = sessao.revisao;
  await pdv.salvarVendaPdv(
    venda({ total: 10, subtotal: 10, formaPagamento: "Pix" }),
    "apos-previa",
  );
  await assert.rejects(() =>
    pdv.confirmarFechamento(sid, revisaoAntiga, 28000, "Operador 1"),
  );
  sessao = await pdv.conferirSessao(sid);
  const fechados = await Promise.all([
    pdv.confirmarFechamento(sid, sessao.revisao, 28010, "Operador 1"),
    pdv.confirmarFechamento(sid, sessao.revisao, 28010, "Operador 1"),
  ]);
  assert.deepEqual(fechados, [sid, sid]);
  const fechado = await pdv.buscarFechamento(sid);
  assert.equal(fechado.diferencaCentavos, 10);
  assert.equal(fechado.situacao, "Sobra");
  assert.equal(fechado.resumo.dinheiro, 13000);
  assert.equal(fechado.resumo.comissaoValida, 1250);
  assert.equal(await pdv.sessaoAtual(), null);
  await assert.rejects(() => pdv.salvarVendaPdv(venda(), "apos-fechamento"));
  await assertFails(
    updateDoc(doc(op1, "pf_caixa_fechamentos", sid), { contadoCentavos: 0 }),
  );
  await assertFails(deleteDoc(doc(admin, "pf_caixa_fechamentos", sid)));
  usar(admin, "admin");
  const antes = JSON.stringify(
    (await getDoc(doc(admin, "pf_caixa_fechamentos", sid))).data(),
  );
  await vc.ajustarVenda("pix", {
    status: "concluida",
    pago: true,
    estornoCentavos: 2000,
    motivo: "Estorno depois do fechamento",
  });
  assert.equal(
    JSON.stringify(
      (await getDoc(doc(admin, "pf_caixa_fechamentos", sid))).data(),
    ),
    antes,
  );
  assert.equal((await pdv.listarAjustes(sid)).itens.length, 1);
  assert.equal(
    (await getDocs(collection(admin, "comissoes", "planilha", "registros")))
      .size,
    1,
  );
  assert.equal(
    (
      await getDoc(doc(admin, "comissoes", "planilha", "registros", "v1"))
    ).data().valor,
    100,
  );
  for (const banco of [vend, anon]) {
    await assertFails(getDoc(doc(banco, "pf_caixa_fechamentos", sid)));
    await assertFails(getDocs(collection(banco, "pf_caixa_fechamentos")));
    await assertFails(
      updateDoc(doc(banco, "pf_caixa_sessoes", sid), { status: "fechado" }),
    );
  }
  usar(admin, "admin");
  await pdv.registrarMovimento(
    {
      sessaoId: sid2,
      tipo: "suprimento",
      valor: 5000,
      motivo: "Administrador suprindo gaveta de outro operador",
    },
    "admin-sup",
  );
  await pdv.registrarMovimento(
    {
      sessaoId: sid2,
      tipo: "sangria",
      valor: 5000,
      motivo: "Administrador retirando valor de outra gaveta",
    },
    "admin-sang",
  );
  usar(op2, "op2");
  sessao = await pdv.conferirSessao(sid2);
  await pdv.confirmarFechamento(sid2, sessao.revisao, 89900, "Operador 2");
  assert.equal((await pdv.buscarFechamento(sid2)).situacao, "Falta");
  usar(admin, "admin");
  const hist = await pdv.historicoFechamentos({
    inicio: new Date("2020-01-01"),
    fim: new Date("2099-01-01"),
  });
  assert.equal(hist.itens.length, 2);
  usar(admin, "admin");
  await pdv.registrarCorrecaoFechamento(
    sid,
    28000,
    "Correção administrativa de contagem",
    "correcao1",
  );
  await pdv.registrarCorrecaoFechamento(
    sid,
    28000,
    "Reenvio da mesma correção",
    "correcao1",
  );
  assert.equal((await pdv.listarAjustes(sid)).itens.length, 2);
  assert.equal((await pdv.buscarFechamento(sid)).contadoCentavos, 28010);
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), "pf_caixa_sessoes", "legado-aberto"), {
      status: "aberto",
      operadorAberturaUid: "admin",
      operadorAberturaNome: "Administrador",
      valorAbertura: 50,
      abertoEm: new Date("2026-10-14T12:00:00Z"),
    }),
  );
  assert.equal((await pdv.sessaoAtual()).legado, true);
  await pdv.encerrarSessaoLegada(
    "legado-aberto",
    5000,
    "Transição conferida do caixa anterior",
  );
  assert.equal(
    (await getDoc(doc(admin, "pf_caixa_sessoes", "legado-aberto"))).data()
      .conferenciaLegada.contadoCentavos,
    5000,
  );
  await assertFails(
    updateDoc(doc(op1, "pf_comissao_vendedores", "joao"), {
      percentualBps: 10000,
    }),
  );
  await assertFails(getDocs(collection(op1, "pf_comissoes_vendas")));
  console.log(
    "OK PDV/FIRESTORE: abertura exclusiva, sessão por operador, venda/planilha/comissão/caixa atômicos, dinheiro e troco, PIX, débito, crédito, misto, descontos, cancelamento, devolução limitada e idempotente, suprimento, sangria, vendedores, comissão sem desconto da gaveta, conferência obsoleta, fechamento concorrente único, sobra/falta, relatório imutável, ajuste pós-fechamento, histórico e permissões.",
  );
} finally {
  await env.cleanup();
}
