// auth.js
import {
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword,
  getAuth,
  setPersistence,
  inMemoryPersistence,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc,
  getDocFromServer,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import app, { auth, db } from "./firebase-config.js";
import {
  initializeApp,
  deleteApp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

// ── Dados do usuário no Firestore ──────────────────────────────
export async function buscarDadosUsuario(uid) {
  const ref = doc(db, "usuarios", uid);
  const snap = await getDocFromServer(ref);
  if (snap.exists()) return snap.data();
  // Outra aba pode ter criado/configurado o perfil depois da primeira leitura.
  return runTransaction(db, async (tx) => {
    const atual = await tx.get(ref);
    if (atual.exists()) return atual.data();
    if (auth.currentUser?.uid !== uid)
      throw Error("A conta conectada foi alterada.");
    const padrao = { uid, roles: ["user"], criadoEm: serverTimestamp() };
    tx.set(ref, padrao);
    return padrao;
  });
}

// Cadastro isolado: criar o colaborador nunca substitui o login do administrador.
export async function criarContaUsuario(email, senha) {
  const secundario = initializeApp(
    app.options,
    "cadastro-" + crypto.randomUUID(),
  );
  const acesso = getAuth(secundario);
  try {
    await setPersistence(acesso, inMemoryPersistence);
    const credencial = await createUserWithEmailAndPassword(
      acesso,
      email,
      senha,
    );
    return { uid: credencial.user.uid };
  } finally {
    await signOut(acesso).catch(() => {});
    await deleteApp(secundario).catch(() => {});
  }
}

// ── Cargos (multi-cargo) ────────────────────────────────────────
// Retorna a lista de cargos de um usuário. Compatível com documentos
// antigos que só tinham o campo `role` (string única).
export function cargosDoUsuario(dadosUsuario) {
  if (Array.isArray(dadosUsuario?.roles) && dadosUsuario.roles.length) {
    return dadosUsuario.roles;
  }
  if (dadosUsuario?.role) return [dadosUsuario.role];
  return ["user"];
}

// Verifica se o usuário tem um cargo específico ("admin", "vendedor", "user")
export function temCargo(dadosUsuario, cargo) {
  return cargosDoUsuario(dadosUsuario).includes(cargo);
}

export async function verificarAdmin(uid) {
  const d = await buscarDadosUsuario(uid);
  return temCargo(d, "admin");
}

// ── Logout ─────────────────────────────────────────────────────
let saindo = false;
let redirecionando = false;
function irParaLogin() {
  if (redirecionando) return;
  redirecionando = true;
  window.location.replace("/login.html");
}
export async function logoutUsuario() {
  if (saindo) return;
  saindo = true;
  try {
    await signOut(auth);
    irParaLogin();
  } catch {
    window.mostrarToast?.(
      "Não foi possível sair da conta. Confira a conexão e tente novamente.",
      "error",
    );
  } finally {
    saindo = false;
  }
}

// ── Proteção de rota ───────────────────────────────────────────
// Aguarda a restauração inicial e acompanha saída/troca de conta nas outras abas.
export function protegerRota(callbackAutenticado) {
  let cancelado = false,
    desligar = null;
  const encerrar = () => {
    cancelado = true;
    desligar?.();
  };
  window.addEventListener("pagehide", encerrar, { once: true });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) window.location.reload();
  });
  auth
    .authStateReady()
    .then(async () => {
      if (cancelado) return;
      const usuario = auth.currentUser;
      if (!usuario) {
        irParaLogin();
        return;
      }
      desligar = onAuthStateChanged(auth, (atual) => {
        if (cancelado || atual?.uid === usuario.uid) return;
        cancelado = true;
        document.body.style.visibility = "hidden";
        if (!atual) irParaLogin();
        else window.location.reload();
      });
      const dados = await buscarDadosUsuario(usuario.uid);
      if (cancelado || auth.currentUser?.uid !== usuario.uid) return;
      await callbackAutenticado(usuario, dados);
    })
    .catch((erro) => {
      if (cancelado) return;
      console.error("Não foi possível carregar a sessão.", erro);
      const aviso = document.createElement("div");
      aviso.id = "avisoSessao";
      aviso.setAttribute("role", "alert");
      aviso.style.cssText =
        "position:fixed;inset:0;z-index:100000;background:#f8fafc;display:grid;place-content:center;gap:18px;padding:24px;text-align:center;color:#123c70;font:16px Arial,sans-serif";
      aviso.innerHTML =
        '<h2>Não foi possível carregar seu acesso</h2><p>Confira sua conexão e tente novamente.</p><button type="button" style="padding:12px;cursor:pointer">Tentar novamente</button>';
      aviso.querySelector("button").onclick = () => window.location.reload();
      document.body.append(aviso);
    });
  return encerrar;
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
  return (
    {
      "auth/invalid-email": "E-mail inválido.",
      "auth/user-disabled": "Usuário desativado.",
      "auth/user-not-found": "Usuário não encontrado.",
      "auth/wrong-password": "Senha incorreta.",
      "auth/invalid-credential": "E-mail ou senha incorretos.",
      "auth/too-many-requests": "Muitas tentativas. Tente mais tarde.",
      "auth/network-request-failed": "Erro de rede.",
      "auth/email-already-in-use": "E-mail já cadastrado.",
      "auth/weak-password": "Senha fraca (mín. 6 caracteres).",
      "auth/requires-recent-login": "Faça login novamente para continuar.",
      "auth/operation-not-allowed": "Operação não permitida.",
    }[codigo] ?? "Erro inesperado. Tente novamente."
  );
}
