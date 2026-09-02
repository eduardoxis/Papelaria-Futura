// ============================================================
// notificacoes.js — Sininho de notificações internas
// Junta em um só lugar: cotações paradas, estoque baixo e
// clientes de Promissórias em atraso.
// ============================================================
import {
  collection, getDocs, query, where, orderBy, limit, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { formatarMoeda } from "./database.js";
import { temCargo } from "./auth.js";

const COL_COTACOES   = "cotacoes";
const COL_PRODUTOS   = "pf_produtos";
const COL_PROM_CLI   = "prom_clientes";
const COL_PROM_COMP  = "prom_compras";
const COL_PROM_PAG   = "prom_pagamentos";

let _cache = [];
let _carregando = false;
let _usuario = null;
let _dadosUsuario = null;

function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function diasDesde(ts) {
  if (!ts) return null;
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

// ── Coleta as 3 categorias de notificação ───────────────────────
async function calcularNotificacoes() {
  const notificacoes = [];
  const usuarioEhAdmin = temCargo(_dadosUsuario, "admin");

  // 1) Somente os próximos follow-ups vencidos. A consulta é limitada e
  // ordenada no banco; não baixa mais todas as cotações ativas.
  try {
    const filtros = [
      where("status", "==", "ativa"),
      where("proximoLembreteEm", "<=", Timestamp.now()),
      orderBy("proximoLembreteEm", "asc"),
      limit(20)
    ];
    if (!usuarioEhAdmin) {
      filtros.unshift(where("criadoPor", "==", _usuario?.uid || ""));
    }
    const cotSnap = await getDocs(query(collection(db, COL_COTACOES), ...filtros));
    cotSnap.forEach(d => {
      const c = d.data();
      const referencia = c.proximoLembreteEm;
      const dias = diasDesde(referencia);
      if (dias !== null && dias >= 0) {
        notificacoes.push({
          tipo: "cotacao",
          icone: "clock",
          titulo: `Follow-up ${Math.min(3, (Number(c.etapaLembrete) || 0) + 1)} pendente`,
          subtitulo: c.cliente || "Cliente não informado",
          pagina: "cotacoes",
          urgencia: dias >= 3 ? "alta" : "media"
        });
      }
    });
  } catch (err) {
    console.error("Notificações — erro ao checar cotações:", err);
  }

  // 2) Estoque baixo e promissórias são informações administrativas.
  // Usuários comuns não possuem acesso a essas coleções e, portanto,
  // não devem disparar leituras que o Firestore corretamente bloquearia.
  if (usuarioEhAdmin) try {
    const prodSnap = await getDocs(collection(db, COL_PRODUTOS));
    prodSnap.forEach(d => {
      const p = d.data();
      const min = p.estoqueMinimo || 0;
      const atual = p.estoque || 0;
      if (min > 0 && atual <= min) {
        notificacoes.push({
          tipo: "estoque",
          icone: "box",
          titulo: atual <= 0 ? "Estoque zerado" : "Estoque baixo",
          subtitulo: `${p.nome || "Produto"} — ${atual} ${p.unidade || "un"} (mín. ${min})`,
          pagina: "produtos",
          urgencia: atual <= 0 ? "alta" : "media"
        });
      }
    });
  } catch (err) {
    console.error("Notificações — erro ao checar estoque:", err);
  }

  // 3) Clientes de Promissórias em atraso
  if (usuarioEhAdmin) try {
    const [cliSnap, compSnap, pagSnap] = await Promise.all([
      getDocs(collection(db, COL_PROM_CLI)),
      getDocs(collection(db, COL_PROM_COMP)),
      getDocs(collection(db, COL_PROM_PAG))
    ]);
    const hoje = new Date();
    const comprasPorCliente = {};
    compSnap.forEach(d => {
      const c = d.data();
      if (!comprasPorCliente[c.clienteId]) comprasPorCliente[c.clienteId] = [];
      comprasPorCliente[c.clienteId].push(c);
    });
    const pagoPorCliente = {};
    pagSnap.forEach(d => {
      const p = d.data();
      pagoPorCliente[p.clienteId] = (pagoPorCliente[p.clienteId] || 0) + (p.valor || 0);
    });
    cliSnap.forEach(d => {
      const cliente = d.data();
      const compras = comprasPorCliente[d.id] || [];
      const totalComprado = compras.reduce((s, c) => s + (c.valor || 0), 0);
      const totalPago = pagoPorCliente[d.id] || 0;
      const saldo = Math.round((totalComprado - totalPago) * 100) / 100;
      if (saldo <= 0.004) return;

      let vencimentoMaisAntigo = null;
      compras.forEach(c => {
        if (!c.vencimento) return;
        const venc = c.vencimento.toDate ? c.vencimento.toDate() : new Date(c.vencimento);
        if (!vencimentoMaisAntigo || venc < vencimentoMaisAntigo) vencimentoMaisAntigo = venc;
      });
      const dias = vencimentoMaisAntigo ? Math.floor((hoje - vencimentoMaisAntigo) / 86400000) : null;
      if (dias === null || dias <= 0) return;

      notificacoes.push({
        tipo: "cliente",
        icone: "alert",
        titulo: `Cliente atrasado há ${dias} dia${dias > 1 ? "s" : ""}`,
        subtitulo: `${cliente.nome || "Cliente"} — ${formatarMoeda(saldo)}`,
        pagina: "promissoria",
        urgencia: dias > 30 ? "alta" : "media"
      });
    });
  } catch (err) {
    console.error("Notificações — erro ao checar promissórias:", err);
  }

  notificacoes.sort((a, b) => (a.urgencia === "alta" ? -1 : 1) - (b.urgencia === "alta" ? -1 : 1));
  return notificacoes;
}

const ICONES = {
  clock: `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/></svg>`,
  box: `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M3 3a1 1 0 000 2v10a2 2 0 002 2h10a2 2 0 002-2V5a1 1 0 100-2H3zm3 4a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm0 3a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h2a1 1 0 100-2H7z"/></svg>`,
  alert: `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.72-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.492-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`
};

async function atualizarBadgeNotificacoes() {
  if (_carregando || document.hidden) return;
  _carregando = true;
  try {
    _cache = await calcularNotificacoes();
  } finally {
    _carregando = false;
  }

  const badges = document.querySelectorAll(".notificacoes-badge");
  badges.forEach(b => {
    if (_cache.length > 0) {
      b.textContent = _cache.length > 99 ? "99+" : String(_cache.length);
      b.style.display = "flex";
    } else {
      b.style.display = "none";
    }
  });
}

let _abaAtiva = "todas";

function renderPainelNotificacoes() {
  const lista = document.getElementById("notificacoesLista");
  if (!lista) return;

  // Atualiza a contagem em cada aba
  const contagens = { todas: _cache.length, cotacao: 0, cliente: 0, estoque: 0 };
  _cache.forEach(n => { if (contagens[n.tipo] !== undefined) contagens[n.tipo]++; });
  document.querySelectorAll(".notificacoes-tab").forEach(tab => {
    const tipo = tab.dataset.tipo;
    const qtd = contagens[tipo] || 0;
    const rotulo = { todas: "Todas", cotacao: "Cotações", cliente: "Promissórias", estoque: "Estoque" }[tipo];
    tab.textContent = qtd > 0 ? `${rotulo} (${qtd})` : rotulo;
  });

  const filtradas = _abaAtiva === "todas" ? _cache : _cache.filter(n => n.tipo === _abaAtiva);

  if (filtradas.length === 0) {
    lista.innerHTML = `<div class="notificacoes-vazio">${_abaAtiva === "todas" ? "Tudo em dia por aqui! 🎉" : "Nada por aqui no momento."}</div>`;
    return;
  }

  lista.innerHTML = filtradas.map(n => `
    <button type="button" class="notificacao-item notificacao-item--${n.urgencia}" data-pagina="${n.pagina}">
      <span class="notificacao-icone">${ICONES[n.icone] || ""}</span>
      <span class="notificacao-texto">
        <strong>${escHtml(n.titulo)}</strong>
        <span>${escHtml(n.subtitulo)}</span>
      </span>
    </button>
  `).join("");

  lista.querySelectorAll(".notificacao-item").forEach(btn => {
    btn.addEventListener("click", () => {
      fecharPainelNotificacoes();
      window.navegar?.(btn.dataset.pagina);
    });
  });
}

function abrirPainelNotificacoes() {
  const painel = document.getElementById("notificacoesPainel");
  if (!painel) return;
  const abrindo = !painel.classList.contains("notificacoes-painel--aberto");
  document.querySelectorAll(".notificacoes-painel--aberto").forEach(p => p.classList.remove("notificacoes-painel--aberto"));
  if (abrindo) {
    renderPainelNotificacoes();
    painel.classList.add("notificacoes-painel--aberto");
  }
}

function fecharPainelNotificacoes() {
  document.querySelectorAll(".notificacoes-painel--aberto").forEach(p => p.classList.remove("notificacoes-painel--aberto"));
}

export async function iniciarNotificacoes(usuario, dadosUsuario) {
  _usuario = usuario;
  _dadosUsuario = dadosUsuario;
  document.querySelectorAll(".btn-notificacoes").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      abrirPainelNotificacoes();
    });
  });

  document.querySelectorAll(".notificacoes-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      e.stopPropagation();
      _abaAtiva = tab.dataset.tipo;
      document.querySelectorAll(".notificacoes-tab").forEach(t => t.classList.toggle("notificacoes-tab--ativa", t === tab));
      renderPainelNotificacoes();
    });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".notificacoes-painel") && !e.target.closest(".btn-notificacoes")) {
      fecharPainelNotificacoes();
    }
  });

  await atualizarBadgeNotificacoes();
  // Só atualiza quando a aba estiver visível; em segundo plano não há
  // consultas recorrentes ao Firestore.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) atualizarBadgeNotificacoes();
  });
  setInterval(() => {
    if (!document.hidden) atualizarBadgeNotificacoes();
  }, 5 * 60 * 1000);
}
