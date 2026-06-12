// auth.js
import { signOut, onAuthStateChanged, sendPasswordResetEmail, updatePassword }
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

// ── Dados do usuário no Firestore ──────────────────────────────
export async function buscarDadosUsuario(uid) {
  try {
    const ref  = doc(db, "usuarios", uid);
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data();
    const padrao = { uid, role: "user", criadoEm: serverTimestamp() };
    await setDoc(ref, padrao, { merge: true });
    return padrao;
  } catch {
    return { role: "user" };
  }
}

export async function verificarAdmin(uid) {
  const d = await buscarDadosUsuario(uid);
  return d?.role === "admin";
}

// ── Logout ─────────────────────────────────────────────────────
export async function logoutUsuario() {
  await signOut(auth).catch(() => {});
  window.location.href = "/index.html";
}

// ── Proteção de rota ───────────────────────────────────────────
// Chama callbackAutenticado(usuario, dadosUsuario) se logado,
// senão redireciona para /index.html. Sem onAuthStateChanged —
// usa authStateReady() que resolve uma única vez, sem emitir null.
export function protegerRota(callbackAutenticado) {
  auth.authStateReady().then(async () => {
    const usuario = auth.currentUser;
    if (!usuario) {
      window.location.href = "/index.html";
      return;
    }
    const dados = await buscarDadosUsuario(usuario.uid);
    callbackAutenticado(usuario, dados);
  });
}

// ── Observar auth (uso genérico) ───────────────────────────────
export function observarAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function usuarioAtual() {
  return auth.currentUser;
}

// ── Reset de senha ─────────────────────────────────────────────
export async function resetarSenha(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { sucesso: true };
  } catch (e) {
    return { sucesso: false, erro: traduzirErro(e.code) };
  }
}

export async function alterarSenha(novaSenha) {
  try {
    await updatePassword(auth.currentUser, novaSenha);
    return { sucesso: true };
  } catch (e) {
    return { sucesso: false, erro: traduzirErro(e.code) };
  }
}

// ── Traduções ──────────────────────────────────────────────────
function traduzirErro(codigo) {
  return ({
    "auth/invalid-email":          "E-mail inválido.",
    "auth/user-disabled":          "Usuário desativado.",
    "auth/user-not-found":         "Usuário não encontrado.",
    "auth/wrong-password":         "Senha incorreta.",
    "auth/invalid-credential":     "E-mail ou senha incorretos.",
    "auth/too-many-requests":      "Muitas tentativas. Tente mais tarde.",
    "auth/network-request-failed": "Erro de rede.",
    "auth/email-already-in-use":   "E-mail já cadastrado.",
    "auth/weak-password":          "Senha fraca (mín. 6 caracteres).",
    "auth/requires-recent-login":  "Faça login novamente para continuar.",
    "auth/operation-not-allowed":  "Operação não permitida.",
  })[codigo] ?? "Erro inesperado. Tente novamente.";
}
