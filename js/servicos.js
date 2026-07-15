// ============================================================
// servicos.js — Módulo Serviços Personalizados — Papelaria Futura
// Cadastro dos serviços/itens personalizados (ex: topo de bolo,
// convite personalizado, lembrancinha, etc). Sem preço fixo —
// o valor é sempre digitado na hora da venda, no Caixa.
// ============================================================
import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { escHtml } from "./index.js";

export const COL_SERVICOS = "pf_servicos";

let _usuario = null;
let _dadosUsuario = null;
let _servicosCache = [];
let _termoBusca = "";

export function iniciarServicos(usuario, dadosUsuario) {
  _usuario = usuario;
  _dadosUsuario = dadosUsuario;

  document.addEventListener("navegacao", (e) => {
    if (e.detail.page === "servicos") carregarListaServicos();
  });

  document.getElementById("btnNovoServico")?.addEventListener("click", abrirModalNovoServico);

  document.getElementById("filtroBuscaServicos")?.addEventListener("input", (e) => {
    _termoBusca = e.target.value;
    renderizarTabelaServicos();
  });
  document.getElementById("btnLimparBuscaServicos")?.addEventListener("click", () => {
    _termoBusca = "";
    const inp = document.getElementById("filtroBuscaServicos");
    if (inp) inp.value = "";
    renderizarTabelaServicos();
  });

  document.getElementById("tbodyServicos")?.addEventListener("click", onTabelaClick);
}

async function carregarListaServicos() {
  const tbody = document.getElementById("tbodyServicos");
  if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Carregando serviços...</td></tr>`;
  try {
    const snap = await getDocs(query(collection(db, COL_SERVICOS), orderBy("nome")));
    _servicosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("Erro ao carregar serviços:", err);
    window.mostrarToast?.("Erro ao carregar serviços.", "error");
    _servicosCache = [];
  }
  atualizarIndicadoresServicos();
  renderizarTabelaServicos();
}

function atualizarIndicadoresServicos() {
  const total = _servicosCache.length;
  const ativos = _servicosCache.filter(s => s.ativo !== false).length;
  const elTotal = document.getElementById("indTotalServicos");
  const elAtivos = document.getElementById("indServicosAtivos");
  if (elTotal) elTotal.textContent = total;
  if (elAtivos) elAtivos.textContent = ativos;
}

function renderizarTabelaServicos() {
  const tbody = document.getElementById("tbodyServicos");
  if (!tbody) return;

  const termo = _termoBusca.trim().toLowerCase();
  const lista = _servicosCache.filter(s =>
    !termo ||
    (s.nome || "").toLowerCase().includes(termo) ||
    (s.categoria || "").toLowerCase().includes(termo) ||
    (s.codigo || "").toLowerCase().includes(termo)
  );

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">Nenhum serviço cadastrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(s => `
    <tr>
      <td>${escHtml(s.codigo || "—")}</td>
      <td><strong>${escHtml(s.nome || "—")}</strong>${s.descricao ? `<br/><small style="color:var(--gray-500)">${escHtml(s.descricao)}</small>` : ""}</td>
      <td>${escHtml(s.categoria || "—")}</td>
      <td class="col-center">
        <span class="badge ${s.ativo === false ? "badge--recusada" : "badge--aprovada"}">${s.ativo === false ? "Inativo" : "Ativo"}</span>
      </td>
      <td class="col-center td-actions-col">
        <div class="td-actions-wrap">
          <button class="btn-action btn-action--edit" data-action="editar" data-id="${escHtml(s.id)}">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
            Editar
          </button>
          <button class="btn-action btn-action--delete" data-action="excluir" data-id="${escHtml(s.id)}" data-nome="${escHtml(s.nome || "")}">
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
  const { action, id, nome } = btn.dataset;
  if (action === "editar") abrirModalEditarServico(id);
  if (action === "excluir") confirmarExcluirServico(id, nome);
}

// ----------------------------------------------------------------
// Modal: novo / editar serviço
// ----------------------------------------------------------------
function corpoModalServico(dados = {}) {
  return `
    <div>
      <label class="field-label">Nome do serviço *</label>
      <input type="text" id="mServNome" class="field-input--plain" placeholder="Ex: Topo de Bolo Personalizado" value="${escHtml(dados.nome || "")}" autocomplete="off" />
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
      <div>
        <label class="field-label">Código (opcional)</label>
        <input type="text" id="mServCodigo" class="field-input--plain" placeholder="Ex: SERV-001" value="${escHtml(dados.codigo || "")}" autocomplete="off" />
      </div>
      <div>
        <label class="field-label">Categoria</label>
        <input type="text" id="mServCategoria" class="field-input--plain" placeholder="Ex: Personalizados, Convites..." value="${escHtml(dados.categoria || "")}" autocomplete="off" />
      </div>
    </div>
    <div style="margin-top:12px">
      <label class="field-label">Descrição / observações</label>
      <input type="text" id="mServDescricao" class="field-input--plain" placeholder="Detalhes do serviço (opcional)" value="${escHtml(dados.descricao || "")}" autocomplete="off" />
    </div>
    <div style="margin-top:12px;display:flex;align-items:center;gap:8px">
      <input type="checkbox" id="mServAtivo" ${dados.ativo === false ? "" : "checked"} style="width:16px;height:16px" />
      <label for="mServAtivo" style="margin:0;font-size:var(--text-sm);color:var(--gray-700)">Serviço ativo (aparece na busca do Caixa)</label>
    </div>
    <p style="margin-top:14px;font-size:var(--text-xs);color:var(--gray-500)">
      💡 Este cadastro não define preço nem estoque — o valor é sempre digitado na hora da venda, no Caixa.
    </p>
  `;
}

function abrirModalNovoServico() {
  window.abrirModal("Novo Serviço Personalizado", corpoModalServico(), `
    <button class="btn-ghost" id="btnCancelarModalServ">Cancelar</button>
    <button class="btn-primary" id="btnSalvarServico">Salvar Serviço</button>
  `);
  document.getElementById("btnCancelarModalServ").onclick = () => window.fecharModal();
  document.getElementById("btnSalvarServico").onclick = () => salvarServico(null);
  document.getElementById("mServNome")?.focus();
}

function abrirModalEditarServico(id) {
  const servico = _servicosCache.find(s => s.id === id);
  if (!servico) return;
  window.abrirModal("Editar Serviço Personalizado", corpoModalServico(servico), `
    <button class="btn-ghost" id="btnCancelarModalServ">Cancelar</button>
    <button class="btn-primary" id="btnSalvarServico">Salvar Alterações</button>
  `);
  document.getElementById("btnCancelarModalServ").onclick = () => window.fecharModal();
  document.getElementById("btnSalvarServico").onclick = () => salvarServico(id);
  document.getElementById("mServNome")?.focus();
}

async function salvarServico(id) {
  const nome = document.getElementById("mServNome").value.trim();
  if (!nome) { window.mostrarToast?.("Informe o nome do serviço.", "error"); return; }

  const dados = {
    nome,
    codigo: document.getElementById("mServCodigo").value.trim(),
    categoria: document.getElementById("mServCategoria").value.trim(),
    descricao: document.getElementById("mServDescricao").value.trim(),
    ativo: document.getElementById("mServAtivo").checked
  };

  const btn = document.getElementById("btnSalvarServico");
  btn.disabled = true; btn.textContent = "Salvando...";

  try {
    if (id) {
      await updateDoc(doc(db, COL_SERVICOS, id), { ...dados, atualizadoEm: serverTimestamp() });
    } else {
      await addDoc(collection(db, COL_SERVICOS), {
        ...dados,
        criadoPor: _usuario?.uid || null,
        criadoPorNome: _dadosUsuario?.nome || "—",
        criadoEm: serverTimestamp()
      });
    }
    window.fecharModal();
    window.mostrarToast?.(id ? "Serviço atualizado com sucesso!" : "Serviço cadastrado com sucesso!", "success");
    carregarListaServicos();
  } catch (err) {
    console.error(err);
    window.mostrarToast?.("Erro ao salvar serviço.", "error");
    btn.disabled = false; btn.textContent = id ? "Salvar Alterações" : "Salvar Serviço";
  }
}

function confirmarExcluirServico(id, nome) {
  window.abrirModal("Excluir Serviço", `
    <p>Tem certeza que deseja excluir o serviço "<strong>${escHtml(nome)}</strong>"? Ele deixará de aparecer na busca do Caixa.</p>
  `, `
    <button class="btn-ghost" id="btnCancExclServ">Cancelar</button>
    <button class="btn-primary" style="background:#DC2626;border-color:#DC2626" id="btnConfExclServ">Excluir</button>
  `);
  document.getElementById("btnCancExclServ").onclick = () => window.fecharModal();
  document.getElementById("btnConfExclServ").onclick = async () => {
    try {
      await deleteDoc(doc(db, COL_SERVICOS, id));
      window.fecharModal();
      window.mostrarToast?.("Serviço excluído.", "success");
      carregarListaServicos();
    } catch (err) {
      console.error(err);
      window.mostrarToast?.("Erro ao excluir serviço.", "error");
    }
  };
}
