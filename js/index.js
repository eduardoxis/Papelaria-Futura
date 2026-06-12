// index.js — página de login
import { signInWithEmailAndPassword, sendPasswordResetEmail }
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth } from "./firebase-config.js";

// Se já estiver logado, vai pro dashboard e para.
// authStateReady() resolve UMA vez com o estado real — sem null transitório.
auth.authStateReady().then(() => {
  if (auth.currentUser) window.location.href = "/dashboard.html";
});

// ── Elementos ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const elEmail     = $("email");
const elSenha     = $("senha");
const elBtnLogin  = $("btnLogin");
const elBtnEsq    = $("btnEsqueciSenha");
const elBtnVoltar = $("btnVoltarLogin");
const elBtnReset  = $("btnEnviarReset");
const elEmailRec  = $("emailRecuperar");
const elFormLogin = $("formLogin");
const elFormRec   = $("formRecuperacao");
const elErroTxt   = $("alertErroTexto");
const elErro      = $("alertErro");
const elOkTxt     = $("alertSucessoTexto");
const elOk        = $("alertSucesso");
const elToggle    = $("toggleSenha");
const elOlhoA     = $("iconOlhoAberto");
const elOlhoF     = $("iconOlhoFechado");

// ── Helpers de UI ──────────────────────────────────────────────
function erro(msg)    { elOk.hidden=true;  elErroTxt.textContent=msg; elErro.hidden=false; }
function sucesso(msg) { elErro.hidden=true; elOkTxt.textContent=msg;  elOk.hidden=false;  }
function limpar()     { elErro.hidden=true; elOk.hidden=true; }

function carregando(btn, sim) {
  btn.querySelector(".btn-login__text").hidden    = sim;
  btn.querySelector(".btn-login__spinner").hidden = !sim;
  btn.disabled = sim;
}

function traduzir(code) {
  return ({
    "auth/invalid-email":          "E-mail inválido.",
    "auth/user-not-found":         "Usuário não encontrado.",
    "auth/wrong-password":         "Senha incorreta.",
    "auth/invalid-credential":     "E-mail ou senha incorretos.",
    "auth/too-many-requests":      "Muitas tentativas. Aguarde.",
    "auth/user-disabled":          "Usuário desativado.",
    "auth/network-request-failed": "Erro de rede.",
  })[code] ?? "Erro inesperado.";
}

// ── Login ──────────────────────────────────────────────────────
async function fazerLogin() {
  limpar();
  const email = elEmail.value.trim();
  const senha = elSenha.value;
  if (!email || !senha) { erro("Preencha e-mail e senha."); return; }

  carregando(elBtnLogin, true);
  try {
    await signInWithEmailAndPassword(auth, email, senha);
    // Firebase persiste a sessão; redireciona direto sem esperar nada.
    window.location.href = "/dashboard.html";
  } catch (e) {
    carregando(elBtnLogin, false);
    erro(traduzir(e.code));
    elSenha.value = "";
  }
}

elBtnLogin.addEventListener("click", fazerLogin);
elEmail.addEventListener("keydown", e => e.key === "Enter" && elSenha.focus());
elSenha.addEventListener("keydown", e => e.key === "Enter" && fazerLogin());

// ── Toggle senha ───────────────────────────────────────────────
elToggle.addEventListener("click", () => {
  const vis = elSenha.type === "text";
  elSenha.type = vis ? "password" : "text";
  elOlhoA.style.display = vis ? ""     : "none";
  elOlhoF.style.display = vis ? "none" : "";
});

// ── Formulário de recuperação ──────────────────────────────────
elBtnEsq.addEventListener("click", () => {
  limpar();
  elFormLogin.hidden = true;
  elFormRec.hidden   = false;
  elEmailRec.value   = elEmail.value;
  elEmailRec.focus();
});

elBtnVoltar.addEventListener("click", () => {
  limpar();
  elFormRec.hidden   = true;
  elFormLogin.hidden = false;
  elEmail.focus();
});

async function enviarReset() {
  limpar();
  const email = elEmailRec.value.trim();
  if (!email) { erro("Informe o e-mail."); return; }
  carregando(elBtnReset, true);
  try {
    await sendPasswordResetEmail(auth, email);
    sucesso("Link enviado! Verifique sua caixa de entrada.");
    elEmailRec.value = "";
  } catch (e) {
    erro(traduzir(e.code));
  }
  carregando(elBtnReset, false);
}

elBtnReset.addEventListener("click", enviarReset);
elEmailRec.addEventListener("keydown", e => e.key === "Enter" && enviarReset());
