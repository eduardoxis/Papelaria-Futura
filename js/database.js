// ============================================================
// database.js
// Operações CRUD no Firestore — Cotações e Usuários
// ============================================================

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  onSnapshot,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "./firebase-config.js";

// ================================================================
// COTAÇÕES
// ================================================================

const COLECAO_COTACOES = "cotacoes";

// ----------------------------------------------------------------
// Criar nova cotação
// ----------------------------------------------------------------
export async function criarCotacao(dados, uidUsuario) {
  try {
    const cotacao = {
      ...dados,
      criadoPor:   uidUsuario,
      dataCriacao: serverTimestamp(),
      updatedAt:   serverTimestamp(),
      status:      dados.status || "ativa"
    };

    const docRef = await addDoc(collection(db, COLECAO_COTACOES), cotacao);
    return { sucesso: true, id: docRef.id };
  } catch (erro) {
    console.error("Erro ao criar cotação:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// ----------------------------------------------------------------
// Atualizar cotação existente
// ----------------------------------------------------------------
export async function atualizarCotacao(id, dados) {
  try {
    await updateDoc(doc(db, COLECAO_COTACOES, id), {
      ...dados,
      updatedAt: serverTimestamp()
    });
    return { sucesso: true };
  } catch (erro) {
    console.error("Erro ao atualizar cotação:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// ----------------------------------------------------------------
// Buscar cotação por ID
// ----------------------------------------------------------------
export async function buscarCotacao(id) {
  try {
    const docSnap = await getDoc(doc(db, COLECAO_COTACOES, id));
    if (docSnap.exists()) {
      return { sucesso: true, dados: { id: docSnap.id, ...docSnap.data() } };
    }
    return { sucesso: false, erro: "Cotação não encontrada." };
  } catch (erro) {
    console.error("Erro ao buscar cotação:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// ----------------------------------------------------------------
// Listar cotações — com filtros opcionais
// ----------------------------------------------------------------
export async function listarCotacoes({ uidUsuario = null, cliente = null, limitQtd = 50 } = {}) {
  try {
    let q = collection(db, COLECAO_COTACOES);
    const restricoes = [orderBy("dataCriacao", "desc"), limit(limitQtd)];

    if (uidUsuario) restricoes.unshift(where("criadoPor", "==", uidUsuario));
    if (cliente)    restricoes.unshift(where("cliente", ">=", cliente), where("cliente", "<=", cliente + "\uf8ff"));

    q = query(q, ...restricoes);
    const snapshot = await getDocs(q);

    const cotacoes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    return { sucesso: true, cotacoes };
  } catch (erro) {
    console.error("Erro ao listar cotações:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// ----------------------------------------------------------------
// Excluir cotação
// ----------------------------------------------------------------
export async function excluirCotacao(id) {
  try {
    await deleteDoc(doc(db, COLECAO_COTACOES, id));
    return { sucesso: true };
  } catch (erro) {
    console.error("Erro ao excluir cotação:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// ----------------------------------------------------------------
// Totais para o Dashboard
// ----------------------------------------------------------------
export async function buscarEstatisticas(uidUsuario = null, apenasAdmin = false) {
  try {
    let q = collection(db, COLECAO_COTACOES);

    if (!apenasAdmin && uidUsuario) {
      q = query(q, where("criadoPor", "==", uidUsuario));
    }

    const snapshot    = await getDocs(q);
    const cotacoes    = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const agora       = new Date();
    const inicioMes   = new Date(agora.getFullYear(), agora.getMonth(), 1);

    const totalCotacoes    = cotacoes.length;
    const valorTotalGeral  = cotacoes.reduce((s, c) => s + (Number(c.valorTotal) || 0), 0);
    const cotacoesMes      = cotacoes.filter(c => {
      const data = c.dataCriacao?.toDate?.() || new Date(c.dataCriacao);
      return data >= inicioMes;
    }).length;

    const ultimas = [...cotacoes]
      .sort((a, b) => {
        const da = a.dataCriacao?.toDate?.() || new Date(a.dataCriacao || 0);
        const db_ = b.dataCriacao?.toDate?.() || new Date(b.dataCriacao || 0);
        return db_ - da;
      })
      .slice(0, 5);

    return { sucesso: true, totalCotacoes, valorTotalGeral, cotacoesMes, ultimas };
  } catch (erro) {
    console.error("Erro ao buscar estatísticas:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// ================================================================
// USUÁRIOS
// ================================================================

const COLECAO_USUARIOS = "usuarios";

// ----------------------------------------------------------------
// Criar/atualizar usuário no Firestore
// ----------------------------------------------------------------
export async function salvarUsuario(uid, dados) {
  try {
    await setDoc(doc(db, COLECAO_USUARIOS, uid), {
      ...dados,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return { sucesso: true };
  } catch (erro) {
    console.error("Erro ao salvar usuário:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// ----------------------------------------------------------------
// Listar todos os usuários (admin)
// ----------------------------------------------------------------
export async function listarUsuarios() {
  try {
    const snapshot = await getDocs(collection(db, COLECAO_USUARIOS));
    const usuarios = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    return { sucesso: true, usuarios };
  } catch (erro) {
    console.error("Erro ao listar usuários:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// ----------------------------------------------------------------
// Excluir usuário do Firestore (apenas doc — Auth via Admin SDK)
// ----------------------------------------------------------------
export async function excluirUsuarioFirestore(uid) {
  try {
    await deleteDoc(doc(db, COLECAO_USUARIOS, uid));
    return { sucesso: true };
  } catch (erro) {
    console.error("Erro ao excluir usuário:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// ================================================================
// UTILS
// ================================================================

export function formatarMoeda(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style:    "currency",
    currency: "BRL"
  }).format(Number(valor) || 0);
}

export function formatarData(timestamp) {
  if (!timestamp) return "—";
  const data = timestamp?.toDate?.() || new Date(timestamp);
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric"
  });
}

export function formatarDataHora(timestamp) {
  if (!timestamp) return "—";
  const data = timestamp?.toDate?.() || new Date(timestamp);
  return data.toLocaleString("pt-BR");
}


// ================================================================
// SENHA COTAÇÃO — Proteção de Editar/Excluir
// ================================================================

const COLECAO_CONFIG = "config";
const DOC_SENHA_COT  = "senhaCotacao";

async function _hashSenha(senha) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(senha)
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function salvarSenhaCotacao(novaSenha) {
  try {
    const hash = await _hashSenha(novaSenha);
    await setDoc(doc(db, COLECAO_CONFIG, DOC_SENHA_COT), {
      hash,
      updatedAt: serverTimestamp()
    });
    return { sucesso: true };
  } catch (erro) {
    console.error("Erro ao salvar senha cotação:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

export async function verificarSenhaCotacao(senha) {
  try {
    const snap = await getDoc(doc(db, COLECAO_CONFIG, DOC_SENHA_COT));
    if (!snap.exists()) return { sucesso: false, semSenha: true };
    const hash = await _hashSenha(senha);
    if (hash === snap.data().hash) return { sucesso: true };
    return { sucesso: false, erro: "Senha incorreta. Tente novamente." };
  } catch (erro) {
    console.error("Erro ao verificar senha cotação:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

export async function senhaCotacaoExiste() {
  try {
    const snap = await getDoc(doc(db, COLECAO_CONFIG, DOC_SENHA_COT));
    return snap.exists();
  } catch {
    return false;
  }
}


// ================================================================
// PLANILHAS DE COMISSÃO
// ================================================================

const COLECAO_COMISSOES = "comissoes";

// Criar nova planilha de comissão (com senha em hash)
export async function criarComissao(dados, uidUsuario) {
  try {
    const hash = await _hashSenha(dados.senha);
    const doc_ = {
      titulo:     dados.titulo,
      descricao:  dados.descricao || "",
      senhaHash:  hash,
      criadoPor:  uidUsuario,
      dataCriacao: serverTimestamp(),
      updatedAt:  serverTimestamp()
    };
    const ref = await addDoc(collection(db, COLECAO_COMISSOES), doc_);
    return { sucesso: true, id: ref.id };
  } catch (erro) {
    console.error("Erro ao criar comissão:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// Listar planilhas de comissão
export async function listarComissoes() {
  try {
    const snap = await getDocs(collection(db, COLECAO_COMISSOES));
    const comissoes = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const da = a.dataCriacao?.toDate?.() || new Date(a.dataCriacao || 0);
        const db_ = b.dataCriacao?.toDate?.() || new Date(b.dataCriacao || 0);
        return db_ - da;
      });
    return { sucesso: true, comissoes };
  } catch (erro) {
    console.error("Erro ao listar comissões:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// Buscar planilha por ID
export async function buscarComissao(id) {
  try {
    const snap = await getDoc(doc(db, COLECAO_COMISSOES, id));
    if (!snap.exists()) return { sucesso: false, erro: "Planilha não encontrada." };
    return { sucesso: true, dados: { id: snap.id, ...snap.data() } };
  } catch (erro) {
    return { sucesso: false, erro: erro.message };
  }
}

// Verificar senha de uma planilha específica
export async function verificarSenhaComissao(comissaoId, senha) {
  try {
    const snap = await getDoc(doc(db, COLECAO_COMISSOES, comissaoId));
    if (!snap.exists()) return { sucesso: false, erro: "Planilha não encontrada." };
    const hash = await _hashSenha(senha);
    if (hash === snap.data().senhaHash) return { sucesso: true };
    return { sucesso: false, erro: "Senha incorreta. Tente novamente." };
  } catch (erro) {
    return { sucesso: false, erro: erro.message };
  }
}

// Excluir planilha de comissão
export async function excluirComissao(id) {
  try {
    // Exclui também todos os registros da planilha
    const registrosSnap = await getDocs(
      collection(db, COLECAO_COMISSOES, id, "registros")
    );
    const deletes = registrosSnap.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletes);
    await deleteDoc(doc(db, COLECAO_COMISSOES, id));
    return { sucesso: true };
  } catch (erro) {
    console.error("Erro ao excluir comissão:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// Atualizar dados (sem senha) de uma planilha
export async function atualizarComissao(id, dados) {
  try {
    await updateDoc(doc(db, COLECAO_COMISSOES, id), {
      ...dados,
      updatedAt: serverTimestamp()
    });
    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, erro: erro.message };
  }
}

// ---- Registros de uma planilha (subcoleção) ----

export async function adicionarRegistroComissao(comissaoId, dados) {
  try {
    const ref = await addDoc(
      collection(db, COLECAO_COMISSOES, comissaoId, "registros"),
      { ...dados, dataCriacao: serverTimestamp(), updatedAt: serverTimestamp() }
    );
    return { sucesso: true, id: ref.id };
  } catch (erro) {
    return { sucesso: false, erro: erro.message };
  }
}

export async function listarRegistrosComissao(comissaoId) {
  try {
    const snap = await getDocs(
      collection(db, COLECAO_COMISSOES, comissaoId, "registros")
    );
    const registros = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        if (a.data && b.data) return a.data.localeCompare(b.data);
        const da = a.dataCriacao?.toDate?.() || new Date(a.dataCriacao || 0);
        const db_ = b.dataCriacao?.toDate?.() || new Date(b.dataCriacao || 0);
        return da - db_;
      });
    return { sucesso: true, registros };
  } catch (erro) {
    return { sucesso: false, erro: erro.message };
  }
}

export async function atualizarRegistroComissao(comissaoId, registroId, dados) {
  try {
    await updateDoc(
      doc(db, COLECAO_COMISSOES, comissaoId, "registros", registroId),
      { ...dados, updatedAt: serverTimestamp() }
    );
    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, erro: erro.message };
  }
}

export async function excluirRegistroComissao(comissaoId, registroId) {
  try {
    await deleteDoc(
      doc(db, COLECAO_COMISSOES, comissaoId, "registros", registroId)
    );
    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, erro: erro.message };
  }
}
