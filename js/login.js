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

// ── Limite de tentativas de login (fricção no navegador) ──────
// Isto NÃO é proteção de segurança de verdade: quem chamar a API do
// Firebase Auth diretamente (fora desta página) não passa por aqui.
// A proteção real de força bruta é do próprio Firebase Auth no
// servidor (erro "auth/too-many-requests" já tratado abaixo). Este
// bloqueio serve só para evitar clique repetido/acidental ou script
// simples martelando o botão desta tela.
const CHAVE_TENTATIVAS_LOGIN = "papelariaFuturaTentativasLogin";
const MAX_TENTATIVAS_LOGIN   = 5;
const JANELA_TENTATIVAS_MS   = 60 * 1000;  // conta tentativas nos últimos 60s
const BLOQUEIO_BASE_MS       = 30 * 1000;  // 30s de bloqueio na 1ª vez que estoura o limite

function _lerEstadoTentativas() {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE_TENTATIVAS_LOGIN)) || { contador: 0, primeiraTentativa: 0, bloqueadoAte: 0, nivelBloqueio: 0 };
  } catch {
    return { contador: 0, primeiraTentativa: 0, bloqueadoAte: 0, nivelBloqueio: 0 };
  }
}

function _salvarEstadoTentativas(estado) {
  try {
    sessionStorage.setItem(CHAVE_TENTATIVAS_LOGIN, JSON.stringify(estado));
  } catch { /* sessionStorage indisponível — segue sem bloqueio */ }
}

// Verifica se o login está bloqueado no momento. Retorna segundos
// restantes de bloqueio (0 se liberado).
function _segundosBloqueioRestante() {
  const estado = _lerEstadoTentativas();
  const restante = estado.bloqueadoAte - Date.now();
  return restante > 0 ? Math.ceil(restante / 1000) : 0;
}

// Registra uma tentativa de login (chamada antes de tentar autenticar).
// Se estourar o limite, ativa o bloqueio (com tempo crescente a cada
// vez que a pessoa insiste depois de bloqueada) e retorna false.
function _registrarTentativaLogin() {
  const agora  = Date.now();
  let estado   = _lerEstadoTentativas();

  if (estado.bloqueadoAte > agora) return false; // já bloqueado

  if (!estado.primeiraTentativa || agora - estado.primeiraTentativa > JANELA_TENTATIVAS_MS) {
    estado = { contador: 0, primeiraTentativa: agora, bloqueadoAte: 0, nivelBloqueio: estado.nivelBloqueio || 0 };
  }

  estado.contador++;

  if (estado.contador > MAX_TENTATIVAS_LOGIN) {
    estado.nivelBloqueio = (estado.nivelBloqueio || 0) + 1;
    estado.bloqueadoAte  = agora + BLOQUEIO_BASE_MS * Math.min(estado.nivelBloqueio, 6); // cresce até 3min
    estado.contador = 0;
    _salvarEstadoTentativas(estado);
    return false;
  }

  _salvarEstadoTentativas(estado);
  return true;
}

function _resetarTentativasLogin() {
  _salvarEstadoTentativas({ contador: 0, primeiraTentativa: 0, bloqueadoAte: 0, nivelBloqueio: 0 });
}

async function fazerLogin() {
  const email = inputEmail.value.trim();
  const senha = inputSenha.value;

  esconderAlertas();

  const segundosBloqueio = _segundosBloqueioRestante();
  if (segundosBloqueio > 0) {
    mostrarErro(`Muitas tentativas de login. Tente novamente em ${segundosBloqueio}s.`);
    return;
  }

  if (!email || !senha) {
    mostrarErro("Preencha e-mail e senha.");
    return;
  }

  if (!_registrarTentativaLogin()) {
    mostrarErro(`Muitas tentativas de login. Tente novamente em ${_segundosBloqueioRestante()}s.`);
    return;
  }

  definirCarregando(true);

  try {
    const manter = inputManterConectado ? inputManterConectado.checked : true;
    await setPersistence(auth, manter ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, senha);
    _resetarTentativasLogin();
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
