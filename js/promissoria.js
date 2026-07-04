// ============================================================
// promissoria.js — Módulo de Promissórias (somente admin)
// Papelaria Futura
// ============================================================

import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy,
  serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { formatarMoeda } from "./database.js";
import { temCargo } from "./auth.js";

// ── Constantes ──────────────────────────────────────────────
const COL_CLIENTES     = "prom_clientes";
const COL_COMPRAS      = "prom_compras";
const COL_PAGAMENTOS   = "prom_pagamentos";

// Juros: 2% ao mês sobre saldo devedor (com base na planilha)
const JUROS_MENSAL     = 0.02;

let _dadosUsuario = null;

// ── Inicialização ───────────────────────────────────────────
export function iniciarPromissoria(usuario, dadosUsuario) {
  _dadosUsuario = dadosUsuario;

  document.addEventListener("navegacao", (e) => {
    if (e.detail.page === "promissoria") {
      if (!temCargo(_dadosUsuario, "admin")) {
        window.navegar?.("dashboard");
        window.mostrarToast?.("Acesso restrito a administradores.", "error");
        return;
      }
      carregarPromissoriaPage();
    }
  });

  // Botão novo cliente
  document.getElementById("btnNovoClienteProm")?.addEventListener("click", abrirModalNovoCliente);

  // Abas Clientes / Dashboard
  document.getElementById("tabPromClientes")?.addEventListener("click", () => trocarAbaProm("clientes"));
  document.getElementById("tabPromDashboard")?.addEventListener("click", () => trocarAbaProm("dashboard"));
  document.getElementById("btnAtualizarDashProm")?.addEventListener("click", carregarDashboardProm);

  // Filtros da listagem
  document.getElementById("btnBuscarProm")?.addEventListener("click", () => {
    const termo = document.getElementById("filtroBuscaProm").value.trim();
    const status = document.getElementById("filtroStatusProm").value;
    carregarListaClientes(termo, status);
  });

  document.getElementById("btnLimparBuscaProm")?.addEventListener("click", () => {
    document.getElementById("filtroBuscaProm").value = "";
    document.getElementById("filtroStatusProm").value = "todos";
    carregarListaClientes();
  });

  document.getElementById("filtroBuscaProm")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const termo = e.target.value.trim();
      const status = document.getElementById("filtroStatusProm").value;
      carregarListaClientes(termo, status);
    }
  });

  // Botão voltar ao painel
  document.getElementById("btnVoltarListaProm")?.addEventListener("click", () => {
    mostrarPainel("lista");
    carregarListaClientes();
  });

  // Event delegation na tabela de clientes
  document.getElementById("tbodyClientesProm")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === "ver-cliente") abrirPainelCliente(id);
    if (action === "excluir-cliente") confirmarExcluirCliente(id);
  });

  // Event delegation no painel de cliente
  document.getElementById("painelDetalhesClienteProm")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    // clienteId pode vir do botão ou do container pai do painel
    const clienteId = btn.dataset.clienteId
      || btn.closest("[data-cliente-id]")?.dataset.clienteId
      || document.getElementById("painelDetalhesClienteProm")?.dataset.clienteId;
    if (action === "nova-compra")      abrirModalNovaCompra(clienteId);
    if (action === "novo-pagamento")   abrirModalNovoPagamento(clienteId);
    if (action === "excluir-compra")   confirmarExcluirCompra(id);
    if (action === "imprimir-cliente") imprimirCliente(clienteId);
  });

  // Botões de relatório/exportação
  document.getElementById("btnExportarProm")?.addEventListener("click", exportarRelatorio);
  document.getElementById("btnImprimirProm")?.addEventListener("click", imprimirRelatorio);
  document.getElementById("btnImportarCsvProm")?.addEventListener("click", () => {
    document.getElementById("inputImportarCsvProm").click();
  });
  document.getElementById("inputImportarCsvProm")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importarCSV(file);
    e.target.value = ""; // reset para permitir reimportar mesmo arquivo
  });
}

// ── Navegação interna ────────────────────────────────────────
function mostrarPainel(painel) {
  document.getElementById("painelListaClientesProm").hidden   = painel !== "lista";
  document.getElementById("painelDetalhesClienteProm").hidden = painel !== "detalhes";
  document.getElementById("painelDashboardProm").hidden       = painel !== "dashboard";
}

// ── Abas Clientes / Dashboard ─────────────────────────────────
function trocarAbaProm(aba) {
  const tabClientes  = document.getElementById("tabPromClientes");
  const tabDashboard = document.getElementById("tabPromDashboard");

  tabClientes.classList.toggle("prom-tab--active", aba === "clientes");
  tabDashboard.classList.toggle("prom-tab--active", aba === "dashboard");
  tabClientes.setAttribute("aria-selected", aba === "clientes");
  tabDashboard.setAttribute("aria-selected", aba === "dashboard");

  if (aba === "dashboard") {
    mostrarPainel("dashboard");
    carregarDashboardProm();
  } else {
    mostrarPainel("lista");
    carregarListaClientes();
  }
}

// ── Carregamento inicial da página ───────────────────────────
async function carregarPromissoriaPage() {
  mostrarPainel("lista");
  await Promise.all([carregarIndicadores(), carregarListaClientes()]);
}

// ── Indicadores financeiros ──────────────────────────────────
async function carregarIndicadores() {
  const el = id => document.getElementById(id);
  ["indTotalVendido","indTotalRecebido","indTotalAberto","indInadimplentes","indClientesTotal"].forEach(i => {
    const e = el(i); if (e) e.textContent = "—";
  });

  try {
    const [clientes, compras, pagamentos] = await Promise.all([
      getDocs(collection(db, COL_CLIENTES)),
      getDocs(collection(db, COL_COMPRAS)),
      getDocs(collection(db, COL_PAGAMENTOS))
    ]);

    const hoje = new Date();
    let totalVendido = 0, totalRecebido = 0, inadimplentes = 0;
    const saldoPorCliente = {};

    compras.forEach(d => {
      const c = d.data();
      totalVendido += c.valor || 0;
      if (!saldoPorCliente[c.clienteId]) saldoPorCliente[c.clienteId] = { compras: 0, pagamentos: 0, vencido: false };
      saldoPorCliente[c.clienteId].compras += c.valor || 0;
      if (c.vencimento) {
        const venc = c.vencimento.toDate?.() || new Date(c.vencimento);
        if (venc < hoje) saldoPorCliente[c.clienteId].vencido = true;
      }
    });

    pagamentos.forEach(d => {
      const p = d.data();
      totalRecebido += p.valor || 0;
      if (!saldoPorCliente[p.clienteId]) saldoPorCliente[p.clienteId] = { compras: 0, pagamentos: 0, vencido: false };
      saldoPorCliente[p.clienteId].pagamentos += p.valor || 0;
    });

    Object.values(saldoPorCliente).forEach(c => {
      const saldo = c.compras - c.pagamentos;
      if (saldo > 0 && c.vencido) inadimplentes++;
    });

    const totalAberto = totalVendido - totalRecebido;

    if (el("indTotalVendido"))   el("indTotalVendido").textContent   = formatarMoeda(totalVendido);
    if (el("indTotalRecebido"))  el("indTotalRecebido").textContent  = formatarMoeda(totalRecebido);
    if (el("indTotalAberto"))    el("indTotalAberto").textContent    = formatarMoeda(Math.max(0, totalAberto));
    if (el("indInadimplentes"))  el("indInadimplentes").textContent  = inadimplentes;
    if (el("indClientesTotal"))  el("indClientesTotal").textContent  = clientes.size;

  } catch (err) {
    console.error("Erro ao carregar indicadores:", err);
  }
}

// ============================================================
// DASHBOARD — gráficos (estilo Power BI) com dados da Promissória
// ============================================================

// Paleta de cores no estilo Power BI
const PROM_CORES = {
  azul:     "#118DFF",
  azulEsc:  "#002D94",
  verde:    "#10B981",
  amarelo:  "#F2C80F",
  vermelho: "#E54957",
  roxo:     "#7C3AED",
  cinza:    "#94A3B8",
  laranja:  "#FD625E"
};

const _promCharts = {}; // guarda instâncias do Chart.js para destruir/recriar

function _destruirChart(id) {
  if (_promCharts[id]) {
    _promCharts[id].destroy();
    delete _promCharts[id];
  }
}

async function carregarDashboardProm() {
  if (typeof Chart === "undefined") {
    console.error("Chart.js não carregado.");
    return;
  }

  const el = id => document.getElementById(id);
  ["dashIndVendido","dashIndRecebido","dashIndAberto","dashIndTicket","dashIndInadimplencia"].forEach(i => {
    const e = el(i); if (e) e.textContent = "—";
  });

  try {
    const [clientesSnap, comprasSnap, pagamentosSnap] = await Promise.all([
      getDocs(collection(db, COL_CLIENTES)),
      getDocs(collection(db, COL_COMPRAS)),
      getDocs(collection(db, COL_PAGAMENTOS))
    ]);

    const hoje = new Date();

    const compras = [];
    comprasSnap.forEach(d => compras.push({ id: d.id, ...d.data() }));

    const pagamentos = [];
    pagamentosSnap.forEach(d => pagamentos.push({ id: d.id, ...d.data() }));

    const clientes = [];
    clientesSnap.forEach(d => clientes.push({ id: d.id, ...d.data() }));

    // ── KPIs ──────────────────────────────────────────────────
    const totalVendido   = compras.reduce((s, c) => s + (c.valor || 0), 0);
    const totalRecebido  = pagamentos.reduce((s, p) => s + (p.valor || 0), 0);
    const totalAberto    = Math.max(0, totalVendido - totalRecebido);
    const ticketMedio    = compras.length ? totalVendido / compras.length : 0;

    // ── Situação por cliente (para inadimplência e gráfico de pizza) ──
    const saldoPorCliente = {};
    compras.forEach(c => {
      if (!saldoPorCliente[c.clienteId]) saldoPorCliente[c.clienteId] = { compras: 0, pagamentos: 0, vencido: false };
      saldoPorCliente[c.clienteId].compras += c.valor || 0;
      if (c.vencimento) {
        const venc = c.vencimento.toDate?.() || new Date(c.vencimento);
        if (venc < hoje) saldoPorCliente[c.clienteId].vencido = true;
      }
    });
    pagamentos.forEach(p => {
      if (!saldoPorCliente[p.clienteId]) saldoPorCliente[p.clienteId] = { compras: 0, pagamentos: 0, vencido: false };
      saldoPorCliente[p.clienteId].pagamentos += p.valor || 0;
    });

    let quitados = 0, pendentes = 0, atrasados = 0;
    clientes.forEach(c => {
      const s = saldoPorCliente[c.id] || { compras: 0, pagamentos: 0, vencido: false };
      const saldo = s.compras - s.pagamentos;
      if (saldo <= 0) quitados++;
      else if (s.vencido) atrasados++;
      else pendentes++;
    });

    const inadimplencia = clientes.length ? (atrasados / clientes.length) * 100 : 0;

    if (el("dashIndVendido"))      el("dashIndVendido").textContent      = formatarMoeda(totalVendido);
    if (el("dashIndRecebido"))     el("dashIndRecebido").textContent     = formatarMoeda(totalRecebido);
    if (el("dashIndAberto"))       el("dashIndAberto").textContent       = formatarMoeda(totalAberto);
    if (el("dashIndTicket"))       el("dashIndTicket").textContent       = formatarMoeda(ticketMedio);
    if (el("dashIndInadimplencia")) el("dashIndInadimplencia").textContent = inadimplencia.toFixed(1) + "%";

    // ── Gráfico 1: Vendas x Recebimentos (últimos 6 meses) ─────
    const meses6 = _ultimosMeses(6);
    const vendasPorMes6 = meses6.map(m => _somaPorMes(compras, "dataCompra", m));
    const recebPorMes6  = meses6.map(m => _somaPorMes(pagamentos, "dataPagamento", m));

    _destruirChart("chartEvolucao");
    _promCharts.chartEvolucao = new Chart(el("chartEvolucao"), {
      type: "bar",
      data: {
        labels: meses6.map(m => m.label),
        datasets: [
          { label: "Vendido",   data: vendasPorMes6, backgroundColor: PROM_CORES.azul,  borderRadius: 4 },
          { label: "Recebido",  data: recebPorMes6,  backgroundColor: PROM_CORES.verde, borderRadius: 4 }
        ]
      },
      options: _opcoesBase({
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => formatarMoeda(v) } }
        }
      })
    });

    // ── Gráfico 2: Situação dos clientes (donut) ───────────────
    _destruirChart("chartSituacao");
    _promCharts.chartSituacao = new Chart(el("chartSituacao"), {
      type: "doughnut",
      data: {
        labels: ["Quitado", "Pendente", "Atrasado"],
        datasets: [{
          data: [quitados, pendentes, atrasados],
          backgroundColor: [PROM_CORES.verde, PROM_CORES.amarelo, PROM_CORES.vermelho],
          borderWidth: 0
        }]
      },
      options: _opcoesBase({ cutout: "65%", scales: undefined })
    });

    // ── Gráfico 3: Recebimentos por forma de pagamento (pizza) ──
    const porForma = {};
    pagamentos.forEach(p => {
      const f = p.forma || "Não informado";
      porForma[f] = (porForma[f] || 0) + (p.valor || 0);
    });
    const formasLabels = Object.keys(porForma);
    const formasValores = formasLabels.map(f => porForma[f]);

    _destruirChart("chartFormaPagamento");
    _promCharts.chartFormaPagamento = new Chart(el("chartFormaPagamento"), {
      type: "pie",
      data: {
        labels: formasLabels.length ? formasLabels : ["Sem dados"],
        datasets: [{
          data: formasValores.length ? formasValores : [1],
          backgroundColor: [PROM_CORES.azul, PROM_CORES.verde, PROM_CORES.amarelo, PROM_CORES.roxo, PROM_CORES.laranja, PROM_CORES.cinza],
          borderWidth: 0
        }]
      },
      options: _opcoesBase({ scales: undefined })
    });

    // ── Gráfico 4: Top 10 clientes por saldo devedor (barra horizontal) ──
    const nomePorId = {};
    clientes.forEach(c => nomePorId[c.id] = c.nome || "—");

    const devedores = Object.entries(saldoPorCliente)
      .map(([id, s]) => ({ nome: nomePorId[id] || "—", saldo: s.compras - s.pagamentos }))
      .filter(d => d.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 10);

    _destruirChart("chartTopDevedores");
    _promCharts.chartTopDevedores = new Chart(el("chartTopDevedores"), {
      type: "bar",
      data: {
        labels: devedores.map(d => d.nome),
        datasets: [{ label: "Saldo Devedor", data: devedores.map(d => d.saldo), backgroundColor: PROM_CORES.vermelho, borderRadius: 4 }]
      },
      options: _opcoesBase({
        indexAxis: "y",
        scales: {
          x: { beginAtZero: true, ticks: { callback: v => formatarMoeda(v) } }
        }
      })
    });

    // ── Gráfico 5: Novas compras por mês (últimos 12 meses) ─────
    const meses12 = _ultimosMeses(12);
    const comprasPorMes12 = meses12.map(m => _contagemPorMes(compras, "dataCompra", m));

    _destruirChart("chartComprasMes");
    _promCharts.chartComprasMes = new Chart(el("chartComprasMes"), {
      type: "line",
      data: {
        labels: meses12.map(m => m.label),
        datasets: [{
          label: "Compras",
          data: comprasPorMes12,
          borderColor: PROM_CORES.azulEsc,
          backgroundColor: "rgba(0,45,148,0.1)",
          tension: 0.35,
          fill: true,
          pointRadius: 3
        }]
      },
      options: _opcoesBase({
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      })
    });

  } catch (err) {
    console.error("Erro ao carregar dashboard:", err);
    window.mostrarToast?.("Erro ao carregar dashboard.", "error");
  }
}

// Opções padrão dos gráficos (visual clean, estilo Power BI)
function _opcoesBase(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label || ctx.label}: ${formatarMoeda(ctx.raw)}` } }
    },
    ...extra
  };
}

// Gera os últimos N meses (mais antigo → mais recente) com label "mmm/aa"
function _ultimosMeses(n) {
  const hoje = new Date();
  const lista = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    lista.push({
      ano: d.getFullYear(),
      mes: d.getMonth(),
      label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "")
    });
  }
  return lista;
}

function _somaPorMes(lista, campoData, mesRef) {
  return lista.reduce((soma, item) => {
    const data = item[campoData]?.toDate?.() || (item[campoData] ? new Date(item[campoData]) : null);
    if (!data) return soma;
    if (data.getFullYear() === mesRef.ano && data.getMonth() === mesRef.mes) {
      return soma + (item.valor || 0);
    }
    return soma;
  }, 0);
}

function _contagemPorMes(lista, campoData, mesRef) {
  return lista.reduce((cont, item) => {
    const data = item[campoData]?.toDate?.() || (item[campoData] ? new Date(item[campoData]) : null);
    if (!data) return cont;
    if (data.getFullYear() === mesRef.ano && data.getMonth() === mesRef.mes) {
      return cont + 1;
    }
    return cont;
  }, 0);
}

// ── Listagem de clientes ─────────────────────────────────────
async function carregarListaClientes(busca = "", filtroStatus = "todos") {
  const tbody = document.getElementById("tbodyClientesProm");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Carregando...</td></tr>`;

  try {
    const [clientesSnap, comprasSnap, pagamentosSnap] = await Promise.all([
      getDocs(query(collection(db, COL_CLIENTES), orderBy("nome"))),
      getDocs(collection(db, COL_COMPRAS)),
      getDocs(collection(db, COL_PAGAMENTOS))
    ]);

    const hoje = new Date();

    // Mapas agregados
    const comprasPorCliente    = {};
    const pagamentosPorCliente = {};
    const vencidoPorCliente    = {};

    comprasSnap.forEach(d => {
      const c = d.data();
      if (!comprasPorCliente[c.clienteId]) comprasPorCliente[c.clienteId] = { total: 0, qtd: 0 };
      comprasPorCliente[c.clienteId].total += c.valor || 0;
      comprasPorCliente[c.clienteId].qtd++;
      if (c.vencimento) {
        const venc = c.vencimento.toDate?.() || new Date(c.vencimento);
        if (venc < hoje) vencidoPorCliente[c.clienteId] = true;
      }
    });

    pagamentosSnap.forEach(d => {
      const p = d.data();
      if (!pagamentosPorCliente[p.clienteId]) pagamentosPorCliente[p.clienteId] = 0;
      pagamentosPorCliente[p.clienteId] += p.valor || 0;
    });

    let clientes = [];
    clientesSnap.forEach(d => {
      const data = d.data();
      const totalComprado = comprasPorCliente[d.id]?.total || 0;
      const qtdCompras    = comprasPorCliente[d.id]?.qtd   || 0;
      const totalPago     = pagamentosPorCliente[d.id]      || 0;
      const saldo         = totalComprado - totalPago;
      const vencido       = vencidoPorCliente[d.id] || false;

      let situacao = "Quitado";
      if (saldo > 0) situacao = vencido ? "Atrasado" : "Pendente";

      clientes.push({ id: d.id, ...data, totalComprado, qtdCompras, totalPago, saldo, situacao });
    });

    // Filtros
    if (busca) {
      const b = busca.toLowerCase();
      clientes = clientes.filter(c => c.nome?.toLowerCase().includes(b) || c.telefone?.toLowerCase().includes(b));
    }
    if (filtroStatus !== "todos") {
      clientes = clientes.filter(c => c.situacao.toLowerCase() === filtroStatus.toLowerCase());
    }

    if (!clientes.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">Nenhum cliente encontrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = clientes.map(c => {
      const badge = badgeSituacao(c.situacao);
      return `
        <tr>
          <td data-label="Cliente"><strong>${escHtml(c.nome)}</strong>${c.telefone ? `<br><span style="font-size:var(--text-xs);color:var(--gray-500)">${escHtml(c.telefone)}</span>` : ""}</td>
          <td class="col-center" data-label="Compras">${c.qtdCompras}</td>
          <td data-label="Total Comprado">${formatarMoeda(c.totalComprado)}</td>
          <td data-label="Total Pago">${formatarMoeda(c.totalPago)}</td>
          <td data-label="Saldo Devedor"><strong style="color:${c.saldo > 0 ? 'var(--color-danger)' : 'var(--color-success)'}">${formatarMoeda(Math.max(0, c.saldo))}</strong></td>
          <td data-label="Situação">${badge}</td>
          <td class="col-center td-actions-prom">
            <div class="actions-cell">
              <button class="btn-table-action btn-table-action--view" data-action="ver-cliente" data-id="${c.id}" title="Ver detalhes">
                <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
              </button>
              <button class="btn-table-action btn-table-action--delete" data-action="excluir-cliente" data-id="${c.id}" title="Excluir cliente">
                <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
    }).join("");

  } catch (err) {
    console.error("Erro ao carregar clientes:", err);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">Erro ao carregar dados.</td></tr>`;
  }
}

// ── Painel de detalhes do cliente ────────────────────────────
async function abrirPainelCliente(clienteId) {
  mostrarPainel("detalhes");
  const painel = document.getElementById("painelDetalhesClienteProm");
  painel.dataset.clienteId = clienteId;
  painel.innerHTML = `<div class="loading-cell" style="padding:40px;text-align:center">Carregando...</div>`;

  try {
    const [clienteSnap, comprasSnap, pagamentosSnap] = await Promise.all([
      getDoc(doc(db, COL_CLIENTES, clienteId)),
      getDocs(query(collection(db, COL_COMPRAS), where("clienteId", "==", clienteId), orderBy("dataCompra", "desc"))),
      getDocs(query(collection(db, COL_PAGAMENTOS), where("clienteId", "==", clienteId), orderBy("dataPagamento", "desc")))
    ]);

    if (!clienteSnap.exists()) {
      painel.innerHTML = `<div class="empty-cell">Cliente não encontrado.</div>`;
      return;
    }

    const cliente = { id: clienteSnap.id, ...clienteSnap.data() };
    const hoje    = new Date();

    let compras    = [];
    let totalComprado = 0;
    comprasSnap.forEach(d => {
      const c = { id: d.id, ...d.data() };
      totalComprado += c.valor || 0;
      compras.push(c);
    });

    let pagamentos = [];
    let totalPago  = 0;
    const pagoPorCompra = {};
    pagamentosSnap.forEach(d => {
      const p = { id: d.id, ...d.data() };
      totalPago += p.valor || 0;
      if (p.compraId) pagoPorCompra[p.compraId] = (pagoPorCompra[p.compraId] || 0) + (p.valor || 0);
      pagamentos.push(p);
    });

    let saldo = totalComprado - totalPago;

    // Calcular juros sobre compras atrasadas + saldo individual de cada compra
    let totalJuros = 0;
    compras = compras.map(c => {
      const pagoCompra  = pagoPorCompra[c.id] || 0;
      const saldoCompra = Math.max(0, (c.valor || 0) - pagoCompra);
      if (!c.vencimento) return { ...c, juros: 0, valorComJuros: c.valor, pagoCompra, saldoCompra };
      const venc = c.vencimento.toDate?.() || new Date(c.vencimento);
      if (venc >= hoje) return { ...c, juros: 0, valorComJuros: c.valor, pagoCompra, saldoCompra };
      const mesesAtraso = Math.max(0, Math.floor((hoje - venc) / (30.44 * 24 * 3600 * 1000)));
      const juros = (c.valor || 0) * JUROS_MENSAL * mesesAtraso;
      totalJuros += juros;
      return { ...c, juros, valorComJuros: (c.valor || 0) + juros, mesesAtraso, pagoCompra, saldoCompra };
    });

    const saldoComJuros = Math.max(0, saldo + totalJuros);

    // Determinar situação
    let situacao = "Quitado";
    if (saldo > 0) {
      const temAtrasada = compras.some(c => {
        if (!c.vencimento) return false;
        const v = c.vencimento.toDate?.() || new Date(c.vencimento);
        return v < hoje;
      });
      situacao = temAtrasada ? "Atrasado" : "Pendente";
    }

    painel.innerHTML = `
      <div data-cliente-id="${clienteId}">
        <!-- Cabeçalho do cliente -->
        <div class="page-header">
          <div>
            <h2 class="page-title">${escHtml(cliente.nome)}</h2>
            <p class="page-subtitle">
              ${cliente.telefone ? `📱 ${escHtml(cliente.telefone)}` : ""}
              ${cliente.observacoes ? ` · ${escHtml(cliente.observacoes)}` : ""}
            </p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-secondary" data-action="imprimir-cliente" data-cliente-id="${clienteId}">
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9v-1h8v1H6zm8-4a1 1 0 11-2 0 1 1 0 012 0z" clip-rule="evenodd"/></svg>
              Imprimir
            </button>
            <button class="btn-secondary" data-action="novo-pagamento" data-cliente-id="${clienteId}">
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clip-rule="evenodd"/></svg>
              Registrar Pagamento
            </button>
            <button class="btn-primary" data-action="nova-compra" data-cliente-id="${clienteId}">
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
              Nova Compra
            </button>
          </div>
        </div>

        <!-- Cards resumo financeiro -->
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:var(--space-6)">
          <div class="stat-card stat-card--blue">
            <div class="stat-card__icon"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4z" clip-rule="evenodd"/></svg></div>
            <div class="stat-card__body">
              <span class="stat-card__label">Total Comprado</span>
              <strong class="stat-card__value stat-card__value--sm">${formatarMoeda(totalComprado)}</strong>
            </div>
          </div>
          <div class="stat-card stat-card--green">
            <div class="stat-card__icon"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clip-rule="evenodd"/></svg></div>
            <div class="stat-card__body">
              <span class="stat-card__label">Total Pago</span>
              <strong class="stat-card__value stat-card__value--sm">${formatarMoeda(totalPago)}</strong>
            </div>
          </div>
          <div class="stat-card ${saldo > 0 ? 'stat-card--gold' : 'stat-card--green'}">
            <div class="stat-card__icon"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg></div>
            <div class="stat-card__body">
              <span class="stat-card__label">Saldo Devedor</span>
              <strong class="stat-card__value stat-card__value--sm">${formatarMoeda(Math.max(0, saldo))}</strong>
            </div>
          </div>
          ${totalJuros > 0 ? `
          <div class="stat-card" style="border-color:#FECACA">
            <div class="stat-card__icon" style="background:#FEE2E2;color:#DC2626"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg></div>
            <div class="stat-card__body">
              <span class="stat-card__label">Juros Acumulados</span>
              <strong class="stat-card__value stat-card__value--sm" style="color:#DC2626">${formatarMoeda(totalJuros)}</strong>
            </div>
          </div>
          <div class="stat-card" style="border-color:#FECACA">
            <div class="stat-card__icon" style="background:#FEE2E2;color:#DC2626"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clip-rule="evenodd"/></svg></div>
            <div class="stat-card__body">
              <span class="stat-card__label">Total c/ Juros</span>
              <strong class="stat-card__value stat-card__value--sm" style="color:#DC2626">${formatarMoeda(saldoComJuros)}</strong>
            </div>
          </div>` : ""}
        </div>

        <!-- Situação badge -->
        <div style="margin-bottom:var(--space-6);display:flex;align-items:center;gap:12px">
          <span style="font-size:var(--text-sm);color:var(--gray-500);font-weight:500">Situação atual:</span>
          ${badgeSituacao(situacao)}
          ${totalJuros > 0 ? `<span style="font-size:var(--text-xs);color:#DC2626;font-weight:500">· Juros de 2% a.m. aplicados sobre ${compras.filter(c=>c.mesesAtraso>0).length} compra(s) em atraso</span>` : ""}
        </div>

        <!-- Histórico de Compras -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-section-title" style="margin:0">Histórico de Compras</h3>
            <span style="font-size:var(--text-sm);color:var(--gray-500)">${compras.length} compra(s)</span>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Data da Compra</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Juros</th>
                  <th>Total c/ Juros</th>
                  <th>Pago</th>
                  <th>Saldo</th>
                  <th>Status</th>
                  <th>Obs.</th>
                  <th class="col-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${compras.length === 0
                  ? `<tr><td colspan="10" class="empty-cell">Nenhuma compra registrada.</td></tr>`
                  : compras.map(c => {
                    const venc = c.vencimento ? (c.vencimento.toDate?.() || new Date(c.vencimento)) : null;
                    const atrasada = venc && venc < hoje;
                    const statusCompra = atrasada ? "Atrasado" : (venc ? "Pendente" : "—");
                    return `
                      <tr>
                        <td>${formatarDataLocal(c.dataCompra)}</td>
                        <td>${formatarMoeda(c.valor)}</td>
                        <td>${venc ? formatarDataLocal(c.vencimento) : "—"}</td>
                        <td>${c.juros > 0 ? `<span style="color:#DC2626">${formatarMoeda(c.juros)}</span>` : "—"}</td>
                        <td>${c.juros > 0 ? `<strong style="color:#DC2626">${formatarMoeda(c.valorComJuros)}</strong>` : formatarMoeda(c.valor)}</td>
                        <td>${c.pagoCompra > 0 ? `<span style="color:var(--color-success)">${formatarMoeda(c.pagoCompra)}</span>` : "—"}</td>
                        <td>${c.saldoCompra > 0 ? `<strong style="color:var(--color-danger)">${formatarMoeda(c.saldoCompra)}</strong>` : `<span style="color:var(--color-success)">Quitado</span>`}</td>
                        <td>${c.juros > 0 ? badgeSituacao("Atrasado") : (venc ? badgeSituacao("Pendente") : "—")}</td>
                        <td style="max-width:140px;white-space:normal;font-size:var(--text-xs);color:var(--gray-500)">${escHtml(c.observacoes || "")}</td>
                        <td class="col-center">
                          <button class="btn-table-action btn-table-action--delete" data-action="excluir-compra" data-id="${c.id}" title="Excluir compra">
                            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                          </button>
                        </td>
                      </tr>`;
                  }).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Histórico de Pagamentos -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-section-title" style="margin:0">Histórico de Pagamentos</h3>
            <span style="font-size:var(--text-sm);color:var(--gray-500)">${pagamentos.length} pagamento(s)</span>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Data do Pagamento</th>
                  <th>Valor Pago</th>
                  <th>Compra Relacionada</th>
                  <th>Forma</th>
                  <th>Observações</th>
                </tr>
              </thead>
              <tbody>
                ${pagamentos.length === 0
                  ? `<tr><td colspan="5" class="empty-cell">Nenhum pagamento registrado.</td></tr>`
                  : pagamentos.map(p => {
                    const compraRel = p.compraId ? compras.find(c => c.id === p.compraId) : null;
                    return `
                    <tr>
                      <td>${formatarDataLocal(p.dataPagamento)}</td>
                      <td><strong style="color:var(--color-success)">${formatarMoeda(p.valor)}</strong></td>
                      <td style="font-size:var(--text-xs);color:var(--gray-500)">${compraRel ? `Compra de ${formatarDataLocal(compraRel.dataCompra)}` : "Crédito geral"}</td>
                      <td>${escHtml(p.forma || "—")}</td>
                      <td style="font-size:var(--text-xs);color:var(--gray-500)">${escHtml(p.observacoes || "")}</td>
                    </tr>`;
                  }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

  } catch (err) {
    console.error("Erro ao carregar detalhes do cliente:", err);
    painel.innerHTML = `<div class="empty-cell">Erro ao carregar dados do cliente.</div>`;
  }
}

// ── Modais ───────────────────────────────────────────────────
function abrirModalNovoCliente() {
  const body = `
    <div class="form-usuario">
      <div>
        <label class="field-label">Nome completo *</label>
        <input type="text" id="mPromNome" class="field-input--plain" placeholder="Nome do cliente" autocomplete="off" />
      </div>
      <div>
        <label class="field-label">Telefone</label>
        <input type="tel" id="mPromTelefone" class="field-input--plain" placeholder="(00) 00000-0000" autocomplete="off" />
      </div>
      <div>
        <label class="field-label">Observações</label>
        <input type="text" id="mPromObs" class="field-input--plain" placeholder="Informações adicionais..." autocomplete="off" />
      </div>
    </div>`;

  const footer = `
    <button class="btn-ghost" id="btnCancelarModalProm">Cancelar</button>
    <button class="btn-primary" id="btnSalvarNovoCliente">Salvar Cliente</button>`;

  abrirModal("Novo Cliente", body, footer);

  document.getElementById("btnCancelarModalProm").onclick = fecharModal;
  document.getElementById("btnSalvarNovoCliente").onclick = salvarNovoCliente;
  document.getElementById("mPromNome").focus();
}

async function salvarNovoCliente() {
  const nome = document.getElementById("mPromNome").value.trim();
  if (!nome) { window.mostrarToast?.("Informe o nome do cliente.", "error"); return; }

  const btn = document.getElementById("btnSalvarNovoCliente");
  btn.disabled = true; btn.textContent = "Salvando...";

  try {
    await addDoc(collection(db, COL_CLIENTES), {
      nome,
      telefone:    document.getElementById("mPromTelefone").value.trim(),
      observacoes: document.getElementById("mPromObs").value.trim(),
      criadoEm:    serverTimestamp()
    });
    fecharModal();
    window.mostrarToast?.("Cliente cadastrado com sucesso!", "success");
    carregarListaClientes();
    carregarIndicadores();
  } catch (err) {
    console.error(err);
    window.mostrarToast?.("Erro ao salvar cliente.", "error");
    btn.disabled = false; btn.textContent = "Salvar Cliente";
  }
}

let _compraRowSeq = 0;

function linhaCompraHtml(hojeStr, vencStr) {
  const rid = `cr${++_compraRowSeq}`;
  return `
    <div class="compra-row" data-row-id="${rid}" style="display:grid;grid-template-columns:1fr 1fr 1fr 1.6fr 32px;gap:8px;align-items:center;margin-bottom:8px">
      <input type="number" class="compra-valor field-input--plain" placeholder="0,00" min="0.01" step="0.01" autocomplete="off" />
      <input type="date" class="compra-data field-input--plain" value="${hojeStr}" autocomplete="off" />
      <input type="date" class="compra-venc field-input--plain" value="${vencStr}" autocomplete="off" />
      <input type="text" class="compra-obs field-input--plain" placeholder="Descrição da compra..." autocomplete="off" />
      <button type="button" class="btn-table-action btn-table-action--delete btn-remove-compra-row" title="Remover esta compra">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
      </button>
    </div>`;
}

function abrirModalNovaCompra(clienteId) {
  if (!clienteId) return;
  const hoje = new Date();
  const vencPadrao = new Date(hoje.getFullYear(), hoje.getMonth() + 1, hoje.getDate());
  const vencStr = vencPadrao.toISOString().split("T")[0];
  const hojeStr = hoje.toISOString().split("T")[0];

  const body = `
    <div class="form-usuario">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1.6fr 32px;gap:8px;margin-bottom:2px">
        <label class="field-label">Valor (R$) *</label>
        <label class="field-label">Data *</label>
        <label class="field-label">Vencimento</label>
        <label class="field-label">Obs.</label>
        <span></span>
      </div>
      <div id="comprasRowsContainer">${linhaCompraHtml(hojeStr, vencStr)}</div>
      <button type="button" class="btn-ghost" id="btnAddCompraRow" style="font-size:var(--text-sm)">+ Adicionar outra compra</button>
      <p style="font-size:var(--text-xs);color:var(--gray-500);margin-top:8px">Você pode lançar quantas compras quiser de uma vez. Linhas em branco são ignoradas.</p>
    </div>`;

  const footer = `
    <button class="btn-ghost" id="btnCancelarModalProm">Cancelar</button>
    <button class="btn-primary" id="btnSalvarNovaCompra">Registrar Compra(s)</button>`;

  abrirModal("Nova Compra", body, footer);

  const container = document.getElementById("comprasRowsContainer");

  document.getElementById("btnAddCompraRow").onclick = () => {
    container.insertAdjacentHTML("beforeend", linhaCompraHtml(hojeStr, vencStr));
  };

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-remove-compra-row");
    if (!btn) return;
    const rows = container.querySelectorAll(".compra-row");
    if (rows.length > 1) {
      btn.closest(".compra-row").remove();
    } else {
      rows[0].querySelectorAll("input").forEach(i => { if (i.type !== "date") i.value = ""; });
    }
  });

  document.getElementById("btnCancelarModalProm").onclick = fecharModal;
  document.getElementById("btnSalvarNovaCompra").onclick = () => salvarNovaCompra(clienteId);
  container.querySelector(".compra-valor").focus();
}

async function salvarNovaCompra(clienteId) {
  const linhas = Array.from(document.querySelectorAll("#comprasRowsContainer .compra-row"));

  const compras = [];
  for (const linha of linhas) {
    const valor = parseFloat(linha.querySelector(".compra-valor").value);
    const dataStr = linha.querySelector(".compra-data").value;
    const vencStr = linha.querySelector(".compra-venc").value;
    const obs = linha.querySelector(".compra-obs").value.trim();
    if (!valor && !obs) continue; // linha em branco, ignora
    if (!valor || valor <= 0) { window.mostrarToast?.("Informe um valor válido em todas as compras preenchidas.", "error"); return; }
    if (!dataStr) { window.mostrarToast?.("Informe a data em todas as compras preenchidas.", "error"); return; }
    compras.push({ valor, dataStr, vencStr, obs });
  }

  if (!compras.length) { window.mostrarToast?.("Adicione ao menos uma compra.", "error"); return; }

  const btn = document.getElementById("btnSalvarNovaCompra");
  btn.disabled = true; btn.textContent = "Salvando...";

  try {
    await Promise.all(compras.map(c => addDoc(collection(db, COL_COMPRAS), {
      clienteId,
      valor: c.valor,
      dataCompra:  Timestamp.fromDate(new Date(c.dataStr + "T12:00:00")),
      vencimento:  c.vencStr ? Timestamp.fromDate(new Date(c.vencStr + "T23:59:59")) : null,
      observacoes: c.obs,
      criadoEm:    serverTimestamp()
    })));
    fecharModal();
    window.mostrarToast?.(`${compras.length} compra(s) registrada(s) com sucesso!`, "success");
    abrirPainelCliente(clienteId);
    carregarIndicadores();
  } catch (err) {
    console.error(err);
    window.mostrarToast?.("Erro ao registrar compra(s).", "error");
    btn.disabled = false; btn.textContent = "Registrar Compra(s)";
  }
}

async function abrirModalNovoPagamento(clienteId) {
  if (!clienteId) return;
  const hojeStr = new Date().toISOString().split("T")[0];

  const body = `<div class="form-usuario"><p class="loading-cell" style="padding:16px 0">Carregando compras em aberto...</p></div>`;
  const footer = `
    <button class="btn-ghost" id="btnCancelarModalProm">Cancelar</button>
    <button class="btn-primary" id="btnSalvarNovoPagamento">Registrar Pagamento</button>`;
  abrirModal("Registrar Pagamento", body, footer);
  document.getElementById("btnCancelarModalProm").onclick = fecharModal;

  let comprasAbertas = [];
  try {
    const [comprasSnap, pagamentosSnap] = await Promise.all([
      getDocs(query(collection(db, COL_COMPRAS), where("clienteId", "==", clienteId), orderBy("dataCompra", "asc"))),
      getDocs(query(collection(db, COL_PAGAMENTOS), where("clienteId", "==", clienteId)))
    ]);

    const pagoPorCompra = {};
    pagamentosSnap.forEach(d => {
      const p = d.data();
      if (p.compraId) pagoPorCompra[p.compraId] = (pagoPorCompra[p.compraId] || 0) + (p.valor || 0);
    });

    comprasSnap.forEach(d => {
      const c = { id: d.id, ...d.data() };
      const pago = pagoPorCompra[c.id] || 0;
      const saldo = Math.round(((c.valor || 0) - pago) * 100) / 100;
      if (saldo > 0.004) comprasAbertas.push({ ...c, pago, saldo });
    });
  } catch (err) {
    console.error("Erro ao buscar compras em aberto:", err);
  }

  const listaHtml = comprasAbertas.length === 0
    ? `<p style="font-size:var(--text-sm);color:var(--gray-500);padding:8px 0">Este cliente não possui compras em aberto. O pagamento será registrado como crédito geral.</p>`
    : `
      <label class="field-label">Compras a abater (desmarque para não incluir)</label>
      <div id="listaComprasPagamento" style="max-height:220px;overflow-y:auto;margin-bottom:var(--space-3)">
        ${comprasAbertas.map(c => `
          <label style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--gray-200);border-radius:var(--radius-md);margin-bottom:6px">
            <input type="checkbox" class="pag-check" data-compra-id="${c.id}" data-max="${c.saldo}" checked style="width:16px;height:16px;flex:none" autocomplete="off" />
            <div style="flex:1;min-width:0">
              <div style="font-size:var(--text-sm);font-weight:600;color:var(--gray-800)">Compra de ${formatarDataLocal(c.dataCompra)} ${c.observacoes ? `· ${escHtml(c.observacoes)}` : ""}</div>
              <div style="font-size:var(--text-xs);color:var(--gray-500)">Valor: ${formatarMoeda(c.valor)} · Saldo em aberto: ${formatarMoeda(c.saldo)}</div>
            </div>
            <input type="number" class="pag-valor field-input--plain" data-compra-id="${c.id}" style="width:110px;flex:none" min="0" step="0.01" max="${c.saldo}" value="${c.saldo.toFixed(2)}" autocomplete="off" />
          </label>`).join("")}
      </div>`;

  const novoBody = `
    <div class="form-usuario">
      ${listaHtml}
      <div>
        <label class="field-label">Data do Pagamento *</label>
        <input type="date" id="mPagData" class="field-input--plain" value="${hojeStr}" autocomplete="off" />
      </div>
      <div>
        <label class="field-label">Forma de Pagamento</label>
        <select id="mPagForma" class="field-input--plain" autocomplete="off">
          <option value="">Selecione...</option>
          <option>Dinheiro</option>
          <option>PIX</option>
          <option>Cartão de Débito</option>
          <option>Cartão de Crédito</option>
          <option>Transferência</option>
        </select>
      </div>
      <div>
        <label class="field-label">Observações</label>
        <input type="text" id="mPagObs" class="field-input--plain" placeholder="Informações do pagamento..." autocomplete="off" />
      </div>
      ${comprasAbertas.length > 0 ? `<div style="text-align:right;font-size:var(--text-sm);color:var(--gray-600);padding-top:4px;border-top:1px solid var(--gray-100)">Total a pagar: <strong id="mPagTotalPreview" style="color:var(--color-success)">—</strong></div>` : `
      <div>
        <label class="field-label">Valor do Pagamento (R$) *</label>
        <input type="number" id="mPagValorGeral" class="field-input--plain" placeholder="0,00" min="0.01" step="0.01" autocomplete="off" />
      </div>`}
    </div>`;

  // Substitui o corpo do modal já aberto (agora que os dados chegaram)
  const modalEl = document.getElementById("modalBody");
  if (modalEl) {
    modalEl.innerHTML = novoBody;
  } else {
    abrirModal("Registrar Pagamento", novoBody, footer);
    document.getElementById("btnCancelarModalProm").onclick = fecharModal;
  }

  const atualizarPreview = () => {
    const totalEl = document.getElementById("mPagTotalPreview");
    if (!totalEl) return;
    let total = 0;
    document.querySelectorAll(".pag-check:checked").forEach(chk => {
      const valInput = document.querySelector(`.pag-valor[data-compra-id="${chk.dataset.compraId}"]`);
      total += parseFloat(valInput?.value) || 0;
    });
    totalEl.textContent = formatarMoeda(total);
  };

  document.querySelectorAll(".pag-check").forEach(chk => {
    chk.addEventListener("change", () => {
      const valInput = document.querySelector(`.pag-valor[data-compra-id="${chk.dataset.compraId}"]`);
      if (valInput) valInput.disabled = !chk.checked;
      atualizarPreview();
    });
  });
  document.querySelectorAll(".pag-valor").forEach(inp => inp.addEventListener("input", atualizarPreview));
  atualizarPreview();

  document.getElementById("btnSalvarNovoPagamento").onclick = () => salvarNovoPagamento(clienteId, comprasAbertas.length > 0);
  document.getElementById("mPagData")?.focus();
}

async function salvarNovoPagamento(clienteId, temComprasAbertas) {
  const dataStr = document.getElementById("mPagData").value;
  const forma   = document.getElementById("mPagForma").value;
  const obs     = document.getElementById("mPagObs").value.trim();

  if (!dataStr) { window.mostrarToast?.("Informe a data do pagamento.", "error"); return; }

  const lancamentos = [];

  if (temComprasAbertas) {
    const checks = Array.from(document.querySelectorAll(".pag-check:checked"));
    for (const chk of checks) {
      const compraId = chk.dataset.compraId;
      const max = parseFloat(chk.dataset.max) || 0;
      const valInput = document.querySelector(`.pag-valor[data-compra-id="${compraId}"]`);
      const valor = parseFloat(valInput?.value);
      if (!valor || valor <= 0) continue;
      if (valor > max + 0.01) { window.mostrarToast?.("O valor a abater não pode ser maior que o saldo da compra.", "error"); return; }
      lancamentos.push({ compraId, valor });
    }
    if (!lancamentos.length) { window.mostrarToast?.("Selecione ao menos uma compra com valor para abater.", "error"); return; }
  } else {
    const valor = parseFloat(document.getElementById("mPagValorGeral")?.value);
    if (!valor || valor <= 0) { window.mostrarToast?.("Informe um valor válido.", "error"); return; }
    lancamentos.push({ compraId: null, valor });
  }

  const btn = document.getElementById("btnSalvarNovoPagamento");
  btn.disabled = true; btn.textContent = "Salvando...";

  try {
    await Promise.all(lancamentos.map(l => addDoc(collection(db, COL_PAGAMENTOS), {
      clienteId,
      compraId:      l.compraId || null,
      valor:         l.valor,
      dataPagamento: Timestamp.fromDate(new Date(dataStr + "T12:00:00")),
      forma,
      observacoes:   obs,
      criadoEm:      serverTimestamp()
    })));
    fecharModal();
    window.mostrarToast?.("Pagamento registrado com sucesso!", "success");
    abrirPainelCliente(clienteId);
    carregarIndicadores();
  } catch (err) {
    console.error(err);
    window.mostrarToast?.("Erro ao registrar pagamento.", "error");
    btn.disabled = false; btn.textContent = "Registrar Pagamento";
  }
}

// ── Exclusões ────────────────────────────────────────────────
function confirmarExcluirCliente(clienteId) {
  const body = `
    <div class="delete-warning">
      <strong>⚠️ Atenção: ação irreversível!</strong>
      Isso removerá o cliente e todo o seu histórico de compras e pagamentos permanentemente.
    </div>`;
  const footer = `
    <button class="btn-ghost" id="btnCancelarModalProm">Cancelar</button>
    <button class="btn-danger" id="btnConfirmarExcluirCliente">Excluir Permanentemente</button>`;
  abrirModal("Excluir Cliente", body, footer);
  document.getElementById("btnCancelarModalProm").onclick = fecharModal;
  document.getElementById("btnConfirmarExcluirCliente").onclick = () => excluirCliente(clienteId);
}

async function excluirCliente(clienteId) {
  const btn = document.getElementById("btnConfirmarExcluirCliente");
  btn.disabled = true; btn.textContent = "Excluindo...";
  try {
    // Excluir cliente e todos os sub-documentos
    await deleteDoc(doc(db, COL_CLIENTES, clienteId));
    const [compras, pagamentos] = await Promise.all([
      getDocs(query(collection(db, COL_COMPRAS), where("clienteId", "==", clienteId))),
      getDocs(query(collection(db, COL_PAGAMENTOS), where("clienteId", "==", clienteId)))
    ]);
    await Promise.all([
      ...compras.docs.map(d => deleteDoc(d.ref)),
      ...pagamentos.docs.map(d => deleteDoc(d.ref))
    ]);
    fecharModal();
    window.mostrarToast?.("Cliente excluído.", "success");
    mostrarPainel("lista");
    carregarListaClientes();
    carregarIndicadores();
  } catch (err) {
    console.error(err);
    window.mostrarToast?.("Erro ao excluir cliente.", "error");
    btn.disabled = false; btn.textContent = "Excluir Permanentemente";
  }
}

function confirmarExcluirCompra(compraId) {
  const body = `<div class="delete-warning"><strong>⚠️ Confirmar exclusão</strong>Esta compra será removida permanentemente.</div>`;
  const footer = `
    <button class="btn-ghost" id="btnCancelarModalProm">Cancelar</button>
    <button class="btn-danger" id="btnConfirmarExcluirCompra">Excluir Compra</button>`;
  abrirModal("Excluir Compra", body, footer);
  document.getElementById("btnCancelarModalProm").onclick = fecharModal;
  document.getElementById("btnConfirmarExcluirCompra").onclick = () => excluirCompra(compraId);
}

async function excluirCompra(compraId) {
  const btn = document.getElementById("btnConfirmarExcluirCompra");
  btn.disabled = true; btn.textContent = "Excluindo...";
  try {
    // Precisamos saber o clienteId para reatualizar o painel
    const snap = await getDoc(doc(db, COL_COMPRAS, compraId));
    const clienteId = snap.data()?.clienteId;
    await deleteDoc(doc(db, COL_COMPRAS, compraId));
    fecharModal();
    window.mostrarToast?.("Compra excluída.", "success");
    if (clienteId) abrirPainelCliente(clienteId);
    carregarIndicadores();
  } catch (err) {
    console.error(err);
    window.mostrarToast?.("Erro ao excluir compra.", "error");
    btn.disabled = false; btn.textContent = "Excluir Compra";
  }
}

// ── Impressão / Exportação ───────────────────────────────────
async function imprimirCliente(clienteId) {
  try {
    const [clienteSnap, comprasSnap, pagamentosSnap] = await Promise.all([
      getDoc(doc(db, COL_CLIENTES, clienteId)),
      getDocs(query(collection(db, COL_COMPRAS), where("clienteId", "==", clienteId), orderBy("dataCompra", "desc"))),
      getDocs(query(collection(db, COL_PAGAMENTOS), where("clienteId", "==", clienteId), orderBy("dataPagamento", "desc")))
    ]);
    const cliente = clienteSnap.data();
    const hoje = new Date();
    let totalComprado = 0, totalPago = 0;
    const compras = [];
    comprasSnap.forEach(d => { const c={id:d.id,...d.data()}; totalComprado+=c.valor||0; compras.push(c); });
    pagamentosSnap.forEach(d => { totalPago+=(d.data().valor||0); });
    const saldo = totalComprado - totalPago;

    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"><title>Promissória — ${cliente.nome}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:13px;margin:20px;color:#111}
        h1{font-size:18px;margin-bottom:4px}
        .sub{color:#555;font-size:12px;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;margin-bottom:20px}
        th{background:#002D94;color:#fff;padding:7px 10px;text-align:left;font-size:12px}
        td{padding:6px 10px;border-bottom:1px solid #eee;font-size:12px}
        .resumo{display:flex;gap:20px;margin-bottom:20px;flex-wrap:wrap}
        .box{background:#f1f5f9;border-radius:8px;padding:12px 16px;min-width:130px}
        .box-label{font-size:11px;color:#555;text-transform:uppercase;margin-bottom:4px}
        .box-val{font-size:16px;font-weight:bold}
        @media print{body{margin:10px}}
      </style></head><body>
      <h1>Papelaria Futura — Ficha do Cliente</h1>
      <div class="sub">${cliente.nome}${cliente.telefone ? ' · ' + cliente.telefone : ''} · Emitido em ${hoje.toLocaleDateString('pt-BR')}</div>
      <div class="resumo">
        <div class="box"><div class="box-label">Total Comprado</div><div class="box-val">${formatarMoeda(totalComprado)}</div></div>
        <div class="box"><div class="box-label">Total Pago</div><div class="box-val" style="color:#059669">${formatarMoeda(totalPago)}</div></div>
        <div class="box"><div class="box-label">Saldo Devedor</div><div class="box-val" style="color:${saldo>0?'#DC2626':'#059669'}">${formatarMoeda(Math.max(0,saldo))}</div></div>
      </div>
      <h3>Compras</h3>
      <table><thead><tr><th>Data</th><th>Valor</th><th>Vencimento</th><th>Observações</th></tr></thead><tbody>
        ${compras.map(c=>`<tr><td>${formatarDataLocal(c.dataCompra)}</td><td>${formatarMoeda(c.valor)}</td><td>${c.vencimento?formatarDataLocal(c.vencimento):'—'}</td><td>${c.observacoes||''}</td></tr>`).join('')}
      </tbody></table>
      <script>window.onload=()=>{window.print();}<\/script>
      </body></html>`);
    win.document.close();
  } catch (err) { console.error(err); window.mostrarToast?.("Erro ao gerar impressão.", "error"); }
}

async function imprimirRelatorio() {
  try {
    const [clientesSnap, comprasSnap, pagamentosSnap] = await Promise.all([
      getDocs(query(collection(db, COL_CLIENTES), orderBy("nome"))),
      getDocs(collection(db, COL_COMPRAS)),
      getDocs(collection(db, COL_PAGAMENTOS))
    ]);

    const comprasPorCliente = {};
    const pagamentosPorCliente = {};
    comprasSnap.forEach(d => {
      const c = d.data();
      comprasPorCliente[c.clienteId] = (comprasPorCliente[c.clienteId] || 0) + (c.valor || 0);
    });
    pagamentosSnap.forEach(d => {
      const p = d.data();
      pagamentosPorCliente[p.clienteId] = (pagamentosPorCliente[p.clienteId] || 0) + (p.valor || 0);
    });

    const clientes = [];
    clientesSnap.forEach(d => {
      const data = d.data();
      const totalC = comprasPorCliente[d.id] || 0;
      const totalP = pagamentosPorCliente[d.id] || 0;
      clientes.push({ ...data, totalC, totalP, saldo: totalC - totalP });
    });

    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"><title>Relatório de Promissórias</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:12px;margin:20px;color:#111}
        h1{font-size:18px}
        table{width:100%;border-collapse:collapse;margin-top:16px}
        th{background:#002D94;color:#fff;padding:7px 10px;text-align:left;font-size:11px}
        td{padding:6px 10px;border-bottom:1px solid #eee;font-size:11px}
        tfoot td{font-weight:bold;background:#f1f5f9}
      </style></head><body>
      <h1>Papelaria Futura — Relatório de Promissórias</h1>
      <p style="color:#555;font-size:11px">Emitido em ${new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}</p>
      <table><thead><tr><th>Cliente</th><th>Telefone</th><th>Total Comprado</th><th>Total Pago</th><th>Saldo Devedor</th><th>Situação</th></tr></thead>
      <tbody>
        ${clientes.map(c=>{
          const s = c.saldo > 0 ? "Em aberto" : "Quitado";
          return `<tr><td>${c.nome||''}</td><td>${c.telefone||''}</td><td>${formatarMoeda(c.totalC)}</td><td>${formatarMoeda(c.totalP)}</td><td style="color:${c.saldo>0?'#DC2626':'#059669'}">${formatarMoeda(Math.max(0,c.saldo))}</td><td>${s}</td></tr>`;
        }).join('')}
      </tbody>
      <tfoot><tr><td colspan="2">TOTAL</td><td>${formatarMoeda(clientes.reduce((a,c)=>a+c.totalC,0))}</td><td>${formatarMoeda(clientes.reduce((a,c)=>a+c.totalP,0))}</td><td>${formatarMoeda(Math.max(0,clientes.reduce((a,c)=>a+c.saldo,0)))}</td><td></td></tr></tfoot>
      </table>
      <script>window.onload=()=>{window.print();}<\/script>
      </body></html>`);
    win.document.close();
  } catch (err) { console.error(err); window.mostrarToast?.("Erro ao gerar relatório.", "error"); }
}

async function exportarRelatorio() {
  try {
    const [clientesSnap, comprasSnap, pagamentosSnap] = await Promise.all([
      getDocs(query(collection(db, COL_CLIENTES), orderBy("nome"))),
      getDocs(collection(db, COL_COMPRAS)),
      getDocs(collection(db, COL_PAGAMENTOS))
    ]);
    const comprasPorCliente = {};
    const pagamentosPorCliente = {};
    comprasSnap.forEach(d => {
      const c = d.data();
      comprasPorCliente[c.clienteId] = (comprasPorCliente[c.clienteId] || 0) + (c.valor || 0);
    });
    pagamentosSnap.forEach(d => {
      const p = d.data();
      pagamentosPorCliente[p.clienteId] = (pagamentosPorCliente[p.clienteId] || 0) + (p.valor || 0);
    });

    const linhas = ["Nome;Telefone;Total Comprado;Total Pago;Saldo Devedor;Situação"];
    clientesSnap.forEach(d => {
      const c = d.data();
      const totalC = comprasPorCliente[d.id] || 0;
      const totalP = pagamentosPorCliente[d.id] || 0;
      const saldo  = totalC - totalP;
      const sit    = saldo > 0 ? "Em aberto" : "Quitado";
      linhas.push(`"${c.nome||''}";${c.telefone||''};${totalC.toFixed(2)};${totalP.toFixed(2)};${Math.max(0,saldo).toFixed(2)};${sit}`);
    });

    const blob = new Blob(["\uFEFF" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: `promissorias_${new Date().toISOString().split("T")[0]}.csv` });
    a.click();
    URL.revokeObjectURL(url);
    window.mostrarToast?.("Relatório exportado!", "success");
  } catch (err) { console.error(err); window.mostrarToast?.("Erro ao exportar.", "error"); }
}

// ── Importação CSV / XLSX ────────────────────────────────────
async function importarCSV(file) {
  let linhasRaw = []; // array de arrays de strings

  try {
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "xlsx" || ext === "xls") {
      // ── Leitura via SheetJS ──────────────────────────────
      if (!window.XLSX) {
        window.mostrarToast?.("Biblioteca XLSX ainda carregando, tente novamente.", "error");
        return;
      }
      const buffer = await file.arrayBuffer();
      const wb     = window.XLSX.read(buffer, { type: "array", cellDates: true });
      const ws     = wb.Sheets[wb.SheetNames[0]];
      const dados  = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      linhasRaw    = dados.map(row => row.map(cel => {
        if (cel instanceof Date) {
          // Formatar datas como DD/MM/YYYY para o parser já existente
          const d = cel;
          return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
        }
        return String(cel ?? "").trim();
      }));
    } else {
      // ── Leitura de CSV puro ──────────────────────────────
      const texto = await file.text();
      const sep   = texto.split("\n")[0].includes(";") ? ";" : ",";
      linhasRaw   = texto
        .split(/\r?\n/)
        .filter(l => l.trim())
        .map(l => l.split(sep).map(v => v.trim().replace(/^"|"$/g, "")));
    }
  } catch (err) {
    console.error("Erro ao ler arquivo:", err);
    window.mostrarToast?.("Erro ao ler o arquivo. Verifique o formato.", "error");
    return;
  }

  if (linhasRaw.length < 2) {
    window.mostrarToast?.("Arquivo vazio ou inválido.", "error");
    return;
  }

  // ── Mapear colunas pelo cabeçalho ────────────────────────
  const cabecalho = linhasRaw[0].map(c => String(c).toUpperCase().replace(/\s+/g, " ").trim());

  const col = (...nomes) => {
    for (const n of nomes) {
      const idx = cabecalho.findIndex(c => c.includes(n));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const iNome       = col("NOME");
  const iTelefone   = col("TELEFONE", "FONE", "CELULAR");
  const iCompra1    = col("COMPRA 1");
  const iDataC1     = col("DATA COMPRA 1");
  const iCompra2    = col("COMPRA 2", "COMPRA  2");
  const iDataC2     = col("DATA COMPRA 2", "DATA COMPRA  2");
  const iCompra3    = col("COMPRA 3");
  const iDataC3     = col("DATA COMPRA 3", "DATA COMPRA  3");
  const iCompra4    = col("COMPRA 4");
  const iDataC4     = col("DATA COMPRA 4", "DATA COMPRA  4");
  const iCompra5    = col("COMPRA 5", "COMPRA  5");
  const iDataC5     = col("DATA COMPRA 5", "DATA COMPRA  5");
  const iVencimento = col("DATA VENCIMENTO", "VENCIMENTO");
  const iPago       = col("VALOR PAGO", "TOTAL PAGO");
  const iDataPag    = col("DATA PAGAMENTO");

  if (iNome === -1) {
    window.mostrarToast?.("Coluna NOME não encontrada. Verifique o arquivo.", "error");
    return;
  }

  const dadosLinhas = linhasRaw.slice(1).filter(c => String(c[iNome] || "").trim());

  if (!dadosLinhas.length) {
    window.mostrarToast?.("Nenhum cliente encontrado no arquivo.", "error");
    return;
  }

  // ── Modal de prévia ──────────────────────────────────────
  const body = `
    <div style="margin-bottom:var(--space-4)">
      <p style="font-size:var(--text-sm);color:var(--gray-600);margin-bottom:var(--space-3)">
        Foram encontrados <strong>${dadosLinhas.length} cliente(s)</strong> no arquivo.
        Clientes com o mesmo nome já cadastrados serão ignorados.
      </p>
      <div style="max-height:260px;overflow-y:auto;border:1px solid var(--gray-200);border-radius:var(--radius-md)">
        <table style="width:100%;border-collapse:collapse;font-size:var(--text-xs)">
          <thead style="position:sticky;top:0;background:#F8FAFC">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--gray-600);border-bottom:1px solid var(--gray-200)">Nome</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600;color:var(--gray-600);border-bottom:1px solid var(--gray-200)">Compras</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600;color:var(--gray-600);border-bottom:1px solid var(--gray-200)">Total</th>
              <th style="padding:8px 12px;text-align:right;font-weight:600;color:var(--gray-600);border-bottom:1px solid var(--gray-200)">Pago</th>
            </tr>
          </thead>
          <tbody>
            ${dadosLinhas.map(c => {
              const nome = String(c[iNome] || "").trim();
              const pares = [[iCompra1,iDataC1],[iCompra2,iDataC2],[iCompra3,iDataC3],[iCompra4,iDataC4],[iCompra5,iDataC5]];
              const comprasValidas = pares.filter(([iv]) => iv !== -1 && parseFloat(c[iv]) > 0);
              const totalComprado  = comprasValidas.reduce((s,[iv]) => s + (parseFloat(c[iv]) || 0), 0);
              const totalPago      = iPago !== -1 ? (parseFloat(c[iPago]) || 0) : 0;
              return `<tr style="border-bottom:1px solid var(--gray-100)">
                <td style="padding:7px 12px;color:var(--gray-800)">${escHtml(nome)}</td>
                <td style="padding:7px 12px;text-align:right;color:var(--gray-600)">${comprasValidas.length}</td>
                <td style="padding:7px 12px;text-align:right;color:var(--gray-700)">${formatarMoeda(totalComprado)}</td>
                <td style="padding:7px 12px;text-align:right;color:#059669">${formatarMoeda(totalPago)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`;

  const footer = `
    <button class="btn-ghost" id="btnCancelarModalProm">Cancelar</button>
    <button class="btn-primary" id="btnConfirmarImportacao">Importar ${dadosLinhas.length} cliente(s)</button>`;

  abrirModal("Importar — Prévia", body, footer);

  document.getElementById("btnCancelarModalProm").onclick = fecharModal;
  document.getElementById("btnConfirmarImportacao").onclick = async () => {
    const btn = document.getElementById("btnConfirmarImportacao");
    btn.disabled = true;
    btn.textContent = "Importando...";

    let importados = 0, ignorados = 0, erros = 0;

    const existentesSnap = await getDocs(collection(db, COL_CLIENTES));
    const nomesExistentes = new Set();
    existentesSnap.forEach(d => nomesExistentes.add((d.data().nome || "").toUpperCase().trim()));

    for (const c of dadosLinhas) {
      const nome = String(c[iNome] || "").trim();
      if (!nome) continue;

      if (nomesExistentes.has(nome.toUpperCase())) { ignorados++; continue; }

      try {
        const clienteRef = await addDoc(collection(db, COL_CLIENTES), {
          nome,
          telefone:    iTelefone !== -1 ? String(c[iTelefone] || "").trim() : "",
          observacoes: "",
          criadoEm:    serverTimestamp()
        });

        const clienteId  = clienteRef.id;
        const vencimento = iVencimento !== -1 && c[iVencimento] ? parseDateCSV(String(c[iVencimento])) : null;
        const pares      = [[iCompra1,iDataC1],[iCompra2,iDataC2],[iCompra3,iDataC3],[iCompra4,iDataC4],[iCompra5,iDataC5]];

        for (const [iv, id] of pares) {
          if (iv === -1) continue;
          const valor = parseFloat(c[iv]);
          if (!valor || valor <= 0) continue;
          const dataCompra = id !== -1 && c[id] ? parseDateCSV(String(c[id])) : new Date();
          await addDoc(collection(db, COL_COMPRAS), {
            clienteId,
            valor,
            dataCompra:  Timestamp.fromDate(dataCompra || new Date()),
            vencimento:  vencimento ? Timestamp.fromDate(vencimento) : null,
            observacoes: "",
            criadoEm:    serverTimestamp()
          });
        }

        if (iPago !== -1) {
          const valorPago = parseFloat(c[iPago]);
          if (valorPago > 0) {
            const dataPag = iDataPag !== -1 && c[iDataPag] ? parseDateCSV(String(c[iDataPag])) : new Date();
            await addDoc(collection(db, COL_PAGAMENTOS), {
              clienteId,
              valor:         valorPago,
              dataPagamento: Timestamp.fromDate(dataPag || new Date()),
              forma:         "Importado",
              observacoes:   "Importado via planilha",
              criadoEm:      serverTimestamp()
            });
          }
        }

        nomesExistentes.add(nome.toUpperCase());
        importados++;
      } catch (err) {
        console.error("Erro ao importar:", nome, err);
        erros++;
      }

      // Atualizar texto do botão com progresso
      const total = dadosLinhas.length;
      const feito = importados + ignorados + erros;
      const btnAtual = document.getElementById("btnConfirmarImportacao");
      if (btnAtual) btnAtual.textContent = `Importando... (${feito}/${total})`;
    }

    fecharModal();
    window.mostrarToast?.(
      `Importação concluída: ${importados} importado(s), ${ignorados} ignorado(s)${erros ? `, ${erros} com erro` : ""}.`,
      importados > 0 ? "success" : "error"
    );
    carregarListaClientes();
    carregarIndicadores();
  };
}

function parseDateCSV(valor) {
  if (!valor) return null;
  // Formato DD/MM/YYYY
  const dmY = valor.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmY) return new Date(parseInt(dmY[3]), parseInt(dmY[2]) - 1, parseInt(dmY[1]));
  // Formato YYYY-MM-DD
  const Ymd = valor.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (Ymd) return new Date(parseInt(Ymd[1]), parseInt(Ymd[2]) - 1, parseInt(Ymd[3]));
  // Tentar Date nativo
  const d = new Date(valor);
  return isNaN(d) ? null : d;
}

// ── Helpers ──────────────────────────────────────────────────
function badgeSituacao(situacao) {
  const map = {
    "Quitado":  { bg: "#D1FAE5", color: "#065F46", label: "Quitado" },
    "Pendente": { bg: "#FEF3C7", color: "#92400E", label: "Pendente" },
    "Atrasado": { bg: "#FEE2E2", color: "#991B1B", label: "Atrasado" }
  };
  const s = map[situacao] || map["Pendente"];
  return `<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:9999px;font-size:0.75rem;font-weight:600;background:${s.bg};color:${s.color}">${s.label}</span>`;
}

function formatarDataLocal(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("pt-BR");
}

function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// Reutiliza o modal global do sistema
function abrirModal(titulo, body, footer) {
  window.abrirModal?.(titulo, body, footer);
}

function fecharModal() {
  window.fecharModal?.();
}
