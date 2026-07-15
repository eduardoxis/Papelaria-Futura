// ============================================================
// login.js — Lógica da tela de login
// ============================================================

import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence }
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { resetarSenha } from "./auth.js";

const btnLogin        = document.getElementById("btnLogin");
const inputEmail      = document.getElementById("email");
const inputSenha      = document.getElementById("senha");
const inputManterConectado = document.getElementById("manterConectado");
const alertErro       = document.getElementById("alertErro");
const alertErroTexto  = document.getElementById("alertErroTexto");
const alertSucesso    = document.getElementById("alertSucesso");
const alertSucessoTexto = document.getElementById("alertSucessoTexto");

const formLogin        = document.getElementById("formLogin");
const formRecuperacao  = document.getElementById("formRecuperacao");
const btnEsqueciSenha  = document.getElementById("btnEsqueciSenha");
const btnVoltarLogin   = document.getElementById("btnVoltarLogin");
const btnEnviarReset   = document.getElementById("btnEnviarReset");
const inputEmailRecuperar = document.getElementById("emailRecuperar");

const toggleSenha      = document.getElementById("toggleSenha");
const iconOlhoAberto   = document.getElementById("iconOlhoAberto");
const iconOlhoFechado  = document.getElementById("iconOlhoFechado");

// ── Login ────────────────────────────────────────────────────
btnLogin?.addEventListener("click", fazerLogin);

[inputEmail, inputSenha].forEach(el => {
  el?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") fazerLogin();
  });
});

async function fazerLogin() {
  const email = inputEmail.value.trim();
  const senha = inputSenha.value;

  esconderAlertas();

  if (!email || !senha) {
    mostrarErro("Preencha e-mail e senha.");
    return;
  }

  definirCarregando(true);

  try {
    const manter = inputManterConectado ? inputManterConectado.checked : true;
    await setPersistence(auth, manter ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, senha);
    window.location.href = "/index.html";
  } catch (e) {
    mostrarErro(traduzirErro(e.code));
    definirCarregando(false);
  }
}

function definirCarregando(carregando) {
  const texto    = btnLogin.querySelector(".btn-login__text");
  const spinner  = btnLogin.querySelector(".btn-login__spinner");
  btnLogin.disabled = carregando;
  if (texto)   texto.hidden   = carregando;
  if (spinner) spinner.hidden = !carregando;
}

// ── Recuperação de senha ─────────────────────────────────────
btnEsqueciSenha?.addEventListener("click", () => {
  esconderAlertas();
  formLogin.hidden       = true;
  formRecuperacao.hidden = false;
});

btnVoltarLogin?.addEventListener("click", () => {
  esconderAlertas();
  formRecuperacao.hidden = true;
  formLogin.hidden       = false;
});

btnEnviarReset?.addEventListener("click", async () => {
  const email = inputEmailRecuperar.value.trim();
  esconderAlertas();

  if (!email) {
    mostrarErro("Informe um e-mail.");
    return;
  }

  const texto   = btnEnviarReset.querySelector(".btn-login__text");
  const spinner = btnEnviarReset.querySelector(".btn-login__spinner");
  btnEnviarReset.disabled = true;
  if (texto)   texto.hidden   = true;
  if (spinner) spinner.hidden = false;

  const resultado = await resetarSenha(email);

  btnEnviarReset.disabled = false;
  if (texto)   texto.hidden   = false;
  if (spinner) spinner.hidden = true;

  if (resultado.sucesso) {
    mostrarSucesso("Link de recuperação enviado para o seu e-mail.");
  } else {
    mostrarErro(resultado.erro);
  }
});

// ── Mostrar/ocultar senha ────────────────────────────────────
toggleSenha?.addEventListener("click", () => {
  const mostrando = inputSenha.type === "text";
  inputSenha.type = mostrando ? "password" : "text";
  iconOlhoAberto.style.display  = mostrando ? ""     : "none";
  iconOlhoFechado.style.display = mostrando ? "none" : "";
  toggleSenha.setAttribute("aria-label", mostrando ? "Mostrar senha" : "Ocultar senha");
});

// ── Helpers de alerta ─────────────────────────────────────────
function mostrarErro(msg) {
  alertErroTexto.textContent = msg;
  alertErro.hidden = false;
}

function mostrarSucesso(msg) {
  alertSucessoTexto.textContent = msg;
  alertSucesso.hidden = false;
}

function esconderAlertas() {
  alertErro.hidden    = true;
  alertSucesso.hidden = true;
}

// ── Traduções de erro (cobre os casos do signInWithEmailAndPassword) ──
function traduzirErro(codigo) {
  return ({
    "auth/invalid-email":          "E-mail inválido.",
    "auth/user-disabled":          "Usuário desativado.",
    "auth/user-not-found":         "Usuário não encontrado.",
    "auth/wrong-password":         "Senha incorreta.",
    "auth/invalid-credential":     "E-mail ou senha incorretos.",
    "auth/too-many-requests":      "Muitas tentativas. Tente mais tarde.",
    "auth/network-request-failed": "Erro de rede.",
  })[codigo] ?? "Erro ao fazer login. Tente novamente.";
}
