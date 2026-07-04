// ============================================================
// admin.js — Painel Administrativo (somente admin)
// ============================================================

import {
  listarUsuarios, salvarUsuario, excluirUsuarioFirestore,
  salvarSenhaCotacao, senhaCotacaoExiste, listarCotacoes, listarVendas
} from "./database.js";
import {
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { escHtml } from "./index.js";
import { formatarData, formatarDataHora, formatarMoeda } from "./database.js";
import { cargosDoUsuario, temCargo } from "./auth.js";

let _dadosUsuario = null;

// Paginação do Histórico de Alterações
const HISTORICO_POR_PAGINA = 50;
let _histFiltroAtual    = "";
let _histPaginaCursor   = null;
let _histTemMais        = false;
let _histCarregandoMais = false;

export function iniciarAdmin(usuario, dadosUsuario) {
  _dadosUsuario = dadosUsuario;

  // Só carrega se for admin
  document.addEventListener("navegacao", (e) => {
    if (e.detail.page === "admin") {
      if (!temCargo(_dadosUsuario, "admin")) {
        window.navegar?.("dashboard");
        window.mostrarToast?.("Acesso restrito a administradores.", "error");
        return;
      }
      carregarUsuarios();
      carregarCardSenhaCotacao();
      carregarHistoricoCotacoes();
      carregarVendas();
    }
  });

  // Botão novo usuário
  document.getElementById("btnNovoUsuario")?.addEventListener("click", abrirModalNovoUsuario);

  // Histórico de alterações
  document.getElementById("btnBuscarHistorico")?.addEventListener("click", () => {
    const termo = document.getElementById("filtroBuscaHistorico").value.trim();
    carregarHistoricoCotacoes(termo);
  });
  document.getElementById("btnLimparBuscaHistorico")?.addEventListener("click", () => {
    document.getElementById("filtroBuscaHistorico").value = "";
    carregarHistoricoCotacoes();
  });
  document.getElementById("filtroBuscaHistorico")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") carregarHistoricoCotacoes(e.target.value.trim());
  });
  document.getElementById("btnCarregarMaisHistorico")?.addEventListener("click", carregarMaisHistorico);

  // Event delegation da tabela de histórico
  document.getElementById("tbodyHistoricoCotacoes")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='ver-historico']");
    if (!btn) return;
    const { cliente, historico } = btn.dataset;
    abrirModalHistorico(cliente, JSON.parse(historico));
  });

  // Vendas Realizadas
  document.getElementById("btnBuscarVendas")?.addEventListener("click", () => {
    const termo = document.getElementById("filtroBuscaVendas").value.trim();
    carregarVendas(termo);
  });
  document.getElementById("btnLimparBuscaVendas")?.addEventListener("click", () => {
    document.getElementById("filtroBuscaVendas").value = "";
    carregarVendas();
  });
  document.getElementById("filtroBuscaVendas")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") carregarVendas(e.target.value.trim());
  });
}

// ================================================================
// LISTAR USUÁRIOS
// ================================================================
async function carregarUsuarios() {
  const tbody = document.getElementById("tbodyUsuarios");
  tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Carregando usuários...</td></tr>`;

  const resultado = await listarUsuarios();

  if (!resultado.sucesso) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Erro ao carregar usuários.</td></tr>`;
    return;
  }

  const { usuarios } = resultado;

  if (usuarios.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">Nenhum usuário cadastrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = usuarios.map(u => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:34px;height:34px;border-radius:50%;background:var(--blue-100);
            color:var(--blue-700);display:flex;align-items:center;justify-content:center;
            font-weight:700;font-size:13px;flex-shrink:0">
            ${escHtml((u.nome || u.email || "?").charAt(0).toUpperCase())}
          </div>
          <strong>${escHtml(u.nome || "Sem nome")}</strong>
        </div>
      </td>
      <td>${escHtml(u.email || "—")}</td>
      <td>${roleBadge(u)}</td>
      <td>${formatarData(u.ultimoAcesso)}</td>
      <td class="col-right">
        <div style="display:flex;gap:5px;justify-content:flex-end">
          <button class="btn-action btn-action--edit" onclick="window.editarUsuarioById('${u.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
            Editar
          </button>
          <button class="btn-action btn-action--delete" onclick="window.excluirUsuarioById('${u.id}', '${escHtml(u.nome || u.email || "")}')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
            Excluir
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  // Expor globalmente
  window.editarUsuarioById = (id) => {
    const u = resultado.usuarios.find(u => u.id === id);
    if (u) abrirModalEditarUsuario(u);
  };

  window.excluirUsuarioById = (id, nome) => confirmarExclusaoUsuario(id, nome);
}

// ================================================================
// CRIAR USUÁRIO
// ================================================================
function abrirModalNovoUsuario() {
  window.abrirModal?.(
    "Novo Usuário",
    `<div class="form-usuario">
      <div class="field">
        <label class="field-label" for="novoNome">Nome completo *</label>
        <input class="field-input--plain" type="text" id="novoNome" placeholder="Nome do usuário" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="novoEmail">E-mail *</label>
        <input class="field-input--plain" type="email" id="novoEmail" placeholder="email@exemplo.com" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="novaSenha">Senha provisória *</label>
        <input class="field-input--plain" type="password" id="novaSenha" placeholder="Mínimo 6 caracteres" autocomplete="new-password" />
      </div>
      <div class="field">
        <label class="field-label">Cargos * <span style="font-weight:400;color:var(--gray-500)">(pode marcar mais de um)</span></label>
        <div class="form-usuario-cargos">
          <label class="checkbox-cargo">
            <input type="checkbox" name="novoCargo" value="user" checked /> Usuário
          </label>
          <label class="checkbox-cargo">
            <input type="checkbox" name="novoCargo" value="vendedor" /> Vendedor
          </label>
          <label class="checkbox-cargo">
            <input type="checkbox" name="novoCargo" value="admin" /> Administrador
          </label>
        </div>
      </div>
      <div id="erroNovoUsuario" style="color:#991B1B;font-size:13px;background:#FEF2F2;
        padding:10px;border-radius:8px;display:none;border:1px solid #FECACA"></div>
    </div>`,
    `<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button>
     <button class="btn-primary" id="btnConfirmarNovoUsuario">Criar Usuário</button>`
  );

  document.getElementById("btnConfirmarNovoUsuario")?.addEventListener("click", criarNovoUsuario);
}

async function criarNovoUsuario() {
  const nome  = document.getElementById("novoNome")?.value.trim();
  const email = document.getElementById("novoEmail")?.value.trim();
  const senha = document.getElementById("novaSenha")?.value;
  const roles = Array.from(document.querySelectorAll('input[name="novoCargo"]:checked')).map(el => el.value);
  const erroEl = document.getElementById("erroNovoUsuario");

  erroEl.style.display = "none";

  if (!nome || !email || !senha) {
    erroEl.textContent = "Preencha todos os campos obrigatórios.";
    erroEl.style.display = "block";
    return;
  }

  if (roles.length === 0) {
    erroEl.textContent = "Selecione ao menos um cargo.";
    erroEl.style.display = "block";
    return;
  }

  const btn = document.getElementById("btnConfirmarNovoUsuario");
  btn.disabled = true;
  btn.textContent = "Criando...";

  try {
    // Criar no Firebase Auth
    const credencial = await createUserWithEmailAndPassword(auth, email, senha);
    const uid = credencial.user.uid;

    // Salvar no Firestore
    await salvarUsuario(uid, { nome, email, roles, role: roles[0], uid });

    window.fecharModal?.();
    window.mostrarToast?.(`Usuário "${nome}" criado com sucesso!`, "success");
    carregarUsuarios();
  } catch (err) {
    erroEl.textContent = traduzirErro(err.code);
    erroEl.style.display = "block";
    btn.disabled = false;
    btn.textContent = "Criar Usuário";
  }
}

// ================================================================
// EDITAR USUÁRIO
// ================================================================
function abrirModalEditarUsuario(usuario) {
  const cargosAtuais = cargosDoUsuario(usuario);
  window.abrirModal?.(
    "Editar Usuário",
    `<div class="form-usuario">
      <div class="field">
        <label class="field-label" for="editNome">Nome completo</label>
        <input class="field-input--plain" type="text" id="editNome" value="${escHtml(usuario.nome || "")}" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label">E-mail</label>
        <input class="field-input--plain" type="email" value="${escHtml(usuario.email || "")}" disabled
          style="opacity:0.6;cursor:not-allowed" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label">Cargos <span style="font-weight:400;color:var(--gray-500)">(pode marcar mais de um)</span></label>
        <div class="form-usuario-cargos">
          <label class="checkbox-cargo">
            <input type="checkbox" name="editCargo" value="user" ${cargosAtuais.includes("user") ? "checked" : ""} /> Usuário
          </label>
          <label class="checkbox-cargo">
            <input type="checkbox" name="editCargo" value="vendedor" ${cargosAtuais.includes("vendedor") ? "checked" : ""} /> Vendedor
          </label>
          <label class="checkbox-cargo">
            <input type="checkbox" name="editCargo" value="admin" ${cargosAtuais.includes("admin") ? "checked" : ""} /> Administrador
          </label>
        </div>
      </div>
      <div id="erroEditarUsuario" style="color:#991B1B;font-size:13px;background:#FEF2F2;
        padding:10px;border-radius:8px;display:none;border:1px solid #FECACA"></div>
    </div>`,
    `<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button>
     <button class="btn-primary" id="btnConfirmarEdicao">Salvar Alterações</button>`
  );

  document.getElementById("btnConfirmarEdicao")?.addEventListener("click", async () => {
    const nome  = document.getElementById("editNome")?.value.trim();
    const roles = Array.from(document.querySelectorAll('input[name="editCargo"]:checked')).map(el => el.value);
    const erroEl = document.getElementById("erroEditarUsuario");

    if (!nome) {
      erroEl.textContent = "Informe o nome do usuário.";
      erroEl.style.display = "block";
      return;
    }

    if (roles.length === 0) {
      erroEl.textContent = "Selecione ao menos um cargo.";
      erroEl.style.display = "block";
      return;
    }

    const btn = document.getElementById("btnConfirmarEdicao");
    btn.disabled = true;
    btn.textContent = "Salvando...";

    const resultado = await salvarUsuario(usuario.id, { nome, roles, role: roles[0] });

    if (resultado.sucesso) {
      window.fecharModal?.();
      window.mostrarToast?.("Usuário atualizado com sucesso!", "success");
      carregarUsuarios();
    } else {
      erroEl.textContent = "Erro ao salvar: " + resultado.erro;
      erroEl.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Salvar Alterações";
    }
  });
}

// ================================================================
// EXCLUIR USUÁRIO
// ================================================================
function confirmarExclusaoUsuario(id, nome) {
  window.abrirModal?.(
    "Excluir Usuário",
    `<div class="delete-warning">
      <strong>⚠ Atenção!</strong>
      Você está prestes a remover o usuário <strong>${escHtml(nome)}</strong> do Firestore.<br><br>
      <em>Nota: Para revogar acesso completamente, remova também o usuário no Firebase Authentication Console.</em>
    </div>`,
    `<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button>
     <button class="btn-danger" id="confirmarExcluirUser">Excluir Usuário</button>`
  );

  document.getElementById("confirmarExcluirUser")?.addEventListener("click", async () => {
    const resultado = await excluirUsuarioFirestore(id);
    window.fecharModal?.();

    if (resultado.sucesso) {
      window.mostrarToast?.("Usuário removido do sistema.", "success");
      carregarUsuarios();
    } else {
      window.mostrarToast?.("Erro ao excluir: " + resultado.erro, "error");
    }
  });
}

// ================================================================
// UTILITÁRIOS
// ================================================================
function roleBadge(usuario) {
  const cargos = cargosDoUsuario(usuario);
  const rotulos = { admin: "Administrador", vendedor: "Vendedor", user: "Usuário" };
  const classes = { admin: "role-badge--admin", vendedor: "role-badge--vendedor", user: "role-badge--user" };
  return cargos.map(c =>
    `<span class="role-badge ${classes[c] || "role-badge--user"}">${rotulos[c] || c}</span>`
  ).join(" ");
}

function traduzirErro(codigo) {
  const erros = {
    "auth/email-already-in-use": "E-mail já cadastrado.",
    "auth/invalid-email":        "E-mail inválido.",
    "auth/weak-password":        "Senha fraca. Use ao menos 6 caracteres.",
    "auth/operation-not-allowed":"Operação não permitida."
  };
  return erros[codigo] || "Erro inesperado. Tente novamente.";
}

// ================================================================
// SENHA COTAÇÃO
// ================================================================
async function carregarCardSenhaCotacao() {
  const container = document.getElementById("cardSenhaCotacao");
  if (!container) return;

  const configurada = await senhaCotacaoExiste();

  container.innerHTML = `
    <div class="senha-cotacao-status">
      <div class="senha-cotacao-status-info">
        <span class="senha-cotacao-icone">${configurada ? "🔒" : "⚠️"}</span>
        <div>
          <strong>${configurada ? "Senha configurada" : "Nenhuma senha definida"}</strong>
          <p>${configurada
            ? "Editar e Excluir cotações exigem autenticação."
            : "Qualquer usuário pode editar ou excluir cotações sem restrição."
          }</p>
        </div>
      </div>
      <button class="btn-primary btn-sm" id="btnAlterarSenhaCotacao">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/></svg>
        ${configurada ? "Alterar Senha" : "Definir Senha"}
      </button>
    </div>
  `;

  document.getElementById("btnAlterarSenhaCotacao")?.addEventListener("click", abrirModalSenhaCotacao);
}

function abrirModalSenhaCotacao() {
  window.abrirModal?.(
    "🔒 Senha Cotação",
    `<div class="form-usuario">
      <p style="font-size:var(--text-sm);color:var(--gray-600);margin:0 0 4px">
        Defina a senha que será exigida para <strong>Editar</strong> ou <strong>Excluir</strong> qualquer cotação.
      </p>
      <div class="field">
        <label class="field-label" for="adminNovaSenhaCot">Nova Senha *</label>
        <div class="senha-input-wrap">
          <input class="field-input--plain" type="password" id="adminNovaSenhaCot" placeholder="Mínimo 6 caracteres" autocomplete="new-password" />
          <button class="btn-toggle-senha" id="btnToggleAdminSenha1" type="button" aria-label="Mostrar">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/></svg>
          </button>
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="adminConfSenhaCot">Confirmar Senha *</label>
        <div class="senha-input-wrap">
          <input class="field-input--plain" type="password" id="adminConfSenhaCot" placeholder="Repita a senha" autocomplete="new-password" />
          <button class="btn-toggle-senha" id="btnToggleAdminSenha2" type="button" aria-label="Mostrar">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/></svg>
          </button>
        </div>
      </div>
      <div id="erroSenhaCotAdmin" style="color:#991B1B;font-size:13px;background:#FEF2F2;
        padding:10px;border-radius:8px;display:none;border:1px solid #FECACA"></div>
    </div>`,
    `<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button>
     <button class="btn-primary" id="btnSalvarSenhaCot">Salvar Senha</button>`
  );

  // Toggles visibilidade
  ["1","2"].forEach(n => {
    document.getElementById(`btnToggleAdminSenha${n}`)?.addEventListener("click", () => {
      const inp = document.getElementById(n === "1" ? "adminNovaSenhaCot" : "adminConfSenhaCot");
      inp.type = inp.type === "password" ? "text" : "password";
    });
  });

  document.getElementById("btnSalvarSenhaCot")?.addEventListener("click", async () => {
    const nova  = document.getElementById("adminNovaSenhaCot")?.value;
    const conf  = document.getElementById("adminConfSenhaCot")?.value;
    const erroEl = document.getElementById("erroSenhaCotAdmin");
    erroEl.style.display = "none";

    if (!nova || !conf) {
      erroEl.textContent = "Preencha os dois campos.";
      erroEl.style.display = "block";
      return;
    }
    if (nova.length < 6) {
      erroEl.textContent = "A senha deve ter pelo menos 6 caracteres.";
      erroEl.style.display = "block";
      return;
    }
    if (nova !== conf) {
      erroEl.textContent = "As senhas não conferem.";
      erroEl.style.display = "block";
      return;
    }

    const btn = document.getElementById("btnSalvarSenhaCot");
    btn.disabled = true;
    btn.textContent = "Salvando...";

    const resultado = await salvarSenhaCotacao(nova);

    if (resultado.sucesso) {
      window.fecharModal?.();
      window.mostrarToast?.("Senha Cotação salva com sucesso!", "success");
      carregarCardSenhaCotacao();
    } else {
      erroEl.textContent = "Erro ao salvar: " + resultado.erro;
      erroEl.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Salvar Senha";
    }
  });
}

// ================================================================
// HISTÓRICO DE ALTERAÇÕES DAS COTAÇÕES
// ================================================================
// ================================================================
// VENDAS REALIZADAS (log por vendedor)
// ================================================================
let _todasVendasCache = [];

async function carregarVendas(termoBusca = "") {
  const tbody = document.getElementById("tbodyVendas");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Carregando...</td></tr>`;

  // Busca tudo uma vez e cacheia; filtro por vendedor é feito no cliente
  if (_todasVendasCache.length === 0 || termoBusca === "") {
    const resultado = await listarVendas({ limitQtd: 200 });
    if (!resultado.sucesso) {
      tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Erro ao carregar vendas.</td></tr>`;
      return;
    }
    _todasVendasCache = resultado.vendas;
  }

  const termo = termoBusca.trim().toLowerCase();
  const vendas = termo
    ? _todasVendasCache.filter(v => (v.vendedorNome || "").toLowerCase().includes(termo))
    : _todasVendasCache;

  if (vendas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">Nenhuma venda encontrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = vendas.map(linhaVendaHtml).join("");
}

function linhaVendaHtml(v) {
  const qtdItens = (v.itens || []).length;
  return `
    <tr>
      <td>${formatarDataHora(v.criadoEm)}</td>
      <td><strong>${escHtml(v.vendedorNome || "—")}</strong></td>
      <td>#${escHtml(String(v.numero ?? "—"))}</td>
      <td>${qtdItens} ${qtdItens === 1 ? "item" : "itens"}</td>
      <td>${escHtml(v.formaPagamento || "—")}</td>
      <td class="col-right"><strong>${formatarMoeda(v.total || 0)}</strong></td>
      <td class="col-center">
        ${v.comissaoId
          ? `<span class="role-badge role-badge--vendedor">Sim</span>`
          : `<span class="role-badge role-badge--user">Não</span>`}
      </td>
    </tr>`;
}

async function carregarHistoricoCotacoes(termoBusca = "") {
  const tbody = document.getElementById("tbodyHistoricoCotacoes");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" class="loading-cell">Carregando...</td></tr>`;

  _histFiltroAtual  = termoBusca;
  _histPaginaCursor = null;
  _histTemMais      = false;

  const resultado = await listarCotacoes({ cliente: termoBusca || null, limitQtd: HISTORICO_POR_PAGINA });

  if (!resultado.sucesso) {
    tbody.innerHTML = `<tr><td colspan="4" class="loading-cell">Erro ao carregar histórico.</td></tr>`;
    atualizarBotaoCarregarMaisHistorico();
    return;
  }

  const { cotacoes, proximoCursor, temMais } = resultado;
  _histPaginaCursor = proximoCursor;
  _histTemMais      = !!temMais;

  if (cotacoes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-cell">Nenhuma cotação encontrada.</td></tr>`;
    atualizarBotaoCarregarMaisHistorico();
    return;
  }

  tbody.innerHTML = cotacoes.map(linhaHistoricoHtml).join("");
  atualizarBotaoCarregarMaisHistorico();
}

// ----------------------------------------------------------------
// Carregar mais — próxima página do histórico (mesmo filtro atual)
// ----------------------------------------------------------------
async function carregarMaisHistorico() {
  if (_histCarregandoMais || !_histTemMais) return;
  _histCarregandoMais = true;

  const btn = document.getElementById("btnCarregarMaisHistorico");
  if (btn) { btn.disabled = true; btn.textContent = "Carregando..."; }

  const resultado = await listarCotacoes({
    cliente: _histFiltroAtual || null,
    limitQtd: HISTORICO_POR_PAGINA,
    cursor: _histPaginaCursor
  });

  _histCarregandoMais = false;

  if (!resultado.sucesso) {
    window.mostrarToast?.("Erro ao carregar mais histórico.", "error");
    if (btn) { btn.disabled = false; btn.textContent = "Carregar mais"; }
    return;
  }

  const { cotacoes, proximoCursor, temMais } = resultado;
  _histPaginaCursor = proximoCursor;
  _histTemMais      = !!temMais;

  document.getElementById("tbodyHistoricoCotacoes").insertAdjacentHTML(
    "beforeend",
    cotacoes.map(linhaHistoricoHtml).join("")
  );

  atualizarBotaoCarregarMaisHistorico();
}

function atualizarBotaoCarregarMaisHistorico() {
  const wrap = document.getElementById("wrapCarregarMaisHistorico");
  const btn  = document.getElementById("btnCarregarMaisHistorico");
  if (!wrap || !btn) return;
  wrap.style.display = _histTemMais ? "flex" : "none";
  btn.disabled = false;
  btn.textContent = "Carregar mais";
}

function linhaHistoricoHtml(c) {
  const historico = Array.isArray(c.historico) ? c.historico : [];
  const ultima    = historico[historico.length - 1] || null;
  return `
    <tr>
      <td><strong>${escHtml(c.cliente || "—")}</strong></td>
      <td>${formatarData(c.dataCriacao)}</td>
      <td>${ultima ? `${escHtml(ultima.usuario || "—")} — ${formatarDataHora(ultima.data)}` : "—"}</td>
      <td class="col-right">
        <button class="btn-action btn-action--view" data-action="ver-historico"
          data-cliente="${escHtml(c.cliente || "—")}"
          data-historico='${escHtml(JSON.stringify(historico))}'>
          <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
          Ver histórico
        </button>
      </td>
    </tr>
  `;
}

function abrirModalHistorico(cliente, historico) {
  const itens = [...historico].reverse(); // mais recente primeiro

  const listaHtml = itens.length === 0
    ? `<p class="page-subtitle" style="margin:0">Nenhum registro de alteração para esta cotação.</p>`
    : `<ul class="historico-lista">
        ${itens.map(h => `
          <li class="historico-item">
            <span class="historico-item-acao">${escHtml(h.acao === "criação" ? "Criou" : "Editou")}</span>
            <strong>${escHtml(h.usuario || "—")}</strong>
            <span class="historico-item-data">${formatarDataHora(h.data)}</span>
          </li>
        `).join("")}
      </ul>`;

  window.abrirModal?.(
    `Histórico — ${escHtml(cliente)}`,
    listaHtml,
    `<button class="btn-ghost" onclick="window.fecharModal()">Fechar</button>`
  );
}
