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
let _dadosUsuario      = null;
let _comissaoAtual    = null;
let _senhaValidadaMap = {};
let _registrosTodos   = [];
let _modoEdicao       = false;
let _contadorLinhas   = 0;
let _undoStack        = [];
const _fotosPorLinha  = new WeakMap(); // tr -> array de dataURLs (base64)

export function iniciarComissao(usuario, dadosUsuario) {
  _usuario = usuario;
  _dadosUsuario = dadosUsuario;

  // Clique para ampliar fotos — delegado no documento inteiro, então
  // funciona sempre, não importa quando/como o modal foi renderizado.
  document.addEventListener("click", (e) => {
    const img = e.target.closest(".comissao-foto-clicavel");
    if (img && img.dataset.src) abrirFotoGrande(img.dataset.src);
  });

  document.addEventListener("navegacao", (e) => {
    if (e.detail.page === "comissao") carregarListaComissoes();
  });

  document.getElementById("btnNovaComissao")?.addEventListener("click", abrirModalNovaComissao);
  document.getElementById("btnVoltarComissao")?.addEventListener("click", mostrarPainelLista);
  document.getElementById("btnAdicionarLinhaComissao")?.addEventListener("click", adicionarLinhaVazia);
  document.getElementById("btnConfirmarQtdLinhas")?.addEventListener("click", adicionarLinhaVazia);
  document.getElementById("qtdLinhasComissao")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); adicionarLinhaVazia(); }
  });
  document.getElementById("btnSalvarComissao")?.addEventListener("click", salvarTodosRegistros);
  document.getElementById("btnDesfazerComissao")?.addEventListener("click", desfazerUltimaAcao);
  document.getElementById("btnAplicarFiltro")?.addEventListener("click", aplicarFiltro);
  document.getElementById("btnLimparFiltro")?.addEventListener("click", limparFiltro);

  // Delegação de clique nos cards da lista — registrado uma única vez para
  // evitar handlers duplicados (bug: cada recarregamento da lista adicionava
  // um novo listener no mesmo container, acumulando cliques/travamentos).
  document.getElementById("comissaoCards")?.addEventListener("click", onCardClick);

  document.addEventListener("keydown", (e) => {
    const ctrlZ = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z";
    if (!ctrlZ) return;
    const painel = document.getElementById("comissaoDetalhePanel");
    if (!painel || painel.hidden || !_modoEdicao) return;
    e.preventDefault();
    desfazerUltimaAcao();
  });
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
  _undoStack      = [];
  carregarListaComissoes();
}

function mostrarPainelDetalhe(comissao, modoEdicao = false) {
  _comissaoAtual  = comissao;
  _modoEdicao     = modoEdicao;
  _contadorLinhas = 0;
  _undoStack      = [];

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
  document.getElementById("btnDesfazerComissao").hidden       = !modoEdicao;
  const wrapQtd = document.getElementById("wrapQtdLinhasComissao");
  if (wrapQtd) wrapQtd.style.display = modoEdicao ? "flex" : "none";
  const inpQtd = document.getElementById("qtdLinhasComissao");
  if (inpQtd) inpQtd.value = "";
  atualizarBotaoDesfazer();

  // Filtro de período — visível em ambos os modos
  // Bloquear inputs de filtro em leitura apenas se desejar (mantemos abertos para filtrar visualização)
  const filtroBar = document.getElementById("comissaoFiltroBar");
  if (filtroBar) filtroBar.hidden = false;

  document.getElementById("filtroDataInicio").value = "";
  document.getElementById("filtroDataFim").value    = "";
  document.getElementById("filtroValorMin").value   = "";
  document.getElementById("filtroValorMax").value   = "";

  // Marcar tabela como somente leitura via classe
  const tabela = document.getElementById("tbodyComissao")?.closest("table");
  if (tabela) {
    tabela.classList.toggle("tabela-readonly", !modoEdicao);
  }

  carregarRegistros(comissao.id);
}

// ================================================================
// LISTA DE PLANILHAS
// ================================================================
async function carregarListaComissoes() {
  const container = document.getElementById("comissaoCards");
  container.innerHTML = `<p class="loading-cell">Carregando...</p>`;

  // Timeout de segurança: em alguns navegadores mobile (Safari em especial),
  // a conexão do Firestore pode ficar "presa" depois que o app volta do
  // background, fazendo a Promise nunca resolver e a tela travar em
  // "Carregando..." para sempre. Se isso acontecer, mostramos um erro com
  // botão de tentar novamente em vez de travar a interface.
  const timeoutPromise = new Promise(resolve =>
    setTimeout(() => resolve({ sucesso: false, erro: "tempo-esgotado" }), 12000)
  );

  const resultado = await Promise.race([listarComissoes(), timeoutPromise]);

  if (!resultado.sucesso) {
    const msg = resultado.erro === "tempo-esgotado"
      ? "A conexão demorou demais para responder."
      : `Erro ao carregar planilhas: ${resultado.erro}`;
    container.innerHTML = `
      <div class="comissao-empty">
        <p>${msg}</p>
        <button class="btn-secondary" id="btnRetryComissoes">Tentar novamente</button>
      </div>`;
    document.getElementById("btnRetryComissoes")?.addEventListener("click", carregarListaComissoes);
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
          <span class="comissao-card-criador">Criada por ${escHtml(c.criadoPorNome || "—")}</span>
          <span class="comissao-card-data">Criada em ${formatarData(c.dataCriacao)}</span>
        </div>
        <div class="comissao-card-actions">
          <button class="cac-btn cac-btn--blue" data-action="abrir" data-id="${escHtml(c.id)}" style="background:#eef2ff;color:#1e3a8a">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
              <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/>
            </svg>
            <span>Abrir</span>
          </button>
          <button class="cac-btn cac-btn--blue" data-action="pdf" data-id="${escHtml(c.id)}" style="background:#eef2ff;color:#1e3a8a">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clip-rule="evenodd"/>
            </svg>
            <span>PDF</span>
          </button>
          <button class="cac-btn cac-btn--blue" data-action="editar" data-id="${escHtml(c.id)}" style="background:#eef2ff;color:#1e3a8a">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
            </svg>
            <span>Editar</span>
          </button>
          <button class="cac-btn cac-btn--red" data-action="excluir-planilha" data-id="${escHtml(c.id)}" data-titulo="${escHtml(c.titulo)}" style="background:#fff1f1;color:#b91c1c">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
            <span>Excluir</span>
          </button>
        </div>
      </div>
    </div>
  `).join("");
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

  const timeoutPromise = new Promise(resolve =>
    setTimeout(() => resolve({ sucesso: false, erro: "tempo-esgotado" }), 12000)
  );
  const resultado = await Promise.race([listarRegistrosComissao(comissaoId), timeoutPromise]);

  if (!resultado.sucesso) {
    const msg = resultado.erro === "tempo-esgotado" ? "A conexão demorou demais para responder." : "Erro ao carregar registros.";
    tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">${msg} <button class="btn-secondary" id="btnRetryRegistros" style="margin-left:8px">Tentar novamente</button></td></tr>`;
    document.getElementById("btnRetryRegistros")?.addEventListener("click", () => carregarRegistros(comissaoId));
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
  if (!_modoEdicao) return;   // bloqueio modo leitura
  const inpQtd = document.getElementById("qtdLinhasComissao");
  let qtd = parseInt(inpQtd?.value, 10);
  if (!qtd || qtd < 1) qtd = 1;
  for (let i = 0; i < qtd; i++) adicionarLinha({});
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
          data-campo="cliente" value="${escHtml(dados.cliente || "")}" autocomplete="off" />
      </td>
      <td class="col-com-desc">
        <input class="excel-input" type="text" placeholder="Descrição"
          data-campo="descricao" value="${escHtml(dados.descricao || "")}" autocomplete="off" />
      </td>
      <td class="col-com-folhas">
        <input class="excel-input excel-input--center" type="number"
          min="0" step="1" placeholder="0"
          data-campo="qtdFolhas" value="${dados.qtdFolhas ?? ""}" autocomplete="off" />
      </td>
      <td class="col-com-valor">
        <input class="excel-input excel-input--right" type="text"
          placeholder="R$ 0,00"
          data-campo="valor" value="${dados.valor ? formatarCampoMoeda(dados.valor) : ""}" autocomplete="off" />
      </td>
      <td class="col-com-data">
        <input class="excel-input" type="date"
          data-campo="data" value="${dados.data || hoje}" autocomplete="off" />
      </td>
      <td class="col-com-cat">
        <select class="excel-input excel-select" data-campo="categoria" autocomplete="off">
          ${optsCategoria}
        </select>
      </td>
      <td class="col-acao" style="display:flex;gap:4px;align-items:center;justify-content:center">
        <button class="btn-remove-row btn-foto-row" type="button" title="Anexar fotos">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 5h2.5l1-1.5h5l1 1.5H16a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zm6 3a3 3 0 100 6 3 3 0 000-6z" clip-rule="evenodd"/></svg>
          <span class="foto-badge" hidden>0</span>
        </button>
        <button class="btn-remove-row" title="Remover linha">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
        </button>
      </td>`;

    _fotosPorLinha.set(tr, Array.isArray(dados.fotos) ? [...dados.fotos] : []);
    atualizarBadgeFoto(tr);

    tr.querySelector(".btn-foto-row").addEventListener("click", () => abrirModalFotos(tr));

    // Formatar valor ao sair
    const inputValor = tr.querySelector('[data-campo="valor"]');
    inputValor.addEventListener("blur", () => {
      const val = parsearMoeda(inputValor.value);
      if (val > 0) inputValor.value = formatarCampoMoeda(val);
      atualizarTotalGeral();
    });
    inputValor.addEventListener("input", atualizarTotalGeral);

    // Remover linha (com confirmação + undo)
    tr.querySelector(".btn-remove-row[title='Remover linha']").addEventListener("click", () => {
      confirmarExclusaoLinha(tr);
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
      <td class="col-acao">
        ${Array.isArray(dados.fotos) && dados.fotos.length ? `
          <button class="btn-ver-fotos" type="button" title="Ver fotos anexadas">
            📷 ${dados.fotos.length}
          </button>` : ""}
      </td>`;

    if (Array.isArray(dados.fotos) && dados.fotos.length) {
      tr.querySelector(".btn-ver-fotos")?.addEventListener("click", () => visualizarFotos(dados.fotos));
    }
  }

  tbody.appendChild(tr);
  renumerarLinhas();
  atualizarContagem();
}

// ================================================================
// EXCLUSÃO DE LINHA (com confirmação) + DESFAZER (undo)
// ================================================================
function confirmarExclusaoLinha(tr) {
  const cliente = tr.querySelector('[data-campo="cliente"]')?.value.trim() || "esta linha";
  window.abrirModal?.(
    "Excluir registro",
    `<div class="senha-cotacao-modal">
      <p>Tem certeza que deseja excluir <strong>${escHtml(cliente)}</strong>? Você pode desfazer com Ctrl+Z logo em seguida.</p>
    </div>`,
    `<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button>
     <button class="btn-danger-solid" id="btnConfExcluirLinha">Excluir</button>`
  );

  document.getElementById("btnConfExcluirLinha")?.addEventListener("click", async () => {
    window.fecharModal?.();
    const registroId = tr.dataset.registroId;
    if (registroId) {
      await excluirLinhaSalva(tr, registroId);
    } else {
      removerLinhaLocal(tr, true);
    }
  });
}

function removerLinhaLocal(tr, registrarUndo) {
  const indexAtual = Array.from(tr.parentElement.children).indexOf(tr);
  if (registrarUndo) {
    _undoStack.push({
      tipo: "local",
      dados: coletarDadosLinha(tr),
      fotos: _fotosPorLinha.get(tr) || [],
      index: indexAtual
    });
    atualizarBotaoDesfazer();
  }
  tr.remove();
  renumerarLinhas();
  atualizarTotalGeral();
  atualizarContagem();
  if (!document.querySelector("#tbodyComissao tr[data-linha]")) adicionarLinhaVazia();
}

async function excluirLinhaSalva(tr, registroId) {
  const dadosAntes = coletarDadosLinha(tr);
  const fotosAntes = _fotosPorLinha.get(tr) || [];
  const indexAtual = Array.from(tr.parentElement.children).indexOf(tr);

  const res = await excluirRegistroComissao(_comissaoAtual.id, registroId);
  if (res.sucesso) {
    tr.remove();
    _registrosTodos = _registrosTodos.filter(r => r.id !== registroId);
    renumerarLinhas();
    atualizarTotalGeral();
    atualizarContagem();
    window.mostrarToast?.("Registro excluído.", "success");
    _undoStack.push({ tipo: "salvo", dados: dadosAntes, fotos: fotosAntes, index: indexAtual });
    atualizarBotaoDesfazer();
    if (!document.querySelector("#tbodyComissao tr[data-linha]")) adicionarLinhaVazia();
  } else {
    window.mostrarToast?.("Erro ao excluir: " + res.erro, "error");
  }
}

function atualizarBotaoDesfazer() {
  const btn = document.getElementById("btnDesfazerComissao");
  if (!btn) return;
  btn.disabled = _undoStack.length === 0;
}

async function desfazerUltimaAcao() {
  if (!_modoEdicao || _undoStack.length === 0) return;
  const acao = _undoStack.pop();
  atualizarBotaoDesfazer();

  if (acao.tipo === "salvo") {
    const res = await adicionarRegistroComissao(_comissaoAtual.id, acao.dados);
    if (!res.sucesso) { window.mostrarToast?.("Não foi possível desfazer: " + res.erro, "error"); return; }
    acao.dados.id = res.id;
  }

  const tbody = document.getElementById("tbodyComissao");
  const vazio = tbody.querySelector(".excel-empty-row, tr:not([data-linha])");
  if (vazio && !vazio.dataset.linha) vazio.remove();

  adicionarLinha(acao.dados);
  const novaLinha = tbody.lastElementChild;
  if (novaLinha) {
    _fotosPorLinha.set(novaLinha, acao.fotos || []);
    atualizarBadgeFoto(novaLinha);
    const refIndex = Math.min(acao.index, tbody.children.length - 1);
    tbody.insertBefore(novaLinha, tbody.children[refIndex] || null);
    renumerarLinhas();
  }
  if (acao.tipo === "salvo") _registrosTodos.push(acao.dados);
  atualizarTotalGeral();
  atualizarContagem();
  window.mostrarToast?.("Ação desfeita.", "success");
}

// ================================================================
// FOTOS DOS SERVIÇOS (anexo opcional, por linha)
// ================================================================
function atualizarBadgeFoto(tr) {
  const badge = tr.querySelector(".foto-badge");
  if (!badge) return;
  const n = (_fotosPorLinha.get(tr) || []).length;
  badge.textContent = n;
  badge.hidden = n === 0;
}

function _comprimirImagem(file, maxDim = 1000, qualidade = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Falha ao carregar imagem."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const escala = maxDim / Math.max(width, height);
          width  = Math.round(width  * escala);
          height = Math.round(height * escala);
        }
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

function abrirModalFotos(tr) {
  const fotos = _fotosPorLinha.get(tr) || [];

  const render = () => `
    <div class="comissao-fotos-modal">
      <div class="comissao-fotos-grid">
        ${fotos.map((f, i) => `
          <div class="comissao-foto-item">
            <img src="${f}" alt="Foto ${i + 1}" class="comissao-foto-clicavel" data-src="${f}" />
            <button class="btn-remove-foto" data-i="${i}" title="Remover foto">×</button>
          </div>`).join("") || `<p class="empty-cell">Nenhuma foto anexada.</p>`}
      </div>
      <label class="btn-secondary comissao-foto-add" for="inputFotosServico">
        Adicionar foto(s)
      </label>
      <input type="file" id="inputFotosServico" accept="image/*" multiple hidden autocomplete="off" />
      <p class="comissao-foto-dica">Pode anexar uma ou várias fotos (opcional).</p>
    </div>`;

  window.abrirModal?.(
    "Fotos do serviço",
    render(),
    `<button class="btn-primary" onclick="window.fecharModal()">Concluir</button>`
  );

  const reabrirComEstadoAtual = () => {
    const corpo = document.querySelector(".comissao-fotos-modal");
    if (!corpo) return;
    corpo.outerHTML = render();
    ligarEventos();
  };

  const ligarEventos = () => {
    document.getElementById("inputFotosServico")?.addEventListener("change", async (e) => {
      const arquivos = Array.from(e.target.files || []);
      if (!arquivos.length) return;
      for (const file of arquivos) {
        try {
          const dataUrl = await _comprimirImagem(file);
          fotos.push(dataUrl);
        } catch {
          window.mostrarToast?.("Erro ao processar uma das imagens.", "error");
        }
      }
      _fotosPorLinha.set(tr, fotos);
      atualizarBadgeFoto(tr);
      reabrirComEstadoAtual();
    });

    document.querySelectorAll(".btn-remove-foto").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.i);
        fotos.splice(i, 1);
        _fotosPorLinha.set(tr, fotos);
        atualizarBadgeFoto(tr);
        reabrirComEstadoAtual();
      });
    });
  };

  ligarEventos();
}

function abrirFotoGrande(src) {
  const overlay = document.createElement("div");
  overlay.className = "comissao-lightbox-overlay";
  overlay.innerHTML = `
    <button class="comissao-lightbox-fechar" title="Fechar">×</button>
    <img src="${src}" alt="Foto ampliada" />`;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.classList.contains("comissao-lightbox-fechar")) {
      overlay.remove();
    }
  });
  document.body.appendChild(overlay);
}

function visualizarFotos(fotos) {
  window.abrirModal?.(
    "Fotos do serviço",
    `<div class="comissao-fotos-modal">
      <div class="comissao-fotos-grid">
        ${fotos.map((f, i) => `
          <div class="comissao-foto-item">
            <img src="${f}" alt="Foto ${i + 1}" class="comissao-foto-clicavel" data-src="${f}" />
          </div>`).join("")}
      </div>
    </div>`,
    `<button class="btn-primary" onclick="window.fecharModal()">Fechar</button>`
  );
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
  linhas.forEach((tr, i) => {
    const dados      = coletarDadosLinha(tr, i);
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

function coletarDadosLinha(tr, ordem) {
  const get = campo => tr.querySelector(`[data-campo="${campo}"]`);
  return {
    cliente:   get("cliente")?.value.trim() || "",
    descricao: get("descricao")?.value.trim() || "",
    qtdFolhas: parsearNumero(get("qtdFolhas")?.value),
    valor:     parsearMoeda(get("valor")?.value),
    data:      get("data")?.value || "",
    categoria: get("categoria")?.value || "",
    fotos:     _fotosPorLinha.get(tr) || [],
    ordem:     ordem
  };
}

// ================================================================
// FILTRO POR PERÍODO
// ================================================================
function aplicarFiltro() {
  const inicio  = document.getElementById("filtroDataInicio")?.value;
  const fim     = document.getElementById("filtroDataFim")?.value;
  const valorMinStr = document.getElementById("filtroValorMin")?.value;
  const valorMaxStr = document.getElementById("filtroValorMax")?.value;
  const valorMin = valorMinStr ? parsearMoeda(valorMinStr) : null;
  const valorMax = valorMaxStr ? parsearMoeda(valorMaxStr) : null;

  if (!inicio && !fim && valorMin === null && valorMax === null) { limparFiltro(); return; }

  const dtInicio = inicio ? new Date(inicio + "T00:00:00") : null;
  const dtFim    = fim    ? new Date(fim    + "T23:59:59") : null;

  const filtrados = _registrosTodos.filter(r => {
    if (dtInicio || dtFim) {
      if (!r.data) return false;
      const dt = new Date(r.data + "T00:00:00");
      if (dtInicio && dt < dtInicio) return false;
      if (dtFim    && dt > dtFim)    return false;
    }
    const valor = Number(r.valor) || 0;
    if (valorMin !== null && valor < valorMin) return false;
    if (valorMax !== null && valor > valorMax) return false;
    return true;
  });

  const tbody = document.getElementById("tbodyComissao");
  _contadorLinhas = 0;
  tbody.innerHTML = "";

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">Nenhum registro encontrado para o filtro selecionado.</td></tr>`;
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
  document.getElementById("filtroValorMin").value   = "";
  document.getElementById("filtroValorMax").value   = "";
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
      <th>Folhas</th><th>Valor</th><th>Data</th><th>Forma de Pagamento</th>
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
            id="inputSenhaComissao" name="senha_planilha_${comissaoId}_${Date.now()}" placeholder="Digite a senha"
            autocomplete="new-password" readonly onfocus="this.removeAttribute('readonly')" />
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

  const _inpSenhaC = document.getElementById("inputSenhaComissao");
  if (_inpSenhaC) _inpSenhaC.value = "";
  setTimeout(() => {
    const inp = document.getElementById("inputSenhaComissao");
    if (inp) inp.value = "";
    inp?.focus();
  }, 100);

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
          placeholder="Ex.: Comissão Janeiro 2025" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="comissaoDescricao">Descrição</label>
        <input class="field-input field-input--plain" type="text" id="comissaoDescricao"
          placeholder="Ex.: Vendas da filial Centro" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="comissaoSenha">Senha da Planilha *</label>
        <div class="senha-input-wrap">
          <input class="field-input field-input--plain" type="password" id="comissaoSenha" placeholder="Mínimo 4 caracteres" autocomplete="new-password" />
          <button class="btn-toggle-senha" id="btnTCS1" type="button">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/></svg>
          </button>
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="comissaoSenhaConf">Confirmar Senha *</label>
        <div class="senha-input-wrap">
          <input class="field-input field-input--plain" type="password" id="comissaoSenhaConf" placeholder="Repita a senha" autocomplete="new-password" />
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
    const nomeCriador = _dadosUsuario?.nome || _usuario?.email?.split("@")[0] || "—";
    const res = await criarComissao({ titulo, descricao: desc, senha, criadoPorNome: nomeCriador }, _usuario.uid);
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
            id="inputSenhaExcluirPlan" name="senha_excluir_${id}_${Date.now()}" placeholder="Digite a senha"
            autocomplete="new-password" readonly onfocus="this.removeAttribute('readonly')" />
        </div>
      </div>
      <div id="errExcluirPlan" class="senha-erro" style="display:none"></div>
    </div>`,
    `<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button>
     <button class="btn-danger-solid" id="btnConfExcluirPlan">Excluir Planilha</button>`
  );

  setTimeout(() => {
    const inp = document.getElementById("inputSenhaExcluirPlan");
    if (inp) inp.value = "";
    inp?.focus();
  }, 100);

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
