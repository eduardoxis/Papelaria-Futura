// ============================================================
// entrega.js — Módulo Entrega — Papelaria Futura
// Seção própria (igual Caixa, Comissão etc.) pra controlar
// saídas/entregas: cliente, local, data, hora de saída e volta.
// ============================================================
import {
  collection, doc, addDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { escHtml } from "./index.js";
import { temCargo } from "./auth.js";

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

  document.getElementById("tabEntregaLista")?.addEventListener("click", () => trocarAbaEntrega("lista"));
  document.getElementById("tabEntregaDashboard")?.addEventListener("click", () => trocarAbaEntrega("dashboard"));

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
    const restricoes = [orderBy("data", "desc")];
    // A consulta também precisa respeitar a regra do Firestore: sem isso
    // o banco recusa uma tentativa de buscar entregas de outras pessoas.
    if (!temCargo(_dadosUsuario, "admin")) {
      restricoes.unshift(where("criadoPor", "==", _usuario?.uid || ""));
    }
    const snap = await getDocs(query(collection(db, COL_ENTREGAS), ...restricoes));
    _entregasCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("Erro ao carregar entregas:", err);
    window.mostrarToast?.("Erro ao carregar entregas.", "error");
    _entregasCache = [];
  }
  renderizarTabelaEntrega();
  renderizarIndicadoresEntrega();
  renderizarDashboardEntrega();
}

function trocarAbaEntrega(aba) {
  document.getElementById("tabEntregaLista")?.classList.toggle("prom-tab--active", aba === "lista");
  document.getElementById("tabEntregaDashboard")?.classList.toggle("prom-tab--active", aba === "dashboard");
  document.getElementById("tabEntregaLista")?.setAttribute("aria-selected", String(aba === "lista"));
  document.getElementById("tabEntregaDashboard")?.setAttribute("aria-selected", String(aba === "dashboard"));
  document.getElementById("entregaListaPanel").hidden = aba !== "lista";
  document.getElementById("entregaDashboardPanel").hidden = aba !== "dashboard";
  if (aba === "dashboard") renderizarDashboardEntrega();
}

// ----------------------------------------------------------------
// Indicadores (cards do topo)
// ----------------------------------------------------------------
function minutosEntre(saida, volta) {
  if (!saida || !volta) return null;
  const [hS, mS] = saida.split(":").map(Number);
  const [hV, mV] = volta.split(":").map(Number);
  if ([hS, mS, hV, mV].some(Number.isNaN)) return null;
  const diff = (hV * 60 + mV) - (hS * 60 + mS);
  return diff > 0 ? diff : null;
}

function renderizarIndicadoresEntrega() {
  const hoje = hojeISO();
  const inicioSemana = new Date();
  inicioSemana.setDate(inicioSemana.getDate() - 6);
  const inicioSemanaISO = isoDeData(inicioSemana);

  const total = _entregasCache.length;
  const hojeQtd = _entregasCache.filter(en => en.data === hoje).length;
  const semanaQtd = _entregasCache.filter(en => en.data >= inicioSemanaISO && en.data <= hoje).length;

  const duracoes = _entregasCache.map(en => minutosEntre(en.horaSaida, en.horaVolta)).filter(v => v !== null);
  const mediaMin = duracoes.length ? Math.round(duracoes.reduce((s, v) => s + v, 0) / duracoes.length) : null;
  const tempoMedioTxto = mediaMin === null ? "—" : `${Math.floor(mediaMin / 60)}h ${String(mediaMin % 60).padStart(2, "0")}min`;

  const elTotal = document.getElementById("entIndTotal");
  const elHoje = document.getElementById("entIndHoje");
  const elSemana = document.getElementById("entIndSemana");
  const elTempo = document.getElementById("entIndTempoMedio");
  if (elTotal) elTotal.textContent = total;
  if (elHoje) elHoje.textContent = hojeQtd;
  if (elSemana) elSemana.textContent = semanaQtd;
  if (elTempo) elTempo.textContent = tempoMedioTxto;
}

// ----------------------------------------------------------------
// Dashboard (gráfico + ranking de clientes)
// ----------------------------------------------------------------
let _chartEntregasDias = null;

function renderizarDashboardEntrega() {
  const canvas = document.getElementById("chartEntregasDias");
  if (canvas && window.Chart) {
    const dias = [];
    const contagem = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = isoDeData(d);
      dias.push(`${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`);
      contagem.push(_entregasCache.filter(en => en.data === iso).length);
    }

    if (_chartEntregasDias) _chartEntregasDias.destroy();
    _chartEntregasDias = new window.Chart(canvas, {
      type: "bar",
      data: {
        labels: dias,
        datasets: [{
          label: "Entregas",
          data: contagem,
          backgroundColor: "#0038B8",
          borderRadius: 4,
          maxBarThickness: 28
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  const tbody = document.getElementById("tbodyRankingClientesEntrega");
  if (!tbody) return;

  const porCliente = {};
  _entregasCache.forEach(en => {
    const nome = en.cliente || "—";
    porCliente[nome] = (porCliente[nome] || 0) + 1;
  });
  const ranking = Object.entries(porCliente).sort((a, b) => b[1] - a[1]).slice(0, 10);

  if (ranking.length === 0) {
    tbody.innerHTML = `<tr><td colspan="2" class="empty-cell">Nenhuma entrega cadastrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = ranking.map(([nome, qtd]) => `
    <tr>
      <td><strong>${escHtml(nome)}</strong></td>
      <td class="col-right">${qtd}</td>
    </tr>
  `).join("");
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

function isoDeData(d) {
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
