// ============================================================
// comissao.js — Planilhas de Comissão
// ============================================================

import {
  criarComissao, listarComissoes, buscarComissao,
  excluirComissao, verificarSenhaComissao,
  adicionarRegistroComissao, listarRegistrosComissao,
  atualizarRegistroComissao, excluirRegistroComissao,
  formatarMoeda, formatarData
} from "./database.js";

const CATEGORIAS = ["Dinheiro", "Débito", "Crédito", "Pix celular", "Pix maquininha", "Convênio"];

let _usuario          = null;
let _comissaoAtual    = null;
let _senhaValidadaMap = {};
let _registrosTodos   = [];
let _modoEdicao       = false;
let _contadorLinhas   = 0;

export function iniciarComissao(usuario, dadosUsuario) {
  _usuario = usuario;

  document.addEventListener("navegacao", (e) => {
    if (e.detail.page === "comissao") carregarListaComissoes();
  });

  document.getElementById("btnNovaComissao")?.addEventListener("click", abrirModalNovaComissao);
  document.getElementById("btnVoltarComissao")?.addEventListener("click", mostrarPainelLista);
  document.getElementById("btnAdicionarLinhaComissao")?.addEventListener("click", adicionarLinhaVazia);
  document.getElementById("btnSalvarComissao")?.addEventListener("click", salvarTodosRegistros);
  document.getElementById("btnAplicarFiltro")?.addEventListener("click", aplicarFiltro);
  document.getElementById("btnLimparFiltro")?.addEventListener("click", limparFiltro);
}

// ================================================================
// NAVEGAÇÃO
// ================================================================
function mostrarPainelLista() {
  document.getElementById("comissaoListaPanel").hidden   = false;
  document.getElementById("comissaoDetalhePanel").hidden = true;
  _comissaoAtual  = null;
  _registrosTodos = [];
  _contadorLinhas = 0;
  _modoEdicao     = false;
  carregarListaComissoes();
}

function mostrarPainelDetalhe(comissao, modoEdicao = false) {
  _comissaoAtual  = comissao;
  _modoEdicao     = modoEdicao;
  _contadorLinhas = 0;

  document.getElementById("comissaoListaPanel").hidden   = true;
  document.getElementById("comissaoDetalhePanel").hidden = false;
  document.getElementById("comissaoDetalheTitulo").textContent = comissao.titulo;
  document.getElementById("comissaoDetalheDesc").textContent   = comissao.descricao || "";

  // Badge de modo
  const badge = document.getElementById("comissaoModoBadge");
  if (modoEdicao) {
    badge.textContent  = "✏️ Modo Edição";
    badge.className    = "comissao-modo-badge comissao-modo-badge--edit";
  } else {
    badge.textContent  = "👁️ Somente Visualização";
    badge.className    = "comissao-modo-badge comissao-modo-badge--view";
  }

  // Mostrar/ocultar controles de edição
  document.getElementById("btnAdicionarLinhaComissao").hidden = !modoEdicao;
  document.getElementById("btnSalvarComissao").hidden         = !modoEdicao;

  document.getElementById("filtroDataInicio").value = "";
  document.getElementById("filtroDataFim").value    = "";

  carregarRegistros(comissao.id);
}

// ================================================================
// LISTA DE PLANILHAS
// ================================================================
async function carregarListaComissoes() {
  const container = document.getElementById("comissaoCards");
  container.innerHTML = `<p class="loading-cell">Carregando...</p>`;

  const resultado = await listarComissoes();
  if (!resultado.sucesso) {
    container.innerHTML = `<p class="empty-cell">Erro ao carregar planilhas: ${resultado.erro}</p>`;
    return;
  }

  const { comissoes } = resultado;
  if (comissoes.length === 0) {
    container.innerHTML = `
      <div class="comissao-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V19.5a2.25 2.25 0 002.25 2.25h.75"/>
        </svg>
        <p>Nenhuma planilha criada ainda.</p>
        <button class="btn-primary" id="btnEmptyNovaComissao">Criar primeira planilha</button>
      </div>`;
    document.getElementById("btnEmptyNovaComissao")?.addEventListener("click", abrirModalNovaComissao);
    return;
  }

  container.innerHTML = comissoes.map(c => `
    <div class="comissao-card">
      <div class="comissao-card-top">
        <div class="comissao-card-icon">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V8z" clip-rule="evenodd"/>
          </svg>
        </div>
        <div class="comissao-card-body">
          <strong class="comissao-card-titulo">${escHtml(c.titulo)}</strong>
          ${c.descricao ? `<p class="comissao-card-desc">${escHtml(c.descricao)}</p>` : ""}
          <span class="comissao-card-data">Criada em ${formatarData(c.dataCriacao)}</span>
        </div>
      </div>
      <div class="comissao-card-divider"></div>
      <div class="comissao-card-actions">
        <button class="btn-icon-label btn-icon-label--view" data-action="abrir" data-id="${escHtml(c.id)}">
          <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
          Abrir
        </button>
        <button class="btn-icon-label btn-icon-label--pdf" data-action="pdf" data-id="${escHtml(c.id)}">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v10"/><path d="M5.5 7.5L10 12l4.5-4.5"/><path d="M4 17h12"/></svg>
          PDF
        </button>
        <button class="btn-icon-label btn-icon-label--edit" data-action="editar" data-id="${escHtml(c.id)}">
          <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
          Editar
        </button>
        <button class="btn-icon-label btn-icon-label--delete" data-action="excluir-planilha" data-id="${escHtml(c.id)}" data-titulo="${escHtml(c.titulo)}">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
          Excluir
        </button>
      </div>
    </div>
  `).join("");

  container.addEventListener("click", onCardClick);
}

function onCardClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const { action, id, titulo } = btn.dataset;

  if (action === "abrir") {
    abrirPlanilha(id, false); // leitura
  } else if (action === "editar") {
    exigirSenha(id, () => abrirPlanilha(id, true), "Editar Planilha");
  } else if (action === "pdf") {
    gerarPDFComissao(id);
  } else if (action === "excluir-planilha") {
    confirmarExcluirPlanilha(id, titulo);
  }
}

async function abrirPlanilha(id, modoEdicao) {
  const resultado = await buscarComissao(id);
  if (!resultado.sucesso) { window.mostrarToast?.("Planilha não encontrada.", "error"); return; }
  mostrarPainelDetalhe(resultado.dados, modoEdicao);
}

// ================================================================
// TABELA — CARREGAR REGISTROS
// ================================================================
async function carregarRegistros(comissaoId) {
  const tbody = document.getElementById("tbodyComissao");
  tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">Carregando...</td></tr>`;
  _contadorLinhas = 0;

  const resultado = await listarRegistrosComissao(comissaoId);
  if (!resultado.sucesso) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">Erro ao carregar registros.</td></tr>`;
    return;
  }

  _registrosTodos = resultado.registros || [];
  tbody.innerHTML = "";

  if (_registrosTodos.length === 0 && _modoEdicao) {
    adicionarLinhaVazia();
  } else if (_registrosTodos.length === 0) {
    tbody.innerHTML = `<tr class="excel-empty-row"><td colspan="8" class="excel-empty"><div class="excel-empty-icon">📋</div>Nenhum registro cadastrado.</td></tr>`;
  } else {
    _registrosTodos.forEach(r => adicionarLinha(r));
  }

  atualizarTotalGeral();
  atualizarContagem();
}

// ================================================================
// LINHAS DA TABELA
// ================================================================
function adicionarLinhaVazia() {
  adicionarLinha({});
  document.getElementById("tbodyComissao").lastElementChild?.querySelector("input")?.focus();
}

function adicionarLinha(dados = {}) {
  _contadorLinhas++;
  const n     = _contadorLinhas;
  const tbody = document.getElementById("tbodyComissao");
  const hoje  = new Date().toISOString().slice(0, 10);

  const vazio = tbody.querySelector(".excel-empty-row");
  if (vazio) vazio.remove();

  const optsCategoria = `<option value="">—</option>` +
    CATEGORIAS.map(c => `<option value="${c}" ${dados.categoria === c ? "selected" : ""}>${c}</option>`).join("");

  const tr = document.createElement("tr");
  tr.dataset.linha      = n;
  tr.dataset.registroId = dados.id || "";

  if (_modoEdicao) {
    // MODO EDIÇÃO: inputs editáveis
    tr.innerHTML = `
      <td class="col-item"><span class="item-num">${n}</span></td>
      <td class="col-com-cliente">
        <input class="excel-input" type="text" placeholder="Cliente *"
          data-campo="cliente" value="${escHtml(dados.cliente || "")}" />
      </td>
      <td class="col-com-desc">
        <input class="excel-input" type="text" placeholder="Descrição"
          data-campo="descricao" value="${escHtml(dados.descricao || "")}" />
      </td>
      <td class="col-com-folhas">
        <input class="excel-input excel-input--center" type="number"
          min="0" step="1" placeholder="0"
          data-campo="qtdFolhas" value="${dados.qtdFolhas ?? ""}" />
      </td>
      <td class="col-com-valor">
        <input class="excel-input excel-input--right" type="text"
          placeholder="R$ 0,00"
          data-campo="valor" value="${dados.valor ? formatarCampoMoeda(dados.valor) : ""}" />
      </td>
      <td class="col-com-data">
        <input class="excel-input" type="date"
          data-campo="data" value="${dados.data || hoje}" />
      </td>
      <td class="col-com-cat">
        <select class="excel-input excel-select" data-campo="categoria">
          ${optsCategoria}
        </select>
      </td>
      <td class="col-acao">
        <button class="btn-remove-row" title="Remover linha">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
        </button>
      </td>`;

    // Formatar valor ao sair
    const inputValor = tr.querySelector('[data-campo="valor"]');
    inputValor.addEventListener("blur", () => {
      const val = parsearMoeda(inputValor.value);
      if (val > 0) inputValor.value = formatarCampoMoeda(val);
      atualizarTotalGeral();
    });
    inputValor.addEventListener("input", atualizarTotalGeral);

    // Remover linha
    tr.querySelector(".btn-remove-row").addEventListener("click", () => {
      const registroId = tr.dataset.registroId;
      if (registroId) {
        excluirLinhaSalva(tr, registroId);
      } else {
        tr.remove();
        renumerarLinhas();
        atualizarTotalGeral();
        atualizarContagem();
        if (!document.querySelector("#tbodyComissao tr[data-linha]")) adicionarLinhaVazia();
      }
    });

  } else {
    // MODO LEITURA: células estáticas
    const dataFmt = dados.data ? new Date(dados.data + "T00:00:00").toLocaleDateString("pt-BR") : "—";
    tr.innerHTML = `
      <td class="col-item"><span class="item-num">${n}</span></td>
      <td class="col-com-cliente" style="padding:0 var(--space-3)"><strong>${escHtml(dados.cliente || "—")}</strong></td>
      <td class="col-com-desc"   style="padding:0 var(--space-3)">${escHtml(dados.descricao || "—")}</td>
      <td class="col-com-folhas cell-total">${dados.qtdFolhas != null ? dados.qtdFolhas : "—"}</td>
      <td class="col-com-valor  cell-total">${formatarMoeda(dados.valor)}</td>
      <td class="col-com-data"  style="padding:0 var(--space-3)">${dataFmt}</td>
      <td class="col-com-cat"   style="padding:0 var(--space-3)">
        <span class="badge-categoria badge-categoria--${slugCategoria(dados.categoria)}">${escHtml(dados.categoria || "—")}</span>
      </td>
      <td class="col-acao"></td>`;
  }

  tbody.appendChild(tr);
  renumerarLinhas();
  atualizarContagem();
}

async function excluirLinhaSalva(tr, registroId) {
  const res = await excluirRegistroComissao(_comissaoAtual.id, registroId);
  if (res.sucesso) {
    tr.remove();
    _registrosTodos = _registrosTodos.filter(r => r.id !== registroId);
    renumerarLinhas();
    atualizarTotalGeral();
    atualizarContagem();
    window.mostrarToast?.("Registro excluído.", "success");
    if (!document.querySelector("#tbodyComissao tr[data-linha]")) adicionarLinhaVazia();
  } else {
    window.mostrarToast?.("Erro ao excluir: " + res.erro, "error");
  }
}

// ================================================================
// SALVAR
// ================================================================
async function salvarTodosRegistros() {
  if (!_comissaoAtual || !_modoEdicao) return;

  const linhas = document.querySelectorAll("#tbodyComissao tr[data-linha]");
  let erroVal  = null;
  linhas.forEach((tr, i) => {
    if (erroVal) return;
    const cliente = tr.querySelector('[data-campo="cliente"]')?.value.trim();
    if (!cliente) erroVal = `Linha ${i + 1}: o campo Cliente é obrigatório.`;
  });
  if (erroVal) { window.mostrarToast?.(erroVal, "error"); return; }

  const btn = document.getElementById("btnSalvarComissao");
  btn.disabled = true; btn.textContent = "Salvando...";

  const promises = [];
  linhas.forEach(tr => {
    const dados      = coletarDadosLinha(tr);
    const registroId = tr.dataset.registroId;
    if (registroId) {
      promises.push(atualizarRegistroComissao(_comissaoAtual.id, registroId, dados).then(res => ({ res, tr, tipo: "update" })));
    } else {
      promises.push(adicionarRegistroComissao(_comissaoAtual.id, dados).then(res => ({ res, tr, tipo: "create" })));
    }
  });

  const resultados = await Promise.all(promises);
  let erros = 0;
  resultados.forEach(({ res, tr, tipo }) => {
    if (res.sucesso) { if (tipo === "create" && res.id) tr.dataset.registroId = res.id; }
    else erros++;
  });

  btn.disabled = false; btn.textContent = "Salvar";

  if (erros === 0) {
    window.mostrarToast?.("Planilha salva com sucesso!", "success");
    carregarRegistros(_comissaoAtual.id);
  } else {
    window.mostrarToast?.(`${erros} registro(s) com erro.`, "error");
  }
}

function coletarDadosLinha(tr) {
  const get = campo => tr.querySelector(`[data-campo="${campo}"]`);
  return {
    cliente:   get("cliente")?.value.trim() || "",
    descricao: get("descricao")?.value.trim() || "",
    qtdFolhas: parsearNumero(get("qtdFolhas")?.value),
    valor:     parsearMoeda(get("valor")?.value),
    data:      get("data")?.value || "",
    categoria: get("categoria")?.value || ""
  };
}

// ================================================================
// FILTRO POR PERÍODO
// ================================================================
function aplicarFiltro() {
  const inicio = document.getElementById("filtroDataInicio")?.value;
  const fim    = document.getElementById("filtroDataFim")?.value;
  if (!inicio && !fim) { limparFiltro(); return; }

  const dtInicio = inicio ? new Date(inicio + "T00:00:00") : null;
  const dtFim    = fim    ? new Date(fim    + "T23:59:59") : null;

  const filtrados = _registrosTodos.filter(r => {
    if (!r.data) return false;
    const dt = new Date(r.data + "T00:00:00");
    if (dtInicio && dt < dtInicio) return false;
    if (dtFim    && dt > dtFim)    return false;
    return true;
  });

  const tbody = document.getElementById("tbodyComissao");
  _contadorLinhas = 0;
  tbody.innerHTML = "";

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">Nenhum registro no período selecionado.</td></tr>`;
    atualizarContagem(0);
    document.getElementById("comissaoTotalGeral").textContent = formatarMoeda(0);
    return;
  }

  filtrados.forEach(r => adicionarLinha(r));
  atualizarTotalGeral();
  atualizarContagem(filtrados.length);
}

function limparFiltro() {
  document.getElementById("filtroDataInicio").value = "";
  document.getElementById("filtroDataFim").value    = "";
  const tbody = document.getElementById("tbodyComissao");
  _contadorLinhas = 0;
  tbody.innerHTML = "";
  if (_registrosTodos.length === 0 && _modoEdicao) { adicionarLinhaVazia(); }
  else _registrosTodos.forEach(r => adicionarLinha(r));
  atualizarTotalGeral();
  atualizarContagem();
}

// ================================================================
// PDF
// ================================================================
async function gerarPDFComissao(id) {
  const res = await buscarComissao(id);
  if (!res.sucesso) { window.mostrarToast?.("Planilha não encontrada.", "error"); return; }

  const regs = await listarRegistrosComissao(id);
  if (!regs.sucesso) { window.mostrarToast?.("Erro ao carregar registros.", "error"); return; }

  const comissao  = res.dados;
  const registros = regs.registros || [];
  const total     = registros.reduce((s, r) => s + (Number(r.valor) || 0), 0);

  const linhas = registros.map((r, i) => {
    const dataFmt = r.data ? new Date(r.data + "T00:00:00").toLocaleDateString("pt-BR") : "—";
    return `<tr>
      <td>${i + 1}</td>
      <td>${escHtml(r.cliente || "—")}</td>
      <td>${escHtml(r.descricao || "—")}</td>
      <td style="text-align:center">${r.qtdFolhas ?? "—"}</td>
      <td style="text-align:right">${formatarMoeda(r.valor)}</td>
      <td>${dataFmt}</td>
      <td>${escHtml(r.categoria || "—")}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>${escHtml(comissao.titulo)}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; margin: 24px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p  { margin: 0 0 16px; color: #666; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1e3a5f; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; }
    td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #f9fafb; }
    .total-row td { background: #1e3a5f; color: #fff; font-weight: bold; text-align: right; padding: 10px; font-size: 14px; }
  </style></head><body>
  <h1>${escHtml(comissao.titulo)}</h1>
  <p>${escHtml(comissao.descricao || "")}</p>
  <table>
    <thead><tr>
      <th>#</th><th>Cliente</th><th>Descrição</th>
      <th>Folhas</th><th>Valor</th><th>Data</th><th>Categoria</th>
    </tr></thead>
    <tbody>${linhas}</tbody>
    <tfoot><tr class="total-row"><td colspan="4">TOTAL</td><td colspan="3">${formatarMoeda(total)}</td></tr></tfoot>
  </table>
  </body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${comissao.titulo.replace(/\s+/g, "_")}.html`;
  a.click();
  URL.revokeObjectURL(url);
  window.mostrarToast?.("PDF gerado com sucesso!", "success");
}

// ================================================================
// PROTEÇÃO POR SENHA
// ================================================================
function _sessaoValida(id) {
  const exp = _senhaValidadaMap[id];
  return exp && Date.now() < exp;
}
function _marcarSessao(id) {
  _senhaValidadaMap[id] = Date.now() + 30 * 60 * 1000;
}

function exigirSenha(comissaoId, acaoAutorizada, tituloAcao = "Ação Protegida") {
  if (_sessaoValida(comissaoId)) { acaoAutorizada(); return; }

  window.abrirModal?.(
    `🔒 ${tituloAcao}`,
    `<div class="senha-cotacao-modal">
      <p class="senha-cotacao-desc">Informe a senha para acessar esta planilha.</p>
      <div class="field">
        <label class="field-label" for="inputSenhaComissao">Senha da planilha</label>
        <div class="senha-input-wrap">
          <input class="field-input field-input--plain" type="password"
            id="inputSenhaComissao" placeholder="Digite a senha" autocomplete="current-password" />
          <button class="btn-toggle-senha" id="btnToggleSenhaC" type="button">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/></svg>
          </button>
        </div>
      </div>
      <div id="errSenhaComissao" class="senha-erro" style="display:none"></div>
    </div>`,
    `<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button>
     <button class="btn-primary" id="btnConfirmarSenhaC">Confirmar</button>`
  );

  setTimeout(() => document.getElementById("inputSenhaComissao")?.focus(), 100);

  document.getElementById("btnToggleSenhaC")?.addEventListener("click", () => {
    const inp = document.getElementById("inputSenhaComissao");
    inp.type = inp.type === "password" ? "text" : "password";
  });
  document.getElementById("inputSenhaComissao")?.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("btnConfirmarSenhaC")?.click();
  });
  document.getElementById("btnConfirmarSenhaC")?.addEventListener("click", async () => {
    const senha  = document.getElementById("inputSenhaComissao")?.value;
    const erroEl = document.getElementById("errSenhaComissao");
    const btnOk  = document.getElementById("btnConfirmarSenhaC");
    erroEl.style.display = "none";
    if (!senha) { erroEl.textContent = "Informe a senha."; erroEl.style.display = "block"; return; }
    btnOk.disabled = true; btnOk.textContent = "Verificando...";
    const res = await verificarSenhaComissao(comissaoId, senha);
    if (res.sucesso) {
      _marcarSessao(comissaoId);
      window.fecharModal?.();
      acaoAutorizada();
    } else {
      erroEl.textContent = res.erro || "Senha incorreta.";
      erroEl.style.display = "block";
      btnOk.disabled = false; btnOk.textContent = "Confirmar";
      document.getElementById("inputSenhaComissao").value = "";
      document.getElementById("inputSenhaComissao").focus();
    }
  });
}

// ================================================================
// MODAL — NOVA PLANILHA
// ================================================================
function abrirModalNovaComissao() {
  window.abrirModal?.(
    "Nova Planilha de Comissão",
    `<div class="form-usuario">
      <div class="field">
        <label class="field-label" for="comissaoTitulo">Título da Planilha *</label>
        <input class="field-input field-input--plain" type="text" id="comissaoTitulo"
          placeholder="Ex.: Comissão Janeiro 2025" />
      </div>
      <div class="field">
        <label class="field-label" for="comissaoDescricao">Descrição</label>
        <input class="field-input field-input--plain" type="text" id="comissaoDescricao"
          placeholder="Ex.: Vendas da filial Centro" />
      </div>
      <div class="field">
        <label class="field-label" for="comissaoSenha">Senha da Planilha *</label>
        <div class="senha-input-wrap">
          <input class="field-input field-input--plain" type="password" id="comissaoSenha" placeholder="Mínimo 4 caracteres" />
          <button class="btn-toggle-senha" id="btnTCS1" type="button">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/></svg>
          </button>
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="comissaoSenhaConf">Confirmar Senha *</label>
        <div class="senha-input-wrap">
          <input class="field-input field-input--plain" type="password" id="comissaoSenhaConf" placeholder="Repita a senha" />
          <button class="btn-toggle-senha" id="btnTCS2" type="button">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/></svg>
          </button>
        </div>
      </div>
      <div id="erroNovaComissao" class="senha-erro" style="display:none"></div>
    </div>`,
    `<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button>
     <button class="btn-primary" id="btnCriarComissao">Criar Planilha</button>`
  );

  document.getElementById("btnTCS1")?.addEventListener("click", () => {
    const inp = document.getElementById("comissaoSenha"); inp.type = inp.type === "password" ? "text" : "password";
  });
  document.getElementById("btnTCS2")?.addEventListener("click", () => {
    const inp = document.getElementById("comissaoSenhaConf"); inp.type = inp.type === "password" ? "text" : "password";
  });

  document.getElementById("btnCriarComissao")?.addEventListener("click", async () => {
    const titulo = document.getElementById("comissaoTitulo")?.value.trim();
    const desc   = document.getElementById("comissaoDescricao")?.value.trim();
    const senha  = document.getElementById("comissaoSenha")?.value;
    const conf   = document.getElementById("comissaoSenhaConf")?.value;
    const erroEl = document.getElementById("erroNovaComissao");
    const btn    = document.getElementById("btnCriarComissao");
    erroEl.style.display = "none";
    if (!titulo) { erroEl.textContent = "Informe o título."; erroEl.style.display = "block"; return; }
    if (!senha || senha.length < 4) { erroEl.textContent = "Senha mínima de 4 caracteres."; erroEl.style.display = "block"; return; }
    if (senha !== conf) { erroEl.textContent = "As senhas não conferem."; erroEl.style.display = "block"; return; }
    btn.disabled = true; btn.textContent = "Criando...";
    const res = await criarComissao({ titulo, descricao: desc, senha }, _usuario.uid);
    if (res.sucesso) {
      window.fecharModal?.();
      window.mostrarToast?.("Planilha criada!", "success");
      carregarListaComissoes();
    } else {
      erroEl.textContent = "Erro: " + res.erro; erroEl.style.display = "block";
      btn.disabled = false; btn.textContent = "Criar Planilha";
    }
  });
}

// ================================================================
// EXCLUIR PLANILHA
// ================================================================
function confirmarExcluirPlanilha(id, titulo) {
  window.abrirModal?.(
    "Excluir Planilha",
    `<div class="senha-cotacao-modal">
      <p>Tem certeza que deseja excluir <strong>${escHtml(titulo)}</strong>? Todos os registros serão perdidos.</p>
      <div class="field" style="margin-top:12px">
        <label class="field-label" for="inputSenhaExcluirPlan">Confirme com a senha da planilha</label>
        <div class="senha-input-wrap">
          <input class="field-input field-input--plain" type="password"
            id="inputSenhaExcluirPlan" placeholder="Digite a senha" />
        </div>
      </div>
      <div id="errExcluirPlan" class="senha-erro" style="display:none"></div>
    </div>`,
    `<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button>
     <button class="btn-danger-solid" id="btnConfExcluirPlan">Excluir Planilha</button>`
  );

  setTimeout(() => document.getElementById("inputSenhaExcluirPlan")?.focus(), 100);

  document.getElementById("btnConfExcluirPlan")?.addEventListener("click", async () => {
    const senha  = document.getElementById("inputSenhaExcluirPlan")?.value;
    const erroEl = document.getElementById("errExcluirPlan");
    const btn    = document.getElementById("btnConfExcluirPlan");
    erroEl.style.display = "none";
    if (!senha) { erroEl.textContent = "Informe a senha."; erroEl.style.display = "block"; return; }
    btn.disabled = true; btn.textContent = "Verificando...";
    const verif = await verificarSenhaComissao(id, senha);
    if (!verif.sucesso) {
      erroEl.textContent = verif.erro || "Senha incorreta."; erroEl.style.display = "block";
      btn.disabled = false; btn.textContent = "Excluir Planilha";
      document.getElementById("inputSenhaExcluirPlan").value = ""; return;
    }
    btn.textContent = "Excluindo...";
    const res = await excluirComissao(id);
    if (res.sucesso) { window.fecharModal?.(); window.mostrarToast?.("Planilha excluída.", "success"); carregarListaComissoes(); }
    else { erroEl.textContent = "Erro: " + res.erro; erroEl.style.display = "block"; btn.disabled = false; btn.textContent = "Excluir Planilha"; }
  });
}

// ================================================================
// TOTAIS E UTILS
// ================================================================
function atualizarTotalGeral() {
  let total = 0;
  document.querySelectorAll("#tbodyComissao [data-campo='valor']").forEach(inp => {
    total += parsearMoeda(inp.value);
  });
  // modo leitura: somar cell-total de valor
  if (!_modoEdicao) {
    total = 0;
    _registrosTodos.forEach(r => total += Number(r.valor) || 0);
  }
  document.getElementById("comissaoTotalGeral").textContent = formatarMoeda(total);
}

function renumerarLinhas() {
  document.querySelectorAll("#tbodyComissao tr[data-linha]").forEach((tr, i) => {
    const num = tr.querySelector(".item-num");
    if (num) num.textContent = i + 1;
  });
}

function atualizarContagem(qtd = null) {
  const el = document.getElementById("comissaoContagem");
  if (!el) return;
  const n = qtd ?? document.querySelectorAll("#tbodyComissao tr[data-linha]").length;
  el.textContent = `${n} registro${n !== 1 ? "s" : ""}`;
}

function escHtml(str) {
  return String(str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function parsearNumero(valor) { return parseFloat(String(valor || "0").replace(",", ".")) || 0; }
function parsearMoeda(valor) {
  if (typeof valor !== "string") return Number(valor) || 0;
  return parseFloat(valor.replace(/[R$\s]/g,"").replace(/\./g,"").replace(",",".")) || 0;
}
function formatarCampoMoeda(valor) {
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(Number(valor)||0);
}
function slugCategoria(cat) {
  const map = { "Dinheiro":"dinheiro","Débito":"debito","Crédito":"credito","Pix celular":"pix","Pix maquininha":"pix","Convênio":"convenio" };
  return map[cat] || "default";
}
