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

let _usuario      = null;
let _dadosUsuario = null;
let _comissaoAtual = null;        // planilha aberta
let _senhaValidadaMap = {};       // cache de sessão por comissaoId

export function iniciarComissao(usuario, dadosUsuario) {
  _usuario      = usuario;
  _dadosUsuario = dadosUsuario;

  document.addEventListener("navegacao", (e) => {
    if (e.detail.page === "comissao") carregarListaComissoes();
  });

  // Botão nova planilha
  document.getElementById("btnNovaComissao")?.addEventListener("click", abrirModalNovaComissao);

  // Voltar para lista
  document.getElementById("btnVoltarComissao")?.addEventListener("click", () => {
    mostrarPainelLista();
  });

  // Botão adicionar registro
  document.getElementById("btnAdicionarRegistro")?.addEventListener("click", abrirModalRegistro);
}

// ================================================================
// NAVEGAÇÃO INTERNA
// ================================================================
function mostrarPainelLista() {
  document.getElementById("comissaoListaPanel").hidden  = false;
  document.getElementById("comissaoDetalhePanel").hidden = true;
  _comissaoAtual = null;
  carregarListaComissoes();
}

function mostrarPainelDetalhe(comissao) {
  _comissaoAtual = comissao;
  document.getElementById("comissaoListaPanel").hidden  = true;
  document.getElementById("comissaoDetalhePanel").hidden = false;
  document.getElementById("comissaoDetalheTitulo").textContent = comissao.titulo;
  document.getElementById("comissaoDetalheDesc").textContent   = comissao.descricao || "";
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
    container.innerHTML = `<p class="empty-cell">Erro ao carregar planilhas.</p>`;
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
        <button class="btn-primary" onclick="document.getElementById('btnNovaComissao').click()">
          Criar primeira planilha
        </button>
      </div>`;
    return;
  }

  container.innerHTML = comissoes.map(c => `
    <div class="comissao-card" data-id="${escHtml(c.id)}">
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
      <div class="comissao-card-actions">
        <button class="btn-primary btn-sm" data-action="abrir" data-id="${escHtml(c.id)}">
          Abrir
        </button>
        <button class="btn-ghost btn-sm btn-danger" data-action="excluir-planilha" data-id="${escHtml(c.id)}" data-titulo="${escHtml(c.titulo)}">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
        </button>
      </div>
    </div>
  `).join("");

  // Event delegation
  container.addEventListener("click", onCardClick);
}

function onCardClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const { action, id, titulo } = btn.dataset;

  if (action === "abrir") {
    abrirPlanilha(id);
  } else if (action === "excluir-planilha") {
    confirmarExcluirPlanilha(id, titulo);
  }
}

// ================================================================
// ABRIR PLANILHA (com validação de senha)
// ================================================================
async function abrirPlanilha(id) {
  const resultado = await buscarComissao(id);
  if (!resultado.sucesso) {
    window.mostrarToast?.("Planilha não encontrada.", "error");
    return;
  }
  mostrarPainelDetalhe(resultado.dados);
}

// ================================================================
// REGISTROS DA PLANILHA
// ================================================================
async function carregarRegistros(comissaoId) {
  const tbody = document.getElementById("tbodyRegistros");
  const totalEl = document.getElementById("comissaoTotalGeral");
  tbody.innerHTML = `<tr><td colspan="6" class="loading-cell">Carregando...</td></tr>`;

  const resultado = await listarRegistrosComissao(comissaoId);

  if (!resultado.sucesso) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">Erro ao carregar registros.</td></tr>`;
    return;
  }

  const { registros } = resultado;

  if (registros.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">Nenhum registro. Clique em "+ Adicionar Registro".</td></tr>`;
    if (totalEl) totalEl.textContent = formatarMoeda(0);
    return;
  }

  let totalGeral = 0;

  tbody.innerHTML = registros.map((r, i) => {
    const valorComissao = (Number(r.valorVenda) || 0) * (Number(r.percentual) || 0) / 100;
    totalGeral += valorComissao;
    return `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${escHtml(r.vendedor || "—")}</strong></td>
        <td>${escHtml(r.descricao || "—")}</td>
        <td class="col-right">${formatarMoeda(r.valorVenda)}</td>
        <td class="col-right">${Number(r.percentual || 0).toFixed(1)}%</td>
        <td class="col-right"><strong>${formatarMoeda(valorComissao)}</strong></td>
        <td class="col-center">
          <div class="action-group">
            <button class="btn-icon btn-icon--sm" title="Editar"
              data-action="editar-reg" data-id="${escHtml(r.id)}">
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
            </button>
            <button class="btn-icon btn-icon--sm btn-icon--danger" title="Excluir"
              data-action="excluir-reg" data-id="${escHtml(r.id)}" data-vendedor="${escHtml(r.vendedor || "")}">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
  }).join("");

  if (totalEl) totalEl.textContent = formatarMoeda(totalGeral);

  // Event delegation
  tbody.addEventListener("click", onRegistroClick);
}

function onRegistroClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const { action, id, vendedor } = btn.dataset;

  if (action === "editar-reg") {
    exigirSenhaComissaoLocal(() => abrirModalRegistro(id), "Editar Registro");
  } else if (action === "excluir-reg") {
    exigirSenhaComissaoLocal(() => confirmarExcluirRegistro(id, vendedor), "Excluir Registro");
  }
}

// ================================================================
// PROTEÇÃO POR SENHA (por planilha, com cache de sessão)
// ================================================================
function _sessaoValida(comissaoId) {
  const exp = _senhaValidadaMap[comissaoId];
  return exp && Date.now() < exp;
}

function _marcarSessao(comissaoId) {
  _senhaValidadaMap[comissaoId] = Date.now() + 30 * 60 * 1000; // 30 min
}

function exigirSenhaComissaoLocal(acaoAutorizada, tituloAcao = "Ação Protegida") {
  if (!_comissaoAtual) return;
  const comissaoId = _comissaoAtual.id;

  if (_sessaoValida(comissaoId)) {
    acaoAutorizada();
    return;
  }

  window.abrirModal?.(
    `🔒 ${tituloAcao}`,
    `<div class="senha-cotacao-modal">
      <p class="senha-cotacao-desc">
        Informe a senha da planilha <strong>${escHtml(_comissaoAtual.titulo)}</strong> para continuar.
      </p>
      <div class="field">
        <label class="field-label" for="inputSenhaComissao">Senha da planilha</label>
        <div class="senha-input-wrap">
          <input class="field-input field-input--plain" type="password"
            id="inputSenhaComissao" placeholder="Digite a senha" autocomplete="current-password" />
          <button class="btn-toggle-senha" id="btnToggleSenhaComissao" type="button">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/></svg>
          </button>
        </div>
      </div>
      <div id="errSenhaComissao" class="senha-erro" style="display:none"></div>
    </div>`,
    `<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button>
     <button class="btn-primary" id="btnConfirmarSenhaComissao">Confirmar</button>`
  );

  setTimeout(() => document.getElementById("inputSenhaComissao")?.focus(), 100);

  document.getElementById("btnToggleSenhaComissao")?.addEventListener("click", () => {
    const inp = document.getElementById("inputSenhaComissao");
    inp.type = inp.type === "password" ? "text" : "password";
  });

  document.getElementById("inputSenhaComissao")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btnConfirmarSenhaComissao")?.click();
  });

  document.getElementById("btnConfirmarSenhaComissao")?.addEventListener("click", async () => {
    const senha  = document.getElementById("inputSenhaComissao")?.value;
    const erroEl = document.getElementById("errSenhaComissao");
    const btnOk  = document.getElementById("btnConfirmarSenhaComissao");
    erroEl.style.display = "none";

    if (!senha) {
      erroEl.textContent = "Informe a senha.";
      erroEl.style.display = "block";
      return;
    }

    btnOk.disabled    = true;
    btnOk.textContent = "Verificando...";

    const res = await verificarSenhaComissao(comissaoId, senha);

    if (res.sucesso) {
      _marcarSessao(comissaoId);
      window.fecharModal?.();
      acaoAutorizada();
    } else {
      erroEl.textContent   = res.erro || "Senha incorreta.";
      erroEl.style.display = "block";
      btnOk.disabled       = false;
      btnOk.textContent    = "Confirmar";
      document.getElementById("inputSenhaComissao").value = "";
      document.getElementById("inputSenhaComissao").focus();
    }
  });
}

// ================================================================
// MODAL — NOVO REGISTRO / EDITAR REGISTRO
// ================================================================
async function abrirModalRegistro(registroId = null) {
  if (!_comissaoAtual) return;

  let dadosReg = null;
  if (registroId) {
    // Buscar dados atuais para preencher o form
    const regs = await listarRegistrosComissao(_comissaoAtual.id);
    dadosReg = regs.registros?.find(r => r.id === registroId) || null;
  }

  window.abrirModal?.(
    registroId ? "Editar Registro" : "Novo Registro",
    `<div class="form-usuario">
      <div class="form-grid form-grid--2">
        <div class="field field--full">
          <label class="field-label" for="regVendedor">Vendedor *</label>
          <input class="field-input field-input--plain" type="text" id="regVendedor"
            placeholder="Nome do vendedor" value="${escHtml(dadosReg?.vendedor || "")}" />
        </div>
        <div class="field field--full">
          <label class="field-label" for="regDescricao">Descrição</label>
          <input class="field-input field-input--plain" type="text" id="regDescricao"
            placeholder="Ex.: Venda de papel A4" value="${escHtml(dadosReg?.descricao || "")}" />
        </div>
        <div class="field">
          <label class="field-label" for="regValorVenda">Valor da Venda (R$) *</label>
          <input class="field-input field-input--plain" type="number" id="regValorVenda"
            placeholder="0,00" min="0" step="0.01"
            value="${dadosReg?.valorVenda ?? ""}" />
        </div>
        <div class="field">
          <label class="field-label" for="regPercentual">% Comissão *</label>
          <input class="field-input field-input--plain" type="number" id="regPercentual"
            placeholder="Ex.: 5" min="0" max="100" step="0.1"
            value="${dadosReg?.percentual ?? ""}" />
        </div>
        <div class="field field--full" id="previewComissao" style="
          background:var(--blue-50,#EFF6FF);border-radius:8px;padding:12px;
          display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span style="font-size:var(--text-sm);color:var(--gray-600)">Comissão calculada:</span>
          <strong id="previewValorComissao" style="font-size:var(--text-lg);color:var(--blue-700,#1D4ED8)">R$ 0,00</strong>
        </div>
      </div>
      <div id="erroRegistro" class="senha-erro" style="display:none;margin-top:8px"></div>
    </div>`,
    `<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button>
     <button class="btn-primary" id="btnSalvarRegistro">${registroId ? "Salvar" : "Adicionar"}</button>`
  );

  // Preview em tempo real
  const calcPreview = () => {
    const venda = Number(document.getElementById("regValorVenda")?.value) || 0;
    const perc  = Number(document.getElementById("regPercentual")?.value) || 0;
    const val   = venda * perc / 100;
    document.getElementById("previewValorComissao").textContent = formatarMoeda(val);
  };
  document.getElementById("regValorVenda")?.addEventListener("input", calcPreview);
  document.getElementById("regPercentual")?.addEventListener("input", calcPreview);
  if (dadosReg) calcPreview();

  document.getElementById("btnSalvarRegistro")?.addEventListener("click", async () => {
    const vendedor   = document.getElementById("regVendedor")?.value.trim();
    const descricao  = document.getElementById("regDescricao")?.value.trim();
    const valorVenda = Number(document.getElementById("regValorVenda")?.value);
    const percentual = Number(document.getElementById("regPercentual")?.value);
    const erroEl     = document.getElementById("erroRegistro");
    const btn        = document.getElementById("btnSalvarRegistro");
    erroEl.style.display = "none";

    if (!vendedor) {
      erroEl.textContent = "Informe o nome do vendedor.";
      erroEl.style.display = "block"; return;
    }
    if (!valorVenda || valorVenda <= 0) {
      erroEl.textContent = "Informe um valor de venda válido.";
      erroEl.style.display = "block"; return;
    }
    if (!percentual || percentual <= 0) {
      erroEl.textContent = "Informe um percentual de comissão válido.";
      erroEl.style.display = "block"; return;
    }

    btn.disabled    = true;
    btn.textContent = "Salvando...";

    const dados = { vendedor, descricao, valorVenda, percentual };
    let res;
    if (registroId) {
      res = await atualizarRegistroComissao(_comissaoAtual.id, registroId, dados);
    } else {
      res = await adicionarRegistroComissao(_comissaoAtual.id, dados);
    }

    if (res.sucesso) {
      window.fecharModal?.();
      window.mostrarToast?.(registroId ? "Registro atualizado!" : "Registro adicionado!", "success");
      carregarRegistros(_comissaoAtual.id);
    } else {
      erroEl.textContent   = "Erro: " + res.erro;
      erroEl.style.display = "block";
      btn.disabled         = false;
      btn.textContent      = registroId ? "Salvar" : "Adicionar";
    }
  });
}

// ================================================================
// EXCLUIR REGISTRO
// ================================================================
function confirmarExcluirRegistro(registroId, vendedor) {
  window.abrirModal?.(
    "Excluir Registro",
    `<p>Tem certeza que deseja excluir o registro de <strong>${escHtml(vendedor)}</strong>? Esta ação não pode ser desfeita.</p>`,
    `<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button>
     <button class="btn-danger-solid" id="btnConfExcluirReg">Excluir</button>`
  );

  document.getElementById("btnConfExcluirReg")?.addEventListener("click", async () => {
    const res = await excluirRegistroComissao(_comissaoAtual.id, registroId);
    if (res.sucesso) {
      window.fecharModal?.();
      window.mostrarToast?.("Registro excluído.", "success");
      carregarRegistros(_comissaoAtual.id);
    } else {
      window.mostrarToast?.("Erro ao excluir: " + res.erro, "error");
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
          <input class="field-input field-input--plain" type="password"
            id="comissaoSenha" placeholder="Mínimo 4 caracteres" />
          <button class="btn-toggle-senha" id="btnToggleComissaoSenha" type="button">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/></svg>
          </button>
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="comissaoSenhaConf">Confirmar Senha *</label>
        <div class="senha-input-wrap">
          <input class="field-input field-input--plain" type="password"
            id="comissaoSenhaConf" placeholder="Repita a senha" />
          <button class="btn-toggle-senha" id="btnToggleComissaoSenha2" type="button">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/></svg>
          </button>
        </div>
      </div>
      <div id="erroNovaComissao" class="senha-erro" style="display:none"></div>
    </div>`,
    `<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button>
     <button class="btn-primary" id="btnCriarComissao">Criar Planilha</button>`
  );

  ["", "2"].forEach(n => {
    document.getElementById(`btnToggleComissaoSenha${n}`)?.addEventListener("click", () => {
      const inp = document.getElementById(n === "2" ? "comissaoSenhaConf" : "comissaoSenha");
      if (inp) inp.type = inp.type === "password" ? "text" : "password";
    });
  });

  document.getElementById("btnCriarComissao")?.addEventListener("click", async () => {
    const titulo  = document.getElementById("comissaoTitulo")?.value.trim();
    const desc    = document.getElementById("comissaoDescricao")?.value.trim();
    const senha   = document.getElementById("comissaoSenha")?.value;
    const conf    = document.getElementById("comissaoSenhaConf")?.value;
    const erroEl  = document.getElementById("erroNovaComissao");
    const btn     = document.getElementById("btnCriarComissao");
    erroEl.style.display = "none";

    if (!titulo) {
      erroEl.textContent = "Informe o título da planilha.";
      erroEl.style.display = "block"; return;
    }
    if (!senha || senha.length < 4) {
      erroEl.textContent = "A senha deve ter pelo menos 4 caracteres.";
      erroEl.style.display = "block"; return;
    }
    if (senha !== conf) {
      erroEl.textContent = "As senhas não conferem.";
      erroEl.style.display = "block"; return;
    }

    btn.disabled    = true;
    btn.textContent = "Criando...";

    const res = await criarComissao({ titulo, descricao: desc, senha }, _usuario.uid);

    if (res.sucesso) {
      window.fecharModal?.();
      window.mostrarToast?.("Planilha criada com sucesso!", "success");
      carregarListaComissoes();
    } else {
      erroEl.textContent   = "Erro: " + res.erro;
      erroEl.style.display = "block";
      btn.disabled         = false;
      btn.textContent      = "Criar Planilha";
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
      <p>Tem certeza que deseja excluir a planilha <strong>${escHtml(titulo)}</strong>?
      <br>Todos os registros serão perdidos permanentemente.</p>
      <div class="field" style="margin-top:12px">
        <label class="field-label" for="inputSenhaExcluirPlan">Confirme com a senha da planilha</label>
        <div class="senha-input-wrap">
          <input class="field-input field-input--plain" type="password"
            id="inputSenhaExcluirPlan" placeholder="Digite a senha para confirmar" />
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

    if (!senha) {
      erroEl.textContent = "Informe a senha para confirmar.";
      erroEl.style.display = "block"; return;
    }

    btn.disabled    = true;
    btn.textContent = "Verificando...";

    const verif = await verificarSenhaComissao(id, senha);
    if (!verif.sucesso) {
      erroEl.textContent   = verif.erro || "Senha incorreta.";
      erroEl.style.display = "block";
      btn.disabled         = false;
      btn.textContent      = "Excluir Planilha";
      document.getElementById("inputSenhaExcluirPlan").value = "";
      return;
    }

    btn.textContent = "Excluindo...";
    const res = await excluirComissao(id);
    if (res.sucesso) {
      window.fecharModal?.();
      window.mostrarToast?.("Planilha excluída.", "success");
      carregarListaComissoes();
    } else {
      erroEl.textContent   = "Erro: " + res.erro;
      erroEl.style.display = "block";
      btn.disabled         = false;
      btn.textContent      = "Excluir Planilha";
    }
  });
}

// ================================================================
// UTILS
// ================================================================
function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
