import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const s = fs.readFileSync(new URL("../js/caixa.js", import.meta.url), "utf8");
const estado = s.slice(
  s.indexOf("let _sessaoCaixa ="),
  s.indexOf(
    "// ----------------------------------------------------------------",
    s.indexOf("let _sessaoCaixa ="),
  ),
);
const status = s.slice(
  s.indexOf("async function atualizarStatusCaixa("),
  s.indexOf(
    "\nfunction modalAberto()",
    s.indexOf("async function atualizarStatusCaixa("),
  ),
);
const finalizacao = s.slice(
  s.indexOf("async function iniciarFinalizacaoVenda()"),
  s.indexOf(
    "\nasync function finalizarVenda(",
    s.indexOf("async function iniciarFinalizacaoVenda()"),
  ),
);
const persistencia = s.slice(
  s.indexOf("async function finalizarVenda("),
  s.indexOf("\nasync function listarVendedoresPdv("),
);
function ambiente({
  sessao = null,
  erro = null,
  itens = [{ nome: "Serviço", qtd: 1, unitario: 10 }],
} = {}) {
  const campos = new Map(),
    avisos = [],
    modais = [];
  let atual = sessao,
    consultas = 0,
    aberturas = 0,
    vendedores = 0;
  const campo = (id) => {
    if (!campos.has(id))
      campos.set(id, {
        style: {},
        classList: { add() {}, remove() {} },
        value: "",
        textContent: "",
        disabled: false,
      });
    return campos.get(id);
  };
  campo("pdvNumeroCaixa").value = "CX-01";
  campo("mAbrirCaixaValor").value = "0";
  campo("selCaixaFormaPagto").value = "Convênio";
  campo("inputValorRecebido").value = "1";
  const ctx = {
    document: { getElementById: campo, querySelectorAll: () => [] },
    window: {
      mostrarToast: (...args) => avisos.push(args),
      abrirModal: (...args) => modais.push(args),
      fecharModal() {},
    },
    _usuario: { uid: "op1", email: "teste@local.invalid" },
    _dadosUsuario: { nome: "Operador" },
    _itens: itens,
    _vendedorSelecionadoId: null,
    _comissaoSelecionadaId: null,
    sessaoAtual: async () => {
      consultas++;
      if (erro) throw erro;
      return atual;
    },
    abrirSessaoPdv: async (d) => {
      aberturas++;
      atual = {
        id: "s1",
        caixaNumero: d.numero,
        status: "aberto",
        versaoPdv: 2,
        operadorAberturaNome: "Operador",
      };
      return "s1";
    },
    centavos: (n) => Math.round(Number(n) * 100),
    formatarDataHora: () => "",
    fecharPdv: async () => {},
    listarVendedoresPdv: async () => {
      vendedores++;
      return { sucesso: true, usuarios: [] };
    },
    listarComissoes: async () => ({ sucesso: true, comissoes: [] }),
    temCargo: () => true,
    console,
  };
  vm.createContext(ctx);
  vm.runInContext([estado,status,finalizacao,persistencia].join('\n'), ctx);
  return {
    ctx,
    campos,
    avisos,
    modais,
    contagens: () => ({ consultas, aberturas, vendedores }),
    trocarSessao: (v) => (atual = v),
    estado: () =>
      vm.runInContext("({sessao:_sessaoCaixa,estado:_estadoSessaoCaixa})", ctx),
  };
}
{
  const a = ambiente({
    erro: Object.assign(Error("negado"), { code: "permission-denied" }),
  });
  await a.ctx.iniciarFinalizacaoVenda();
  assert.equal(a.estado().estado, "erro");
  assert.ok(
    a.campos.get("caixaStatusTexto").textContent.includes("Não foi possível"),
  );
  assert.equal(a.modais.length, 0);
  assert.ok(a.avisos[0][0].includes("acesso"));
  assert.equal(a.ctx._itens.length, 1);
}
{
  const a = ambiente();
  await a.ctx.iniciarFinalizacaoVenda();
  assert.equal(a.modais[0][0], "Abrir Caixa");
  assert.ok(a.modais[0][1].includes("preservados"));
  assert.equal(a.contagens().aberturas, 0);
  await Promise.all([
    a.campos.get("btnConfirmarAbrirCaixa").onclick(),
    a.campos.get("btnConfirmarAbrirCaixa").onclick(),
  ]);
  assert.equal(a.contagens().aberturas, 1);
  assert.equal(a.contagens().vendedores, 1);
  assert.equal(a.estado().sessao.id, "s1");
  assert.equal(a.campos.get("selCaixaFormaPagto").value, "Convênio");
  assert.equal(a.campos.get("inputValorRecebido").value, "1");
  assert.equal(a.ctx._itens.length, 1);
}
{
  const a = ambiente({
    sessao: { id: "s1", status: "aberto", operadorAberturaNome: "Operador" },
  });
  await Promise.all([
    a.ctx.iniciarFinalizacaoVenda(),
    a.ctx.iniciarFinalizacaoVenda(),
  ]);
  assert.equal(a.contagens().vendedores, 1);
  assert.equal(a.modais.length, 0);
  assert.equal(a.estado().sessao.id, "s1");
  a.trocarSessao(null);
  await a.ctx.atualizarStatusCaixa(true);
  assert.equal(a.campos.get("caixaStatusTexto").textContent, "Fechado");
}
{
  const a = ambiente({ itens: [] });
  await a.ctx.iniciarFinalizacaoVenda();
  assert.equal(a.contagens().consultas, 0);
  assert.ok(a.avisos[0][0].includes("Adicione"));
  assert.equal(a.modais.length, 0);
}
{
  const a = ambiente({ sessao: { id: "s1", status: "aberto" } });
  vm.runInContext("_sessaoFinalizacaoId='s1'", a.ctx);
  a.trocarSessao({ id: "s2", status: "aberto" });
  await assert.rejects(
    () => a.ctx.finalizarVenda({ id: "vendedor" }),
    /fechado ou alterado/,
  );
  assert.equal(a.ctx._itens.length, 1);
  a.trocarSessao(null);
  await assert.rejects(
    () => a.ctx.finalizarVenda({ id: "vendedor" }),
    /fechado ou alterado/,
  );
}
console.log(
  "OK CAIXA/SESSÃO: falha de consulta não vira caixa fechado; abertura solicitada ao finalizar, retomada da venda, itens e pagamento preservados, sessão existente reconhecida e clique duplo protegido.",
);
