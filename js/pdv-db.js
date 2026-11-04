import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db, auth } from "./firebase-config.js";
import {
  COL_COM,
  centavos,
  calcularComissao,
  dataLocal,
} from "./vendas-comissoes-core.js";
import {
  resumoVazio,
  aplicarContribuicao,
  conferirFechamento,
  validarMovimento,
  pagamentosVenda,
  dadosComprovante,
  contribuicaoVenda,
} from "./pdv-core.js";
export const COL_PDV = {
  controle: "pf_caixa_controle",
  operadores: "pf_caixa_operadores",
  movimentos: "pf_caixa_movimentos",
  ajustes: "pf_caixa_ajustes",
  fechamentos: "pf_caixa_fechamentos",
};
const uid = () => {
  if (!auth.currentUser) throw Error("Entre novamente.");
  return auth.currentUser.uid;
};
const ref = (c, id) => doc(db, c, id);
const stamp = () => serverTimestamp();
export async function configuracaoPdv() {
  const s = await getDoc(ref("config", "pdv"));
  return {
    nome: "Papelaria Futura",
    logo: "./img/logo.png",
    formato: "a4",
    agradecimento:
      "Obrigado pela preferência! Papelaria Futura - Volte sempre!",
    ...(s.exists() ? s.data() : {}),
  };
}
export async function salvarConfiguracaoPdv(dados) {
  await runTransaction(db, async (tx) => {
    const r = ref("config", "pdv");
    await tx.get(r);
    tx.set(r, {
      nome: "Papelaria Futura",
      logo: "./img/logo.png",
      endereco: String(dados.endereco || ""),
      telefone: String(dados.telefone || ""),
      cnpj: String(dados.cnpj || ""),
      formato: ["a4", "58", "80"].includes(dados.formato)
        ? dados.formato
        : "a4",
      agradecimento: String(
        dados.agradecimento ||
          "Obrigado pela preferência! Papelaria Futura - Volte sempre!",
      ),
      atualizadoPor: uid(),
      atualizadoEm: stamp(),
    });
  });
}
export async function sessaoAtual() {
  const ponteiro = await getDoc(ref(COL_PDV.operadores, uid()));
  if (ponteiro.exists() && ponteiro.data().sessaoId) {
    const ss = await getDoc(ref("pf_caixa_sessoes", ponteiro.data().sessaoId));
    if (ss.exists() && ss.data().status === "aberto")
      return { ...ss.data(), id: ss.id };
  }
  const legados = await getDocs(
    query(
      collection(db, "pf_caixa_sessoes"),
      where("operadorAberturaUid", "==", uid()),
      where("status", "==", "aberto"),
      limit(1),
    ),
  );
  const ss = legados.docs[0];
  return ss
    ? { ...ss.data(), id: ss.id, legado: ss.data().versaoPdv !== 2 }
    : null;
}
export async function abrirSessaoPdv({ numero = "CX-01", inicial = 0, nome }) {
  const id = doc(collection(db, "pf_caixa_sessoes")).id,
    autor = uid();
  numero = numero.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,24}$/.test(numero))
    throw Error("Use um número de caixa com letras, números ou hífen.");
  if (!Number.isSafeInteger(inicial) || inicial < 0)
    throw Error("Valor inicial inválido.");
  return runTransaction(db, async (tx) => {
    const controle = ref(COL_PDV.controle, numero),
      operador = ref(COL_PDV.operadores, autor);
    const [c, o] = await Promise.all([tx.get(controle), tx.get(operador)]);
    if (c.exists() && c.data().sessaoId)
      throw Error("Este caixa já está aberto.");
    if (o.exists() && o.data().sessaoId)
      throw Error("Você já possui uma sessão aberta.");
    const sr = ref("pf_caixa_sessoes", id);
    tx.set(sr, {
      versaoPdv: 2,
      caixaNumero: numero,
      status: "aberto",
      operadorAberturaUid: autor,
      operadorAberturaNome: nome,
      abertoEm: stamp(),
      inicialCentavos: inicial,
      valorAbertura: inicial / 100,
      revisao: 0,
      resumo: resumoVazio(),
      vendedores: {},
      ultimaOperacao: "abertura",
      tipoUltimaOperacao: "abertura",
    });
    tx.set(controle, { sessaoId: id, operadorUid: autor });
    tx.set(operador, { sessaoId: id });
    return id;
  });
}
export async function salvarVendaPdv(venda, id) {
  const vr = ref("pf_vendas", id),
    autor = uid();
  return runTransaction(db, async (tx) => {
    const [ex, snap, config, base, loja] = await Promise.all([
      tx.get(vr),
      tx.get(ref("pf_caixa_sessoes", venda.sessaoId)),
      tx.get(ref(COL_COM.vendedores, venda.vendedorId)),
      tx.get(ref(COL_COM.config, "base")),
      tx.get(ref("config", "pdv")),
    ]);
    if (ex.exists()) return vr;
    if (
      !snap.exists() ||
      snap.data().status !== "aberto" ||
      snap.data().operadorAberturaUid !== autor
    )
      throw Error("Abra um caixa autorizado antes de concluir a venda.");
    const s = snap.data(),
      total = centavos(venda.total),
      v = {
        ...venda,
        numero: s.caixaNumero + "-" + id,
        numeroLocal: venda.numero ?? null,
        total: total / 100,
        totalCentavos: total,
        freteCentavos: 0,
        estornoCentavos: 0,
        status: "concluida",
        comissaoVersao: 1,
        operadorUid: autor,
        criadoEm: stamp(),
        caixaNumero: s.caixaNumero,
      };
    v.idPdv = id;
    v.quantidadeItens = (v.itens || []).reduce(
      (n, i) => n + Number(i.qtd || 0),
      0,
    );
    v.pagamentos = pagamentosVenda(v);
    if (v.pagamentos.fiado > 0 && v.pagamentos.fiado !== total)
      throw Error("Fiado não pode ser combinado com outros pagamentos.");
    v.pago = v.pagamentos.fiado === 0;
    const recebido = v.recebidoCentavos ?? total;
    if (
      !Number.isSafeInteger(recebido) ||
      recebido < total ||
      (!v.pagamentos.dinheiro && recebido !== total)
    )
      throw Error(
        "Confira o valor recebido. Troco só é permitido em dinheiro.",
      );
    v.recebidoCentavos = recebido;
    v.trocoCentavos = recebido - total;
    v.valorRecebido = recebido / 100;
    v.troco = v.trocoCentavos / 100;
    const percentualBps = config.exists() ? config.data().percentualBps : 0,
      excluirFrete = base.exists() ? base.data().excluirFrete : true;
    const c = {
      vendaId: id,
      vendedorId: v.vendedorId,
      vendedorNome: v.vendedorNome,
      dataVenda: stamp(),
      totalVendaCentavos: total,
      percentualBps,
      excluirFrete,
      ...calcularComissao(v, percentualBps, { excluirFrete }),
      retroativa: false,
      criadoEm: stamp(),
      atualizadoEm: stamp(),
      atualizadoPor: autor,
      sessaoId: v.sessaoId,
    };
    const agregado = aplicarContribuicao(s, v, c);
    v.contribuicaoPdv = agregado.contribuicao;
    const empresa = {
      nome: "Papelaria Futura",
      logo: "./img/logo.png",
      ...(loja.exists() ? loja.data() : {}),
    };
    v.comprovante = dadosComprovante({ ...v, id }, empresa, stamp());
    tx.set(vr, v);
    tx.set(ref(COL_COM.registros, id), c);
    tx.update(snap.ref, {
      resumo: agregado.resumo,
      vendedores: agregado.vendedores,
      revisao: s.revisao + 1,
      ultimaOperacao: id,
      tipoUltimaOperacao: "venda",
    });
    if (v.comissaoId) {
      tx.set(doc(db, "comissoes", v.comissaoId, "registros", id), {
        origem: "caixa",
        cliente: v.clienteNome || v.cpfCnpj || "Consumidor",
        descricao:
          v.itens.length === 1
            ? v.itens[0].nome
            : `Venda #${v.numero} - ${v.itens.length} itens`,
        qtdFolhas: 1,
        valor: total / 100,
        data: dataLocal(),
        categoria:
          {
            Dinheiro: "Dinheiro",
            Pix: "Pix celular",
            PIX: "Pix celular",
            "Cartão de Débito": "Débito",
            "Cartão de Crédito": "Crédito",
            Fiado: "Convênio",
            Convênio: "Convênio",
            Misto: "Misto",
          }[v.formaPagamento] || v.formaPagamento,
        vendedor: v.vendedorNome,
        vendaId: id,
        ordem: Date.now(),
        dataCriacao: stamp(),
        updatedAt: stamp(),
      });
    }
    return vr;
  });
}
export async function registrarMovimento(
  { sessaoId, tipo, valor, motivo, vendaId = null },
  operacaoId = doc(collection(db, COL_PDV.movimentos)).id,
) {
  const campo = validarMovimento(tipo, valor, motivo),
    autor = uid();
  return runTransaction(db, async (tx) => {
    const sr = ref("pf_caixa_sessoes", sessaoId),
      mr = ref(COL_PDV.movimentos, operacaoId);
    const [ss, ms, vs, perfil] = await Promise.all([
      tx.get(sr),
      tx.get(mr),
      tipo === "devolucao" && vendaId
        ? tx.get(ref("pf_vendas", vendaId))
        : Promise.resolve(null),
      tx.get(ref("usuarios", autor)),
    ]);
    if (ms.exists()) return operacaoId;
    if (
      !ss.exists() ||
      ss.data().status !== "aberto" ||
      (ss.data().operadorAberturaUid !== autor &&
        perfil.data()?.role !== "admin" &&
        !(perfil.data()?.roles || []).includes("admin"))
    )
      throw Error("Caixa fechado ou de outro operador.");
    const s = ss.data();
    if (tipo === "devolucao") {
      if (!vs?.exists()) throw Error("Venda não encontrada.");
      const v = vs.data(),
        permitido = ["cancelada", "devolvida"].includes(v.status)
          ? v.totalCentavos
          : v.estornoCentavos || 0,
        devolvido = (v.devolvidoDinheiroCentavos || 0) + valor;
      if (devolvido > permitido)
        throw Error(
          "Devolução em dinheiro excede o cancelamento ou estorno registrado.",
        );
      tx.update(vs.ref, {
        devolvidoDinheiroCentavos: devolvido,
        ultimaDevolucaoId: operacaoId,
      });
    }
    tx.set(mr, {
      sessaoId,
      tipo,
      valorCentavos: valor,
      motivo,
      vendaId,
      operadorUid: autor,
      criadoEm: stamp(),
    });
    tx.update(sr, {
      resumo: { ...s.resumo, [campo]: s.resumo[campo] + valor },
      revisao: s.revisao + 1,
      ultimaOperacao: operacaoId,
      tipoUltimaOperacao: "movimento",
    });
    return operacaoId;
  });
}
export async function conferirSessao(id) {
  const [s, empresa] = await Promise.all([
    getDoc(ref("pf_caixa_sessoes", id)),
    configuracaoPdv(),
  ]);
  if (!s.exists()) throw Error("Sessão não encontrada.");
  return { ...s.data(), id: s.id, empresa };
}
export async function confirmarFechamento(id, revisao, contado, nome) {
  const autor = uid();
  try {
    return await runTransaction(db, async (tx) => {
      const sr = ref("pf_caixa_sessoes", id),
        fr = ref(COL_PDV.fechamentos, id);
      const [s, f, loja] = await Promise.all([
        tx.get(sr),
        tx.get(fr),
        tx.get(ref("config", "pdv")),
      ]);
      if (f.exists()) return id;
      if (
        !s.exists() ||
        s.data().status !== "aberto" ||
        s.data().operadorAberturaUid !== autor
      )
        throw Error("Sessão fechada ou não autorizada.");
      const sessao = s.data();
      if (sessao.revisao !== revisao)
        throw Error(
          "O caixa recebeu novas movimentações. Atualize a conferência antes de confirmar.",
        );
      const conferido = conferirFechamento(sessao, contado);
      tx.set(fr, {
        versao: 2,
        sessaoId: id,
        numero: "FCX-" + id,
        caixaNumero: sessao.caixaNumero,
        operadorUid: autor,
        operadorNome: nome,
        abertoEm: sessao.abertoEm,
        fechadoEm: stamp(),
        inicialCentavos: sessao.inicialCentavos,
        resumo: sessao.resumo,
        vendedores: sessao.vendedores,
        revisao: sessao.revisao,
        ...conferido,
        empresa: {
          nome: "Papelaria Futura",
          logo: "./img/logo.png",
          ...(loja.exists() ? loja.data() : {}),
        },
        status: "confirmado",
      });
      tx.update(sr, {
        status: "fechado",
        fechadoEm: stamp(),
        fechamentoId: id,
        operadorFechamentoNome: nome,
      });
      tx.set(ref(COL_PDV.controle, sessao.caixaNumero), {
        sessaoId: null,
        operadorUid: autor,
      });
      tx.set(ref(COL_PDV.operadores, autor), { sessaoId: null });
      return id;
    });
  } catch (erro) {
    const salvo = await getDoc(ref(COL_PDV.fechamentos, id));
    if (salvo.exists()) return id;
    throw erro;
  }
}
export async function buscarFechamento(id) {
  const f = await getDoc(ref(COL_PDV.fechamentos, id));
  if (!f.exists()) throw Error("Fechamento não encontrado.");
  return { ...f.data(), id: f.id };
}
export async function buscarVenda(id) {
  const f = await getDoc(ref("pf_vendas", id));
  if (!f.exists()) throw Error("Venda não encontrada.");
  return { ...f.data(), id: f.id };
}
export async function historicoFechamentos({
  inicio,
  fim,
  operador = "",
  numero = "",
  cursor = null,
}) {
  const filtros = [
    where("fechadoEm", ">=", inicio),
    where("fechadoEm", "<", fim),
    orderBy("fechadoEm", "desc"),
    limit(30),
  ];
  if (operador) filtros.push(where("operadorUid", "==", operador));
  if (numero) filtros.push(where("caixaNumero", "==", numero.toUpperCase()));
  if (cursor) filtros.push(startAfter(cursor));
  const s = await getDocs(
    query(collection(db, COL_PDV.fechamentos), ...filtros),
  );
  return {
    itens: s.docs.map((d) => ({ ...d.data(), id: d.id })),
    cursor: s.docs.length === 30 ? s.docs.at(-1) : null,
  };
}
export async function listarVendasPdv(cursor = null, operador = null) {
  const filtros = [orderBy("criadoEm", "desc"), limit(25)];
  if (operador) filtros.push(where("operadorUid", "==", operador));
  if (cursor) filtros.push(startAfter(cursor));
  const s = await getDocs(query(collection(db, "pf_vendas"), ...filtros));
  return {
    itens: s.docs.map((d) => ({ ...d.data(), id: d.id })),
    cursor: s.docs.length === 25 ? s.docs.at(-1) : null,
  };
}
// Executar antes das primeiras escritas de uma transação de ajuste.
export async function prepararAjustePdv(tx, venda) {
  if (!venda.sessaoId) return null;
  const s = await tx.get(ref("pf_caixa_sessoes", venda.sessaoId));
  return s.exists() ? s : null;
}
export function gravarAjustePdv(
  tx,
  snap,
  anterior,
  nova,
  comissao,
  auditoriaId,
  motivo,
) {
  if (!snap) return;
  const s = snap.data();
  if (s.status === "aberto") {
    const a = aplicarContribuicao(s, nova, comissao, anterior.contribuicaoPdv);
    tx.update(snap.ref, {
      resumo: a.resumo,
      vendedores: a.vendedores,
      revisao: s.revisao + 1,
      ultimaOperacao: auditoriaId,
      tipoUltimaOperacao: "ajuste",
    });
    tx.update(ref("pf_vendas", nova.id), { contribuicaoPdv: a.contribuicao });
  } else {
    tx.set(ref(COL_PDV.ajustes, auditoriaId), {
      sessaoId: snap.id,
      fechamentoId: s.fechamentoId || snap.id,
      vendaId: nova.id,
      motivo,
      antes: anterior.contribuicaoPdv || null,
      depois: contribuicaoVenda(nova, comissao),
      operadorUid: uid(),
      criadoEm: stamp(),
    });
  }
}
export async function listarAjustes(id, cursor = null) {
  const filtros = [
    where("fechamentoId", "==", id),
    orderBy("criadoEm", "asc"),
    limit(50),
  ];
  if (cursor) filtros.push(startAfter(cursor));
  const snap = await getDocs(
    query(collection(db, COL_PDV.ajustes), ...filtros),
  );
  return {
    itens: snap.docs.map((d) => ({ ...d.data(), id: d.id })),
    cursor: snap.docs.length === 50 ? snap.docs.at(-1) : null,
  };
}
export async function listarMovimentos(id, cursor = null) {
  const filtros = [
    where("sessaoId", "==", id),
    orderBy("criadoEm", "asc"),
    limit(50),
  ];
  if (cursor) filtros.push(startAfter(cursor));
  const snap = await getDocs(
    query(collection(db, COL_PDV.movimentos), ...filtros),
  );
  return {
    itens: snap.docs.map((d) => ({ ...d.data(), id: d.id })),
    cursor: snap.docs.length === 50 ? snap.docs.at(-1) : null,
  };
}
export async function encerrarSessaoLegada(id, contado, motivo) {
  if (!Number.isSafeInteger(contado) || contado < 0 || !motivo.trim())
    throw Error("Informe valor contado e motivo.");
  return runTransaction(db, async (tx) => {
    const r = ref("pf_caixa_sessoes", id),
      s = await tx.get(r);
    if (!s.exists()) throw Error("Sessão não encontrada.");
    if (s.data().status === "fechado") return id;
    if (s.data().versaoPdv === 2)
      throw Error("Use a conferência do caixa atual.");
    tx.update(r, {
      status: "fechado",
      fechadoEm: stamp(),
      operadorFechamentoNome: s.data().operadorAberturaNome,
      conferenciaLegada: {
        contadoCentavos: contado,
        motivo,
        operadorUid: uid(),
        criadoEm: stamp(),
      },
    });
    return id;
  });
}
export async function registrarCorrecaoFechamento(
  id,
  contado,
  motivo,
  operacao = doc(collection(db, COL_PDV.ajustes)).id,
) {
  if (!Number.isSafeInteger(contado) || contado < 0 || !motivo.trim())
    throw Error("Informe o valor e o motivo da correção.");
  return runTransaction(db, async (tx) => {
    const [f, a] = await Promise.all([
      tx.get(ref(COL_PDV.fechamentos, id)),
      tx.get(ref(COL_PDV.ajustes, operacao)),
    ]);
    if (a.exists()) return operacao;
    if (!f.exists()) throw Error("Fechamento não encontrado.");
    tx.set(ref(COL_PDV.ajustes, operacao), {
      tipo: "correcao_fechamento",
      fechamentoId: id,
      sessaoId: id,
      motivo,
      operadorUid: uid(),
      criadoEm: stamp(),
      antes: {
        contadoCentavos: f.data().contadoCentavos,
        diferencaCentavos: f.data().diferencaCentavos,
      },
      depois: {
        contadoCentavos: contado,
        diferencaCentavos: contado - f.data().esperadoCentavos,
      },
    });
    return operacao;
  });
}
