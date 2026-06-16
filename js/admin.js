// ============================================================
// admin.js — Painel Administrativo (somente admin)
// ============================================================

import {
  listarUsuarios, salvarUsuario, excluirUsuarioFirestore,
  salvarSenhaCotacao, senhaCotacaoExiste
} from "./database.js";
import {
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { escHtml } from "./dashboard.js";
import { formatarData } from "./database.js";

let _dadosUsuario = null;

export function iniciarAdmin(usuario, dadosUsuario) {
  _dadosUsuario = dadosUsuario;

  // Só carrega se for admin
  document.addEventListener("navegacao", (e) => {
    if (e.detail.page === "admin") {
      if (_dadosUsuario?.role !== "admin") {
        window.navegar?.("dashboard");
        window.mostrarToast?.("Acesso restrito a administradores.", "error");
        return;
      }
      carregarUsuarios();
      carregarCardSenhaCotacao();
    }
  });

  // Botão novo usuário
  document.getElementById("btnNovoUsuario")?.addEventListener("click", abrirModalNovoUsuario);
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
      <td>${roleBadge(u.role)}</td>
      <td>${formatarData(u.ultimoAcesso)}</td>
      <td class="col-center">
        <div style="display:flex;gap:5px;justify-content:center">
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
        <input class="field-input--plain" type="text" id="novoNome" placeholder="Nome do usuário" />
      </div>
      <div class="field">
        <label class="field-label" for="novoEmail">E-mail *</label>
        <input class="field-input--plain" type="email" id="novoEmail" placeholder="email@exemplo.com" />
      </div>
      <div class="field">
        <label class="field-label" for="novaSenha">Senha provisória *</label>
        <input class="field-input--plain" type="password" id="novaSenha" placeholder="Mínimo 6 caracteres" />
      </div>
      <div class="field">
        <label class="field-label" for="novoRole">Perfil de acesso *</label>
        <select class="field-input--plain" id="novoRole">
          <option value="user">Usuário</option>
          <option value="admin">Administrador</option>
        </select>
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
  const role  = document.getElementById("novoRole")?.value;
  const erroEl = document.getElementById("erroNovoUsuario");

  erroEl.style.display = "none";

  if (!nome || !email || !senha) {
    erroEl.textContent = "Preencha todos os campos obrigatórios.";
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
    await salvarUsuario(uid, { nome, email, role, uid });

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
  window.abrirModal?.(
    "Editar Usuário",
    `<div class="form-usuario">
      <div class="field">
        <label class="field-label" for="editNome">Nome completo</label>
        <input class="field-input--plain" type="text" id="editNome" value="${escHtml(usuario.nome || "")}" />
      </div>
      <div class="field">
        <label class="field-label">E-mail</label>
        <input class="field-input--plain" type="email" value="${escHtml(usuario.email || "")}" disabled
          style="opacity:0.6;cursor:not-allowed" />
      </div>
      <div class="field">
        <label class="field-label" for="editRole">Perfil de acesso</label>
        <select class="field-input--plain" id="editRole">
          <option value="user"  ${usuario.role === "user"  ? "selected" : ""}>Usuário</option>
          <option value="admin" ${usuario.role === "admin" ? "selected" : ""}>Administrador</option>
        </select>
      </div>
      <div id="erroEditarUsuario" style="color:#991B1B;font-size:13px;background:#FEF2F2;
        padding:10px;border-radius:8px;display:none;border:1px solid #FECACA"></div>
    </div>`,
    `<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button>
     <button class="btn-primary" id="btnConfirmarEdicao">Salvar Alterações</button>`
  );

  document.getElementById("btnConfirmarEdicao")?.addEventListener("click", async () => {
    const nome  = document.getElementById("editNome")?.value.trim();
    const role  = document.getElementById("editRole")?.value;
    const erroEl = document.getElementById("erroEditarUsuario");

    if (!nome) {
      erroEl.textContent = "Informe o nome do usuário.";
      erroEl.style.display = "block";
      return;
    }

    const btn = document.getElementById("btnConfirmarEdicao");
    btn.disabled = true;
    btn.textContent = "Salvando...";

    const resultado = await salvarUsuario(usuario.id, { nome, role });

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
function roleBadge(role) {
  if (role === "admin") return `<span class="role-badge role-badge--admin">Administrador</span>`;
  return `<span class="role-badge role-badge--user">Usuário</span>`;
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
          <input class="field-input--plain" type="password" id="adminNovaSenhaCot" placeholder="Mínimo 6 caracteres" />
          <button class="btn-toggle-senha" id="btnToggleAdminSenha1" type="button" aria-label="Mostrar">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/></svg>
          </button>
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="adminConfSenhaCot">Confirmar Senha *</label>
        <div class="senha-input-wrap">
          <input class="field-input--plain" type="password" id="adminConfSenhaCot" placeholder="Repita a senha" />
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
