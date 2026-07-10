// ============================================================
// promissoria.js — Módulo de Promissórias (somente admin)
// Papelaria Futura
// ============================================================

import {
  collection, doc, addDoc, getDoc, getDocs, setDoc,
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
const COL_HISTORICO    = "prom_historico";

// Juros: 2% ao mês sobre saldo devedor (com base na planilha)
const JUROS_MENSAL     = 0.02;

let _dadosUsuario = null;
let _usuarioAtual = null;

// Gera os links clicáveis de anexos (fotos/PDF) pra exibir nas tabelas
function _htmlAnexos(anexos) {
  if (!anexos || !anexos.length) return "";
  return `<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">${
    anexos.map(a => `<a href="${a.url}" target="_blank" rel="noopener" title="${escHtml(a.nome || "Foto")}" style="display:inline-block">
      <img src="${a.url}" alt="${escHtml(a.nome || "Foto")}" style="width:32px;height:32px;object-fit:cover;border-radius:6px;border:1px solid var(--gray-200)" />
    </a>`).join("")
  }</div>`;
}

// Redimensiona/comprime uma imagem no navegador e devolve um data URL (base64).
// Assim os anexos ficam salvos direto no documento do Firestore, sem usar o Storage (pago).
function _redimensionarImagemAnexo(file, maxLado = 1000, qualidade = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Arquivo não é uma imagem válida"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxLado) { height = Math.round(height * (maxLado / width)); width = maxLado; }
        else if (height > maxLado) { width = Math.round(width * (maxLado / height)); height = maxLado; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", qualidade));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Converte os arquivos escolhidos (só imagens — PDF não é salvo por causa do limite
// de 1 MB por documento do Firestore) em anexos [{nome, url}] com a foto comprimida em base64.
async function _uploadAnexos(files, _pastaBaseIgnorada) {
  if (!files || !files.length) return [];
  const enviados = [];
  for (const file of Array.from(files)) {
    if (!file.type.startsWith("image/")) {
      window.mostrarToast?.(`"${file.name}" não é uma imagem e foi ignorado (PDF não é suportado sem armazenamento pago).`, "error");
      continue;
    }
    try {
      const dataUrl = await _redimensionarImagemAnexo(file);
      enviados.push({ nome: file.name, url: dataUrl });
    } catch (err) {
      console.error("Erro ao processar anexo:", err);
    }
  }
  return enviados;
}
async function _registrarHistorico(tipo, acao, clienteId, refId, valor, detalhes = "") {
  try {
    await addDoc(collection(db, COL_HISTORICO), {
      tipo, acao, clienteId, refId,
      valor: valor || 0,
      detalhes,
      usuarioUid:  _usuarioAtual?.uid || null,
      usuarioNome: _dadosUsuario?.nome || _usuarioAtual?.email || "—",
      criadoEm: serverTimestamp()
    });
  } catch (err) {
    console.error("Erro ao registrar histórico:", err);
  }
}

// ── Inicialização ───────────────────────────────────────────
export function iniciarPromissoria(usuario, dadosUsuario) {
  _dadosUsuario = dadosUsuario;
  _usuarioAtual = usuario;

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
  document.getElementById("filtroPeriodoDash")?.addEventListener("change", (e) => _renderGraficosPeriodo(e.target.value));
  document.getElementById("painelDashboardProm")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".prom-meta-editar");
    if (btn) abrirModalEditarMeta(btn.dataset.meta);
  });

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

  // Seta de voltar no header mobile (mesmo comportamento do botão "Voltar à lista")
  document.getElementById("btnVoltarPromMobile")?.addEventListener("click", () => {
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
    if (action === "voltar-lista-prom") mostrarPainel("lista");
    if (action === "historico-cliente") abrirModalHistoricoCliente(clienteId);
    if (action === "ver-comprovante-compra")      reabrirComprovanteCompra(clienteId, id, "preview");
    if (action === "pdf-comprovante-compra")      reabrirComprovanteCompra(clienteId, id, "print");
    if (action === "ver-comprovante-pagamento")   reabrirComprovantePagamento(clienteId, id, "preview");
    if (action === "pdf-comprovante-pagamento")   reabrirComprovantePagamento(clienteId, id, "print");
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

  const btnVoltarMobile = document.getElementById("btnVoltarPromMobile");
  if (btnVoltarMobile) btnVoltarMobile.hidden = painel !== "detalhes";
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

const COL_CONFIG   = "config";
const DOC_METAS    = "prom_metas";
const _promCharts  = {}; // guarda instâncias do Chart.js para destruir/recriar
const _dashCache   = { compras: [], pagamentos: [] };
let   _metasCache  = { vendas: 0, recebimentos: 0, cobranca: 0 };

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

  try {
    const [clientesSnap, comprasSnap, pagamentosSnap, metasSnap] = await Promise.all([
      getDocs(collection(db, COL_CLIENTES)),
      getDocs(collection(db, COL_COMPRAS)),
      getDocs(collection(db, COL_PAGAMENTOS)),
      getDoc(doc(db, COL_CONFIG, DOC_METAS)).catch(() => null)
    ]);

    if (metasSnap && metasSnap.exists()) {
      const m = metasSnap.data();
      _metasCache = {
        vendas:       m.vendas       || 0,
        recebimentos: m.recebimentos || 0,
        cobranca:     m.cobranca     || 0
      };
    }

    const hoje = new Date();

    const compras = [];
    comprasSnap.forEach(d => compras.push({ id: d.id, ...d.data() }));

    const pagamentos = [];
    pagamentosSnap.forEach(d => pagamentos.push({ id: d.id, ...d.data() }));

    const clientes = [];
    clientesSnap.forEach(d => clientes.push({ id: d.id, ...d.data() }));

    const nomePorId = {};
    clientes.forEach(c => nomePorId[c.id] = c.nome || "—");

    // ── Situação por cliente (saldo, atraso) ───────────────────
    const saldoPorCliente = {};
    compras.forEach(c => {
      if (!saldoPorCliente[c.clienteId]) saldoPorCliente[c.clienteId] = { compras: 0, pagamentos: 0, vencido: false, qtdCompras: 0 };
      saldoPorCliente[c.clienteId].compras += c.valor || 0;
      saldoPorCliente[c.clienteId].qtdCompras++;
      if (c.vencimento) {
        const venc = c.vencimento.toDate?.() || new Date(c.vencimento);
        if (venc < hoje) saldoPorCliente[c.clienteId].vencido = true;
      }
    });
    pagamentos.forEach(p => {
      if (!saldoPorCliente[p.clienteId]) saldoPorCliente[p.clienteId] = { compras: 0, pagamentos: 0, vencido: false, qtdCompras: 0 };
      saldoPorCliente[p.clienteId].pagamentos += p.valor || 0;
    });

    // ── KPIs principais ─────────────────────────────────────────
    const totalVendido  = compras.reduce((s, c) => s + (c.valor || 0), 0);
    const totalRecebido = pagamentos.reduce((s, p) => s + (p.valor || 0), 0);
    const totalAberto   = Math.max(0, totalVendido - totalRecebido);

    const clientesInadimplentesSet = new Set();
    Object.entries(saldoPorCliente).forEach(([id, s]) => {
      const saldo = s.compras - s.pagamentos;
      if (saldo > 0 && s.vencido) clientesInadimplentesSet.add(id);
    });

    if (el("dashKpiVendido"))      el("dashKpiVendido").textContent      = formatarMoeda(totalVendido);
    if (el("dashKpiRecebido"))     el("dashKpiRecebido").textContent     = formatarMoeda(totalRecebido);
    if (el("dashKpiAberto"))       el("dashKpiAberto").textContent       = formatarMoeda(totalAberto);
    if (el("dashKpiInadimplentes")) el("dashKpiInadimplentes").textContent = clientesInadimplentesSet.size;
    if (el("dashKpiClientes"))     el("dashKpiClientes").textContent     = clientes.length;

    // ── Comparativo vs mês anterior (para os deltas dos KPIs) ───
    const mesAtualRef    = { ano: hoje.getFullYear(), mes: hoje.getMonth() };
    const dataAnterior   = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const mesAnteriorRef = { ano: dataAnterior.getFullYear(), mes: dataAnterior.getMonth() };
    const fimMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59);

    const vendidoMesAtual     = _somaPorMes(compras, "dataCompra", mesAtualRef);
    const vendidoMesAnterior  = _somaPorMes(compras, "dataCompra", mesAnteriorRef);
    const recebidoMesAtual    = _somaPorMes(pagamentos, "dataPagamento", mesAtualRef);
    const recebidoMesAnterior = _somaPorMes(pagamentos, "dataPagamento", mesAnteriorRef);

    // Aberto "até o fim do mês anterior" (snapshot), pra comparar com o aberto de hoje
    const vendidoAteFimMesAnterior = _somaAte(compras, "dataCompra", fimMesAnterior);
    const recebidoAteFimMesAnterior = _somaAte(pagamentos, "dataPagamento", fimMesAnterior);
    const abertoFimMesAnterior = Math.max(0, vendidoAteFimMesAnterior - recebidoAteFimMesAnterior);

    const clientesAteFimMesAnterior = clientes.filter(c => {
      const d = c.criadoEm?.toDate?.() || (c.criadoEm ? new Date(c.criadoEm) : null);
      return !d || d <= fimMesAnterior;
    }).length;

    _definirDeltaKpi("dashKpiVendido",       vendidoMesAtual, vendidoMesAnterior, "moeda");
    _definirDeltaKpi("dashKpiRecebido",      recebidoMesAtual, recebidoMesAnterior, "moeda");
    _definirDeltaKpi("dashKpiAberto",        totalAberto, abertoFimMesAnterior, "moeda");
    _definirDeltaKpi("dashKpiClientes",      clientes.length, clientesAteFimMesAnterior, "contagem");
    if (el("dashKpiInadimplentesDelta")) {
      el("dashKpiInadimplentesDelta").textContent = "vs mês anterior";
      el("dashKpiInadimplentesDelta").className = "prom-delta prom-delta--neutro";
    }

    _dashCache.compras = compras;
    _dashCache.pagamentos = pagamentos;

    // ── Gráficos 1 e 5: Evolução + Recebimentos por Mês (respeitam o filtro de período) ──
    _renderGraficosPeriodo(document.getElementById("filtroPeriodoDash")?.value || "ano");

    // ── Gráfico 2: Situação das Promissórias (por valor) ────────
    let valorAtrasado = 0, valorPendente = 0;
    Object.values(saldoPorCliente).forEach(s => {
      const saldo = s.compras - s.pagamentos;
      if (saldo <= 0) return;
      if (s.vencido) valorAtrasado += saldo; else valorPendente += saldo;
    });
    const totalSituacao = totalRecebido + valorPendente + valorAtrasado;

    _destruirChart("chartSituacao");
    _promCharts.chartSituacao = new Chart(el("chartSituacao"), {
      type: "doughnut",
      data: {
        labels: ["Pagas", "Pendentes", "Atrasadas"],
        datasets: [{
          data: [totalRecebido, valorPendente, valorAtrasado],
          backgroundColor: [PROM_CORES.azul, PROM_CORES.amarelo, PROM_CORES.vermelho],
          borderWidth: 0
        }]
      },
      options: _opcoesBase({ cutout: "65%", plugins: { legend: { display: false } }, scales: undefined })
    });
    _renderLegendaDonut("situacaoLegend", [
      { cor: PROM_CORES.azul,     label: "Pagas",      valor: totalRecebido },
      { cor: PROM_CORES.amarelo,  label: "Pendentes",  valor: valorPendente },
      { cor: PROM_CORES.vermelho, label: "Atrasadas",  valor: valorAtrasado }
    ], totalSituacao);

    // ── Gráfico 3: Clientes Novos x Recorrentes ─────────────────
    let novos = 0, recorrentes = 0;
    clientes.forEach(c => {
      const qtd = saldoPorCliente[c.id]?.qtdCompras || 0;
      if (qtd >= 2) recorrentes++; else novos++;
    });
    const totalNR = novos + recorrentes;

    _destruirChart("chartNovosRecorrentes");
    _promCharts.chartNovosRecorrentes = new Chart(el("chartNovosRecorrentes"), {
      type: "doughnut",
      data: {
        labels: ["Recorrentes", "Novos"],
        datasets: [{
          data: [recorrentes, novos],
          backgroundColor: [PROM_CORES.azulEsc, PROM_CORES.azul],
          borderWidth: 0
        }]
      },
      options: _opcoesBase({ cutout: "65%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw}` } } }, scales: undefined })
    });
    _renderLegendaDonut("novosRecorrentesLegend", [
      { cor: PROM_CORES.azulEsc, label: "Recorrentes", valor: recorrentes, unidade: "" },
      { cor: PROM_CORES.azul,    label: "Novos",       valor: novos, unidade: "" }
    ], totalNR, { moeda: false, totalLabel: "Total de clientes" });

    // ── Gráfico 4: Top 10 Clientes Devedores ────────────────────
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
        datasets: [{ label: "Saldo Devedor", data: devedores.map(d => d.saldo), backgroundColor: PROM_CORES.azul, borderRadius: 4 }]
      },
      options: _opcoesBase({
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { callback: v => formatarMoeda(v) } } }
      })
    });

    // ── Gráfico 6: Recebimentos por Forma de Pagamento ──────────
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

    // ── Gráfico 7: Aging de Inadimplência (dias em atraso) ──────
    const faixasAging = [
      { label: "1–30 dias",  min: 1,  max: 30 },
      { label: "31–60 dias", min: 31, max: 60 },
      { label: "61–90 dias", min: 61, max: 90 },
      { label: "90+ dias",   min: 91, max: Infinity }
    ];
    const valoresAging = faixasAging.map(() => 0);

    compras.forEach(c => {
      const saldoCli = saldoPorCliente[c.clienteId];
      if (!saldoCli || (saldoCli.compras - saldoCli.pagamentos) <= 0) return;
      if (!c.vencimento) return;
      const venc = c.vencimento.toDate?.() || new Date(c.vencimento);
      const diasAtraso = Math.floor((hoje - venc) / 86400000);
      if (diasAtraso <= 0) return;
      const idxFaixa = faixasAging.findIndex(f => diasAtraso >= f.min && diasAtraso <= f.max);
      if (idxFaixa >= 0) valoresAging[idxFaixa] += (c.valor || 0);
    });

    _destruirChart("chartAging");
    _promCharts.chartAging = new Chart(el("chartAging"), {
      type: "bar",
      data: {
        labels: faixasAging.map(f => f.label),
        datasets: [{
          label: "Valor em Atraso",
          data: valoresAging,
          backgroundColor: [PROM_CORES.amarelo, PROM_CORES.laranja, PROM_CORES.vermelho, "#991B1B"],
          borderRadius: 4
        }]
      },
      options: _opcoesBase({
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => formatarMoeda(v) } } }
      })
    });

    // ── Gráfico 8: Previsão de Recebimentos (vencimentos futuros) ──
    const faixasFuturo = [
      { label: "Próx. 7 dias", min: 0,  max: 7 },
      { label: "8–15 dias",    min: 8,  max: 15 },
      { label: "16–30 dias",   min: 16, max: 30 },
      { label: "31–60 dias",   min: 31, max: 60 },
      { label: "60+ dias",     min: 61, max: Infinity }
    ];
    const valoresFuturo = faixasFuturo.map(() => 0);

    compras.forEach(c => {
      const saldoCli = saldoPorCliente[c.clienteId];
      if (!saldoCli || (saldoCli.compras - saldoCli.pagamentos) <= 0) return;
      if (!c.vencimento) return;
      const venc = c.vencimento.toDate?.() || new Date(c.vencimento);
      const diasRestantes = Math.ceil((venc - hoje) / 86400000);
      if (diasRestantes < 0) return;
      const idxFaixa = faixasFuturo.findIndex(f => diasRestantes >= f.min && diasRestantes <= f.max);
      if (idxFaixa >= 0) valoresFuturo[idxFaixa] += (c.valor || 0);
    });

    _destruirChart("chartVencimentosFuturos");
    _promCharts.chartVencimentosFuturos = new Chart(el("chartVencimentosFuturos"), {
      type: "bar",
      data: {
        labels: faixasFuturo.map(f => f.label),
        datasets: [{
          label: "Previsto a Receber",
          data: valoresFuturo,
          backgroundColor: PROM_CORES.verde,
          borderRadius: 4
        }]
      },
      options: _opcoesBase({
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => formatarMoeda(v) } } }
      })
    });

    // ── Metas (gauges) ──────────────────────────────────────────
    const recebidoInadimplentesMesAtual = pagamentos.reduce((soma, p) => {
      const d = p.dataPagamento?.toDate?.() || (p.dataPagamento ? new Date(p.dataPagamento) : null);
      if (!d || d.getFullYear() !== mesAtualRef.ano || d.getMonth() !== mesAtualRef.mes) return soma;
      if (!clientesInadimplentesSet.has(p.clienteId)) return soma;
      return soma + (p.valor || 0);
    }, 0);

    _renderGaugeMeta("gaugeVendas",       vendidoMesAtual,             _metasCache.vendas,       PROM_CORES.azul);
    _renderGaugeMeta("gaugeRecebimentos", recebidoMesAtual,            _metasCache.recebimentos, PROM_CORES.verde);
    _renderGaugeMeta("gaugeCobranca",     recebidoInadimplentesMesAtual, _metasCache.cobranca,    PROM_CORES.laranja);

  } catch (err) {
    console.error("Erro ao carregar dashboard:", err);
    window.mostrarToast?.("Erro ao carregar dashboard.", "error");
  }
}

// ── Delta genérico dos cards de KPI (moeda ou contagem) ─────────
function _definirDeltaKpi(idPrefix, atual, anterior, tipo = "moeda") {
  const elDelta = document.getElementById(`${idPrefix}Delta`);
  if (!elDelta) return;

  if (tipo === "contagem") {
    const diff = atual - anterior;
    if (diff === 0) {
      elDelta.textContent = "— vs mês anterior";
      elDelta.className = "prom-delta prom-delta--neutro";
      return;
    }
    const seta = diff > 0 ? "▲" : "▼";
    const classe = diff > 0 ? "prom-delta--up" : "prom-delta--down";
    elDelta.textContent = `${seta} ${Math.abs(diff)} vs mês anterior`;
    elDelta.className = `prom-delta ${classe}`;
    return;
  }

  if (anterior <= 0) {
    elDelta.textContent = atual > 0 ? "Novo mês de movimento" : "Sem dados no período";
    elDelta.className = `prom-delta ${atual > 0 ? "prom-delta--up" : "prom-delta--neutro"}`;
    return;
  }
  const variacao = ((atual - anterior) / anterior) * 100;
  const seta = variacao > 0 ? "▲" : variacao < 0 ? "▼" : "—";
  const classe = variacao > 0 ? "prom-delta--up" : variacao < 0 ? "prom-delta--down" : "prom-delta--neutro";
  elDelta.textContent = `${seta} ${Math.abs(variacao).toFixed(1)}% vs mês anterior`;
  elDelta.className = `prom-delta ${classe}`;
}

// Renderiza a legenda ao lado de um donut (cor + label + valor + total)
function _renderLegendaDonut(containerId, itens, total, { moeda = true, totalLabel = "Total" } = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const fmt = v => moeda ? formatarMoeda(v) : v;
  container.innerHTML = itens.map(i => `
    <div class="psl-linha">
      <span class="psl-dot" style="background:${i.cor}"></span>
      <span class="psl-label">${i.label}</span>
      <span class="psl-valor">${fmt(i.valor)}</span>
    </div>
  `).join("") + `<div class="psl-total">${totalLabel}: ${fmt(total)}</div>`;
}

// ── Gauge (semicírculo) de metas ────────────────────────────────
function _renderGaugeMeta(canvasId, valorAtual, meta, cor) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const pct = meta > 0 ? Math.min(1, valorAtual / meta) : 0;
  const pctTexto = meta > 0 ? Math.round((valorAtual / meta) * 100) : 0;

  _destruirChart(canvasId);
  _promCharts[canvasId] = new Chart(canvas, {
    type: "doughnut",
    data: {
      datasets: [{
        data: [pct, 1 - pct],
        backgroundColor: [cor, "#E2E8F0"],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      rotation: -90,
      circumference: 180,
      cutout: "75%",
      plugins: { legend: { display: false }, tooltip: { enabled: false } }
    }
  });

  const elPct = document.getElementById(`${canvasId}Pct`);
  if (elPct) elPct.textContent = `${pctTexto}%`;

  const elValores = document.getElementById(`${canvasId}Valores`);
  if (elValores) elValores.textContent = meta > 0
    ? `${formatarMoeda(valorAtual)} de ${formatarMoeda(meta)}`
    : `${formatarMoeda(valorAtual)} — meta não definida`;
}

// ── Modal para editar as metas (salva em config/prom_metas) ────
async function abrirModalEditarMeta(chave) {
  const labels = { vendas: "Meta de Vendas", recebimentos: "Meta de Recebimentos", cobranca: "Meta de Cobrança" };
  const valorAtual = _metasCache[chave] || 0;

  const body = `
    <div class="form-usuario">
      <label class="field-label">${labels[chave] || "Meta"} (R$)</label>
      <input type="number" id="inputValorMeta" class="filter-input" style="width:100%" min="0" step="0.01" value="${valorAtual || ""}" placeholder="0,00">
    </div>`;
  const footer = `
    <button class="btn-ghost" id="btnCancelarModalProm">Cancelar</button>
    <button class="btn-primary" id="btnSalvarMeta">Salvar</button>`;

  abrirModal(labels[chave] || "Editar Meta", body, footer);
  document.getElementById("btnCancelarModalProm").onclick = fecharModal;
  document.getElementById("inputValorMeta").focus();

  document.getElementById("btnSalvarMeta").onclick = async () => {
    const novoValor = parseFloat(document.getElementById("inputValorMeta").value) || 0;
    try {
      _metasCache[chave] = novoValor;
      await setDoc(doc(db, COL_CONFIG, DOC_METAS), { [chave]: novoValor }, { merge: true });
      fecharModal();
      window.mostrarToast?.("Meta salva com sucesso!", "success");
      carregarDashboardProm();
    } catch (err) {
      console.error(err);
      window.mostrarToast?.("Erro ao salvar meta.", "error");
    }
  };
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

// Gera os 12 meses (Jan → Dez) de um ano, com label "mmm"
function _mesesDoAno(ano) {
  const lista = [];
  for (let mes = 0; mes < 12; mes++) {
    lista.push({
      ano, mes,
      label: new Date(ano, mes, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")
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

function _somaPorDia(lista, campoData, diaRef) {
  return lista.reduce((soma, item) => {
    const data = item[campoData]?.toDate?.() || (item[campoData] ? new Date(item[campoData]) : null);
    if (!data) return soma;
    if (data.getFullYear() === diaRef.ano && data.getMonth() === diaRef.mes && data.getDate() === diaRef.dia) {
      return soma + (item.valor || 0);
    }
    return soma;
  }, 0);
}

// Monta os "baldes" (dias ou meses) de acordo com o período escolhido no filtro
function _bucketsDoPeriodo(periodo) {
  const hoje = new Date();
  if (periodo === "mes") {
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    return {
      tipo: "dia",
      buckets: Array.from({ length: diasNoMes }, (_, i) => ({
        ano: hoje.getFullYear(), mes: hoje.getMonth(), dia: i + 1, label: String(i + 1)
      }))
    };
  }
  if (periodo === "trimestre") {
    const lista = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      lista.push({ ano: d.getFullYear(), mes: d.getMonth(), label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "") });
    }
    return { tipo: "mes", buckets: lista };
  }
  // "ano" (padrão) — Jan a Dez do ano atual
  return { tipo: "mes", buckets: _mesesDoAno(hoje.getFullYear()) };
}

// Renderiza os gráficos "Evolução das Promissórias" e "Recebimentos por Mês"
// usando os dados já carregados em cache (não refaz a busca ao Firestore).
function _renderGraficosPeriodo(periodo) {
  const el = id => document.getElementById(id);
  if (!el("chartEvolucao") || typeof Chart === "undefined") return;

  const { tipo, buckets } = _bucketsDoPeriodo(periodo);
  const somaFn = tipo === "dia" ? _somaPorDia : _somaPorMes;
  const compras = _dashCache.compras, pagamentos = _dashCache.pagamentos;

  const vendidoSerie  = buckets.map(b => somaFn(compras, "dataCompra", b));
  const recebidoSerie = buckets.map(b => somaFn(pagamentos, "dataPagamento", b));

  // "Aberto" é sempre o saldo real acumulado (histórico completo) até o fim de cada balde
  const abertoSerie = buckets.map(b => {
    const fim = tipo === "dia"
      ? new Date(b.ano, b.mes, b.dia, 23, 59, 59)
      : new Date(b.ano, b.mes + 1, 0, 23, 59, 59);
    const vendidoAte  = _somaAte(compras, "dataCompra", fim);
    const recebidoAte = _somaAte(pagamentos, "dataPagamento", fim);
    return Math.max(0, vendidoAte - recebidoAte);
  });

  const labels = buckets.map(b => b.label);

  _destruirChart("chartEvolucao");
  _promCharts.chartEvolucao = new Chart(el("chartEvolucao"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Valor Vendido",  data: vendidoSerie,  borderColor: PROM_CORES.azul,    backgroundColor: PROM_CORES.azul,    tension: .35, pointRadius: 3 },
        { label: "Valor Recebido", data: recebidoSerie, borderColor: PROM_CORES.verde,   backgroundColor: PROM_CORES.verde,   tension: .35, pointRadius: 3 },
        { label: "Valor em Aberto", data: abertoSerie,  borderColor: PROM_CORES.laranja, backgroundColor: PROM_CORES.laranja, tension: .35, pointRadius: 3 }
      ]
    },
    options: _opcoesBase({
      scales: { y: { beginAtZero: true, ticks: { callback: v => formatarMoeda(v) } } }
    })
  });

  _destruirChart("chartRecebimentosMes");
  _promCharts.chartRecebimentosMes = new Chart(el("chartRecebimentosMes"), {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Recebido", data: recebidoSerie, backgroundColor: PROM_CORES.verde, borderRadius: 4 }]
    },
    options: _opcoesBase({
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => formatarMoeda(v) } } }
    })
  });
}

// Soma tudo cujo campo de data seja <= dataLimite (snapshot acumulado)
function _somaAte(lista, campoData, dataLimite) {
  return lista.reduce((soma, item) => {
    const data = item[campoData]?.toDate?.() || (item[campoData] ? new Date(item[campoData]) : null);
    if (!data || data > dataLimite) return soma;
    return soma + (item.valor || 0);
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
          <div style="display:flex;align-items:flex-start;gap:10px">
            <button class="btn-icon" id="btnVoltarClienteProm" data-action="voltar-lista-prom" title="Voltar para Promissórias" style="flex-shrink:0;margin-top:2px">
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:20px;height:20px"><path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>
            </button>
            <div>
              <h2 class="page-title">${escHtml(cliente.nome)}</h2>
              <p class="page-subtitle">
                ${cliente.documento ? `${cliente.tipo === "juridica" ? "CNPJ" : "CPF"}: ${escHtml(cliente.documento)} · ` : ""}
                ${(cliente.telefone || cliente.celular) ? `📱 ${escHtml(cliente.celular || cliente.telefone)}` : ""}
                ${cliente.cidade ? ` · ${escHtml(cliente.cidade)}${cliente.estado ? "/"+escHtml(cliente.estado) : ""}` : ""}
                ${cliente.observacoes ? ` · ${escHtml(cliente.observacoes)}` : ""}
              </p>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-secondary" data-action="historico-cliente" data-cliente-id="${clienteId}">
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/></svg>
              Histórico de Alterações
            </button>
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
                        <td>${formatarDataLocal(c.dataCompra)}${c.parcelaTotal ? `<br><span style="display:inline-block;margin-top:2px;padding:1px 8px;border-radius:9999px;font-size:0.7rem;font-weight:600;background:var(--blue-050);color:var(--blue-600)">Parcela ${c.parcelaNumero}/${c.parcelaTotal}</span>` : ""}</td>
                        <td>${formatarMoeda(c.valor)}</td>
                        <td>${venc ? formatarDataLocal(c.vencimento) : "—"}</td>
                        <td>${c.juros > 0 ? `<span style="color:#DC2626">${formatarMoeda(c.juros)}</span>` : "—"}</td>
                        <td>${c.juros > 0 ? `<strong style="color:#DC2626">${formatarMoeda(c.valorComJuros)}</strong>` : formatarMoeda(c.valor)}</td>
                        <td>${c.pagoCompra > 0 ? `<span style="color:var(--color-success)">${formatarMoeda(c.pagoCompra)}</span>` : "—"}</td>
                        <td>${c.saldoCompra > 0 ? `<strong style="color:var(--color-danger)">${formatarMoeda(c.saldoCompra)}</strong>` : `<span style="color:var(--color-success)">Quitado</span>`}</td>
                        <td>${c.juros > 0 ? badgeSituacao("Atrasado") : (venc ? badgeSituacao("Pendente") : "—")}</td>
                        <td style="max-width:140px;white-space:normal;font-size:var(--text-xs);color:var(--gray-500)">${escHtml(c.observacoes || "")}${_htmlAnexos(c.anexos)}</td>
                        <td class="col-center">
                          <button class="btn-table-action" data-action="ver-comprovante-compra" data-id="${c.id}" title="Ver comprovante">
                            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
                          </button>
                          <button class="btn-table-action" data-action="pdf-comprovante-compra" data-id="${c.id}" title="Baixar PDF do comprovante">
                            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM9 3a1 1 0 012 0v8.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V3z" clip-rule="evenodd"/></svg>
                          </button>
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
                  <th class="col-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${pagamentos.length === 0
                  ? `<tr><td colspan="6" class="empty-cell">Nenhum pagamento registrado.</td></tr>`
                  : pagamentos.map(p => {
                    const compraRel = p.compraId ? compras.find(c => c.id === p.compraId) : null;
                    return `
                    <tr>
                      <td>${formatarDataLocal(p.dataPagamento)}</td>
                      <td><strong style="color:var(--color-success)">${formatarMoeda(p.valor)}</strong></td>
                      <td style="font-size:var(--text-xs);color:var(--gray-500)">${compraRel ? `Compra de ${formatarDataLocal(compraRel.dataCompra)}` : "Crédito geral"}</td>
                      <td>${escHtml(p.forma || "—")}</td>
                      <td style="font-size:var(--text-xs);color:var(--gray-500)">${escHtml(p.observacoes || "")}${_htmlAnexos(p.anexos)}</td>
                      <td class="col-center">
                        <button class="btn-table-action" data-action="ver-comprovante-pagamento" data-id="${p.id}" title="Ver comprovante">
                          <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
                        </button>
                        <button class="btn-table-action" data-action="pdf-comprovante-pagamento" data-id="${p.id}" title="Baixar PDF do comprovante">
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM9 3a1 1 0 012 0v8.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V3z" clip-rule="evenodd"/></svg>
                        </button>
                      </td>
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
const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

function _mascararCpf(valor) {
  let v = valor.replace(/\D/g, "").substring(0, 11);
  if (v.length > 9)      v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2})$/, "$1.$2.$3-$4");
  else if (v.length > 6) v = v.replace(/^(\d{3})(\d{3})(\d{0,3})$/, "$1.$2.$3");
  else if (v.length > 3) v = v.replace(/^(\d{3})(\d{0,3})$/, "$1.$2");
  return v;
}

function _mascararCnpj(valor) {
  let v = valor.replace(/\D/g, "").substring(0, 14);
  if (v.length > 12)     v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})$/, "$1.$2.$3/$4-$5");
  else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})$/, "$1.$2.$3/$4");
  else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d{0,3})$/, "$1.$2.$3");
  else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,3})$/, "$1.$2");
  return v;
}

function _mascararCep(valor) {
  let v = valor.replace(/\D/g, "").substring(0, 8);
  if (v.length > 5) v = v.replace(/^(\d{5})(\d{0,3})$/, "$1-$2");
  return v;
}

async function _buscarEnderecoPorCep(e) {
  const cep = e.target.value.replace(/\D/g, "");
  if (cep.length !== 8) return;
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await resp.json();
    if (data.erro) return;
    if (document.getElementById("mPromEndereco")) document.getElementById("mPromEndereco").value = data.logradouro || "";
    if (document.getElementById("mPromBairro"))   document.getElementById("mPromBairro").value   = data.bairro || "";
    if (document.getElementById("mPromCidade"))   document.getElementById("mPromCidade").value   = data.localidade || "";
    if (document.getElementById("mPromEstado"))   document.getElementById("mPromEstado").value   = data.uf || "";
    document.getElementById("mPromNumero")?.focus();
  } catch (err) {
    console.error("Erro ao buscar CEP:", err);
  }
}

function abrirModalNovoCliente() {
  const tipo = "fisica";
  const optionsEstado = ESTADOS_BR.map(uf => `<option value="${uf}">${uf}</option>`).join("");

  const body = `
    <div class="cli-tipo-toggle" role="tablist">
      <button type="button" class="cli-tipo-btn cli-tipo-btn--active" data-tipo="fisica" id="btnPromTipoFisica">Pessoa Física</button>
      <button type="button" class="cli-tipo-btn" data-tipo="juridica" id="btnPromTipoJuridica">Pessoa Jurídica</button>
    </div>
    <input type="hidden" id="mPromTipo" value="${tipo}" autocomplete="off" />

    <div class="cli-form-grid" style="margin-top:var(--space-4)">
      <div class="field" style="grid-column:1 / -1">
        <label class="field-label" id="lblPromNome" for="mPromNome">Nome completo *</label>
        <input type="text" class="field-input--plain" id="mPromNome" placeholder="Nome do cliente" autocomplete="off" />
      </div>

      <div class="field" style="grid-column:1 / -1">
        <label class="field-label" id="lblPromApelido" for="mPromApelido">Apelido</label>
        <input type="text" class="field-input--plain" id="mPromApelido" autocomplete="off" />
      </div>

      <!-- Campos Pessoa Física -->
      <div id="mPromBlocoFisica" class="cli-form-grid" style="grid-column:1 / -1;display:grid">
        <div class="field">
          <label class="field-label" for="mPromCpf">CPF</label>
          <input type="text" class="field-input--plain" id="mPromCpf" placeholder="000.000.000-00" maxlength="14" autocomplete="off" />
        </div>
        <div class="field">
          <label class="field-label" for="mPromRg">RG</label>
          <input type="text" class="field-input--plain" id="mPromRg" autocomplete="off" />
        </div>
        <div class="field">
          <label class="field-label" for="mPromNascimento">Nascimento</label>
          <input type="date" class="field-input--plain" id="mPromNascimento" autocomplete="off" />
        </div>
      </div>

      <!-- Campos Pessoa Jurídica -->
      <div id="mPromBlocoJuridica" class="cli-form-grid" style="grid-column:1 / -1;display:none">
        <div class="field">
          <label class="field-label" for="mPromCnpj">CNPJ</label>
          <input type="text" class="field-input--plain" id="mPromCnpj" placeholder="00.000.000/0001-00" maxlength="18" autocomplete="off" />
        </div>
        <div class="field">
          <label class="field-label" for="mPromIe">Inscrição Estadual</label>
          <input type="text" class="field-input--plain" id="mPromIe" autocomplete="off" />
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="mPromEmail">E-mail</label>
        <input type="email" class="field-input--plain" id="mPromEmail" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="mPromTelefone">Telefone</label>
        <input type="tel" class="field-input--plain" id="mPromTelefone" placeholder="(00) 0000-0000" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="mPromCelular">Celular</label>
        <input type="tel" class="field-input--plain" id="mPromCelular" placeholder="(00) 00000-0000" autocomplete="off" />
      </div>

      <div class="field">
        <label class="field-label" for="mPromCep">CEP</label>
        <input type="text" class="field-input--plain" id="mPromCep" placeholder="00000-000" maxlength="9" autocomplete="off" />
      </div>
      <div class="field" style="grid-column:span 2">
        <label class="field-label" for="mPromEndereco">Endereço</label>
        <input type="text" class="field-input--plain" id="mPromEndereco" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="mPromNumero">Número</label>
        <input type="text" class="field-input--plain" id="mPromNumero" autocomplete="off" />
      </div>

      <div class="field">
        <label class="field-label" for="mPromComplemento">Complemento</label>
        <input type="text" class="field-input--plain" id="mPromComplemento" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="mPromBairro">Bairro</label>
        <input type="text" class="field-input--plain" id="mPromBairro" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="mPromCidade">Cidade</label>
        <input type="text" class="field-input--plain" id="mPromCidade" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="mPromEstado">Estado</label>
        <select class="field-input--plain" id="mPromEstado" autocomplete="off">
          <option value="">UF</option>
          ${optionsEstado}
        </select>
      </div>

      <div class="field" style="grid-column:1 / -1">
        <label class="field-label" for="mPromObs">Observações</label>
        <textarea class="field-input--plain field-textarea" id="mPromObs" rows="2" autocomplete="off"></textarea>
      </div>

      <div class="field" style="grid-column:1 / -1">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--text-sm);color:var(--gray-700)">
          <input type="checkbox" id="mPromAtivo" checked autocomplete="off" />
          Cliente ativo
        </label>
      </div>
    </div>`;

  const footer = `
    <button class="btn-ghost" id="btnCancelarModalProm">Cancelar</button>
    <button class="btn-primary" id="btnSalvarNovoCliente">Salvar Cliente</button>`;

  abrirModal("Novo Cliente", body, footer, { tamanho: "lg" });

  document.getElementById("btnPromTipoFisica").onclick = () => _alternarTipoClienteProm("fisica");
  document.getElementById("btnPromTipoJuridica").onclick = () => _alternarTipoClienteProm("juridica");

  document.getElementById("mPromCpf")?.addEventListener("input", (e) => e.target.value = _mascararCpf(e.target.value));
  document.getElementById("mPromCnpj")?.addEventListener("input", (e) => e.target.value = _mascararCnpj(e.target.value));
  document.getElementById("mPromCep")?.addEventListener("input", (e) => e.target.value = _mascararCep(e.target.value));
  document.getElementById("mPromCep")?.addEventListener("blur", _buscarEnderecoPorCep);

  document.getElementById("btnCancelarModalProm").onclick = fecharModal;
  document.getElementById("btnSalvarNovoCliente").onclick = salvarNovoCliente;
  document.getElementById("mPromNome").focus();
}

function _alternarTipoClienteProm(tipo) {
  document.getElementById("mPromTipo").value = tipo;
  document.getElementById("btnPromTipoFisica").classList.toggle("cli-tipo-btn--active", tipo === "fisica");
  document.getElementById("btnPromTipoJuridica").classList.toggle("cli-tipo-btn--active", tipo === "juridica");
  document.getElementById("mPromBlocoFisica").style.display   = tipo === "fisica"   ? "grid" : "none";
  document.getElementById("mPromBlocoJuridica").style.display = tipo === "juridica" ? "grid" : "none";
  document.getElementById("lblPromApelido").textContent = tipo === "juridica" ? "Nome Fantasia" : "Apelido";
  document.getElementById("lblPromNome").textContent = `Nome ${tipo === "juridica" ? "/ Razão Social" : "completo"} *`;
}

async function salvarNovoCliente() {
  const tipo = document.getElementById("mPromTipo").value;
  const nome = document.getElementById("mPromNome").value.trim();
  if (!nome) { window.mostrarToast?.("Informe o nome do cliente.", "error"); return; }

  const documento = tipo === "fisica"
    ? document.getElementById("mPromCpf").value.trim()
    : document.getElementById("mPromCnpj").value.trim();

  const btn = document.getElementById("btnSalvarNovoCliente");
  btn.disabled = true; btn.textContent = "Salvando...";

  try {
    await addDoc(collection(db, COL_CLIENTES), {
      tipo,
      nome,
      documento,
      apelido:           document.getElementById("mPromApelido").value.trim(),
      rg:                tipo === "fisica"   ? document.getElementById("mPromRg").value.trim()   : "",
      nascimento:        tipo === "fisica"   ? document.getElementById("mPromNascimento").value    : "",
      inscricaoEstadual: tipo === "juridica" ? document.getElementById("mPromIe").value.trim()     : "",
      email:             document.getElementById("mPromEmail").value.trim(),
      telefone:          document.getElementById("mPromTelefone").value.trim(),
      celular:           document.getElementById("mPromCelular").value.trim(),
      cep:               document.getElementById("mPromCep").value.trim(),
      endereco:          document.getElementById("mPromEndereco").value.trim(),
      numero:            document.getElementById("mPromNumero").value.trim(),
      complemento:       document.getElementById("mPromComplemento").value.trim(),
      bairro:            document.getElementById("mPromBairro").value.trim(),
      cidade:            document.getElementById("mPromCidade").value.trim(),
      estado:            document.getElementById("mPromEstado").value,
      observacoes:       document.getElementById("mPromObs").value.trim(),
      ativo:             document.getElementById("mPromAtivo").checked,
      criadoEm:          serverTimestamp()
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
    <div class="compra-row" data-row-id="${rid}">
      <div class="compra-field compra-field--valor">
        <label class="field-label">Valor (R$) *</label>
        <input type="number" class="compra-valor field-input--plain" placeholder="0,00" min="0.01" step="0.01" autocomplete="off" />
      </div>
      <div class="compra-field">
        <label class="field-label">Data *</label>
        <input type="date" class="compra-data field-input--plain" value="${hojeStr}" autocomplete="off" />
      </div>
      <div class="compra-field">
        <label class="field-label">1º Vencimento</label>
        <input type="date" class="compra-venc field-input--plain" value="${vencStr}" autocomplete="off" />
      </div>
      <div class="compra-field compra-field--parcelas">
        <label class="field-label">Parcelas</label>
        <input type="number" class="compra-parcelas field-input--plain" placeholder="1" min="1" max="24" step="1" value="1" autocomplete="off" title="Número de parcelas" />
      </div>
      <div class="compra-field compra-field--obs">
        <label class="field-label">Observação</label>
        <input type="text" class="compra-obs field-input--plain" placeholder="Descrição da compra..." autocomplete="off" />
      </div>
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
      <div id="comprasRowsContainer">${linhaCompraHtml(hojeStr, vencStr)}</div>
      <button type="button" class="btn-ghost" id="btnAddCompraRow" style="font-size:var(--text-sm)">+ Adicionar outra compra</button>
      <p style="font-size:var(--text-xs);color:var(--gray-500);margin-top:8px">Você pode lançar quantas compras quiser de uma vez. Se "Parcelas" for maior que 1, o valor é dividido igualmente e as parcelas seguintes vencem a cada 30 dias a partir do 1º vencimento. Linhas em branco são ignoradas.</p>
      <div style="margin-top:var(--space-3)">
        <label class="field-label">Fotos da compra</label>
        <input type="file" id="mCompraAnexos" accept="image/*" multiple class="field-input--plain" />
        <p style="font-size:var(--text-xs);color:var(--gray-500);margin-top:4px">As fotos são comprimidas e vinculadas a todas as compras registradas nesta janela. PDF não é suportado (evita custo de armazenamento pago).</p>
      </div>
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
      rows[0].querySelectorAll("input").forEach(i => { if (i.type === "number" && i.classList.contains("compra-parcelas")) i.value = "1"; else if (i.type !== "date") i.value = ""; });
    }
  });

  document.getElementById("btnCancelarModalProm").onclick = fecharModal;
  document.getElementById("btnSalvarNovaCompra").onclick = () => salvarNovaCompra(clienteId);
  container.querySelector(".compra-valor").focus();
}

async function salvarNovaCompra(clienteId) {
  const linhas = Array.from(document.querySelectorAll("#comprasRowsContainer .compra-row"));

  const lancamentos = [];
  for (const linha of linhas) {
    const valor = parseFloat(linha.querySelector(".compra-valor").value);
    const dataStr = linha.querySelector(".compra-data").value;
    const vencStr = linha.querySelector(".compra-venc").value;
    const obs = linha.querySelector(".compra-obs").value.trim();
    const parcelas = Math.max(1, parseInt(linha.querySelector(".compra-parcelas").value, 10) || 1);
    if (!valor && !obs) continue; // linha em branco, ignora
    if (!valor || valor <= 0) { window.mostrarToast?.("Informe um valor válido em todas as compras preenchidas.", "error"); return; }
    if (!dataStr) { window.mostrarToast?.("Informe a data em todas as compras preenchidas.", "error"); return; }
    if (parcelas > 1 && !vencStr) { window.mostrarToast?.("Informe o 1º vencimento para compras parceladas.", "error"); return; }
    lancamentos.push({ valor, dataStr, vencStr, obs, parcelas });
  }

  if (!lancamentos.length) { window.mostrarToast?.("Adicione ao menos uma compra.", "error"); return; }

  // Expande cada lançamento em N parcelas (docs individuais em prom_compras)
  const compras = [];
  lancamentos.forEach(l => {
    const grupoId = `pg${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const valorParcela = Math.floor((l.valor / l.parcelas) * 100) / 100;
    const somaParcelas = valorParcela * (l.parcelas - 1);
    const vencBase = l.vencStr ? new Date(l.vencStr + "T23:59:59") : null;

    for (let i = 0; i < l.parcelas; i++) {
      const valorAtual = i === l.parcelas - 1 ? Math.round((l.valor - somaParcelas) * 100) / 100 : valorParcela;
      const vencAtual = vencBase ? new Date(vencBase.getTime() + i * 30 * 24 * 3600 * 1000) : null;
      const obsAtual = l.parcelas > 1 ? `${l.obs ? l.obs + " — " : ""}Parcela ${i + 1}/${l.parcelas}` : l.obs;
      compras.push({
        valor: valorAtual,
        dataStr: l.dataStr,
        vencimento: vencAtual,
        obs: obsAtual,
        parcelaGrupoId: l.parcelas > 1 ? grupoId : null,
        parcelaNumero: l.parcelas > 1 ? i + 1 : null,
        parcelaTotal: l.parcelas > 1 ? l.parcelas : null
      });
    }
  });

  const btn = document.getElementById("btnSalvarNovaCompra");
  btn.disabled = true; btn.textContent = "Salvando...";

  try {
    const arquivos = document.getElementById("mCompraAnexos")?.files;
    let anexos = [];
    if (arquivos && arquivos.length) {
      btn.textContent = "Processando fotos...";
      anexos = await _uploadAnexos(arquivos, `compras/${clienteId}`);
      btn.textContent = "Salvando...";
    }

    const refs = await Promise.all(compras.map(c => addDoc(collection(db, COL_COMPRAS), {
      clienteId,
      valor: c.valor,
      dataCompra:      Timestamp.fromDate(new Date(c.dataStr + "T12:00:00")),
      vencimento:      c.vencimento ? Timestamp.fromDate(c.vencimento) : null,
      observacoes:     c.obs,
      parcelaGrupoId:  c.parcelaGrupoId,
      parcelaNumero:   c.parcelaNumero,
      parcelaTotal:    c.parcelaTotal,
      anexos,
      criadoEm:        serverTimestamp()
    })));
    await Promise.all(refs.map((docRef, idx) => _registrarHistorico(
      "compra", "criado", clienteId, docRef.id, compras[idx].valor,
      compras[idx].parcelaTotal ? `Parcela ${compras[idx].parcelaNumero}/${compras[idx].parcelaTotal}` : ""
    )));
    fecharModal();
    window.mostrarToast?.(`${compras.length} compra(s) registrada(s) com sucesso!`, "success");
    abrirPainelCliente(clienteId);
    carregarIndicadores();

    // Gera um comprovante para cada lançamento (uma compra pode ter várias parcelas,
    // mas o comprovante é por lançamento original, com o valor total dele; usa o
    // primeiro doc de cada grupo de parcelas como referência do número da compra)
    let idxDoc = 0;
    for (const l of lancamentos) {
      const compraRef = refs[idxDoc];
      idxDoc += l.parcelas;
      const modo = await perguntarComprovante("Compra registrada com sucesso! Deseja visualizar ou imprimir o comprovante?");
      if (modo) await imprimirComprovanteCompra(clienteId, compraRef.id, l.valor, l.dataStr, l.vencStr, l.obs, modo);
    }
  } catch (err) {
    console.error(err);
    window.mostrarToast?.("Erro ao registrar compra(s).", "error");
    btn.disabled = false; btn.textContent = "Registrar Compra(s)";
  }
}

// ── Comprovante de Compra / Venda a Prazo (impressão) ───────────
async function imprimirComprovanteCompra(clienteId, compraId, valorCompra, dataStr, vencStr, obsCompra, modo = "print") {
  try {
    const [clienteSnap, comprasSnap, pagamentosSnap] = await Promise.all([
      getDoc(doc(db, COL_CLIENTES, clienteId)),
      getDocs(query(collection(db, COL_COMPRAS), where("clienteId", "==", clienteId))),
      getDocs(query(collection(db, COL_PAGAMENTOS), where("clienteId", "==", clienteId)))
    ]);
    const cliente = clienteSnap.data();
    const origem = window.location.origin;

    let totalComprado = 0;
    comprasSnap.forEach(d => { totalComprado += d.data().valor || 0; });
    let totalPago = 0;
    pagamentosSnap.forEach(d => { totalPago += d.data().valor || 0; });
    const saldoAtual = totalComprado - totalPago;

    const agora = new Date();
    const dataCompra = new Date(dataStr + "T12:00:00");
    const vencimento = vencStr ? new Date(vencStr + "T23:59:59") : null;
    const diasPrazo = vencimento ? Math.round((vencimento - dataCompra) / 86400000) : null;
    const numeroCompra = `CMP-${compraId.slice(-6).toUpperCase()}`;

    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"><title>Comprovante de Compra — ${escHtml(cliente.nome)}</title>
      <style>
        * { box-sizing: border-box; }
        body{font-family:Arial,Helvetica,sans-serif;font-size:13px;margin:0;padding:28px 32px;color:#1E1E1E;background:#fff}
        .topo{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:1px solid #E2E8F0;padding-bottom:20px;margin-bottom:20px}
        .empresa{display:flex;gap:14px;align-items:flex-start}
        .empresa img{width:70px;height:70px;border-radius:14px;object-fit:cover}
        .empresa h1{font-size:24px;margin:0 0 2px;color:#002D94;letter-spacing:.02em}
        .empresa .subtitulo{font-size:13px;color:#475569;font-weight:bold;margin-bottom:8px}
        .empresa .linha{font-size:11.5px;color:#334155;line-height:1.5}
        .empresa .linha strong{color:#111}
        .cartao-info{background:#F7F9FC;border:1px solid #E2E8F0;border-radius:10px;padding:10px 18px;min-width:270px}
        .cartao-info .item{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #E7ECF3}
        .cartao-info .item:last-child{border-bottom:none}
        .cartao-info .ico{width:16px;height:16px;flex-shrink:0;color:#118DFF}
        .cartao-info .rotulo{font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:.03em;flex:1}
        .cartao-info .valor{font-size:13px;font-weight:bold;color:#111;text-align:right}
        .resumo{display:flex;gap:16px;margin-bottom:24px}
        .box{flex:1;background:#F7F9FC;border-radius:10px;padding:14px 18px;text-align:center}
        .box-label{font-size:10.5px;color:#64748B;text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px}
        .box-val{font-size:20px;font-weight:800}
        .detalhes{background:#F7F9FC;border-radius:10px;padding:18px 22px;margin-bottom:24px}
        h3.secao{font-size:13px;color:#111;text-transform:uppercase;letter-spacing:.03em;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid #E2E8F0}
        .detalhes-item{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #E7ECF3}
        .detalhes-item:last-child{border-bottom:none}
        .detalhes-item .ico{width:17px;height:17px;flex-shrink:0;color:#118DFF;margin-top:2px}
        .detalhes-item .rotulo{font-size:10.5px;color:#64748B;text-transform:uppercase;letter-spacing:.03em;display:block;margin-bottom:3px}
        .detalhes-item .valor{font-size:14px;font-weight:600;color:#111}
        .detalhes-item .obs{font-size:12px;color:#334155;line-height:1.5}
        .info-box{display:flex;gap:12px;align-items:flex-start;background:#F7F9FC;border-radius:10px;padding:14px 18px;margin-top:10px}
        .info-box .ico{width:18px;height:18px;color:#118DFF;flex-shrink:0;margin-top:1px}
        .info-box strong{display:block;font-size:12px;margin-bottom:2px}
        .info-box span{font-size:11.5px;color:#475569}
        .obrigado{text-align:center;margin-top:26px;font-weight:700;color:#002D94}
        .rodape{display:flex;justify-content:center;gap:22px;flex-wrap:wrap;margin-top:16px;padding-top:16px;border-top:1px solid #E2E8F0;font-size:11.5px;color:#334155}
        .rodape span{display:flex;align-items:center;gap:6px}
        .btn-voltar{position:fixed;top:16px;left:16px;display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #E2E8F0;border-radius:9999px;padding:8px 16px;font-size:13px;font-weight:600;color:#334155;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.08)}
        .btn-voltar:hover{background:#F7F9FC;border-color:#118DFF;color:#118DFF}
        .btn-voltar svg{width:16px;height:16px}
        @media print{.btn-voltar{display:none}}
        @media print{body{padding:14px 18px}}
      </style></head><body>

      <button class="btn-voltar" onclick="window.close()">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>
        Voltar
      </button>

      <div class="topo">
        <div class="empresa">
          <img src="${origem}/img/logo.png" alt="Papelaria Futura" onerror="this.style.display='none'" />
          <div>
            <h1>PAPELARIA FUTURA</h1>
            <div class="subtitulo">COMPROVANTE DE COMPRA (VENDA A PRAZO)</div>
            <div class="linha">
              <strong>Papelaria Futura LTDA</strong><br>
              Av. Dr. Ézio Carneiro Qd.32 Lt.31/33 — Setor Aeroporto, Luziânia/GO<br>
              <strong>CNPJ:</strong> 01.064.836/0001-12<br>
              <strong>Telefone:</strong> (61) 3621-4452 &nbsp;|&nbsp; futuralza@gmail.com
            </div>
          </div>
        </div>
        <div class="cartao-info">
          <div class="item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm10 7H4v7h12V9z" clip-rule="evenodd"/></svg>
            <span class="rotulo">Data da Compra</span>
            <span class="valor">${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span>
          </div>
          <div class="item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
            <span class="rotulo">Cliente</span>
            <span class="valor">${escHtml(cliente.nome)}</span>
          </div>
          <div class="item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9z" clip-rule="evenodd"/></svg>
            <span class="rotulo">Tipo de Venda</span>
            <span class="valor">Venda a Prazo (Fiado)</span>
          </div>
          <div class="item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
            <span class="rotulo">Atendido por</span>
            <span class="valor">${escHtml(_dadosUsuario?.nome || "—")}</span>
          </div>
        </div>
      </div>

      <div class="resumo">
        <div class="box"><div class="box-label">Número da Compra</div><div class="box-val" style="font-size:16px">${escHtml(numeroCompra)}</div></div>
        <div class="box"><div class="box-label">Valor Total da Compra</div><div class="box-val" style="color:#059669">${formatarMoeda(valorCompra)}</div></div>
        <div class="box"><div class="box-label">Saldo Inicial (Em Aberto)</div><div class="box-val" style="color:#DC2626">${formatarMoeda(valorCompra)}</div></div>
      </div>

      <div class="detalhes">
        <h3 class="secao">Informações da Compra</h3>
        <div class="detalhes-item">
          <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm10 7H4v7h12V9z" clip-rule="evenodd"/></svg>
          <div><span class="rotulo">Data da Compra</span><span class="valor">${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span></div>
        </div>
        ${vencimento ? `<div class="detalhes-item">
          <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm10 7H4v7h12V9z" clip-rule="evenodd"/></svg>
          <div><span class="rotulo">Data de Vencimento</span><span class="valor" style="color:#DC2626">${vencimento.toLocaleDateString("pt-BR")}</span>${diasPrazo !== null ? `<div style="font-size:11.5px;color:#64748B;margin-top:2px">(${diasPrazo} dias)</div>` : ""}</div>
        </div>` : ""}
        <div class="detalhes-item">
          <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a1 1 0 011-1h10a1 1 0 011 1v1H4V4zm-1 3a1 1 0 011-1h12a1 1 0 011 1v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" clip-rule="evenodd"/></svg>
          <div><span class="rotulo">Forma de Pagamento</span><span class="valor">A Prazo (Fiado)</span></div>
        </div>
        <div class="detalhes-item">
          <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clip-rule="evenodd"/></svg>
          <div><span class="rotulo">Valor Total da Compra</span><span class="valor" style="color:#059669">${formatarMoeda(valorCompra)}</span></div>
        </div>
        <div class="detalhes-item">
          <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm3 1h6v2H7V5zm0 4h6v2H7V9zm0 4h4v2H7v-2z" clip-rule="evenodd"/></svg>
          <div><span class="rotulo">Saldo Inicial (Em Aberto)</span><span class="valor" style="color:#DC2626">${formatarMoeda(valorCompra)}</span></div>
        </div>
        <div class="detalhes-item">
          <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a1 1 0 00-1 1v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 10.586V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
          <div><span class="rotulo">Observações</span><span class="valor obs">Compra realizada no crediário (fiado).<br>O pagamento poderá ser feito total ou parcialmente até a data de vencimento.${obsCompra ? `<br>${escHtml(obsCompra)}` : ""}</span></div>
        </div>
      </div>

      <h3 class="secao" style="border:none;margin-bottom:8px">Resumo Financeiro</h3>
      <div class="resumo">
        <div class="box"><div class="box-label">Valor Total da Compra</div><div class="box-val" style="color:#059669;font-size:17px">${formatarMoeda(totalComprado)}</div></div>
        <div class="box"><div class="box-label">Pagamentos Realizados</div><div class="box-val" style="color:#059669;font-size:17px">${formatarMoeda(totalPago)}</div></div>
        <div class="box"><div class="box-label">Saldo Atual (Em Aberto)</div><div class="box-val" style="color:${saldoAtual>0?'#DC2626':'#059669'};font-size:17px">${formatarMoeda(Math.max(0,saldoAtual))}</div></div>
      </div>

      <div class="info-box">
        <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>
        <div>
          <strong>Informação</strong>
          <span>Este comprovante não possui valor fiscal. É um documento de controle interno.</span>
        </div>
      </div>

      <div class="obrigado">✓ Obrigado pela preferência!<br>Volte sempre.</div>

      <div class="rodape">
        <span>📞 (61) 3621-4452</span>
        <span>✉️ futuralza@gmail.com</span>
      </div>

      <script>window.onload=()=>{${modo === "print" ? "window.print();" : ""}}<\/script>
      </body></html>`);
    win.document.close();
  } catch (err) {
    console.error(err);
    window.mostrarToast?.("Compra salva, mas houve erro ao gerar o comprovante para impressão.", "warning");
  }
}

// Converte um Timestamp do Firestore (ou string/Date) para "YYYY-MM-DD",
// formato esperado pelas funções de impressão de comprovante.
function _timestampParaDataStr(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// Reabre (visualizar ou baixar PDF) o comprovante de uma compra já salva,
// buscando os dados originais no Firestore.
async function reabrirComprovanteCompra(clienteId, compraId, modo) {
  try {
    const snap = await getDoc(doc(db, COL_COMPRAS, compraId));
    if (!snap.exists()) { window.mostrarToast?.("Compra não encontrada.", "error"); return; }
    const c = snap.data();
    const dataStr = _timestampParaDataStr(c.dataCompra);
    const vencStr = c.vencimento ? _timestampParaDataStr(c.vencimento) : "";
    await imprimirComprovanteCompra(clienteId, compraId, c.valor, dataStr, vencStr, c.observacoes || "", modo);
  } catch (err) {
    console.error(err);
    window.mostrarToast?.("Erro ao gerar comprovante.", "error");
  }
}

// Reabre (visualizar ou baixar PDF) o comprovante de um pagamento já salvo.
async function reabrirComprovantePagamento(clienteId, pagamentoId, modo) {
  try {
    const snap = await getDoc(doc(db, COL_PAGAMENTOS, pagamentoId));
    if (!snap.exists()) { window.mostrarToast?.("Pagamento não encontrado.", "error"); return; }
    const p = snap.data();
    await imprimirComprovantePagamento(clienteId, pagamentoId, p.valor, p.forma || "", p.observacoes || "", modo);
  } catch (err) {
    console.error(err);
    window.mostrarToast?.("Erro ao gerar comprovante.", "error");
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
      <div>
        <label class="field-label">Foto do comprovante</label>
        <input type="file" id="mPagAnexos" accept="image/*" multiple class="field-input--plain" />
        <p style="font-size:var(--text-xs);color:var(--gray-500);margin-top:4px">PDF não é suportado (evita custo de armazenamento pago).</p>
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
    const arquivos = document.getElementById("mPagAnexos")?.files;
    let anexos = [];
    if (arquivos && arquivos.length) {
      btn.textContent = "Processando fotos...";
      anexos = await _uploadAnexos(arquivos, `pagamentos/${clienteId}`);
      btn.textContent = "Salvando...";
    }

    const refs = await Promise.all(lancamentos.map(l => addDoc(collection(db, COL_PAGAMENTOS), {
      clienteId,
      compraId:      l.compraId || null,
      valor:         l.valor,
      dataPagamento: Timestamp.fromDate(new Date(dataStr + "T12:00:00")),
      forma,
      observacoes:   obs,
      anexos,
      criadoEm:      serverTimestamp()
    })));
    await Promise.all(refs.map((docRef, idx) => _registrarHistorico(
      "pagamento", "criado", clienteId, docRef.id, lancamentos[idx].valor, forma ? `Forma: ${forma}` : ""
    )));
    fecharModal();
    window.mostrarToast?.("Pagamento registrado com sucesso!", "success");
    abrirPainelCliente(clienteId);
    carregarIndicadores();

    const valorTotalPago = lancamentos.reduce((s, l) => s + l.valor, 0);
    const modo = await perguntarComprovante("Pagamento registrado com sucesso! Deseja visualizar ou imprimir o comprovante?");
    if (modo) await imprimirComprovantePagamento(clienteId, refs[0].id, valorTotalPago, forma, obs, modo);
  } catch (err) {
    console.error(err);
    window.mostrarToast?.("Erro ao registrar pagamento.", "error");
    btn.disabled = false; btn.textContent = "Registrar Pagamento";
  }
}

// ── Comprovante de Pagamento (impressão) ────────────────────────
async function imprimirComprovantePagamento(clienteId, pagamentoId, valorPago, forma, obs, modo = "print") {
  try {
    const [clienteSnap, comprasSnap, pagamentosSnap] = await Promise.all([
      getDoc(doc(db, COL_CLIENTES, clienteId)),
      getDocs(query(collection(db, COL_COMPRAS), where("clienteId", "==", clienteId))),
      getDocs(query(collection(db, COL_PAGAMENTOS), where("clienteId", "==", clienteId)))
    ]);
    const cliente = clienteSnap.data();
    const origem = window.location.origin;

    // Monta a linha do tempo (compras aumentam o saldo, pagamentos diminuem)
    const linhas = [];
    let totalComprado = 0;
    comprasSnap.forEach(d => {
      const c = d.data();
      totalComprado += c.valor || 0;
      linhas.push({
        data: c.dataCompra, tipo: "compra", numero: `COMPRA-${d.id.slice(-6).toUpperCase()}`,
        forma: "Compra (Fiado)", valor: c.valor || 0
      });
    });
    let totalPago = 0;
    pagamentosSnap.forEach(d => {
      const p = { id: d.id, ...d.data() };
      totalPago += p.valor || 0;
      linhas.push({
        data: p.dataPagamento, tipo: "pagamento", numero: `PGT-${d.id.slice(-6).toUpperCase()}`,
        forma: p.forma || "—", valor: p.valor || 0, id: d.id
      });
    });
    linhas.sort((a, b) => {
      const da = a.data?.toDate ? a.data.toDate() : new Date(a.data);
      const db_ = b.data?.toDate ? b.data.toDate() : new Date(b.data);
      return da - db_;
    });

    // Calcula o saldo corrente após cada linha, e identifica saldo antes/depois deste pagamento
    let saldoCorrente = 0;
    let saldoAnterior = 0;
    let saldoRestante = 0;
    linhas.forEach(l => {
      if (l.tipo === "compra") saldoCorrente += l.valor;
      else saldoCorrente -= l.valor;
      l.saldoApos = saldoCorrente;
      if (l.id === pagamentoId) {
        saldoRestante = saldoCorrente;
        saldoAnterior = saldoCorrente + l.valor;
      }
    });

    const pagamentoAtual = linhas.find(l => l.id === pagamentoId);
    const numeroPagamento = pagamentoAtual?.numero || `PGT-${pagamentoId.slice(-6).toUpperCase()}`;
    const agora = new Date();
    const historico = linhas.slice().reverse().slice(0, 10); // mais recentes primeiro, até 10

    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"><title>Comprovante de Pagamento — ${escHtml(cliente.nome)}</title>
      <style>
        * { box-sizing: border-box; }
        body{font-family:Arial,Helvetica,sans-serif;font-size:13px;margin:0;padding:28px 32px;color:#1E1E1E;background:#fff}
        .topo{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:1px solid #E2E8F0;padding-bottom:20px;margin-bottom:20px}
        .empresa{display:flex;gap:14px;align-items:flex-start}
        .empresa img{width:70px;height:70px;border-radius:14px;object-fit:cover}
        .empresa h1{font-size:24px;margin:0 0 2px;color:#002D94;letter-spacing:.02em}
        .empresa .subtitulo{font-size:13px;color:#475569;font-weight:bold;margin-bottom:8px}
        .empresa .linha{font-size:11.5px;color:#334155;line-height:1.5}
        .empresa .linha strong{color:#111}
        .cartao-info{background:#F7F9FC;border:1px solid #E2E8F0;border-radius:10px;padding:10px 18px;min-width:270px}
        .cartao-info .item{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #E7ECF3}
        .cartao-info .item:last-child{border-bottom:none}
        .cartao-info .ico{width:16px;height:16px;flex-shrink:0;color:#118DFF}
        .cartao-info .rotulo{font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:.03em;flex:1}
        .cartao-info .valor{font-size:13px;font-weight:bold;color:#111;text-align:right}
        .resumo{display:flex;gap:16px;margin-bottom:24px}
        .box{flex:1;background:#F7F9FC;border-radius:10px;padding:14px 18px;text-align:center}
        .box-label{font-size:10.5px;color:#64748B;text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px}
        .box-val{font-size:20px;font-weight:800}
        .detalhes{background:#F7F9FC;border-radius:10px;padding:18px 22px;margin-bottom:24px}
        h3.secao{font-size:13px;color:#111;text-transform:uppercase;letter-spacing:.03em;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid #E2E8F0}
        .detalhes-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px 32px}
        .detalhes-item{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #E7ECF3}
        .detalhes-item .ico{width:16px;height:16px;flex-shrink:0;color:#118DFF;margin-top:2px}
        .detalhes-item .rotulo{font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:.03em;display:block;margin-bottom:3px}
        .detalhes-item .valor{font-size:13px;font-weight:600;color:#111}
        table{width:100%;border-collapse:collapse;margin-bottom:22px}
        th{background:#002D94;color:#fff;padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.02em}
        td{padding:9px 12px;border-bottom:1px solid #EEF1F5;font-size:12px}
        tr:last-child td{border-bottom:none}
        .info-box{display:flex;gap:12px;align-items:flex-start;background:#F7F9FC;border-radius:10px;padding:14px 18px;margin-top:10px}
        .info-box .ico{width:18px;height:18px;color:#118DFF;flex-shrink:0;margin-top:1px}
        .info-box strong{display:block;font-size:12px;margin-bottom:2px}
        .info-box span{font-size:11.5px;color:#475569}
        .obrigado{text-align:center;margin-top:26px;font-weight:700;color:#002D94}
        .rodape{display:flex;justify-content:center;gap:22px;flex-wrap:wrap;margin-top:16px;padding-top:16px;border-top:1px solid #E2E8F0;font-size:11.5px;color:#334155}
        .rodape span{display:flex;align-items:center;gap:6px}
        .btn-voltar{position:fixed;top:16px;left:16px;display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #E2E8F0;border-radius:9999px;padding:8px 16px;font-size:13px;font-weight:600;color:#334155;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.08)}
        .btn-voltar:hover{background:#F7F9FC;border-color:#118DFF;color:#118DFF}
        .btn-voltar svg{width:16px;height:16px}
        @media print{.btn-voltar{display:none}}
        @media print{body{padding:14px 18px}}
      </style></head><body>

      <button class="btn-voltar" onclick="window.close()">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>
        Voltar
      </button>

      <div class="topo">
        <div class="empresa">
          <img src="${origem}/img/logo.png" alt="Papelaria Futura" onerror="this.style.display='none'" />
          <div>
            <h1>PAPELARIA FUTURA</h1>
            <div class="subtitulo">COMPROVANTE DE PAGAMENTO</div>
            <div class="linha">
              <strong>Papelaria Futura LTDA</strong><br>
              Av. Dr. Ézio Carneiro Qd.32 Lt.31/33 — Setor Aeroporto, Luziânia/GO<br>
              <strong>CNPJ:</strong> 01.064.836/0001-12<br>
              <strong>Telefone:</strong> (61) 3621-4452 &nbsp;|&nbsp; futuralza@gmail.com
            </div>
          </div>
        </div>
        <div class="cartao-info">
          <div class="item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm10 7H4v7h12V9z" clip-rule="evenodd"/></svg>
            <span class="rotulo">Data do Pagamento</span>
            <span class="valor">${agora.toLocaleDateString("pt-BR")} ${agora.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span>
          </div>
          <div class="item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
            <span class="rotulo">Cliente</span>
            <span class="valor">${escHtml(cliente.nome)}</span>
          </div>
          <div class="item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9z" clip-rule="evenodd"/></svg>
            <span class="rotulo">Tipo de Operação</span>
            <span class="valor">Pagamento de Débito (Fiado)</span>
          </div>
          <div class="item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
            <span class="rotulo">Atendido por</span>
            <span class="valor">${escHtml(_dadosUsuario?.nome || "—")}</span>
          </div>
        </div>
      </div>

      <div class="resumo">
        <div class="box"><div class="box-label">Saldo Anterior</div><div class="box-val" style="color:${saldoAnterior>0?'#DC2626':'#059669'}">${formatarMoeda(Math.max(0,saldoAnterior))}</div></div>
        <div class="box"><div class="box-label">Valor Pago</div><div class="box-val" style="color:#059669">${formatarMoeda(valorPago)}</div></div>
        <div class="box"><div class="box-label">Saldo Restante</div><div class="box-val" style="color:${saldoRestante>0?'#DC2626':'#059669'}">${formatarMoeda(Math.max(0,saldoRestante))}</div></div>
      </div>

      <div class="detalhes">
        <h3 class="secao">Detalhes do Pagamento</h3>
        <div class="detalhes-grid">
          <div class="detalhes-item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9z" clip-rule="evenodd"/></svg>
            <div><span class="rotulo">Forma de Pagamento</span><span class="valor">${escHtml(forma || "—")}</span></div>
          </div>
          <div class="detalhes-item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm3 1h6v2H7V5zm0 4h6v2H7V9zm0 4h4v2H7v-2z" clip-rule="evenodd"/></svg>
            <div><span class="rotulo">Nº do Pagamento</span><span class="valor">${escHtml(numeroPagamento)}</span></div>
          </div>
          <div class="detalhes-item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a1 1 0 00-1 1v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 10.586V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
            <div><span class="rotulo">Observações</span><span class="valor">${escHtml(obs || "—")}</span></div>
          </div>
          <div class="detalhes-item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clip-rule="evenodd"/></svg>
            <div><span class="rotulo">Valor Pago</span><span class="valor" style="color:#059669">${formatarMoeda(valorPago)}</span></div>
          </div>
        </div>
      </div>

      <h3 class="secao">Histórico de Pagamentos</h3>
      <table><thead><tr><th>Data</th><th>Nº Pagamento</th><th>Forma de Pagamento</th><th>Valor Pago</th><th>Saldo Após</th></tr></thead><tbody>
        ${historico.map(l => `<tr>
          <td>${formatarDataLocal(l.data)}</td>
          <td>${escHtml(l.numero)}</td>
          <td>${escHtml(l.forma)}</td>
          <td style="color:${l.tipo==='compra'?'#DC2626':'#059669'}">${formatarMoeda(l.valor)}</td>
          <td style="color:${l.saldoApos>0?'#DC2626':'#059669'}">${formatarMoeda(Math.max(0,l.saldoApos))}</td>
        </tr>`).join('')}
      </tbody></table>

      <div class="info-box">
        <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>
        <div>
          <strong>Informação</strong>
          <span>Este comprovante não possui valor fiscal. É um documento de controle interno.</span>
        </div>
      </div>

      <div class="obrigado">✓ Obrigado pela preferência!<br>Volte sempre.</div>

      <div class="rodape">
        <span>📞 (61) 3621-4452</span>
        <span>✉️ futuralza@gmail.com</span>
      </div>

      <script>window.onload=()=>{${modo === "print" ? "window.print();" : ""}}<\/script>
      </body></html>`);
    win.document.close();
  } catch (err) {
    console.error(err);
    window.mostrarToast?.("Pagamento salvo, mas houve erro ao gerar o comprovante para impressão.", "warning");
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
    const dados = snap.data();
    const clienteId = dados?.clienteId;
    await deleteDoc(doc(db, COL_COMPRAS, compraId));
    if (clienteId) {
      await _registrarHistorico("compra", "excluido", clienteId, compraId, dados?.valor,
        dados?.parcelaTotal ? `Parcela ${dados.parcelaNumero}/${dados.parcelaTotal}` : "");
    }
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
    const origem = window.location.origin;

    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"><title>Comprovante — ${cliente.nome}</title>
      <style>
        * { box-sizing: border-box; }
        body{font-family:Arial,Helvetica,sans-serif;font-size:13px;margin:0;padding:28px 32px;color:#1E1E1E;background:#fff}
        .topo{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:1px solid #E2E8F0;padding-bottom:20px;margin-bottom:20px}
        .empresa{display:flex;gap:14px;align-items:flex-start}
        .empresa img{width:70px;height:70px;border-radius:14px;object-fit:cover}
        .empresa h1{font-size:24px;margin:0 0 2px;color:#002D94;letter-spacing:.02em}
        .empresa .subtitulo{font-size:13px;color:#475569;font-weight:bold;margin-bottom:8px}
        .empresa .linha{font-size:11.5px;color:#334155;line-height:1.5}
        .empresa .linha strong{color:#111}
        .cartao-info{background:#F7F9FC;border:1px solid #E2E8F0;border-radius:10px;padding:10px 18px;min-width:270px}
        .cartao-info .item{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #E7ECF3}
        .cartao-info .item:last-child{border-bottom:none}
        .cartao-info .ico{width:16px;height:16px;flex-shrink:0;color:#118DFF}
        .cartao-info .rotulo{font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:.03em;flex:1}
        .cartao-info .valor{font-size:13px;font-weight:bold;color:#111;text-align:right}
        .resumo{display:flex;gap:16px;margin-bottom:24px}
        .box{flex:1;background:#F7F9FC;border-radius:10px;padding:14px 18px;text-align:center}
        .box.atraso{background:#FEF2F2;border:1px solid #FCA5A5}
        .box-label{font-size:10.5px;color:#64748B;text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px}
        .box-val{font-size:20px;font-weight:800}
        h3.secao{font-size:13px;color:#111;text-transform:uppercase;letter-spacing:.03em;margin:0 0 8px}
        table{width:100%;border-collapse:collapse;margin-bottom:22px}
        th{background:#002D94;color:#fff;padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.02em}
        td{padding:9px 12px;border-bottom:1px solid #EEF1F5;font-size:12px}
        tr:last-child td{border-bottom:none}
        .info-box{display:flex;gap:12px;align-items:flex-start;background:#F7F9FC;border-radius:10px;padding:14px 18px;margin-top:30px}
        .info-box .ico{width:18px;height:18px;color:#118DFF;flex-shrink:0;margin-top:1px}
        .info-box strong{display:block;font-size:12px;margin-bottom:2px}
        .info-box span{font-size:11.5px;color:#475569}
        .rodape{display:flex;justify-content:center;gap:22px;flex-wrap:wrap;margin-top:26px;padding-top:16px;border-top:1px solid #E2E8F0;font-size:11.5px;color:#334155}
        .rodape span{display:flex;align-items:center;gap:6px}
        @media print{body{padding:14px 18px}}
      </style></head><body>

      <div class="topo">
        <div class="empresa">
          <img src="${origem}/img/logo.png" alt="Papelaria Futura" onerror="this.style.display='none'" />
          <div>
            <h1>PAPELARIA FUTURA</h1>
            <div class="subtitulo">COMPROVANTE DE VENDA</div>
            <div class="linha">
              <strong>Papelaria Futura LTDA</strong><br>
              Av. Dr. Ézio Carneiro Qd.32 Lt.31/33 — Setor Aeroporto, Luziânia/GO<br>
              <strong>CNPJ:</strong> 01.064.836/0001-12<br>
              <strong>Telefone:</strong> (61) 3621-4452 &nbsp;|&nbsp; futuralza@gmail.com
            </div>
          </div>
        </div>
        <div class="cartao-info">
          <div class="item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm10 7H4v7h12V9z" clip-rule="evenodd"/></svg>
            <span class="rotulo">Data da Venda</span>
            <span class="valor">${hoje.toLocaleDateString("pt-BR")}</span>
          </div>
          <div class="item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
            <span class="rotulo">Cliente</span>
            <span class="valor">${escHtml(cliente.nome)}</span>
          </div>
          ${cliente.documento ? `<div class="item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm3 1h6v2H7V5zm0 4h6v2H7V9zm0 4h4v2H7v-2z" clip-rule="evenodd"/></svg>
            <span class="rotulo">${cliente.tipo === "juridica" ? "CNPJ" : "CPF"}</span>
            <span class="valor">${escHtml(cliente.documento)}</span>
          </div>` : ""}
          ${(cliente.endereco || cliente.cidade) ? `<div class="item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
            <span class="rotulo">Endereço</span>
            <span class="valor" style="font-weight:600;font-size:11.5px">${escHtml([cliente.endereco, cliente.numero].filter(Boolean).join(", "))}${cliente.bairro ? ` — ${escHtml(cliente.bairro)}` : ""}${cliente.cidade ? `, ${escHtml(cliente.cidade)}${cliente.estado ? "/"+escHtml(cliente.estado) : ""}` : ""}</span>
          </div>` : ""}
          <div class="item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9z" clip-rule="evenodd"/></svg>
            <span class="rotulo">Tipo de Venda</span>
            <span class="valor">Venda a Prazo (Promissória)</span>
          </div>
          <div class="item">
            <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
            <span class="rotulo">Atendido por</span>
            <span class="valor">${escHtml(_dadosUsuario?.nome || "—")}</span>
          </div>
        </div>
      </div>

      <div class="resumo">
        <div class="box"><div class="box-label">Total Comprado</div><div class="box-val">${formatarMoeda(totalComprado)}</div></div>
        <div class="box"><div class="box-label">Total Pago</div><div class="box-val" style="color:#059669">${formatarMoeda(totalPago)}</div></div>
        <div class="box ${saldo>0?'atraso':''}"><div class="box-label">Saldo Devedor</div><div class="box-val" style="color:${saldo>0?'#DC2626':'#059669'}">${formatarMoeda(Math.max(0,saldo))}</div></div>
      </div>

      <h3 class="secao">Vendas Realizadas</h3>
      <table><thead><tr><th>Data</th><th>Valor</th><th>Vencimento</th><th>Observações</th></tr></thead><tbody>
        ${compras.map(c=>`<tr><td>${formatarDataLocal(c.dataCompra)}</td><td>${formatarMoeda(c.valor)}</td><td>${c.vencimento?formatarDataLocal(c.vencimento):'—'}</td><td>${escHtml(c.observacoes||'')||'—'}</td></tr>`).join('')}
      </tbody></table>

      <div class="info-box">
        <svg class="ico" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>
        <div>
          <strong>Informação</strong>
          <span>Este comprovante não possui valor fiscal. É um documento de controle interno.</span>
        </div>
      </div>

      <div class="rodape">
        <span>📞 (61) 3621-4452</span>
        <span>✉️ futuralza@gmail.com</span>
      </div>

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

function formatarDataHoraLocal(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ── Histórico de Alterações (auditoria de compras/pagamentos) ──
async function abrirModalHistoricoCliente(clienteId) {
  const body = `<div class="loading-cell" style="padding:24px 0">Carregando histórico...</div>`;
  const footer = `<button class="btn-ghost" id="btnCancelarModalProm">Fechar</button>`;
  abrirModal("Histórico de Alterações", body, footer);
  document.getElementById("btnCancelarModalProm").onclick = fecharModal;

  try {
    const snap = await getDocs(query(collection(db, COL_HISTORICO), where("clienteId", "==", clienteId)));
    const registros = [];
    snap.forEach(d => registros.push({ id: d.id, ...d.data() }));
    registros.sort((a, b) => {
      const da = a.criadoEm?.toDate?.() || new Date(0);
      const db_ = b.criadoEm?.toDate?.() || new Date(0);
      return db_ - da;
    });

    const acaoLabel = { criado: "Criou", excluido: "Excluiu" };
    const tipoLabel = { compra: "Compra", pagamento: "Pagamento" };

    const html = registros.length === 0
      ? `<p style="font-size:var(--text-sm);color:var(--gray-500);padding:8px 0">Nenhum registro de alteração encontrado para este cliente.</p>`
      : `<ul class="historico-lista" style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;max-height:420px;overflow-y:auto">
          ${registros.map(r => `
            <li style="border:1px solid var(--gray-100);border-radius:var(--radius-md);padding:10px 12px">
              <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
                <strong style="font-size:var(--text-sm);color:var(--gray-800)">
                  ${acaoLabel[r.acao] || r.acao} ${tipoLabel[r.tipo] || r.tipo}
                  ${r.valor ? ` · ${formatarMoeda(r.valor)}` : ""}
                </strong>
                <span style="font-size:var(--text-xs);color:var(--gray-500)">${formatarDataHoraLocal(r.criadoEm)}</span>
              </div>
              <div style="font-size:var(--text-xs);color:var(--gray-500);margin-top:2px">
                Por ${escHtml(r.usuarioNome || "—")}${r.detalhes ? ` · ${escHtml(r.detalhes)}` : ""}
              </div>
            </li>
          `).join("")}
        </ul>`;

    const modalEl = document.getElementById("modalBody");
    if (modalEl) modalEl.innerHTML = `<div class="form-usuario">${html}</div>`;
  } catch (err) {
    console.error("Erro ao carregar histórico:", err);
    const modalEl = document.getElementById("modalBody");
    if (modalEl) modalEl.innerHTML = `<p style="color:var(--color-danger)">Erro ao carregar histórico de alterações.</p>`;
  }
}

function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// Reutiliza o modal global do sistema
function abrirModal(titulo, body, footer, opcoes) {
  window.abrirModal?.(titulo, body, footer, opcoes);
}

function fecharModal() {
  window.fecharModal?.();
}

// Pergunta ao usuário o que fazer com um comprovante recém-gerado.
// Retorna uma Promise que resolve para "preview", "print" ou null (fechar sem fazer nada).
function perguntarComprovante(mensagem) {
  return new Promise((resolve) => {
    const body = `<p style="color:var(--gray-600)">${mensagem}</p>`;
    const footer = `
      <button class="btn-ghost" id="btnComprovanteFechar">Fechar</button>
      <button class="btn-secondary" id="btnComprovanteVisualizar">Visualizar</button>
      <button class="btn-primary" id="btnComprovanteImprimir">Imprimir</button>
    `;
    abrirModal("Comprovante", body, footer);

    document.getElementById("btnComprovanteFechar")?.addEventListener("click", () => {
      fecharModal();
      resolve(null);
    });
    document.getElementById("btnComprovanteVisualizar")?.addEventListener("click", () => {
      fecharModal();
      resolve("preview");
    });
    document.getElementById("btnComprovanteImprimir")?.addEventListener("click", () => {
      fecharModal();
      resolve("print");
    });
  });
}
