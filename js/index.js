// ============================================================
// index.js — Login
// ============================================================
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyA5j_7Ef90CUjkk5FurjwG1amlMzG98PoU",
  authDomain:        "papelaria-futura.firebaseapp.com",
  projectId:         "papelaria-futura",
  storageBucket:     "papelaria-futura.firebasestorage.app",
  messagingSenderId: "643112282801",
  appId:             "1:643112282801:web:9e076c751282fa1988d090"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Redirecionar se já estiver logado
onAuthStateChanged(auth, (usuario) => {
  if (usuario) window.location.href = "/dashboard.html";
});

// Elementos
const elEmail      = document.getElementById("email");
const elSenha      = document.getElementById("senha");
const elBtnLogin   = document.getElementById("btnLogin");
const elBtnEsqueci = document.getElementById("btnEsqueciSenha");
const elBtnVoltar  = document.getElementById("btnVoltarLogin");
const elBtnReset   = document.getElementById("btnEnviarReset");
const elEmailRec   = document.getElementById("emailRecuperar");
const elFormLogin  = document.getElementById("formLogin");
const elFormRec    = document.getElementById("formRecuperacao");
const elAlertErro  = document.getElementById("alertErro");
const elAlertErroTxt = document.getElementById("alertErroTexto");
const elAlertOk    = document.getElementById("alertSucesso");
const elAlertOkTxt = document.getElementById("alertSucessoTexto");
const elToggle     = document.getElementById("toggleSenha");
const elIconAberto = document.getElementById("iconOlhoAberto");
const elIconFechado= document.getElementById("iconOlhoFechado");

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
  elAlertOk.hidden = true;
}
function setCarregando(btn, estado) {
  btn.querySelector(".btn-login__text").hidden    = estado;
  btn.querySelector(".btn-login__spinner").hidden = !estado;
  btn.disabled = estado;
}

function traduzirErro(codigo) {
  const erros = {
    "auth/invalid-email":      "E-mail inválido.",
    "auth/user-not-found":     "Usuário não encontrado.",
    "auth/wrong-password":     "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests":  "Muitas tentativas. Aguarde um momento.",
    "auth/user-disabled":      "Usuário desativado.",
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
    window.location.href = "/dashboard.html";
  } catch (err) {
    setCarregando(elBtnLogin, false);
    mostrarErro(traduzirErro(err.code));
    elSenha.value = "";
  }
}

elBtnLogin.addEventListener("click", fazerLogin);
elEmail.addEventListener("keydown", e => { if (e.key === "Enter") elSenha.focus(); });
elSenha.addEventListener("keydown", e => { if (e.key === "Enter") fazerLogin(); });

elToggle.addEventListener("click", () => {
  const vis = elSenha.type === "text";
  elSenha.type = vis ? "password" : "text";
  elIconAberto.style.display  = vis ? "" : "none";
  elIconFechado.style.display = vis ? "none" : "";
});

elBtnEsqueci.addEventListener("click", () => {
  esconderAlertas();
  elFormLogin.hidden = true;
  elFormRec.hidden = false;
  elEmailRec.value = elEmail.value;
  elEmailRec.focus();
});

elBtnVoltar.addEventListener("click", () => {
  esconderAlertas();
  elFormRec.hidden = true;
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
