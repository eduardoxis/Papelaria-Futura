// ============================================================
// admin.js — Painel Administrativo (somente admin)
// ============================================================

import {
  listarUsuarios, salvarUsuario, excluirUsuarioFirestore
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
