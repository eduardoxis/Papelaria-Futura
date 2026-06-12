// ============================================================
// auth.js
// Gerenciamento completo de autenticação Firebase
// ============================================================

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";

// ----------------------------------------------------------------
// Constantes e rotas protegidas
// ----------------------------------------------------------------
const ROUTES = {
  login:     "/index.html",
  dashboard: "/dashboard.html"
};

const PROTECTED_PAGES = ["dashboard.html"];
const PUBLIC_PAGES    = ["index.html", ""];

// ----------------------------------------------------------------
// Login
// ----------------------------------------------------------------
export async function loginUsuario(email, senha) {
  try {
    const credencial   = await signInWithEmailAndPassword(auth, email, senha);
    const usuario      = credencial.user;
    const dadosUsuario = await buscarDadosUsuario(usuario.uid);

    await setDoc(
      doc(db, "usuarios", usuario.uid),
      { ultimoAcesso: serverTimestamp() },
      { merge: true }
    );

    return { sucesso: true, usuario, dadosUsuario };
  } catch (erro) {
    return { sucesso: false, erro: traduzirErroAuth(erro.code) };
  }
}

// ----------------------------------------------------------------
// Logout
// ----------------------------------------------------------------
export async function logoutUsuario() {
  try {
    await signOut(auth);
    window.location.replace(ROUTES.login);
  } catch (erro) {
    console.error("Erro ao fazer logout:", erro);
  }
}

// ----------------------------------------------------------------
// Buscar dados do usuário no Firestore
// ----------------------------------------------------------------
export async function buscarDadosUsuario(uid) {
  try {
    const docRef  = doc(db, "usuarios", uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data();
    }

    const dadosPadrao = {
      uid,
      role:      "user",
      criadoEm:  serverTimestamp()
    };
    await setDoc(docRef, dadosPadrao, { merge: true });
    return dadosPadrao;
  } catch (erro) {
    console.error("Erro ao buscar dados do usuário:", erro);
    return { role: "user" };
  }
}

// ----------------------------------------------------------------
// Verificar se usuário é admin
// ----------------------------------------------------------------
export async function verificarAdmin(uid) {
  const dados = await buscarDadosUsuario(uid);
  return dados?.role === "admin";
}

// ----------------------------------------------------------------
// Proteção de rotas — chamar em cada página protegida
// ----------------------------------------------------------------
export function protegerRota(callbackAutenticado) {
  // Guard: evita múltiplos redirects se o listener disparar mais de uma vez
  let redirecionando = false;

  return onAuthStateChanged(auth, async (usuario) => {
    // Se já estamos redirecionando, ignora disparos subsequentes
    if (redirecionando) return;

    const pathname    = window.location.pathname;
    const paginaAtual = pathname.split("/").pop() || "index.html";

    if (!usuario && PROTECTED_PAGES.includes(paginaAtual)) {
      // Não autenticado em página protegida → login
      redirecionando = true;
      window.location.replace(ROUTES.login);
      return;
    }

    if (usuario && PUBLIC_PAGES.includes(paginaAtual)) {
      // Já autenticado na página de login → dashboard
      redirecionando = true;
      window.location.replace(ROUTES.dashboard);
      return;
    }

    if (usuario && callbackAutenticado) {
      const dadosUsuario = await buscarDadosUsuario(usuario.uid);
      callbackAutenticado(usuario, dadosUsuario);
    }
  });
}

// ----------------------------------------------------------------
// Observar estado de autenticação (genérico)
// ----------------------------------------------------------------
export function observarAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// ----------------------------------------------------------------
// Obter usuário atual em sincronia
// ----------------------------------------------------------------
export function usuarioAtual() {
  return auth.currentUser;
}

// ----------------------------------------------------------------
// Reset de senha por e-mail
// ----------------------------------------------------------------
export async function resetarSenha(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, erro: traduzirErroAuth(erro.code) };
  }
}

// ----------------------------------------------------------------
// Tradução de erros Firebase Auth para português
// ----------------------------------------------------------------
function traduzirErroAuth(codigo) {
  const erros = {
    "auth/invalid-email":          "E-mail inválido.",
    "auth/user-disabled":          "Usuário desativado.",
    "auth/user-not-found":         "Usuário não encontrado.",
    "auth/wrong-password":         "Senha incorreta.",
    "auth/invalid-credential":     "E-mail ou senha incorretos.",
    "auth/too-many-requests":      "Muitas tentativas. Tente novamente mais tarde.",
    "auth/network-request-failed": "Erro de rede. Verifique sua conexão.",
    "auth/email-already-in-use":   "E-mail já cadastrado.",
    "auth/weak-password":          "Senha fraca. Use ao menos 6 caracteres.",
    "auth/requires-recent-login":  "Faça login novamente para continuar.",
    "auth/operation-not-allowed":  "Operação não permitida."
  };
  return erros[codigo] || "Erro inesperado. Tente novamente.";
}
