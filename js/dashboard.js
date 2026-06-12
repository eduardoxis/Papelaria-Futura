// ============================================================
// dashboard.js — Lógica do painel principal
// ============================================================

import { buscarEstatisticas, formatarMoeda, formatarData } from "./database.js";

let _usuario = null;
let _dadosUsuario = null;

export function iniciarDashboard(usuario, dadosUsuario) {
  _usuario      = usuario;
  _dadosUsuario = dadosUsuario;

  // Carregar ao navegar para dashboard
  document.addEventListener("navegacao", (e) => {
    if (e.detail.page === "dashboard") carregarDashboard();
  });

  // Botão atualizar
  document.getElementById("btnAtualizarDash")?.addEventListener("click", carregarDashboard);

  // Links "Ver todas"
  document.querySelectorAll(".link-ver-todas").forEach(el => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      window.navegar?.(el.dataset.page || "cotacoes");
    });
  });

  // Carga inicial
  carregarDashboard();
}

async function carregarDashboard() {
  const isAdmin = _dadosUsuario?.role === "admin";
  const uid     = _usuario?.uid;

  // Skeleton
  definirEstatisticas("—", "—", "—", "—");
  document.getElementById("tbodyUltimas").innerHTML =
    `<tr><td colspan="5" class="loading-cell">Carregando...</td></tr>`;

  const resultado = await buscarEstatisticas(uid, isAdmin);

  if (!resultado.sucesso) {
    mostrarToast?.("Erro ao carregar dados.", "error");
    return;
  }

  const { totalCotacoes, valorTotalGeral, cotacoesMes, ultimas } = resultado;

  // Atualizar cards
  definirEstatisticas(
    totalCotacoes,
    formatarMoeda(valorTotalGeral),
    cotacoesMes,
    new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })
  );

  // Tabela de últimas
  renderizarUltimas(ultimas);
}

function definirEstatisticas(total, valor, mes, acesso) {
  document.getElementById("statTotal").textContent  = total;
  document.getElementById("statValor").textContent  = valor;
  document.getElementById("statMes").textContent    = mes;
  document.getElementById("statAcesso").textContent = acesso;
}

function renderizarUltimas(cotacoes) {
  const tbody = document.getElementById("tbodyUltimas");

  if (!cotacoes || cotacoes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">Nenhuma cotação cadastrada ainda.</td></tr>`;
    return;
  }

  tbody.innerHTML = cotacoes.map(c => `
    <tr>
      <td><strong>${escHtml(c.cliente || "—")}</strong></td>
      <td>${formatarData(c.dataCriacao)}</td>
      <td class="col-right"><strong>${formatarMoeda(c.valorTotal)}</strong></td>
      <td>${badgeStatus(c.status)}</td>
      <td class="col-center">
        <div style="display:flex;gap:6px;justify-content:center">
          <button class="btn-action btn-action--edit" onclick="window.editarCotacaoById('${c.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
            Editar
          </button>
          <button class="btn-action btn-action--pdf" onclick="window.gerarPDFById('${c.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clip-rule="evenodd"/></svg>
            PDF
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

// ----------------------------------------------------------------
// Utilitários compartilhados
// ----------------------------------------------------------------
export function badgeStatus(status) {
  const map = {
    ativa:     ["badge--ativa",    "Ativa"],
    aprovada:  ["badge--aprovada", "Aprovada"],
    recusada:  ["badge--recusada", "Recusada"],
    expirada:  ["badge--expirada", "Expirada"]
  };
  const [cls, label] = map[status] || ["badge--expirada", status || "—"];
  return `<span class="badge ${cls}">${label}</span>`;
}

export function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
