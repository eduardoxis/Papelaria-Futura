// ============================================================
// entregas.js — Módulo "Controle de Entregas"
// Papelaria Futura
// ============================================================

import {
  collection, doc, addDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";

const COL_ENTREGAS = "entregas";

let _usuarioAtual = null;
let _dadosUsuario = null;

let _todasEntregas = [];   // cache local de todos os registros carregados
let _entregasFiltradas = []; // resultado atual após busca/filtro/ordenação
let _paginaAtual = 1;
const ITENS_POR_PAGINA = 10;
let _ordemAsc = false; // false = mais recentes primeiro

// ── Inicialização ────────────────────────────────────────────
export function iniciarEntregas(usuario, dadosUsuario) {
  _usuarioAtual = usuario;
  _dadosUsuario = dadosUsuario;

  document.addEventListener("navegacao", (e) => {
    if (e.detail.page === "entregas") carregarEntregas();
  });

  document.getElementById("btnNovaEntrega")?.addEventListener("click", () => abrirModalEntrega());

  document.getElementById("btnBuscarEntregas")?.addEventListener("click", aplicarFiltros);
  document.getElementById("btnLimparBuscaEntregas")?.addEventListener("click", limparFiltros);
  document.getElementById("entFiltroCliente")?.addEventListener("keydown", (e) => { if (e.key === "Enter") aplicarFiltros(); });
  document.getElementById("entFiltroLocal")?.addEventListener("keydown", (e) => { if (e.key === "Enter") aplicarFiltros(); });

  document.getElementById("btnAplicarFiltroDataEntregas")?.addEventListener("click", aplicarFiltros);
  document.getElementById("btnLimparFiltroDataEntregas")?.addEventListener("click", limparFiltros);

  document.getElementById("btnOrdenarDataEntregas")?.addEventListener("click", () => {
    _ordemAsc = !_ordemAsc;
    _atualizarIconeOrdenacao();
    _aplicarOrdenacaoEPaginar();
  });

  document.getElementById("btnEntregasPdf")?.addEventListener("click", exportarPdf);
  document.getElementById("btnEntregasExcel")?.addEventListener("click", exportarExcel);

  document.getElementById("btnEntPaginaAnterior")?.addEventListener("click", () => {
    if (_paginaAtual > 1) { _paginaAtual--; _renderizarTabela(); }
  });
  document.getElementById("btnEntPaginaProxima")?.addEventListener("click", () => {
    const totalPaginas = Math.max(1, Math.ceil(_entregasFiltradas.length / ITENS_POR_PAGINA));
    if (_paginaAtual < totalPaginas) { _paginaAtual++; _renderizarTabela(); }
  });

  document.getElementById("tbodyEntregas")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === "editar-entrega")  abrirModalEntrega(id);
    if (action === "excluir-entrega") confirmarExcluirEntrega(id);
  });
}

function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function formatarDataBR(dataStr) {
  if (!dataStr) return "—";
  const [ano, mes, dia] = dataStr.split("-");
  if (!ano || !mes || !dia) return dataStr;
  return `${dia}/${mes}/${ano}`;
}

// ── Carregamento ──────────────────────────────────────────────
async function carregarEntregas() {
  const tbody = document.getElementById("tbodyEntregas");
  if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">Carregando entregas...</td></tr>`;

  try {
    const snap = await getDocs(query(collection(db, COL_ENTREGAS), orderBy("data", "desc")));
    _todasEntregas = [];
    snap.forEach(d => _todasEntregas.push({ id: d.id, ...d.data() }));

    _atualizarDashboard();
    _entregasFiltradas = [..._todasEntregas];
    _paginaAtual = 1;
    _aplicarOrdenacaoEPaginar();
  } catch (err) {
    console.error("Erro ao carregar entregas:", err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">Erro ao carregar entregas. <button class="btn-secondary" id="btnRetryEntregas" style="margin-left:8px">Tentar novamente</button></td></tr>`;
    document.getElementById("btnRetryEntregas")?.addEventListener("click", carregarEntregas);
  }
}

// ── Dashboard de estatísticas ────────────────────────────────
function _atualizarDashboard() {
  const hojeStr = _dataLocalStr(new Date());
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();

  const total = _todasEntregas.length;

  const realizadasHoje = _todasEntregas.filter(e => e.data === hojeStr).length;

  const doMes = _todasEntregas.filter(e => {
    if (!e.data) return false;
    const [ano, mes] = e.data.split("-").map(Number);
    return ano === anoAtual && (mes - 1) === mesAtual;
  }).length;

  const clientesUnicos = new Set(
    _todasEntregas.map(e => (e.cliente || "").trim().toLowerCase()).filter(Boolean)
  ).size;

  _setTexto("statEntTotal", total);
  _setTexto("statEntHoje", realizadasHoje);
  _setTexto("statEntMes", doMes);
  _setTexto("statEntClientes", clientesUnicos);
}

function _setTexto(id, valor) {
  const el = document.getElementById(id);
  if (el) el.textContent = valor;
}

function _dataLocalStr(d) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// ── Filtros / busca / ordenação ──────────────────────────────
function aplicarFiltros() {
  const termoCliente = (document.getElementById("entFiltroCliente")?.value || "").trim().toLowerCase();
  const termoLocal   = (document.getElementById("entFiltroLocal")?.value || "").trim().toLowerCase();
  const dataInicio   = document.getElementById("entFiltroDataInicio")?.value || "";
  const dataFim      = document.getElementById("entFiltroDataFim")?.value || "";

  _entregasFiltradas = _todasEntregas.filter(e => {
    if (termoCliente && !(e.cliente || "").toLowerCase().includes(termoCliente)) return false;
    if (termoLocal && !(e.local || "").toLowerCase().includes(termoLocal)) return false;
    if (dataInicio && e.data < dataInicio) return false;
    if (dataFim && e.data > dataFim) return false;
    return true;
  });

  _paginaAtual = 1;
  _aplicarOrdenacaoEPaginar();
}

function limparFiltros() {
  ["entFiltroCliente", "entFiltroLocal", "entFiltroDataInicio", "entFiltroDataFim"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  _entregasFiltradas = [..._todasEntregas];
  _paginaAtual = 1;
  _aplicarOrdenacaoEPaginar();
}

function _atualizarIconeOrdenacao() {
  const btn = document.getElementById("btnOrdenarDataEntregas");
  if (!btn) return;
  btn.querySelector(".ent-ordem-label").textContent = _ordemAsc ? "Data (mais antigas)" : "Data (mais recentes)";
}

function _aplicarOrdenacaoEPaginar() {
  _entregasFiltradas.sort((a, b) => {
    const da = a.data || "";
    const db_ = b.data || "";
    return _ordemAsc ? da.localeCompare(db_) : db_.localeCompare(da);
  });
  _renderizarTabela();
}

// ── Renderização da tabela + paginação ───────────────────────
function _renderizarTabela() {
  const tbody = document.getElementById("tbodyEntregas");
  if (!tbody) return;

  if (_entregasFiltradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">Nenhuma entrega encontrada.</td></tr>`;
    document.getElementById("entPaginacao")?.setAttribute("hidden", "");
    return;
  }

  const totalPaginas = Math.max(1, Math.ceil(_entregasFiltradas.length / ITENS_POR_PAGINA));
  if (_paginaAtual > totalPaginas) _paginaAtual = totalPaginas;
  const inicio = (_paginaAtual - 1) * ITENS_POR_PAGINA;
  const pagina = _entregasFiltradas.slice(inicio, inicio + ITENS_POR_PAGINA);

  tbody.innerHTML = pagina.map(e => `
    <tr>
      <td data-label="Cliente"><strong>${escHtml(e.cliente)}</strong></td>
      <td data-label="Local">${escHtml(e.local)}</td>
      <td data-label="Data">${formatarDataBR(e.data)}</td>
      <td data-label="Horário de Saída">${escHtml(e.horarioSaida || "—")}</td>
      <td data-label="Horário de Chegada">${escHtml(e.horarioChegada || "—")}</td>
      <td class="col-center" data-label="Ações">
        <button class="btn-table-action" data-action="editar-entrega" data-id="${e.id}" title="Editar">
          <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
        </button>
        <button class="btn-table-action btn-table-action--delete" data-action="excluir-entrega" data-id="${e.id}" title="Excluir">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
        </button>
      </td>
    </tr>
  `).join("");

  const paginacao = document.getElementById("entPaginacao");
  if (paginacao) {
    paginacao.hidden = false;
    document.getElementById("entPaginacaoInfo").textContent =
      `Mostrando ${inicio + 1}–${Math.min(inicio + ITENS_POR_PAGINA, _entregasFiltradas.length)} de ${_entregasFiltradas.length}`;
    document.getElementById("entPaginacaoPagina").textContent = `Página ${_paginaAtual} de ${totalPaginas}`;
    document.getElementById("btnEntPaginaAnterior").disabled = _paginaAtual <= 1;
    document.getElementById("btnEntPaginaProxima").disabled = _paginaAtual >= totalPaginas;
  }
}

// ── Modal: Nova / Editar entrega ─────────────────────────────
function abrirModalEntrega(entregaId = null) {
  const editando = !!entregaId;
  const entrega = editando ? _todasEntregas.find(e => e.id === entregaId) : null;

  const body = `
    <div class="form-grid">
      <div class="field--full">
        <label class="field-label">Cliente *</label>
        <input type="text" id="entCliente" class="field-input--plain" placeholder="Nome do cliente" value="${escHtml(entrega?.cliente || "")}" autocomplete="off" />
      </div>
      <div class="field--full">
        <label class="field-label">Local *</label>
        <input type="text" id="entLocal" class="field-input--plain" placeholder="Endereço / local de entrega" value="${escHtml(entrega?.local || "")}" autocomplete="off" />
      </div>
      <div>
        <label class="field-label">Data *</label>
        <input type="date" id="entData" class="field-input--plain" value="${entrega?.data || _dataLocalStr(new Date())}" autocomplete="off" />
      </div>
      <div></div>
      <div>
        <label class="field-label">Horário de Saída</label>
        <input type="time" id="entHorarioSaida" class="field-input--plain" value="${entrega?.horarioSaida || ""}" autocomplete="off" />
      </div>
      <div>
        <label class="field-label">Horário de Chegada</label>
        <input type="time" id="entHorarioChegada" class="field-input--plain" value="${entrega?.horarioChegada || ""}" autocomplete="off" />
      </div>
    </div>
  `;

  const footer = `
    <button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button>
    <button class="btn-primary" id="btnSalvarEntrega">${editando ? "Salvar Alterações" : "Cadastrar Entrega"}</button>
  `;

  window.abrirModal(editando ? "Editar Entrega" : "Nova Entrega", body, footer);
  document.getElementById("btnSalvarEntrega").addEventListener("click", () => salvarEntrega(entregaId));
  document.getElementById("entCliente")?.focus();
}

async function salvarEntrega(entregaId) {
  const cliente = document.getElementById("entCliente").value.trim();
  const local = document.getElementById("entLocal").value.trim();
  const data = document.getElementById("entData").value;
  const horarioSaida = document.getElementById("entHorarioSaida").value;
  const horarioChegada = document.getElementById("entHorarioChegada").value;

  if (!cliente || !local || !data) {
    window.mostrarToast?.("Preencha cliente, local e data.", "error");
    return;
  }

  const btn = document.getElementById("btnSalvarEntrega");
  btn.disabled = true;

  try {
    const dados = {
      cliente, local, data, horarioSaida, horarioChegada,
      atualizadoEm: serverTimestamp()
    };

    if (entregaId) {
      await updateDoc(doc(db, COL_ENTREGAS, entregaId), dados);
      window.mostrarToast?.("Entrega atualizada!", "success");
    } else {
      dados.criadoEm = serverTimestamp();
      dados.criadoPor = _usuarioAtual?.uid || null;
      dados.criadoPorNome = _dadosUsuario?.nome || _usuarioAtual?.email || "—";
      await addDoc(collection(db, COL_ENTREGAS), dados);
      window.mostrarToast?.("Entrega cadastrada!", "success");
    }

    window.fecharModal();
    carregarEntregas();
  } catch (err) {
    console.error("Erro ao salvar entrega:", err);
    window.mostrarToast?.("Erro ao salvar a entrega.", "error");
  } finally {
    btn.disabled = false;
  }
}

function confirmarExcluirEntrega(entregaId) {
  const entrega = _todasEntregas.find(e => e.id === entregaId);
  const body = `<p style="font-size:var(--text-sm);color:var(--gray-600)">Tem certeza que deseja excluir a entrega de <strong>${escHtml(entrega?.cliente || "")}</strong> em ${formatarDataBR(entrega?.data)}? Essa ação não pode ser desfeita.</p>`;
  const footer = `
    <button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button>
    <button class="btn-danger-solid" id="btnConfirmarExcluirEntrega">Excluir</button>
  `;
  window.abrirModal("Excluir Entrega", body, footer);
  document.getElementById("btnConfirmarExcluirEntrega").addEventListener("click", async () => {
    try {
      await deleteDoc(doc(db, COL_ENTREGAS, entregaId));
      window.mostrarToast?.("Entrega excluída.", "success");
      window.fecharModal();
      carregarEntregas();
    } catch (err) {
      console.error("Erro ao excluir entrega:", err);
      window.mostrarToast?.("Erro ao excluir a entrega.", "error");
    }
  });
}

// ── Exportação PDF ────────────────────────────────────────────
function exportarPdf() {
  if (!window.jspdf) {
    window.mostrarToast?.("Biblioteca de PDF não carregada.", "error");
    return;
  }
  if (_entregasFiltradas.length === 0) {
    window.mostrarToast?.("Não há entregas para exportar.", "error");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc_ = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  doc_.setFontSize(15);
  doc_.setTextColor(0, 45, 148);
  doc_.text("Papelaria Futura — Controle de Entregas", 14, 16);

  doc_.setFontSize(10);
  doc_.setTextColor(100, 116, 139);
  doc_.text(`Emitido em ${new Date().toLocaleDateString("pt-BR")} • ${_entregasFiltradas.length} registro(s)`, 14, 22);

  doc_.autoTable({
    startY: 28,
    head: [["Cliente", "Local", "Data", "Saída", "Chegada"]],
    body: _entregasFiltradas.map(e => [
      e.cliente || "", e.local || "", formatarDataBR(e.data), e.horarioSaida || "—", e.horarioChegada || "—"
    ]),
    headStyles: { fillColor: [0, 45, 148], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    margin: { left: 14, right: 14 }
  });

  doc_.save(`controle_entregas_${_dataLocalStr(new Date())}.pdf`);
}

// ── Exportação Excel ──────────────────────────────────────────
function exportarExcel() {
  if (!window.XLSX) {
    window.mostrarToast?.("Biblioteca de Excel não carregada.", "error");
    return;
  }
  if (_entregasFiltradas.length === 0) {
    window.mostrarToast?.("Não há entregas para exportar.", "error");
    return;
  }

  const linhas = [
    ["Cliente", "Local", "Data", "Horário de Saída", "Horário de Chegada"],
    ..._entregasFiltradas.map(e => [e.cliente || "", e.local || "", formatarDataBR(e.data), e.horarioSaida || "", e.horarioChegada || ""])
  ];

  const ws = window.XLSX.utils.aoa_to_sheet(linhas);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, "Entregas");
  window.XLSX.writeFile(wb, `controle_entregas_${_dataLocalStr(new Date())}.xlsx`);
}
