// ============================================================
// carta-anuencia.js — Módulo "Carta de Anuência" (Promissórias)
// Editor tipo Mini Word, com preenchimento automático dos dados
// do cliente, histórico de versões e exportação em PDF/DOCX.
// Papelaria Futura
// ============================================================

import {
  collection, doc, addDoc, getDoc, getDocs, setDoc,
  updateDoc, query, where, orderBy, limit,
  serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { formatarMoeda } from "./database.js";
import { temCargo } from "./auth.js";

const COL_CLIENTES   = "prom_clientes";
const COL_COMPRAS    = "prom_compras";
const COL_PAGAMENTOS = "prom_pagamentos";
const COL_CARTAS     = "prom_cartas_anuencia";

let _usuarioAtual = null;
let _dadosUsuario = null;

// Estado da carta atualmente aberta no editor
let _cartaAtual = {
  id: null,
  clienteId: null,
  status: "rascunho",
  autoSaveTimer: null,
  sujo: false // há alterações não salvas desde o último save
};

export function iniciarCartaAnuencia(usuario, dadosUsuario) {
  _usuarioAtual = usuario;
  _dadosUsuario = dadosUsuario;
  window.abrirCartaAnuencia = abrirCartaAnuencia;
}

function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function formatarDataLocal(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("pt-BR");
}

function formatarDataExtenso(d = new Date()) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

// ── Busca dados do cliente + totais financeiros ─────────────
async function _buscarDadosCliente(clienteId) {
  const [clienteSnap, comprasSnap, pagamentosSnap] = await Promise.all([
    getDoc(doc(db, COL_CLIENTES, clienteId)),
    getDocs(query(collection(db, COL_COMPRAS), where("clienteId", "==", clienteId))),
    getDocs(query(collection(db, COL_PAGAMENTOS), where("clienteId", "==", clienteId)))
  ]);

  if (!clienteSnap.exists()) throw new Error("Cliente não encontrado.");
  const cliente = { id: clienteSnap.id, ...clienteSnap.data() };

  let totalComprado = 0;
  comprasSnap.forEach(d => { totalComprado += d.data().valor || 0; });

  let totalPago = 0;
  let ultimaDataPagamento = null;
  pagamentosSnap.forEach(d => {
    const p = d.data();
    totalPago += p.valor || 0;
    const dt = p.dataPagamento?.toDate?.() || (p.dataPagamento ? new Date(p.dataPagamento) : null);
    if (dt && (!ultimaDataPagamento || dt > ultimaDataPagamento)) ultimaDataPagamento = dt;
  });

  const saldo = Math.max(0, Math.round((totalComprado - totalPago) * 100) / 100);

  return { cliente, totalComprado, totalPago, saldo, ultimaDataPagamento };
}

function _enderecoCompleto(c) {
  const partes = [
    c.endereco,
    c.numero ? `nº ${c.numero}` : "",
    c.complemento,
    c.bairro,
    (c.cidade || c.estado) ? `${c.cidade || ""}${c.cidade && c.estado ? "/" : ""}${c.estado || ""}` : "",
    c.cep ? `CEP ${c.cep}` : ""
  ].filter(Boolean);
  return partes.join(", ") || "não informado";
}

// ── Modelo oficial da Carta de Anuência (preenchido automaticamente) ──
function _gerarModeloHtml({ cliente, totalComprado, totalPago, saldo, ultimaDataPagamento }, responsavelNome) {
  const numeroContrato = `PROM-${cliente.id.slice(-6).toUpperCase()}`;
  const dataQuitacao = saldo <= 0 ? formatarDataExtenso(ultimaDataPagamento || new Date()) : "___/___/______";
  const docTipo = cliente.tipo === "juridica" ? "CNPJ" : "CPF";
  const cidadeEmpresa = "Luziânia/GO";
  const hoje = formatarDataExtenso();

  return `
<p style="text-align:center;font-weight:bold;font-size:16px;letter-spacing:.02em;margin-bottom:24px">CARTA DE ANUÊNCIA</p>

<p>Declaramos, para os devidos fins de direito, que o(a) Sr.(a) <strong>${escHtml(cliente.nome || "")}</strong>, inscrito(a) no ${docTipo} nº <strong>${escHtml(cliente.documento || "não informado")}</strong>, residente e domiciliado(a) em ${escHtml(_enderecoCompleto(cliente))}, realizou a quitação integral do débito referente ao contrato nº <strong>${numeroContrato}</strong>, no valor original de <strong>${formatarMoeda(totalComprado)}</strong>, tendo sido efetivamente pago o montante de <strong>${formatarMoeda(totalPago)}</strong>, em data de <strong>${dataQuitacao}</strong>.</p>

<p>Diante da quitação ora comprovada, inexiste, por parte desta empresa, qualquer impedimento, restrição ou óbice ao cancelamento de eventual protesto, negativação ou restrição cadastral existente em nome do(a) referido(a) cliente perante os órgãos de proteção ao crédito (SPC/SERASA) ou cartórios competentes, relacionados exclusivamente ao débito ora tratado.</p>

<p>Por ser esta a expressão da verdade, firmamos a presente <strong>Carta de Anuência</strong>, para que produza os efeitos legais e seja apresentada perante quem de direito.</p>

<p style="margin-top:32px">${cidadeEmpresa}, ${hoje}.</p>

<p style="margin-top:56px;text-align:center">_______________________________________________</p>
<p style="text-align:center"><strong>PAPELARIA FUTURA LTDA</strong></p>
<p style="text-align:center">CNPJ: 01.064.836/0001-12</p>
<p style="text-align:center">Responsável: ${escHtml(responsavelNome || "—")}</p>
`.trim();
}

// ── Abrir o editor para um cliente (cria rascunho novo, ou abre o mais recente) ──
export async function abrirCartaAnuencia(clienteId) {
  if (!clienteId) return;
  if (!temCargo(_dadosUsuario, "admin")) {
    window.mostrarToast?.("Acesso restrito a administradores.", "error");
    return;
  }

  window.mostrarToast?.("Carregando dados do cliente...", "info");

  try {
    const dados = await _buscarDadosCliente(clienteId);

    // Verifica se já existe uma carta em rascunho para este cliente — se existir, reabre-a
    const existentes = await getDocs(query(
      collection(db, COL_CARTAS),
      where("clienteId", "==", clienteId),
      where("status", "==", "rascunho")
    ));

    let cartaId = null;
    let conteudoHtml = null;

    if (!existentes.empty) {
      const docExistente = existentes.docs.sort((a, b) => {
        const da = a.data().atualizadoEm?.toDate?.() || new Date(0);
        const dbb = b.data().atualizadoEm?.toDate?.() || new Date(0);
        return dbb - da;
      })[0];
      cartaId = docExistente.id;
      conteudoHtml = docExistente.data().conteudoHtml;
    } else {
      conteudoHtml = _gerarModeloHtml(dados, _dadosUsuario?.nome);
      const ref = await addDoc(collection(db, COL_CARTAS), {
        clienteId,
        clienteNome: dados.cliente.nome || "",
        conteudoHtml,
        cabecalhoHtml: "",
        rodapeHtml: "Documento de controle interno — Papelaria Futura",
        status: "rascunho",
        criadoPor: _usuarioAtual?.uid || null,
        criadoPorNome: _dadosUsuario?.nome || _usuarioAtual?.email || "—",
        criadoEm: serverTimestamp(),
        atualizadoPor: _usuarioAtual?.uid || null,
        atualizadoPorNome: _dadosUsuario?.nome || _usuarioAtual?.email || "—",
        atualizadoEm: serverTimestamp(),
        downloads: []
      });
      cartaId = ref.id;
    }

    _cartaAtual = { id: cartaId, clienteId, status: "rascunho", autoSaveTimer: null, sujo: false };
    _montarEditor(dados, conteudoHtml);
  } catch (err) {
    console.error("Erro ao gerar carta de anuência:", err);
    window.mostrarToast?.("Erro ao gerar a carta de anuência.", "error");
  }
}

// ── Monta a interface do editor (overlay fullscreen) ────────
function _montarEditor(dadosCliente, conteudoHtml) {
  let overlay = document.getElementById("cartaAnuenciaOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "cartaAnuenciaOverlay";
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="ca-topbar">
      <button id="caBtnFechar" title="Fechar editor">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>
        Voltar
      </button>
      <div class="ca-titulo">
        <strong>Carta de Anuência — ${escHtml(dadosCliente.cliente.nome || "")}</strong>
        <span id="caAutoSaveMsg" class="ca-autosave-msg">Todas as alterações salvas</span>
      </div>
      <span id="caStatusPill" class="ca-status-pill ca-status-pill--rascunho">Rascunho</span>
      <button id="caBtnVersoes" title="Histórico de versões">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/></svg>
        Versões
      </button>
      <button id="caBtnAssinatura" title="Inserir assinatura/carimbo">
        <svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm5 7l-2.5 2.5L5 12l3-3 2 2 4-4 1.5 1.5L10 13l-1-2z"/></svg>
        Assinatura
      </button>
      <button id="caBtnImprimir" title="Imprimir">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9v-1h8v1H6zm8-4a1 1 0 11-2 0 1 1 0 012 0z" clip-rule="evenodd"/></svg>
        Imprimir
      </button>
      <button id="caBtnPdf" title="Baixar em PDF">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM9 3a1 1 0 012 0v8.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V3z" clip-rule="evenodd"/></svg>
        PDF
      </button>
      <button id="caBtnDocx" title="Baixar em DOCX (Word)">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM9 3a1 1 0 012 0v8.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V3z" clip-rule="evenodd"/></svg>
        DOCX
      </button>
      <button id="caBtnSalvarRascunho">Salvar Rascunho</button>
      <button id="caBtnFinalizar" class="ca-btn-primary">Salvar Versão Final</button>
    </div>

    <div class="ca-toolbar">
      <div class="ca-group">
        <select id="caFonteSelect" title="Fonte">
          <option value="'Times New Roman',serif" selected>Times New Roman</option>
          <option value="Arial,sans-serif">Arial</option>
          <option value="'Courier New',monospace">Courier New</option>
          <option value="Georgia,serif">Georgia</option>
          <option value="Calibri,sans-serif">Calibri</option>
        </select>
        <select id="caTamanhoSelect" title="Tamanho da fonte">
          <option value="1">10</option>
          <option value="2">12</option>
          <option value="3" selected>14</option>
          <option value="4">16</option>
          <option value="5">18</option>
          <option value="6">24</option>
          <option value="7">32</option>
        </select>
      </div>
      <div class="ca-group">
        <button class="ca-tool" data-cmd="bold" title="Negrito"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a1 1 0 00-1 1v12a1 1 0 001 1h5.5a4 4 0 002.7-6.95A3.5 3.5 0 0010.5 3H5zm2 2h3.5a1.5 1.5 0 010 3H7V5zm0 5.5h3.5a2 2 0 010 4H7v-4z"/></svg></button>
        <button class="ca-tool" data-cmd="italic" title="Itálico"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M8 3a1 1 0 100 2h1.5l-3 10H5a1 1 0 100 2h6a1 1 0 100-2h-1.5l3-10H14a1 1 0 100-2H8z"/></svg></button>
        <button class="ca-tool" data-cmd="underline" title="Sublinhado"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a1 1 0 011 1v6a4 4 0 008 0V4a1 1 0 112 0v6a6 6 0 01-12 0V4a1 1 0 011-1zM4 16a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z"/></svg></button>
      </div>
      <div class="ca-group">
        <button class="ca-tool" data-cmd="justifyLeft" title="Alinhar à esquerda"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h10a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h10a1 1 0 110 2H3a1 1 0 01-1-1z" clip-rule="evenodd"/></svg></button>
        <button class="ca-tool" data-cmd="justifyCenter" title="Centralizar"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm3 4a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm-3 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm3 4a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clip-rule="evenodd"/></svg></button>
        <button class="ca-tool" data-cmd="justifyRight" title="Alinhar à direita"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm6 4a1 1 0 011-1h8a1 1 0 110 2H9a1 1 0 01-1-1zm-6 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm6 4a1 1 0 011-1h8a1 1 0 110 2H9a1 1 0 01-1-1z" clip-rule="evenodd"/></svg></button>
        <button class="ca-tool" data-cmd="justifyFull" title="Justificado"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M2 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1z" clip-rule="evenodd"/></svg></button>
      </div>
      <div class="ca-group">
        <button class="ca-tool" data-cmd="insertUnorderedList" title="Lista com marcadores"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 5a1 1 0 100 2 1 1 0 000-2zm4 .5a1 1 0 011-1h8a1 1 0 110 2H9a1 1 0 01-1-1zM4 9a1 1 0 100 2 1 1 0 000-2zm4 .5a1 1 0 011-1h8a1 1 0 110 2H9a1 1 0 01-1-1zM4 13a1 1 0 100 2 1 1 0 000-2zm4 .5a1 1 0 011-1h8a1 1 0 110 2H9a1 1 0 01-1-1z"/></svg></button>
        <button class="ca-tool" data-cmd="insertOrderedList" title="Lista numerada"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h1v2H3V4h-.5v-.5H3V3zm0 5.5h1.3L3 9.9v.6h1.7v-.6H4l1.3-1.4V8H3v.5zM3 13h.7l-.7.9v.6h1.7v-2H3v.5zM8 4.5a1 1 0 011-1h8a1 1 0 110 2H9a1 1 0 01-1-1zm0 5a1 1 0 011-1h8a1 1 0 110 2H9a1 1 0 01-1-1zm0 5a1 1 0 011-1h8a1 1 0 110 2H9a1 1 0 01-1-1z"/></svg></button>
      </div>
      <div class="ca-group">
        <select id="caEspacamentoSelect" title="Espaçamento entre linhas">
          <option value="1">1,0</option>
          <option value="1.15" selected>1,15</option>
          <option value="1.5">1,5</option>
          <option value="2">2,0</option>
        </select>
      </div>
      <div class="ca-group">
        <button class="ca-tool" id="caBtnInserirLogo" title="Inserir logo da empresa"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l3.5-4.5 2.5 3L13.5 9 16 15z" clip-rule="evenodd"/></svg></button>
        <button class="ca-tool" id="caBtnInserirImagem" title="Inserir imagem"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm0 2h12v6.5l-3-3-4 4-2-2L4 13.5V5zm2 2a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" clip-rule="evenodd"/></svg></button>
      </div>
      <input type="file" id="caInputImagem" accept="image/*" style="display:none" />
      <input type="file" id="caInputAssinatura" accept="image/*" style="display:none" />
    </div>

    <div class="ca-editor-scroll">
      <div class="ca-pagina">
        <div class="ca-cabecalho" id="caCabecalho" contenteditable="true" placeholder="Cabeçalho (opcional)"></div>
        <div class="ca-corpo" id="caCorpo" contenteditable="true"></div>
        <div class="ca-rodape" id="caRodape" contenteditable="true">Documento de controle interno — Papelaria Futura</div>
      </div>
      <div class="ca-pagecount" id="caPageCount">~1 página</div>
    </div>
  `;

  document.getElementById("caCorpo").innerHTML = conteudoHtml || "";
  overlay.hidden = false;
  document.body.style.overflow = "hidden";

  _ligarEventosEditor(dadosCliente);
  _atualizarStatusPill();
  _atualizarContagemPaginas();
}

// ── Eventos da barra de ferramentas e do editor ─────────────
function _ligarEventosEditor(dadosCliente) {
  const overlay = document.getElementById("cartaAnuenciaOverlay");

  document.getElementById("caBtnFechar").onclick = () => _fecharEditor();

  // Comandos de formatação (execCommand ainda é o jeito mais simples/compatível
  // de implementar um editor rich-text sem dependências externas)
  overlay.querySelectorAll(".ca-tool[data-cmd]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("caCorpo").focus();
      document.execCommand(btn.dataset.cmd, false, null);
      _marcarSujo();
      _atualizarEstadoBotoes();
    });
  });

  document.getElementById("caFonteSelect").addEventListener("change", (e) => {
    document.getElementById("caCorpo").focus();
    document.execCommand("fontName", false, e.target.value);
    _marcarSujo();
  });

  document.getElementById("caTamanhoSelect").addEventListener("change", (e) => {
    document.getElementById("caCorpo").focus();
    document.execCommand("fontSize", false, e.target.value);
    _marcarSujo();
  });

  document.getElementById("caEspacamentoSelect").addEventListener("change", (e) => {
    document.getElementById("caCorpo").style.lineHeight = e.target.value;
    _marcarSujo();
  });

  // Inserir logo da empresa (já existente em img/logo.png)
  document.getElementById("caBtnInserirLogo").addEventListener("click", () => {
    document.getElementById("caCorpo").focus();
    const origem = window.location.origin;
    document.execCommand("insertHTML", false, `<img src="${origem}/img/logo.png" style="width:70px;height:70px;display:inline-block;vertical-align:middle" />`);
    _marcarSujo();
  });

  // Inserir imagem qualquer (upload local, embutida em base64)
  document.getElementById("caBtnInserirImagem").addEventListener("click", () => document.getElementById("caInputImagem").click());
  document.getElementById("caInputImagem").addEventListener("change", (e) => _inserirImagemArquivo(e.target.files[0]));

  // Assinatura / carimbo
  document.getElementById("caBtnAssinatura").addEventListener("click", () => {
    window.mostrarToast?.("Selecione a imagem da assinatura ou carimbo.", "info");
    document.getElementById("caInputAssinatura").click();
  });
  document.getElementById("caInputAssinatura").addEventListener("change", (e) => _inserirImagemArquivo(e.target.files[0], 220));

  // Marcar como "sujo" (não salvo) em qualquer edição
  ["caCorpo", "caCabecalho", "caRodape"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => {
      _marcarSujo();
      _atualizarContagemPaginas();
    });
  });
  document.getElementById("caCorpo").addEventListener("keyup", _atualizarEstadoBotoes);
  document.getElementById("caCorpo").addEventListener("mouseup", _atualizarEstadoBotoes);

  // Versões
  document.getElementById("caBtnVersoes").addEventListener("click", () => _abrirHistoricoVersoes());

  // Impressão / exportação
  document.getElementById("caBtnImprimir").addEventListener("click", () => _imprimirCarta());
  document.getElementById("caBtnPdf").addEventListener("click", () => _imprimirCarta(true));
  document.getElementById("caBtnDocx").addEventListener("click", () => _exportarDocx(dadosCliente));

  // Salvar
  document.getElementById("caBtnSalvarRascunho").addEventListener("click", () => _salvarCarta("rascunho", true));
  document.getElementById("caBtnFinalizar").addEventListener("click", () => _salvarCarta("finalizada", true));

  // Auto-save a cada 25s, só se houver alterações pendentes
  if (_cartaAtual.autoSaveTimer) clearInterval(_cartaAtual.autoSaveTimer);
  _cartaAtual.autoSaveTimer = setInterval(() => {
    if (_cartaAtual.sujo) _salvarCarta(_cartaAtual.status, false);
  }, 25000);
}

function _marcarSujo() {
  _cartaAtual.sujo = true;
  const msg = document.getElementById("caAutoSaveMsg");
  if (msg) msg.textContent = "Alterações não salvas...";
}

function _atualizarEstadoBotoes() {
  document.querySelectorAll(".ca-tool[data-cmd]").forEach(btn => {
    try {
      btn.classList.toggle("is-ativo", document.queryCommandState(btn.dataset.cmd));
    } catch { /* alguns comandos não suportam queryCommandState */ }
  });
}

function _atualizarStatusPill() {
  const pill = document.getElementById("caStatusPill");
  if (!pill) return;
  const finalizada = _cartaAtual.status === "finalizada";
  pill.textContent = finalizada ? "Finalizada" : "Rascunho";
  pill.className = `ca-status-pill ${finalizada ? "ca-status-pill--finalizada" : "ca-status-pill--rascunho"}`;
}

// Estimativa simples de número de páginas com base na altura do conteúdo
function _atualizarContagemPaginas() {
  const corpo = document.getElementById("caCorpo");
  const contador = document.getElementById("caPageCount");
  if (!corpo || !contador) return;
  const alturaUtilPorPagina = 1000; // aproximação da área útil de uma página A4 em px
  const paginas = Math.max(1, Math.ceil(corpo.scrollHeight / alturaUtilPorPagina));
  contador.textContent = `~${paginas} página${paginas > 1 ? "s" : ""}`;
}

function _inserirImagemArquivo(file, maxLargura = 320) {
  if (!file || !file.type.startsWith("image/")) {
    window.mostrarToast?.("Selecione um arquivo de imagem válido.", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById("caCorpo").focus();
    document.execCommand("insertHTML", false, `<img src="${reader.result}" style="max-width:${maxLargura}px;display:block;margin:8px 0" />`);
    _marcarSujo();
  };
  reader.readAsDataURL(file);
}

// ── Salvar (rascunho ou versão final) ───────────────────────
async function _salvarCarta(novoStatus, mostrarFeedback) {
  if (!_cartaAtual.id) return;
  const conteudoHtml = document.getElementById("caCorpo").innerHTML;
  const cabecalhoHtml = document.getElementById("caCabecalho").innerHTML;
  const rodapeHtml = document.getElementById("caRodape").innerHTML;

  const btnRascunho = document.getElementById("caBtnSalvarRascunho");
  const btnFinal = document.getElementById("caBtnFinalizar");
  if (mostrarFeedback) { btnRascunho.disabled = true; btnFinal.disabled = true; }

  try {
    // Guarda a versão anterior no histórico antes de sobrescrever
    const antesSnap = await getDoc(doc(db, COL_CARTAS, _cartaAtual.id));
    if (antesSnap.exists()) {
      const antes = antesSnap.data();
      if (antes.conteudoHtml && antes.conteudoHtml !== conteudoHtml) {
        await addDoc(collection(db, COL_CARTAS, _cartaAtual.id, "versoes"), {
          conteudoHtml: antes.conteudoHtml,
          status: antes.status || "rascunho",
          usuarioNome: antes.atualizadoPorNome || antes.criadoPorNome || "—",
          data: antes.atualizadoEm || serverTimestamp()
        });
      }
    }

    await updateDoc(doc(db, COL_CARTAS, _cartaAtual.id), {
      conteudoHtml, cabecalhoHtml, rodapeHtml,
      status: novoStatus,
      atualizadoPor: _usuarioAtual?.uid || null,
      atualizadoPorNome: _dadosUsuario?.nome || _usuarioAtual?.email || "—",
      atualizadoEm: serverTimestamp()
    });

    _cartaAtual.status = novoStatus;
    _cartaAtual.sujo = false;
    _atualizarStatusPill();
    const msg = document.getElementById("caAutoSaveMsg");
    if (msg) msg.textContent = `Salvo às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

    if (mostrarFeedback) {
      window.mostrarToast?.(novoStatus === "finalizada" ? "Versão final salva!" : "Rascunho salvo!", "success");
    }
  } catch (err) {
    console.error("Erro ao salvar carta:", err);
    if (mostrarFeedback) window.mostrarToast?.("Erro ao salvar a carta.", "error");
  } finally {
    if (mostrarFeedback) { btnRascunho.disabled = false; btnFinal.disabled = false; }
  }
}

// ── Histórico de versões ────────────────────────────────────
async function _abrirHistoricoVersoes() {
  if (!_cartaAtual.id) return;
  const body = `<div class="loading-cell" style="padding:24px 0">Carregando versões...</div>`;
  const footer = `<button class="btn-ghost" onclick="window.fecharModal()">Fechar</button>`;
  window.abrirModal?.("Histórico de Versões", body, footer);

  try {
    const snap = await getDocs(query(
      collection(db, COL_CARTAS, _cartaAtual.id, "versoes"),
      orderBy("data", "desc"),
      limit(15)
    ));
    const versoes = [];
    snap.forEach(d => versoes.push({ id: d.id, ...d.data() }));

    const html = versoes.length === 0
      ? `<p style="font-size:var(--text-sm);color:var(--gray-500);padding:8px 0">Nenhuma versão anterior salva ainda. Toda vez que você salvar alterações, a versão anterior fica guardada aqui.</p>`
      : `<ul class="ca-versoes-lista">
          ${versoes.map(v => `
            <li>
              <div class="ca-versao-info">
                <strong>${formatarDataLocal(v.data)} às ${(v.data?.toDate?.() || new Date()).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</strong>
                <span>Por ${escHtml(v.usuarioNome || "—")} · ${v.status === "finalizada" ? "Finalizada" : "Rascunho"}</span>
              </div>
              <button class="btn-secondary" data-versao-id="${v.id}" id="btnRestaurar_${v.id}">Restaurar</button>
            </li>`).join("")}
        </ul>`;

    const modalEl = document.getElementById("modalBody");
    if (modalEl) {
      modalEl.innerHTML = `<div class="form-usuario">${html}</div>`;
      versoes.forEach(v => {
        document.getElementById(`btnRestaurar_${v.id}`)?.addEventListener("click", () => _restaurarVersao(v));
      });
    }
  } catch (err) {
    console.error("Erro ao carregar versões:", err);
    const modalEl = document.getElementById("modalBody");
    if (modalEl) modalEl.innerHTML = `<p style="color:var(--color-danger)">Erro ao carregar histórico de versões.</p>`;
  }
}

function _restaurarVersao(versao) {
  document.getElementById("caCorpo").innerHTML = versao.conteudoHtml || "";
  _marcarSujo();
  _atualizarContagemPaginas();
  window.fecharModal?.();
  window.mostrarToast?.("Versão restaurada. Salve para confirmar.", "success");
}

// ── Registrar log de download (PDF/DOCX) ────────────────────
async function _registrarDownload(tipo) {
  if (!_cartaAtual.id) return;
  try {
    await updateDoc(doc(db, COL_CARTAS, _cartaAtual.id), {
      [`ultimoDownload${tipo}`]: {
        por: _dadosUsuario?.nome || _usuarioAtual?.email || "—",
        em: Timestamp.now()
      }
    });
  } catch (err) {
    console.error("Erro ao registrar log de download:", err);
  }
}

// ── Impressão / PDF ──────────────────────────────────────────
function _imprimirCarta(comoDownloadPdf = false) {
  const cabecalho = document.getElementById("caCabecalho").innerHTML;
  const corpo = document.getElementById("caCorpo").innerHTML;
  const rodape = document.getElementById("caRodape").innerHTML;
  const lineHeight = document.getElementById("caCorpo").style.lineHeight || "1.15";

  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <title>Carta de Anuência</title>
    <style>
      @page { size: A4; margin: 22mm 20mm; }
      body{font-family:"Times New Roman",Georgia,serif;font-size:14px;line-height:${lineHeight};color:#1a1a1a;margin:0;padding:0}
      .cab{font-size:11px;color:#666;margin-bottom:18px;padding-bottom:8px;border-bottom:1px solid #eee}
      .rod{font-size:11px;color:#666;margin-top:24px;padding-top:8px;border-top:1px solid #eee}
      img{max-width:100%}
      p{margin:0 0 10px}
    </style></head><body>
    ${cabecalho ? `<div class="cab">${cabecalho}</div>` : ""}
    ${corpo}
    ${rodape ? `<div class="rod">${rodape}</div>` : ""}
    <script>window.onload=()=>{window.print();}<\/script>
    </body></html>`);
  win.document.close();

  if (comoDownloadPdf) _registrarDownload("PDF");
}

// ── Exportação em .doc (compatível com Microsoft Word) ──────
// Gera um arquivo HTML com o namespace do Word, que o Word abre e
// converte normalmente — é a forma padrão de exportar "DOCX" sem
// precisar de bibliotecas externas no navegador.
function _exportarDocx(dadosCliente) {
  const cabecalho = document.getElementById("caCabecalho").innerHTML;
  const corpo = document.getElementById("caCorpo").innerHTML;
  const rodape = document.getElementById("caRodape").innerHTML;

  const htmlDoc = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><title>Carta de Anuência</title>
    <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
    <style>
      @page{size:21cm 29.7cm;margin:2.2cm 2cm}
      body{font-family:"Times New Roman",serif;font-size:14pt;line-height:1.4;color:#1a1a1a}
      p{margin:0 0 10pt}
      img{max-width:400px}
    </style></head>
    <body>
      ${cabecalho ? `<div style="font-size:9pt;color:#666;margin-bottom:14pt">${cabecalho}</div>` : ""}
      ${corpo}
      ${rodape ? `<div style="font-size:9pt;color:#666;margin-top:18pt">${rodape}</div>` : ""}
    </body></html>`;

  const blob = new Blob(['\ufeff', htmlDoc], { type: "application/msword" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const nomeArq = (dadosCliente?.cliente?.nome || "cliente").replace(/[^\w]+/g, "_");
  link.download = `Carta_Anuencia_${nomeArq}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  _registrarDownload("DOCX");
  window.mostrarToast?.("Arquivo .doc gerado! Ele abre normalmente no Microsoft Word.", "success");
}

// ── Fechar editor ────────────────────────────────────────────
function _fecharEditor() {
  if (_cartaAtual.sujo) {
    const confirmar = window.confirm("Há alterações não salvas. Deseja salvar como rascunho antes de sair?");
    if (confirmar) { _salvarCarta("rascunho", false); }
  }
  if (_cartaAtual.autoSaveTimer) clearInterval(_cartaAtual.autoSaveTimer);
  const overlay = document.getElementById("cartaAnuenciaOverlay");
  if (overlay) overlay.hidden = true;
  document.body.style.overflow = "";
  _cartaAtual = { id: null, clienteId: null, status: "rascunho", autoSaveTimer: null, sujo: false };
}
