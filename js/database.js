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
  Timestamp,
  arrayUnion,
  getAggregateFromServer,
  count,
  sum,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "./firebase-config.js";

// ================================================================
// COTAÇÕES
// ================================================================

const COLECAO_COTACOES = "cotacoes";

// ----------------------------------------------------------------
// Criar nova cotação
// ----------------------------------------------------------------
export async function criarCotacao(dados, uidUsuario, diasParaPrimeiroLembrete = 4) {
  try {
    const proximoLembreteEm = Timestamp.fromDate(new Date(
      Date.now() + Math.max(1, Number(diasParaPrimeiroLembrete) || 4) * 86400000
    ));
    const cotacao = {
      ...dados,
      criadoPor:   uidUsuario,
      dataCriacao: serverTimestamp(),
      updatedAt:   serverTimestamp(),
      status:      dados.status || "ativa",
      etapaLembrete: 0,
      proximoLembreteEm,
      historico: [{
        usuario: dados.funcionario || "—",
        data:    new Date().toISOString(),
        acao:    "criação"
      }]
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
      updatedAt: serverTimestamp(),
      historico: arrayUnion({
        usuario: dados.funcionario || "—",
        data:    new Date().toISOString(),
        acao:    "edição"
      })
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
// Listar cotações — com filtros opcionais e paginação por cursor.
//
// Compatível com chamadas antigas (sem `cursor`): continua devolvendo
// só `{ sucesso, cotacoes }`, agora também com `proximoCursor`/`temMais`
// (que quem não usa paginação simplesmente ignora).
//
// Para paginar de verdade: chame de novo passando `cursor: proximoCursor`
// da resposta anterior — ele continua exatamente de onde parou.
// ----------------------------------------------------------------
export async function listarCotacoes({
  uidUsuario = null,
  cliente = null,
  dataInicio = null,
  dataFim = null,
  limitQtd = 50,
  cursor = null
} = {}) {
  try {
    const temFiltroData = !!(dataInicio || dataFim);

    function montarRestricoesBase() {
      const restricoes = [];
      if (uidUsuario) restricoes.push(where("criadoPor", "==", uidUsuario));

      if (temFiltroData) {
        if (dataInicio) {
          const inicio = new Date(dataInicio); inicio.setHours(0, 0, 0, 0);
          restricoes.push(where("dataCriacao", ">=", Timestamp.fromDate(inicio)));
        }
        if (dataFim) {
          const fim = new Date(dataFim); fim.setHours(23, 59, 59, 999);
          restricoes.push(where("dataCriacao", "<=", Timestamp.fromDate(fim)));
        }
      }
      restricoes.push(orderBy("dataCriacao", "desc"));
      return restricoes;
    }

    // ── Busca por cliente ──────────────────────────────────────
    // O filtro de texto é feito no JS (case-insensitive — o Firestore só
    // suporta range "começa com" sensível a maiúsculas/minúsculas). Por
    // isso buscamos em lotes do Firestore e vamos filtrando até juntar
    // `limitQtd` resultados (ou até a coleção acabar), em vez de buscar
    // tudo de uma vez.
    if (cliente) {
      const termo = cliente.toLowerCase();
      const TAMANHO_LOTE = 150;
      const MAX_LOTES = 6; // protege contra escanear a coleção inteira numa chamada só

      let cotacoes = [];
      let cursorAtual = cursor;
      let ultimoDocBruto = null;
      let chegouAoFim = false;

      for (let lote = 0; lote < MAX_LOTES; lote++) {
        const restricoes = montarRestricoesBase();
        restricoes.push(limit(TAMANHO_LOTE));
        if (cursorAtual) restricoes.push(startAfter(cursorAtual));

        const snapshot = await getDocs(query(collection(db, COLECAO_COTACOES), ...restricoes));

        if (snapshot.empty) { chegouAoFim = true; break; }

        ultimoDocBruto = snapshot.docs[snapshot.docs.length - 1];
        cursorAtual = ultimoDocBruto;

        const encontrados = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(c => (c.cliente || "").toLowerCase().includes(termo));

        cotacoes.push(...encontrados);

        if (snapshot.docs.length < TAMANHO_LOTE) { chegouAoFim = true; break; }
        if (cotacoes.length >= limitQtd) break;
      }

      return {
        sucesso: true,
        cotacoes,
        proximoCursor: chegouAoFim ? null : ultimoDocBruto,
        temMais: !chegouAoFim
      };
    }

    // ── Sem filtro de cliente ──────────────────────────────────
    // Pede 1 documento extra só pra saber se existe próxima página,
    // sem precisar de uma consulta de contagem separada.
    const restricoes = montarRestricoesBase();
    restricoes.push(limit(limitQtd + 1));
    if (cursor) restricoes.push(startAfter(cursor));

    const snapshot = await getDocs(query(collection(db, COLECAO_COTACOES), ...restricoes));
    const docsPagina = snapshot.docs.slice(0, limitQtd);
    const temMais = snapshot.docs.length > limitQtd;

    return {
      sucesso: true,
      cotacoes: docsPagina.map(d => ({ id: d.id, ...d.data() })),
      proximoCursor: temMais ? docsPagina[docsPagina.length - 1] : null,
      temMais
    };
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
    const agora       = new Date();
    const inicioMes   = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const filtros = uidUsuario ? [where("criadoPor", "==", uidUsuario)] : [];
    const consultaTotal = query(collection(db, COLECAO_COTACOES), ...filtros);
    const consultaMes = query(
      collection(db, COLECAO_COTACOES),
      ...filtros,
      where("dataCriacao", ">=", Timestamp.fromDate(inicioMes))
    );

    // Agregações retornam somente os números calculados pelo Firestore,
    // sem baixar cada cotação para o navegador.
    const [total, mes] = await Promise.all([
      getAggregateFromServer(consultaTotal, {
        quantidade: count(),
        valor: sum("valorTotal")
      }),
      getAggregateFromServer(consultaMes, { quantidade: count() })
    ]);

    return {
      sucesso: true,
      totalCotacoes: total.data().quantidade || 0,
      valorTotalGeral: Number(total.data().valor) || 0,
      cotacoesMes: mes.data().quantidade || 0,
      ultimas: []
    };
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
// Sessões de Caixa (abrir/fechar) + relatório de fechamento
// ----------------------------------------------------------------
const COL_CAIXA_SESSOES = "pf_caixa_sessoes";
const COL_VENDAS_DB     = "pf_vendas";

export async function buscarSessaoCaixaAberta() {
  try {
    const snap = await getDocs(
      query(collection(db, COL_CAIXA_SESSOES), where("status", "==", "aberto"), limit(1))
    );
    if (snap.empty) return { sucesso: true, sessao: null };
    const d = snap.docs[0];
    return { sucesso: true, sessao: { id: d.id, ...d.data() } };
  } catch (erro) {
    console.error("Erro ao buscar sessão de caixa:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

export async function abrirCaixaSessao({ operadorUid, operadorNome, valorAbertura = 0 }) {
  try {
    const doc_ = {
      status: "aberto",
      operadorAberturaUid: operadorUid || null,
      operadorAberturaNome: operadorNome || "—",
      valorAbertura: Number(valorAbertura) || 0,
      abertoEm: serverTimestamp(),
      fechadoEm: null
    };
    const ref = await addDoc(collection(db, COL_CAIXA_SESSOES), doc_);
    return { sucesso: true, id: ref.id };
  } catch (erro) {
    console.error("Erro ao abrir caixa:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

export async function fecharCaixaSessao(sessaoId, { operadorNome, resumo }) {
  try {
    await updateDoc(doc(db, COL_CAIXA_SESSOES, sessaoId), {
      status: "fechado",
      operadorFechamentoNome: operadorNome || "—",
      fechadoEm: serverTimestamp(),
      resumo: resumo || null
    });
    return { sucesso: true };
  } catch (erro) {
    console.error("Erro ao fechar caixa:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// Lista vendas (pf_vendas) criadas a partir de um instante (Date ou Timestamp)
export async function listarVendasDesde(dataInicio) {
  try {
    const inicioTs = dataInicio instanceof Date ? Timestamp.fromDate(dataInicio) : dataInicio;
    const snap = await getDocs(
      query(
        collection(db, COL_VENDAS_DB),
        where("criadoEm", ">=", inicioTs),
        orderBy("criadoEm", "asc")
      )
    );
    const vendas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return { sucesso: true, vendas };
  } catch (erro) {
    console.error("Erro ao listar vendas desde a abertura:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// Lista vendas (pf_vendas) entre duas datas (ex: um dia inteiro, 00:00 a 23:59:59)
export async function listarVendasEntre(dataInicio, dataFim) {
  try {
    const inicioTs = dataInicio instanceof Date ? Timestamp.fromDate(dataInicio) : dataInicio;
    const fimTs    = dataFim instanceof Date ? Timestamp.fromDate(dataFim) : dataFim;
    const snap = await getDocs(
      query(
        collection(db, COL_VENDAS_DB),
        where("criadoEm", ">=", inicioTs),
        where("criadoEm", "<=", fimTs),
        orderBy("criadoEm", "asc")
      )
    );
    const vendas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return { sucesso: true, vendas };
  } catch (erro) {
    console.error("Erro ao listar vendas do período:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// ----------------------------------------------------------------
// Listar vendas finalizadas no Caixa (log — Administração)
// ----------------------------------------------------------------
const COL_VENDAS_LOG = "pf_vendas";

export async function listarVendas({ limitQtd = 100 } = {}) {
  try {
    const snapshot = await getDocs(
      query(collection(db, COL_VENDAS_LOG), orderBy("criadoEm", "desc"), limit(limitQtd))
    );
    const vendas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    return { sucesso: true, vendas };
  } catch (erro) {
    console.error("Erro ao listar vendas:", erro);
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

// Exporta uma matriz de linhas (array de arrays) para um arquivo .xlsx,
// baixando-o no navegador. Requer a biblioteca SheetJS (window.XLSX).
export function exportarExcel(nomeArquivo, linhas) {
  try {
    if (!window.XLSX) {
      console.error("Biblioteca XLSX não carregada.");
      return false;
    }
    const ws = window.XLSX.utils.aoa_to_sheet(linhas);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Dados");
    window.XLSX.writeFile(wb, nomeArquivo);
    return true;
  } catch (erro) {
    console.error("Erro ao exportar Excel:", erro);
    return false;
  }
}

// Exporta várias planilhas dentro de um único arquivo .xlsx.
// `abas` = [{ nome: "Cotações", linhas: [[...],[...]] }, ...]
export function exportarExcelMultiplasAbas(nomeArquivo, abas) {
  try {
    if (!window.XLSX) {
      console.error("Biblioteca XLSX não carregada.");
      return false;
    }
    const wb = window.XLSX.utils.book_new();
    abas.forEach(aba => {
      if (!aba.linhas || aba.linhas.length === 0) return;
      const ws = window.XLSX.utils.aoa_to_sheet(aba.linhas);
      // Nome da aba no Excel tem limite de 31 caracteres e não pode ter alguns símbolos
      const nomeAba = aba.nome.replace(/[\\/*?:\[\]]/g, "").substring(0, 31);
      window.XLSX.utils.book_append_sheet(wb, ws, nomeAba);
    });
    window.XLSX.writeFile(wb, nomeArquivo);
    return true;
  } catch (erro) {
    console.error("Erro ao exportar Excel:", erro);
    return false;
  }
}

// ================================================================
// BACKUP — controle de quando foi o último backup gerado
// ================================================================
const DOC_ULTIMO_BACKUP = "ultimoBackup";

export async function buscarUltimoBackup() {
  try {
    const snap = await getDoc(doc(db, COLECAO_CONFIG, DOC_ULTIMO_BACKUP));
    if (!snap.exists()) return { sucesso: true, data: null };
    return { sucesso: true, data: snap.data().em || null };
  } catch (erro) {
    console.error("Erro ao buscar data do último backup:", erro);
    return { sucesso: false, erro: erro.message, data: null };
  }
}

export async function salvarUltimoBackup() {
  try {
    await setDoc(doc(db, COLECAO_CONFIG, DOC_ULTIMO_BACKUP), { em: serverTimestamp() });
    return { sucesso: true };
  } catch (erro) {
    console.error("Erro ao salvar data do último backup:", erro);
    return { sucesso: false, erro: erro.message };
  }
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
    const hash = await _hashSenha(String(senha ?? "").trim());
    if (hash === snap.data().hash) return { sucesso: true };
    return { sucesso: false, erro: "Senha incorreta. Tente novamente." };
  } catch (erro) {
    console.error("Erro ao verificar senha cotação:", erro);
    if (erro.code === "permission-denied") {
      return {
        sucesso: false,
        erro: "Sem permissão para verificar a senha. Peça para um administrador liberar leitura da configuração no Firestore."
      };
    }
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
// COMISSÃO POR COTAÇÃO GANHADA (do criador do sistema)
// Totalmente separado da comissão dos vendedores no Caixa:
// aqui o cálculo é sobre o valor de cada cotação com status
// "aprovada", não sobre vendas do PDV.
// ================================================================
const DOC_COMISSAO_CRIADOR = "comissaoCriador";

export async function buscarConfigComissaoCriador() {
  try {
    const snap = await getDoc(doc(db, COLECAO_CONFIG, DOC_COMISSAO_CRIADOR));
    if (!snap.exists()) return { sucesso: true, percentual: 0 };
    return { sucesso: true, percentual: Number(snap.data().percentual) || 0 };
  } catch (erro) {
    console.error("Erro ao buscar config de comissão do criador:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

export async function salvarConfigComissaoCriador(percentual) {
  try {
    await setDoc(doc(db, COLECAO_CONFIG, DOC_COMISSAO_CRIADOR), {
      percentual: Number(percentual) || 0,
      updatedAt: serverTimestamp()
    });
    return { sucesso: true };
  } catch (erro) {
    console.error("Erro ao salvar config de comissão do criador:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// Lista todas as cotações com status "aprovada"
export async function listarCotacoesAprovadas() {
  try {
    // Sem orderBy na consulta de propósito: where + orderBy em campos
    // diferentes exige índice composto no Firestore. Ordena no cliente.
    const snap = await getDocs(
      query(collection(db, COLECAO_COTACOES), where("status", "==", "aprovada"))
    );
    const cotacoes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cotacoes.sort((a, b) => {
      const da = a.dataCriacao?.toDate ? a.dataCriacao.toDate() : new Date(a.dataCriacao || 0);
      const db_ = b.dataCriacao?.toDate ? b.dataCriacao.toDate() : new Date(b.dataCriacao || 0);
      return db_ - da;
    });
    return { sucesso: true, cotacoes };
  } catch (erro) {
    console.error("Erro ao listar cotações aprovadas:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// Marca/desmarca a comissão de uma cotação aprovada como paga
export async function marcarComissaoCriadorPaga(cotacaoId, paga) {
  try {
    await updateDoc(doc(db, COLECAO_COTACOES, cotacaoId), {
      comissaoCriadorPaga: !!paga,
      comissaoCriadorPagaEm: paga ? serverTimestamp() : null
    });
    return { sucesso: true };
  } catch (erro) {
    console.error("Erro ao atualizar status de pagamento da comissão:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// Status de pagamento da cotação PARA A LOJA (o cliente pagou o pedido?)
// — independente do status de pagamento da comissão do criador.
export async function marcarCotacaoPagaLoja(cotacaoId, paga) {
  try {
    await updateDoc(doc(db, COLECAO_COTACOES, cotacaoId), {
      pagoLoja: !!paga,
      pagoLojaEm: paga ? serverTimestamp() : null
    });
    return { sucesso: true };
  } catch (erro) {
    console.error("Erro ao atualizar status de pagamento da cotação:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

// ================================================================
// LEMBRETE DE COTAÇÕES (follow-up com o cliente)
// ================================================================
const DOC_LEMBRETE_COTACAO = "lembreteCotacao";

export async function buscarConfigLembreteCotacao() {
  try {
    const snap = await getDoc(doc(db, COLECAO_CONFIG, DOC_LEMBRETE_COTACAO));
    if (!snap.exists()) return { sucesso: true, dias: 4 };
    return { sucesso: true, dias: Number(snap.data().dias) || 4 };
  } catch (erro) {
    console.error("Erro ao buscar config de lembrete de cotações:", erro);
    return { sucesso: false, erro: erro.message, dias: 4 };
  }
}

export async function salvarConfigLembreteCotacao(dias) {
  try {
    await setDoc(doc(db, COLECAO_CONFIG, DOC_LEMBRETE_COTACAO), {
      dias: Number(dias) || 4,
      updatedAt: serverTimestamp()
    });
    return { sucesso: true };
  } catch (erro) {
    console.error("Erro ao salvar config de lembrete de cotações:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

const DIAS_ENTRE_FOLLOW_UPS = 3;

// Registra o contato em uma subcoleção (histórico completo) e atualiza
// somente o resumo necessário no documento da cotação.
export async function registrarLembreteCotacao(cotacaoId, {
  atendente = "—", tipo = "Mensagem enviada", mensagem = "", resultado = "enviado", etapa = 1
} = {}) {
  try {
    const etapaAtual = Math.min(3, Math.max(1, Number(etapa) || 1));
    const ultimoContato = etapaAtual >= 3;
    const cotacaoRef = doc(db, COLECAO_COTACOES, cotacaoId);
    const lembreteRef = doc(collection(cotacaoRef, "lembretes"));
    const batch = writeBatch(db);

    batch.set(lembreteRef, {
      etapa: etapaAtual,
      atendente,
      tipo,
      mensagem,
      resultado,
      enviadoEm: serverTimestamp()
    });
    batch.update(cotacaoRef, {
      ultimoLembreteEm: serverTimestamp(),
      ultimoLembreteTipo: tipo,
      etapaLembrete: etapaAtual,
      proximoLembreteEm: ultimoContato
        ? null
        : Timestamp.fromDate(new Date(Date.now() + DIAS_ENTRE_FOLLOW_UPS * 86400000)),
      ...(ultimoContato ? {
        status: "sem_retorno",
        encerradaSemRetornoEm: serverTimestamp()
      } : {})
    });
    await batch.commit();
    return { sucesso: true };
  } catch (erro) {
    console.error("Erro ao registrar lembrete:", erro);
    return { sucesso: false, erro: erro.message };
  }
}

export async function listarHistoricoLembretes(cotacaoId, limiteHistorico = 20) {
  try {
    const snap = await getDocs(query(
      collection(doc(db, COLECAO_COTACOES, cotacaoId), "lembretes"),
      orderBy("enviadoEm", "desc"),
      limit(limiteHistorico)
    ));
    return { sucesso: true, lembretes: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
  } catch (erro) {
    console.error("Erro ao carregar histórico de lembretes:", erro);
    return { sucesso: false, erro: erro.message, lembretes: [] };
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
      criadoPorNome: dados.criadoPorNome || "—",
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
    const hash = await _hashSenha(String(senha ?? "").trim());
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

export async function listarRegistrosComissao(comissaoId, { limitQtd = 50, cursor = null } = {}) {
  try {
    const restricoes = [orderBy("ordem", "asc"), limit(limitQtd + 1)];
    if (cursor) restricoes.push(startAfter(cursor));
    const snap = await getDocs(query(
      collection(db, COLECAO_COMISSOES, comissaoId, "registros"),
      ...restricoes
    ));
    const docs = snap.docs.slice(0, limitQtd);
    return {
      sucesso: true,
      registros: docs.map(d => ({ id: d.id, ...d.data() })),
      proximoCursor: snap.docs.length > limitQtd ? docs[docs.length - 1] : null,
      temMais: snap.docs.length > limitQtd
    };
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
