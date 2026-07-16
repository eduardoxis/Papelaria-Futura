// ============================================================
// entrega.js — Módulo Entrega — Papelaria Futura
// Seção própria (igual Caixa, Comissão etc.) pra controlar
// saídas/entregas: cliente, local, data, hora de saída e volta.
// ============================================================
import {
  collection, doc, addDoc, getDocs,
  updateDoc, deleteDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { escHtml } from "./index.js";

export const COL_ENTREGAS = "pf_entregas";

let _usuario = null;
let _dadosUsuario = null;
let _entregasCache = [];
let _termoBusca = "";

export function iniciarEntrega(usuario, dadosUsuario) {
  _usuario = usuario;
  _dadosUsuario = dadosUsuario;

  document.addEventListener("navegacao", (e) => {
    if (e.detail.page === "entrega") carregarListaEntregas();
  });

  document.getElementById("btnNovaEntrega")?.addEventListener("click", abrirModalNovaEntrega);

  document.getElementById("filtroBuscaEntrega")?.addEventListener("input", (e) => {
    _termoBusca = e.target.value;
    renderizarTabelaEntrega();
  });
  document.getElementById("btnBuscarEntrega")?.addEventListener("click", renderizarTabelaEntrega);
  document.getElementById("btnLimparBuscaEntrega")?.addEventListener("click", () => {
    _termoBusca = "";
    const inp = document.getElementById("filtroBuscaEntrega");
    if (inp) inp.value = "";
    renderizarTabelaEntrega();
  });

  document.getElementById("tbodyEntrega")?.addEventListener("click", onTabelaClick);
}

async function carregarListaEntregas() {
  const tbody = document.getElementById("tbodyEntrega");
  if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">Carregando...</td></tr>`;
  try {
    const snap = await getDocs(query(collection(db, COL_ENTREGAS), orderBy("data", "desc")));
    _entregasCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("Erro ao carregar entregas:", err);
    window.mostrarToast?.("Erro ao carregar entregas.", "error");
    _entregasCache = [];
  }
  renderizarTabelaEntrega();
}

function fmtDataBR(data) {
  if (!data) return "—";
  const [ano, mes, dia] = data.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : data;
}

function renderizarTabelaEntrega() {
  const tbody = document.getElementById("tbodyEntrega");
  if (!tbody) return;

  const termo = _termoBusca.trim().toLowerCase();
  const lista = _entregasCache.filter(en =>
    !termo ||
    (en.cliente || "").toLowerCase().includes(termo) ||
    (en.local || "").toLowerCase().includes(termo)
  );

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">Nenhuma entrega cadastrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(en => `
    <tr>
      <td><strong>${escHtml(en.cliente || "—")}</strong></td>
      <td>${escHtml(en.local || "—")}</td>
      <td>${fmtDataBR(en.data)}</td>
      <td class="col-center">${escHtml(en.horaSaida || "—")}</td>
      <td class="col-center">${escHtml(en.horaVolta || "—")}</td>
      <td class="col-center td-actions-col">
        <div class="td-actions-wrap">
          <button class="btn-action btn-action--edit" data-action="editar" data-id="${escHtml(en.id)}">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
            Editar
          </button>
          <button class="btn-action btn-action--delete" data-action="excluir" data-id="${escHtml(en.id)}" data-cliente="${escHtml(en.cliente || "")}">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
            Excluir
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

function onTabelaClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const { action, id, cliente } = btn.dataset;
  if (action === "editar") abrirModalEditarEntrega(id);
  if (action === "excluir") confirmarExcluirEntrega(id, cliente);
}

// ----------------------------------------------------------------
// Modal: nova / editar entrega
// ----------------------------------------------------------------
function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function corpoModalEntrega(dados = {}) {
  return `
    <div>
      <label class="field-label">Nome do Cliente *</label>
      <input type="text" id="mEntCliente" class="field-input--plain" placeholder="Quem vai receber a entrega" value="${escHtml(dados.cliente || "")}" autocomplete="off" />
    </div>
    <div style="margin-top:12px">
      <label class="field-label">Local</label>
      <input type="text" id="mEntLocal" class="field-input--plain" placeholder="Endereço ou ponto de entrega" value="${escHtml(dados.local || "")}" autocomplete="off" />
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:12px">
      <div>
        <label class="field-label">Data</label>
        <input type="date" id="mEntData" class="field-input--plain" value="${escHtml(dados.data || hojeISO())}" autocomplete="off" />
      </div>
      <div>
        <label class="field-label">Hora de Saída</label>
        <input type="time" id="mEntSaida" class="field-input--plain" value="${escHtml(dados.horaSaida || "")}" autocomplete="off" />
      </div>
      <div>
        <label class="field-label">Hora de Volta</label>
        <input type="time" id="mEntVolta" class="field-input--plain" value="${escHtml(dados.horaVolta || "")}" autocomplete="off" />
      </div>
    </div>
  `;
}

function abrirModalNovaEntrega() {
  window.abrirModal("Nova Entrega", corpoModalEntrega(), `
    <button class="btn-ghost" id="btnCancelarModalEnt">Cancelar</button>
    <button class="btn-primary" id="btnSalvarEntrega">Salvar Entrega</button>
  `);
  document.getElementById("btnCancelarModalEnt").onclick = () => window.fecharModal();
  document.getElementById("btnSalvarEntrega").onclick = () => salvarEntrega(null);
  document.getElementById("mEntCliente")?.focus();
}

function abrirModalEditarEntrega(id) {
  const entrega = _entregasCache.find(en => en.id === id);
  if (!entrega) return;
  window.abrirModal("Editar Entrega", corpoModalEntrega(entrega), `
    <button class="btn-ghost" id="btnCancelarModalEnt">Cancelar</button>
    <button class="btn-primary" id="btnSalvarEntrega">Salvar Alterações</button>
  `);
  document.getElementById("btnCancelarModalEnt").onclick = () => window.fecharModal();
  document.getElementById("btnSalvarEntrega").onclick = () => salvarEntrega(id);
  document.getElementById("mEntCliente")?.focus();
}

async function salvarEntrega(id) {
  const cliente = document.getElementById("mEntCliente").value.trim();
  if (!cliente) { window.mostrarToast?.("Informe o nome do cliente.", "error"); return; }

  const dados = {
    cliente,
    local: document.getElementById("mEntLocal").value.trim(),
    data: document.getElementById("mEntData").value || hojeISO(),
    horaSaida: document.getElementById("mEntSaida").value,
    horaVolta: document.getElementById("mEntVolta").value
  };

  const btn = document.getElementById("btnSalvarEntrega");
  btn.disabled = true; btn.textContent = "Salvando...";

  try {
    if (id) {
      await updateDoc(doc(db, COL_ENTREGAS, id), { ...dados, atualizadoEm: serverTimestamp() });
    } else {
      await addDoc(collection(db, COL_ENTREGAS), {
        ...dados,
        criadoPor: _usuario?.uid || null,
        criadoPorNome: _dadosUsuario?.nome || "—",
        criadoEm: serverTimestamp()
      });
    }
    window.fecharModal();
    window.mostrarToast?.(id ? "Entrega atualizada com sucesso!" : "Entrega cadastrada com sucesso!", "success");
    carregarListaEntregas();
  } catch (err) {
    console.error(err);
    window.mostrarToast?.("Erro ao salvar entrega.", "error");
    btn.disabled = false; btn.textContent = id ? "Salvar Alterações" : "Salvar Entrega";
  }
}

function confirmarExcluirEntrega(id, cliente) {
  window.abrirModal("Excluir Entrega", `
    <p>Tem certeza que deseja excluir a entrega de "<strong>${escHtml(cliente)}</strong>"?</p>
  `, `
    <button class="btn-ghost" id="btnCancExclEnt">Cancelar</button>
    <button class="btn-primary" style="background:#DC2626;border-color:#DC2626" id="btnConfExclEnt">Excluir</button>
  `);
  document.getElementById("btnCancExclEnt").onclick = () => window.fecharModal();
  document.getElementById("btnConfExclEnt").onclick = async () => {
    try {
      await deleteDoc(doc(db, COL_ENTREGAS, id));
      window.fecharModal();
      window.mostrarToast?.("Entrega excluída.", "success");
      carregarListaEntregas();
    } catch (err) {
      console.error(err);
      window.mostrarToast?.("Erro ao excluir entrega.", "error");
    }
  };
}
