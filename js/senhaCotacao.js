// ============================================================
// senhaCotacao.js — Proteção por senha para Editar / Excluir
// ============================================================

import { verificarSenhaCotacao } from "./database.js";

// Cache da sessão: senha validada dura 30 min
let _senhaValidadaAte = null;

function _sessaoValida() {
  return _senhaValidadaAte && Date.now() < _senhaValidadaAte;
}

function _marcarSessao() {
  _senhaValidadaAte = Date.now() + 30 * 60 * 1000; // 30 minutos
}

/**
 * Solicita a senha ao usuário via modal e executa a ação
 * se validada. Se a sessão já estiver ativa, executa direto.
 *
 * @param {Function} acaoAutorizada - função a executar após validação
 * @param {string}   tituloAcao     - texto descritivo para o modal (ex: "Editar Cotação")
 */
export function exigirSenhaCotacao(acaoAutorizada, tituloAcao = "Ação Protegida") {
  if (_sessaoValida()) {
    acaoAutorizada();
    return;
  }

  window.abrirModal?.(
    `🔒 Senha necessária`,
    `<div class="senha-cotacao-modal">
      <p class="senha-cotacao-desc">
        Para <strong>${escHtmlLocal(tituloAcao)}</strong>, informe a senha de acesso às cotações.
      </p>
      <div class="field">
        <label class="field-label" for="inputSenhaCotacao">Senha</label>
        <div class="senha-input-wrap">
          <input
            class="field-input field-input--plain"
            type="password"
            id="inputSenhaCotacao"
            placeholder="Digite a senha"
            autocomplete="current-password"
          />
          <button class="btn-toggle-senha" id="btnToggleSenha" type="button" aria-label="Mostrar senha">
            <svg id="iconSenhaVis" viewBox="0 0 20 20" fill="currentColor" style="display:none">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
              <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/>
            </svg>
            <svg id="iconSenhaHid" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"/>
              <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z"/>
            </svg>
          </button>
        </div>
      </div>
      <div id="errSenhaCotacao" class="senha-erro" style="display:none"></div>
    </div>`,
    `<button class="btn-ghost" id="btnCancelarSenha">Cancelar</button>
     <button class="btn-primary" id="btnConfirmarSenha">Confirmar</button>`
  );

  // Focar no input
  setTimeout(() => document.getElementById("inputSenhaCotacao")?.focus(), 100);

  // Toggle mostrar/ocultar senha
  document.getElementById("btnToggleSenha")?.addEventListener("click", () => {
    const input = document.getElementById("inputSenhaCotacao");
    const isPass = input.type === "password";
    input.type = isPass ? "text" : "password";
    document.getElementById("iconSenhaVis").style.display = isPass ? "" : "none";
    document.getElementById("iconSenhaHid").style.display = isPass ? "none" : "";
  });

  // Enter confirma
  document.getElementById("inputSenhaCotacao")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btnConfirmarSenha")?.click();
  });

  document.getElementById("btnCancelarSenha")?.addEventListener("click", () => {
    window.fecharModal?.();
  });

  document.getElementById("btnConfirmarSenha")?.addEventListener("click", async () => {
    const senha   = document.getElementById("inputSenhaCotacao")?.value;
    const erroEl  = document.getElementById("errSenhaCotacao");
    const btnConf = document.getElementById("btnConfirmarSenha");

    erroEl.style.display = "none";

    if (!senha) {
      erroEl.textContent = "Informe a senha.";
      erroEl.style.display = "block";
      return;
    }

    btnConf.disabled     = true;
    btnConf.textContent  = "Verificando...";

    const resultado = await verificarSenhaCotacao(senha);

    if (resultado.sucesso) {
      _marcarSessao();
      window.fecharModal?.();
      acaoAutorizada();
    } else if (resultado.semSenha) {
      // Senha ainda não configurada — permite passar (admin ainda não configurou)
      window.fecharModal?.();
      window.mostrarToast?.("Atenção: nenhuma senha foi configurada. Configure em Administração → Senha Cotação.", "warning", 6000);
      acaoAutorizada();
    } else {
      erroEl.textContent   = resultado.erro || "Senha incorreta.";
      erroEl.style.display = "block";
      btnConf.disabled     = false;
      btnConf.textContent  = "Confirmar";
      document.getElementById("inputSenhaCotacao").value = "";
      document.getElementById("inputSenhaCotacao").focus();
    }
  });
}

function escHtmlLocal(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
