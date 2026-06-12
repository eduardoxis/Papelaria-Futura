// ============================================================
// index.js — Login
// ============================================================

import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { auth } from "./firebase-config.js";

// ----------------------------------------------------------------
// Redirect se já estiver logado
//
// Usa auth.authStateReady() em vez de onAuthStateChanged para evitar
// reagir ao estado transitório "null" inicial do Firebase.
// Só redireciona após a resolução real do estado de autenticação.
// ----------------------------------------------------------------
auth.authStateReady().then(() => {
  if (auth.currentUser) {
    window.location.replace("/dashboard.html");
  }
});

// Elementos
const elEmail        = document.getElementById("email");
const elSenha        = document.getElementById("senha");
const elBtnLogin     = document.getElementById("btnLogin");
const elBtnEsqueci   = document.getElementById("btnEsqueciSenha");
const elBtnVoltar    = document.getElementById("btnVoltarLogin");
const elBtnReset     = document.getElementById("btnEnviarReset");
const elEmailRec     = document.getElementById("emailRecuperar");
const elFormLogin    = document.getElementById("formLogin");
const elFormRec      = document.getElementById("formRecuperacao");
const elAlertErro    = document.getElementById("alertErro");
const elAlertErroTxt = document.getElementById("alertErroTexto");
const elAlertOk      = document.getElementById("alertSucesso");
const elAlertOkTxt   = document.getElementById("alertSucessoTexto");
const elToggle       = document.getElementById("toggleSenha");
const elIconAberto   = document.getElementById("iconOlhoAberto");
const elIconFechado  = document.getElementById("iconOlhoFechado");

function mostrarErro(msg) {
  elAlertOk.hidden = true;
  elAlertErroTxt.textContent = msg;
  elAlertErro.hidden = false;
}
function mostrarSucesso(msg) {
  elAlertErro.hidden = true;
  elAlertOkTxt.textContent = msg;
  elAlertOk.hidden = false;
}
function esconderAlertas() {
  elAlertErro.hidden = true;
  elAlertOk.hidden   = true;
}
function setCarregando(btn, estado) {
  btn.querySelector(".btn-login__text").hidden    = estado;
  btn.querySelector(".btn-login__spinner").hidden = !estado;
  btn.disabled = estado;
}

function traduzirErro(codigo) {
  const erros = {
    "auth/invalid-email":          "E-mail inválido.",
    "auth/user-not-found":         "Usuário não encontrado.",
    "auth/wrong-password":         "Senha incorreta.",
    "auth/invalid-credential":     "E-mail ou senha incorretos.",
    "auth/too-many-requests":      "Muitas tentativas. Aguarde um momento.",
    "auth/user-disabled":          "Usuário desativado.",
    "auth/network-request-failed": "Erro de rede. Verifique sua conexão."
  };
  return erros[codigo] || "Erro inesperado. Tente novamente.";
}

async function fazerLogin() {
  esconderAlertas();
  const email = elEmail.value.trim();
  const senha = elSenha.value;
  if (!email || !senha) { mostrarErro("Preencha e-mail e senha."); return; }

  setCarregando(elBtnLogin, true);
  try {
    await signInWithEmailAndPassword(auth, email, senha);
    window.location.replace("/dashboard.html");
  } catch (err) {
    setCarregando(elBtnLogin, false);
    mostrarErro(traduzirErro(err.code));
    elSenha.value = "";
  }
}

elBtnLogin.addEventListener("click", fazerLogin);
elEmail.addEventListener("keydown",  e => { if (e.key === "Enter") elSenha.focus(); });
elSenha.addEventListener("keydown",  e => { if (e.key === "Enter") fazerLogin(); });

elToggle.addEventListener("click", () => {
  const vis = elSenha.type === "text";
  elSenha.type = vis ? "password" : "text";
  elIconAberto.style.display  = vis ? ""     : "none";
  elIconFechado.style.display = vis ? "none" : "";
});

elBtnEsqueci.addEventListener("click", () => {
  esconderAlertas();
  elFormLogin.hidden = true;
  elFormRec.hidden   = false;
  elEmailRec.value   = elEmail.value;
  elEmailRec.focus();
});

elBtnVoltar.addEventListener("click", () => {
  esconderAlertas();
  elFormRec.hidden   = true;
  elFormLogin.hidden = false;
  elEmail.focus();
});

async function enviarReset() {
  esconderAlertas();
  const email = elEmailRec.value.trim();
  if (!email) { mostrarErro("Informe o e-mail."); return; }
  setCarregando(elBtnReset, true);
  try {
    await sendPasswordResetEmail(auth, email);
    mostrarSucesso("Link enviado! Verifique sua caixa de entrada.");
    elEmailRec.value = "";
  } catch (err) {
    mostrarErro(traduzirErro(err.code));
  }
  setCarregando(elBtnReset, false);
}

elBtnReset.addEventListener("click", enviarReset);
elEmailRec.addEventListener("keydown", e => { if (e.key === "Enter") enviarReset(); });
