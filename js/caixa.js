// ============================================================
// caixa.js — Módulo Caixa (PDV) — Papelaria Futura
// Integra baixa de estoque (pf_produtos) e lançamento
// automático de comissão (comissoes/{id}/registros)
// ============================================================
import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, query, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";
import {
  formatarMoeda, listarComissoes, adicionarRegistroComissao, listarUsuarios
} from "./database.js";
import { escHtml } from "./index.js";

const COL_PRODUTOS = "pf_produtos";
const COL_HIST     = "pf_estoque_historico";
const COL_VENDAS   = "pf_vendas";

// Mapa forma de pagamento do Caixa → categoria usada na Comissão
const MAPA_CATEGORIA_COMISSAO = {
  "Dinheiro":            "Dinheiro",
  "Cartão de Débito":    "Débito",
  "Cartão de Crédito":   "Crédito",
  "Pix":                 "Pix celular",
  "Convênio":            "Convênio",
  "Fiado":               "Convênio"
};

let _usuario = null;
let _dadosUsuario = null;

let _itens = [];                 // { produtoId, nome, qtd, unitario, descontoValor, total }
let _descontoTotalTipo = "RS";   // "RS" | "PCT"
let _descontoTotalValor = 0;
let _acrescimoTipo = "RS";
let _acrescimoValor = 0;
let _cpfCnpj = "";
let _observacao = "";
let _contadorVenda = 1;

let _produtosCache = null;       // lista de produtos carregada do Firestore
let _produtosCacheEm = 0;

let _vendedorSelecionadoId = null;
let _comissaoSelecionadaId = null;

// ----------------------------------------------------------------
// Inicialização
// ----------------------------------------------------------------
export function iniciarCaixa(usuario, dadosUsuario) {
  _usuario = usuario;
  _dadosUsuario = dadosUsuario;

  const nome = dadosUsuario?.nome || usuario?.email?.split("@")[0] || "—";
  const elNome = document.getElementById("caixaOperadorNome");
  const elHora = document.getElementById("caixaHoraAbertura");
  if (elNome) elNome.textContent = nome;
  if (elHora) elHora.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  document.addEventListener("navegacao", (e) => {
    if (e.detail.page === "caixa") {
      document.getElementById("caixaTerminalInput")?.focus();
    }
  });

  const terminal = document.getElementById("caixaTerminalInput");
  terminal?.addEventListener("keydown", onTerminalKeydown);

  document.querySelectorAll(".caixa-atalho-card").forEach(el => {
    el.addEventListener("click", () => {
      executarAtalho(el.dataset.atalho, lerBufferNumero());
      limparBufferTerminal();
      terminal?.focus();
    });
  });

  document.getElementById("btnFinalizarVenda")?.addEventListener("click", () => executarAtalho("F", null));
  document.getElementById("btnLimparTudoCaixa")?.addEventListener("click", () => confirmarLimparTudo());

  document.getElementById("selCaixaFormaPagto")?.addEventListener("change", atualizarTroco);
  document.getElementById("inputValorRecebido")?.addEventListener("input", atualizarTroco);
  document.getElementById("inputCaixaCpfCnpj")?.addEventListener("input", (e) => _cpfCnpj = e.target.value);
  document.getElementById("inputCaixaObservacao")?.addEventListener("input", (e) => _observacao = e.target.value);

  document.getElementById("inputDescontoTotalValor")?.addEventListener("input", (e) => {
    _descontoTotalValor = parseFloat(e.target.value) || 0;
    renderResumo();
  });
  document.getElementById("inputAcrescimoValor")?.addEventListener("input", (e) => {
    _acrescimoValor = parseFloat(e.target.value) || 0;
    renderResumo();
  });

  document.getElementById("btnDescTotalTipoRS")?.addEventListener("click", () => setToggleTipo("desconto", "RS"));
  document.getElementById("btnDescTotalTipoPct")?.addEventListener("click", () => setToggleTipo("desconto", "PCT"));
  document.getElementById("btnAcresTipoRS")?.addEventListener("click", () => setToggleTipo("acrescimo", "RS"));
  document.getElementById("btnAcresTipoPct")?.addEventListener("click", () => setToggleTipo("acrescimo", "PCT"));

  document.getElementById("tbodyCaixaItens")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    if (btn.dataset.action === "remover") removerItem(idx);
    if (btn.dataset.action === "editar-preco") abrirModalEditarPreco(idx);
  });

  renderTudo();
}

// ----------------------------------------------------------------
// Terminal — captura de teclas
// ----------------------------------------------------------------
function modalAberto() {
  const backdrop = document.getElementById("modalBackdrop");
  return backdrop && backdrop.style.display === "flex";
}

function lerBufferNumero() {
  const raw = (document.getElementById("caixaTerminalInput")?.value || "").trim().replace(",", ".");
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

function limparBufferTerminal() {
  const el = document.getElementById("caixaTerminalInput");
  if (el) el.value = "";
}

function onTerminalKeydown(e) {
  if (modalAberto()) return; // não interferir com inputs de modal aberto

  if (e.key === "Enter") {
    e.preventDefault();
    executarAtalho("F", lerBufferNumero());
    limparBufferTerminal();
    return;
  }
  if (e.key === "Escape") {
    limparBufferTerminal();
    return;
  }
  // dígitos, ponto e vírgula seguem digitação normal no input
  if (/^[0-9.,]$/.test(e.key) || e.key === "Backspace" || e.key === "Delete" ||
      e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Tab") {
    return;
  }
  if (/^[a-zA-Z]$/.test(e.key)) {
    e.preventDefault();
    const letra = e.key.toUpperCase();
    const numero = lerBufferNumero();
    limparBufferTerminal();
    executarAtalho(letra, numero);
  } else {
    e.preventDefault();
  }
}

function executarAtalho(letra, numero) {
  switch (letra) {
    case "P": abrirModalBuscarProduto(numero && numero > 0 ? numero : 1); break;
    case "Q": abrirModalQuantidade(); break;
    case "E": abrirModalEditarQuantidade(numero); break;
    case "D": abrirModalDeletarItem(numero); break;
    case "I": abrirModalDescontoItem(numero); break;
    case "C": confirmarCancelarCompra(); break;
    case "T": document.getElementById("inputDescontoTotalValor")?.focus(); break;
    case "A": document.getElementById("inputAcrescimoValor")?.focus(); break;
    case "N": document.getElementById("inputCaixaCpfCnpj")?.focus(); break;
    case "O": document.getElementById("inputCaixaObservacao")?.focus(); break;
    case "H": abrirModalHistorico(); break;
    case "L": limparBufferTerminal(); break;
    case "F": iniciarFinalizacaoVenda(); break;
    default: break;
  }
}

function setToggleTipo(campo, tipo) {
  if (campo === "desconto") {
    _descontoTotalTipo = tipo;
    document.getElementById("btnDescTotalTipoRS")?.classList.toggle("caixa-toggle-btn--ativo", tipo === "RS");
    document.getElementById("btnDescTotalTipoPct")?.classList.toggle("caixa-toggle-btn--ativo", tipo === "PCT");
  } else {
    _acrescimoTipo = tipo;
    document.getElementById("btnAcresTipoRS")?.classList.toggle("caixa-toggle-btn--ativo", tipo === "RS");
    document.getElementById("btnAcresTipoPct")?.classList.toggle("caixa-toggle-btn--ativo", tipo === "PCT");
  }
  renderResumo();
}

// ----------------------------------------------------------------
// Produtos — cache + busca
// ----------------------------------------------------------------
async function carregarProdutosCache(forcar = false) {
  const agora = Date.now();
  if (!forcar && _produtosCache && (agora - _produtosCacheEm) < 60000) return _produtosCache;
  try {
    const snap = await getDocs(collection(db, COL_PRODUTOS));
    _produtosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _produtosCacheEm = agora;
  } catch (err) {
    console.error("Erro ao carregar produtos:", err);
    window.mostrarToast?.("Erro ao carregar produtos do estoque.", "error");
    _produtosCache = _produtosCache || [];
  }
  return _produtosCache;
}

function buscarProdutosLocal(termo) {
  const t = (termo || "").trim().toLowerCase();
  const lista = _produtosCache || [];
  if (!t) return lista.slice(0, 30);
  return lista.filter(p =>
    (p.nome || "").toLowerCase().includes(t) ||
    (p.codigo || "").toLowerCase() === t ||
    (p.codigoBarras || "").toLowerCase() === t ||
    (p.codigo || "").toLowerCase().includes(t)
  ).slice(0, 30);
}

// ----------------------------------------------------------------
// Modal: buscar/adicionar produto (P)
// ----------------------------------------------------------------
async function abrirModalBuscarProduto(qtdInicial) {
  await carregarProdutosCache();

  const body = `
    <div class="field-label">Buscar por nome, código ou código de barras</div>
    <input type="text" class="field-input--plain" id="mCaixaBuscaProd" placeholder="Digite para buscar..." autocomplete="off" />
    <div class="caixa-lista-itens-modal" id="mCaixaListaProd" style="margin-top:12px"></div>
  `;
  window.abrirModal("Buscar Produto", body, `<button class="btn-ghost" id="btnFecharBuscaProd">Fechar</button>`);
  document.getElementById("btnFecharBuscaProd").onclick = () => window.fecharModal();

  const renderLista = (termo) => {
    const resultados = buscarProdutosLocal(termo);
    const cont = document.getElementById("mCaixaListaProd");
    if (!cont) return;
    if (resultados.length === 0) {
      cont.innerHTML = `<p class="empty-cell" style="padding:12px 0">Nenhum produto encontrado.</p>`;
      return;
    }
    cont.innerHTML = resultados.map(p => `
      <div class="caixa-lista-item-linha">
        <div>
          <strong>${escHtml(p.nome || "—")}</strong><br/>
          <small>${escHtml(p.codigo || "s/ código")}${p.estoque != null ? ` · Estoque: ${p.estoque}` : ""}</small>
        </div>
        <div class="caixa-preco-add-wrap">
          <span class="caixa-preco-add-prefixo">R$</span>
          <input type="number" min="0.01" step="0.01" class="field-input--plain caixa-preco-add-input"
                 data-preco-id="${escHtml(p.id)}" placeholder="0,00" autocomplete="off" />
          <button type="button" class="btn-primary" data-id="${escHtml(p.id)}">Adicionar</button>
        </div>
      </div>
    `).join("");
    cont.querySelectorAll("[data-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const produto = resultados.find(p => p.id === btn.dataset.id);
        const inputPreco = cont.querySelector(`[data-preco-id="${btn.dataset.id}"]`);
        const precoCustom = parseFloat(inputPreco?.value);
        if (isNaN(precoCustom) || precoCustom <= 0) {
          window.mostrarToast?.("Informe o valor cobrado neste item.", "error");
          inputPreco?.focus();
          return;
        }
        if (produto) {
          adicionarItem(produto, qtdInicial || 1, precoCustom);
          window.fecharModal();
        }
      });
    });
    // Enter no campo de preço já adiciona o item (fluxo rápido no balcão)
    cont.querySelectorAll(".caixa-preco-add-input").forEach(inp => {
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          cont.querySelector(`[data-id="${inp.dataset.precoId}"]`)?.click();
        }
      });
    });
    // Foco automático no primeiro campo de preço quando há um único resultado
    if (resultados.length === 1) cont.querySelector(".caixa-preco-add-input")?.focus();
  };

  renderLista("");
  const inputBusca = document.getElementById("mCaixaBuscaProd");
  inputBusca?.addEventListener("input", () => renderLista(inputBusca.value));
  inputBusca?.focus();
}

function adicionarItem(produto, qtd, precoCustom) {
  qtd = Number(qtd) || 1;
  const unitario = (precoCustom != null && !isNaN(precoCustom) && precoCustom >= 0)
    ? precoCustom
    : (Number(produto.preco) || 0);
  if (produto.estoque != null && produto.estoque <= 0) {
    window.mostrarToast?.(`"${produto.nome}" está sem estoque.`, "warning");
  }
  const existente = _itens.find(i => i.produtoId === produto.id && i.unitario === unitario);
  if (existente) {
    existente.qtd += qtd;
    existente.total = calcularTotalItem(existente);
  } else {
    _itens.push({
      produtoId: produto.id,
      nome: produto.nome || "—",
      precoOriginal: Number(produto.preco) || 0,
      unitario,
      qtd,
      descontoValor: 0,
      total: unitario * qtd
    });
  }
  renderTudo();
  window.mostrarToast?.(`${produto.nome} adicionado (${qtd}x).`, "success", 2000);
}

function calcularTotalItem(item) {
  const bruto = item.unitario * item.qtd;
  return Math.max(0, bruto - (item.descontoValor || 0));
}

function removerItem(idx) {
  if (idx < 0 || idx >= _itens.length) return;
  const removido = _itens.splice(idx, 1)[0];
  renderTudo();
  window.mostrarToast?.(`${removido?.nome || "Item"} removido.`, "warning", 2000);
}

// ----------------------------------------------------------------
// Modal: quantidade (Q) — define qtd. do último item adicionado
// ----------------------------------------------------------------
function abrirModalQuantidade() {
  if (_itens.length === 0) {
    window.mostrarToast?.("Adicione um produto antes de definir a quantidade.", "warning");
    return;
  }
  const ultimo = _itens[_itens.length - 1];
  const body = `
    <div class="field-label">Quantidade para "${escHtml(ultimo.nome)}"</div>
    <input type="number" min="0.01" step="0.01" class="field-input--plain" id="mCaixaQtd" value="${ultimo.qtd}" autocomplete="off" />
  `;
  window.abrirModal("Definir Quantidade", body, `
    <button class="btn-ghost" id="btnCancQtd">Cancelar</button>
    <button class="btn-primary" id="btnOkQtd">Confirmar</button>
  `);
  document.getElementById("btnCancQtd").onclick = () => window.fecharModal();
  document.getElementById("btnOkQtd").onclick = () => {
    const v = parseFloat(document.getElementById("mCaixaQtd").value);
    if (!v || v <= 0) { window.mostrarToast?.("Quantidade inválida.", "error"); return; }
    ultimo.qtd = v;
    ultimo.total = calcularTotalItem(ultimo);
    renderTudo();
    window.fecharModal();
  };
  document.getElementById("mCaixaQtd")?.focus();
}

// ----------------------------------------------------------------
// Modal: editar quantidade de item específico (E)
// ----------------------------------------------------------------
function abrirModalEditarQuantidade(numeroItem) {
  if (_itens.length === 0) {
    window.mostrarToast?.("Não há itens na venda.", "warning");
    return;
  }
  if (numeroItem && _itens[numeroItem - 1]) {
    abrirEdicaoQtdItem(numeroItem - 1);
    return;
  }
  const body = `<div class="caixa-lista-itens-modal">${_itens.map((it, idx) => `
    <div class="caixa-lista-item-linha">
      <div><strong>#${idx + 1} ${escHtml(it.nome)}</strong><br/><small>Qtd. atual: ${it.qtd}</small></div>
      <button type="button" class="btn-secondary" data-idx="${idx}">Editar</button>
    </div>`).join("")}</div>`;
  window.abrirModal("Editar Quantidade — Selecione o item", body, `<button class="btn-ghost" id="btnFecharEditQtd">Fechar</button>`);
  document.getElementById("btnFecharEditQtd").onclick = () => window.fecharModal();
  document.querySelectorAll("#modalBody [data-idx]").forEach(btn => {
    btn.addEventListener("click", () => abrirEdicaoQtdItem(Number(btn.dataset.idx)));
  });
}

function abrirEdicaoQtdItem(idx) {
  const item = _itens[idx];
  if (!item) return;
  const body = `
    <div class="field-label">Nova quantidade para "${escHtml(item.nome)}"</div>
    <input type="number" min="0.01" step="0.01" class="field-input--plain" id="mCaixaQtdEdit" value="${item.qtd}" autocomplete="off" />
  `;
  window.abrirModal("Editar Quantidade", body, `
    <button class="btn-ghost" id="btnCancQtdEdit">Cancelar</button>
    <button class="btn-primary" id="btnOkQtdEdit">Salvar</button>
  `);
  document.getElementById("btnCancQtdEdit").onclick = () => window.fecharModal();
  document.getElementById("btnOkQtdEdit").onclick = () => {
    const v = parseFloat(document.getElementById("mCaixaQtdEdit").value);
    if (!v || v <= 0) { window.mostrarToast?.("Quantidade inválida.", "error"); return; }
    item.qtd = v;
    item.total = calcularTotalItem(item);
    renderTudo();
    window.fecharModal();
  };
}

// ----------------------------------------------------------------
// Editar valor unitário de um item já adicionado (preço variável —
// ex: bolo, presente personalizado, produto sem preço fixo)
// ----------------------------------------------------------------
function abrirModalEditarPreco(idx) {
  const item = _itens[idx];
  if (!item) return;
  const precoOriginalInfo = (item.precoOriginal != null && item.precoOriginal !== item.unitario)
    ? `<small style="color:var(--gray-500)">Preço cadastrado: ${formatarMoeda(item.precoOriginal)}</small>`
    : "";
  const body = `
    <div class="field-label">Valor unitário para "${escHtml(item.nome)}"</div>
    <div class="caixa-toggle-input" style="max-width:220px">
      <span class="caixa-preco-add-prefixo" style="padding:0 10px;display:flex;align-items:center;background:var(--gray-100);font-size:var(--text-xs);font-weight:700;color:var(--gray-500)">R$</span>
      <input type="number" min="0" step="0.01" class="field-input--plain" id="mCaixaPrecoEdit" value="${item.unitario.toFixed(2)}" autocomplete="off" />
    </div>
    <div style="margin-top:6px">${precoOriginalInfo}</div>
  `;
  window.abrirModal("Editar Valor Unitário", body, `
    <button class="btn-ghost" id="btnCancPrecoEdit">Cancelar</button>
    <button class="btn-primary" id="btnOkPrecoEdit">Salvar</button>
  `);
  document.getElementById("btnCancPrecoEdit").onclick = () => window.fecharModal();
  document.getElementById("btnOkPrecoEdit").onclick = () => {
    const v = parseFloat(document.getElementById("mCaixaPrecoEdit").value);
    if (isNaN(v) || v < 0) { window.mostrarToast?.("Valor inválido.", "error"); return; }
    item.unitario = v;
    item.total = calcularTotalItem(item);
    renderTudo();
    window.fecharModal();
  };
  document.getElementById("mCaixaPrecoEdit")?.focus();
  document.getElementById("mCaixaPrecoEdit")?.select();
}


function abrirModalDeletarItem(numeroItem) {
  if (_itens.length === 0) {
    window.mostrarToast?.("Não há itens na venda.", "warning");
    return;
  }
  if (numeroItem && _itens[numeroItem - 1]) {
    removerItem(numeroItem - 1);
    return;
  }
  const body = `<div class="caixa-lista-itens-modal">${_itens.map((it, idx) => `
    <div class="caixa-lista-item-linha">
      <div><strong>#${idx + 1} ${escHtml(it.nome)}</strong><br/><small>Qtd: ${it.qtd} · ${formatarMoeda(it.total)}</small></div>
      <button type="button" class="btn-ghost" style="color:#DC2626" data-idx="${idx}">Excluir</button>
    </div>`).join("")}</div>`;
  window.abrirModal("Deletar Item — Selecione", body, `<button class="btn-ghost" id="btnFecharDelItem">Fechar</button>`);
  document.getElementById("btnFecharDelItem").onclick = () => window.fecharModal();
  document.querySelectorAll("#modalBody [data-idx]").forEach(btn => {
    btn.addEventListener("click", () => {
      removerItem(Number(btn.dataset.idx));
      window.fecharModal();
    });
  });
}

// ----------------------------------------------------------------
// Modal: desconto por item (I)
// ----------------------------------------------------------------
function abrirModalDescontoItem(numeroItem) {
  if (_itens.length === 0) {
    window.mostrarToast?.("Não há itens na venda.", "warning");
    return;
  }
  if (numeroItem && _itens[numeroItem - 1]) {
    abrirEdicaoDescontoItem(numeroItem - 1);
    return;
  }
  const body = `<div class="caixa-lista-itens-modal">${_itens.map((it, idx) => `
    <div class="caixa-lista-item-linha">
      <div><strong>#${idx + 1} ${escHtml(it.nome)}</strong><br/><small>Desconto atual: ${formatarMoeda(it.descontoValor || 0)}</small></div>
      <button type="button" class="btn-secondary" data-idx="${idx}">Dar Desconto</button>
    </div>`).join("")}</div>`;
  window.abrirModal("Desconto no Item — Selecione", body, `<button class="btn-ghost" id="btnFecharDescItem">Fechar</button>`);
  document.getElementById("btnFecharDescItem").onclick = () => window.fecharModal();
  document.querySelectorAll("#modalBody [data-idx]").forEach(btn => {
    btn.addEventListener("click", () => abrirEdicaoDescontoItem(Number(btn.dataset.idx)));
  });
}

function abrirEdicaoDescontoItem(idx) {
  const item = _itens[idx];
  if (!item) return;
  const body = `
    <div class="field-label">Desconto em R$ para "${escHtml(item.nome)}"</div>
    <input type="number" min="0" step="0.01" class="field-input--plain" id="mCaixaDescItem" value="${item.descontoValor || 0}" autocomplete="off" />
  `;
  window.abrirModal("Desconto no Item", body, `
    <button class="btn-ghost" id="btnCancDescItem">Cancelar</button>
    <button class="btn-primary" id="btnOkDescItem">Salvar</button>
  `);
  document.getElementById("btnCancDescItem").onclick = () => window.fecharModal();
  document.getElementById("btnOkDescItem").onclick = () => {
    const v = parseFloat(document.getElementById("mCaixaDescItem").value) || 0;
    item.descontoValor = Math.max(0, v);
    item.total = calcularTotalItem(item);
    renderTudo();
    window.fecharModal();
  };
}

// ----------------------------------------------------------------
// Cancelar compra (C) / Limpar tudo
// ----------------------------------------------------------------
function confirmarCancelarCompra() {
  if (_itens.length === 0) return;
  const body = `<p>Tem certeza que deseja cancelar a venda atual? Todos os itens e valores serão perdidos.</p>`;
  window.abrirModal("Cancelar Compra", body, `
    <button class="btn-ghost" id="btnNaoCancComp">Voltar</button>
    <button class="btn-primary" style="background:#DC2626;border-color:#DC2626" id="btnSimCancComp">Sim, Cancelar</button>
  `);
  document.getElementById("btnNaoCancComp").onclick = () => window.fecharModal();
  document.getElementById("btnSimCancComp").onclick = () => {
    resetarTerminal();
    window.fecharModal();
    window.mostrarToast?.("Venda cancelada.", "warning");
  };
}

function confirmarLimparTudo() { confirmarCancelarCompra(); }

// ----------------------------------------------------------------
// Histórico (H) — últimas vendas
// ----------------------------------------------------------------
async function abrirModalHistorico() {
  window.abrirModal("Histórico de Vendas", `<p class="empty-cell">Carregando...</p>`, `<button class="btn-ghost" id="btnFecharHist">Fechar</button>`);
  document.getElementById("btnFecharHist").onclick = () => window.fecharModal();

  try {
    const snap = await getDocs(query(collection(db, COL_VENDAS), orderBy("criadoEm", "desc"), limit(20)));
    const vendas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (vendas.length === 0) {
      document.getElementById("modalBody").innerHTML = `<p class="empty-cell">Nenhuma venda registrada ainda.</p>`;
      return;
    }
    document.getElementById("modalBody").innerHTML = `<div class="caixa-lista-itens-modal">${vendas.map(v => `
      <div class="caixa-lista-item-linha">
        <div>
          <strong>Venda #${v.numero ?? "—"}</strong> · ${escHtml(v.formaPagamento || "—")}<br/>
          <small>${escHtml(v.vendedorNome || "—")} · ${v.itens?.length || 0} itens</small>
        </div>
        <strong>${formatarMoeda(v.total)}</strong>
      </div>`).join("")}</div>`;
  } catch (err) {
    console.error(err);
    document.getElementById("modalBody").innerHTML = `<p class="empty-cell">Erro ao carregar histórico.</p>`;
  }
}

// ----------------------------------------------------------------
// Cálculo e render
// ----------------------------------------------------------------
function calcularTotais() {
  const subtotalBruto = _itens.reduce((s, i) => s + (i.unitario * i.qtd), 0);
  const descontoItens = _itens.reduce((s, i) => s + (i.descontoValor || 0), 0);
  const subtotalComDescItens = Math.max(0, subtotalBruto - descontoItens);

  const descontoTotal = _descontoTotalTipo === "PCT"
    ? subtotalComDescItens * (_descontoTotalValor / 100)
    : _descontoTotalValor;

  const acrescimo = _acrescimoTipo === "PCT"
    ? subtotalComDescItens * (_acrescimoValor / 100)
    : _acrescimoValor;

  const total = Math.max(0, subtotalComDescItens - descontoTotal + acrescimo);

  return { subtotalBruto, descontoItens, descontoTotal, acrescimo, total };
}

function renderTudo() {
  renderItens();
  renderResumo();
  atualizarTroco();
}

function renderItens() {
  const tbody = document.getElementById("tbodyCaixaItens");
  if (!tbody) return;
  if (_itens.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">Nenhum item na venda. Use o terminal para adicionar produtos.</td></tr>`;
    return;
  }
  tbody.innerHTML = _itens.map((it, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${escHtml(it.nome)}</td>
      <td>${it.qtd}</td>
      <td>
        <button type="button" class="caixa-preco-editar" data-action="editar-preco" data-idx="${idx}" title="Clique para editar o valor unitário">
          ${formatarMoeda(it.unitario)}
        </button>
      </td>
      <td>${it.descontoValor ? formatarMoeda(it.descontoValor) : "—"}</td>
      <td class="col-right"><strong>${formatarMoeda(it.total)}</strong></td>
      <td class="col-center">
        <button type="button" class="caixa-item-remover" data-action="remover" data-idx="${idx}" title="Remover item">
          <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
        </button>
      </td>
    </tr>
  `).join("");
}

function renderResumo() {
  const { subtotalBruto, descontoItens, descontoTotal, acrescimo, total } = calcularTotais();
  document.getElementById("caixaSubtotal").textContent      = formatarMoeda(subtotalBruto);
  document.getElementById("caixaDescontoItens").textContent = formatarMoeda(descontoItens);
  document.getElementById("caixaDescontoTotal").textContent = formatarMoeda(descontoTotal);
  document.getElementById("caixaAcrescimo").textContent     = formatarMoeda(acrescimo);
  document.getElementById("caixaTotal").textContent         = formatarMoeda(total);
  atualizarTroco();
}

function atualizarTroco() {
  const { total } = calcularTotais();
  const recebidoRaw = (document.getElementById("inputValorRecebido")?.value || "").replace(",", ".");
  const recebido = parseFloat(recebidoRaw) || 0;
  const troco = Math.max(0, recebido - total);
  const elTroco = document.getElementById("caixaTroco");
  if (elTroco) elTroco.textContent = formatarMoeda(troco);
}

function resetarTerminal() {
  _itens = [];
  _descontoTotalTipo = "RS"; _descontoTotalValor = 0;
  _acrescimoTipo = "RS"; _acrescimoValor = 0;
  _cpfCnpj = ""; _observacao = "";
  const inputDesc = document.getElementById("inputDescontoTotalValor"); if (inputDesc) inputDesc.value = 0;
  const inputAcr  = document.getElementById("inputAcrescimoValor");     if (inputAcr)  inputAcr.value  = 0;
  const inputCpf  = document.getElementById("inputCaixaCpfCnpj");       if (inputCpf)  inputCpf.value  = "";
  const inputObs  = document.getElementById("inputCaixaObservacao");    if (inputObs)  inputObs.value  = "";
  const inputRec  = document.getElementById("inputValorRecebido");      if (inputRec)  inputRec.value  = "";
  setToggleTipo("desconto", "RS");
  setToggleTipo("acrescimo", "RS");
  limparBufferTerminal();
  renderTudo();
}

// ----------------------------------------------------------------
// Finalizar venda → modal Selecionar Vendedor (+ planilha comissão)
// ----------------------------------------------------------------
async function iniciarFinalizacaoVenda() {
  if (_itens.length === 0) {
    window.mostrarToast?.("Adicione ao menos um item para finalizar a venda.", "warning");
    return;
  }

  _vendedorSelecionadoId = null;
  _comissaoSelecionadaId = null;

  const [resUsuarios, resComissoes] = await Promise.all([listarUsuarios(), listarComissoes()]);
  const vendedores = resUsuarios.sucesso ? resUsuarios.usuarios : [];
  const planilhas   = resComissoes.sucesso ? resComissoes.comissoes : [];

  if (vendedores.length === 0) {
    window.mostrarToast?.("Nenhum vendedor cadastrado. Cadastre um usuário em Administração.", "error");
    return;
  }

  const listaVendedoresHTML = vendedores.map(v => `
    <button type="button" class="caixa-vendedor-opcao" data-uid="${escHtml(v.id)}">
      <span class="caixa-vendedor-avatar">${escHtml((v.nome || "?").charAt(0).toUpperCase())}</span>
      <span>
        <div class="caixa-vendedor-nome">${escHtml(v.nome || v.email || "—")}</div>
        <div class="caixa-vendedor-role">${v.role === "admin" ? "Administrador" : "Usuário"}</div>
      </span>
    </button>
  `).join("");

  const optsPlanilha = planilhas.length
    ? planilhas.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.titulo)}</option>`).join("")
    : `<option value="">Nenhuma planilha cadastrada</option>`;

  const body = `
    <div class="field-label">Vendedor responsável pela venda</div>
    <div class="caixa-vendedor-lista" id="mCaixaListaVendedores">${listaVendedoresHTML}</div>

    <div style="margin-top:16px">
      <label class="field-label">Lançar comissão na planilha</label>
      <select class="field-input--plain" id="mCaixaSelectComissao" ${planilhas.length ? "" : "disabled"} autocomplete="off">
        ${optsPlanilha}
      </select>
      ${planilhas.length === 0 ? '<small style="color:var(--gray-500)">A venda será finalizada normalmente, mas nenhum registro de comissão será criado.</small>' : ""}
    </div>
  `;

  window.abrirModal("Selecionar Vendedor", body, `
    <button class="btn-ghost" id="btnCancelarVendedor">Cancelar</button>
    <button class="btn-primary" id="btnConfirmarVendedor" disabled>Confirmar</button>
  `);

  if (planilhas.length) _comissaoSelecionadaId = planilhas[0].id;
  document.getElementById("mCaixaSelectComissao")?.addEventListener("change", (e) => {
    _comissaoSelecionadaId = e.target.value || null;
  });

  document.getElementById("btnCancelarVendedor").onclick = () => window.fecharModal();

  const btnConfirmar = document.getElementById("btnConfirmarVendedor");
  document.querySelectorAll("#mCaixaListaVendedores .caixa-vendedor-opcao").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#mCaixaListaVendedores .caixa-vendedor-opcao").forEach(b => b.classList.remove("caixa-vendedor-opcao--ativo"));
      btn.classList.add("caixa-vendedor-opcao--ativo");
      _vendedorSelecionadoId = btn.dataset.uid;
      btnConfirmar.disabled = false;
    });
  });

  btnConfirmar.onclick = async () => {
    const vendedor = vendedores.find(v => v.id === _vendedorSelecionadoId);
    if (!vendedor) return;
    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Finalizando...";
    try {
      await finalizarVenda(vendedor);
      window.fecharModal();
    } catch (err) {
      console.error(err);
      window.mostrarToast?.("Erro ao finalizar a venda. Tente novamente.", "error");
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = "Confirmar";
    }
  };
}

// ----------------------------------------------------------------
// Persistência: venda + baixa de estoque + registro de comissão
// ----------------------------------------------------------------
async function finalizarVenda(vendedor) {
  const { subtotalBruto, descontoItens, descontoTotal, acrescimo, total } = calcularTotais();
  const formaPagamento = document.getElementById("selCaixaFormaPagto")?.value || "Dinheiro";
  const recebidoRaw = (document.getElementById("inputValorRecebido")?.value || "").replace(",", ".");
  const valorRecebido = parseFloat(recebidoRaw) || 0;
  const troco = Math.max(0, valorRecebido - total);
  const numeroVenda = _contadorVenda++;

  const vendaDoc = {
    numero: numeroVenda,
    itens: _itens.map(i => ({
      produtoId: i.produtoId, nome: i.nome, qtd: i.qtd,
      unitario: i.unitario, precoOriginal: i.precoOriginal ?? i.unitario,
      descontoValor: i.descontoValor || 0, total: i.total
    })),
    subtotal: subtotalBruto,
    descontoItens, descontoTotal, acrescimo, total,
    formaPagamento,
    valorRecebido, troco,
    cpfCnpj: _cpfCnpj || "",
    observacao: _observacao || "",
    vendedorId: vendedor.id,
    vendedorNome: vendedor.nome || vendedor.email || "—",
    comissaoId: _comissaoSelecionadaId || null,
    operadorUid: _usuario?.uid || null,
    operadorNome: _dadosUsuario?.nome || _usuario?.email || "—",
    criadoEm: serverTimestamp()
  };

  // 1) Salvar a venda
  const vendaRef = await addDoc(collection(db, COL_VENDAS), vendaDoc);

  // 2) Baixar estoque de cada item (best-effort — não bloqueia a venda)
  await Promise.all(_itens.map(async (item) => {
    try {
      const prodRef = doc(db, COL_PRODUTOS, item.produtoId);
      const snap = await getDoc(prodRef);
      if (!snap.exists()) return;
      const estoqueAntes = Number(snap.data().estoque) || 0;
      const estoqueDepois = Math.max(0, estoqueAntes - item.qtd);
      await updateDoc(prodRef, { estoque: estoqueDepois });
      await addDoc(collection(db, COL_HIST), {
        produtoId: item.produtoId,
        nomeProduto: item.nome,
        tipo: "venda",
        qtdAntes: estoqueAntes,
        qtdDepois: estoqueDepois,
        delta: estoqueDepois - estoqueAntes,
        motivo: `Venda #${numeroVenda} (Caixa)`,
        operador: _dadosUsuario?.nome || _usuario?.email || "—",
        criadoEm: serverTimestamp()
      });
    } catch (err) {
      console.error(`Erro ao baixar estoque do item ${item.nome}:`, err);
    }
  }));

  // 3) Criar registro na Comissão (se uma planilha foi escolhida)
  let comissaoRegistrada = false;
  if (_comissaoSelecionadaId) {
    const resumoItens = _itens.length === 1
      ? _itens[0].nome
      : `Venda #${numeroVenda} — ${_itens.length} itens`;
    const descricaoComissao = _observacao?.trim()
      ? `${resumoItens} — ${_observacao.trim()}`
      : resumoItens;

    const hoje = new Date().toISOString().slice(0, 10);
    const registro = {
      cliente: _cpfCnpj ? `Consumidor (${_cpfCnpj})` : "Consumidor",
      descricao: descricaoComissao,
      qtdFolhas: 1,
      valor: total,
      data: hoje,
      categoria: MAPA_CATEGORIA_COMISSAO[formaPagamento] || formaPagamento,
      vendedor: vendedor.nome || vendedor.email || "—",
      vendaId: vendaRef.id
    };

    const resReg = await adicionarRegistroComissao(_comissaoSelecionadaId, registro);
    comissaoRegistrada = !!resReg.sucesso;
    if (!comissaoRegistrada) {
      console.error("Erro ao registrar comissão:", resReg.erro);
    }
  }

  // 4) Feedback + limpar terminal
  if (_comissaoSelecionadaId && comissaoRegistrada) {
    window.mostrarToast?.(`Venda finalizada e comissão registrada para ${vendedor.nome || vendedor.email}.`, "success", 5000);
  } else if (_comissaoSelecionadaId && !comissaoRegistrada) {
    window.mostrarToast?.(`Venda finalizada, mas houve um erro ao registrar a comissão de ${vendedor.nome || vendedor.email}.`, "warning", 6000);
  } else {
    window.mostrarToast?.(`Venda finalizada para ${vendedor.nome || vendedor.email}.`, "success", 4000);
  }

  resetarTerminal();
  carregarProdutosCache(true); // atualiza estoque em cache
  document.getElementById("caixaTerminalInput")?.focus();
}
