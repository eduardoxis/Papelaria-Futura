import {salvarVendaPdv,prepararAjustePdv,gravarAjustePdv} from './pdv-db.js';
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
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db, auth } from "./firebase-config.js";
import {
  COL_COM,
  centavos,
  totalCentavos,
  percentualBps,
  calcularComissao,
  validarPagamento,
  elegivel,
  dataLocal,
} from "./vendas-comissoes-core.js";
const ref = (colecao, id) => doc(db, colecao, id);
const uid = () => {
  if (!auth.currentUser) throw Error("Entre novamente no sistema.");
  return auth.currentUser.uid;
};
const stamp = () => serverTimestamp();
const politica = (s) => ({
  excluirFrete: s.exists() ? s.data().excluirFrete : true,
});
function registroVenda(id, v, bps, regra, retroativa = false) {
  return {
    vendaId: id,
    vendedorId: v.vendedorId,
    vendedorNome: v.vendedorNome || "Vendedor",
    dataVenda: v.criadoEm,
    totalVendaCentavos: totalCentavos(v),
    percentualBps: bps,
    excluirFrete: regra.excluirFrete,
    ...calcularComissao(v, bps, regra),
    retroativa,
    criadoEm: stamp(),
    atualizadoEm: stamp(),
    atualizadoPor: uid(),
  };
}
export async function salvarVendaComComissao(venda, id) {
  if(venda.sessaoId) return salvarVendaPdv(venda,id);
  const vendaRef = ref("pf_vendas", id);
  return runTransaction(db, async (tx) => {
    const [existente, config, base] = await Promise.all([
      tx.get(vendaRef),
      tx.get(ref(COL_COM.vendedores, venda.vendedorId)),
      tx.get(ref(COL_COM.config, "base")),
    ]);
    if (existente.exists()) return vendaRef;
    const v = {
      ...venda,
      total: centavos(venda.total) / 100,
      totalCentavos: centavos(venda.total),
      freteCentavos: 0,
      estornoCentavos: 0,
      status: "concluida",
      pago: !["Fiado", "Convênio"].includes(venda.formaPagamento),
      comissaoVersao: 1,
    };
    const bps = config.exists() ? config.data().percentualBps : 0;
    tx.set(vendaRef, v);
    tx.set(
      ref(COL_COM.registros, id),
      registroVenda(id, v, bps, politica(base)),
    );
    return vendaRef;
  });
}
export async function salvarPercentual(vendedor, texto) {
  const bps = percentualBps(texto);
  const auditoria = doc(collection(db, COL_COM.auditoria));
  const autor = uid();
  return runTransaction(db, async (tx) => {
    const destino = ref(COL_COM.vendedores, vendedor.id);
    const antes = await tx.get(destino);
    tx.set(destino, {
      vendedorId: vendedor.id,
      nome: vendedor.nome,
      percentualBps: bps,
      atualizadoEm: stamp(),
      atualizadoPor: autor,
      auditoriaId: auditoria.id,
    });
    tx.set(auditoria, {
      tipo: "percentual",
      vendedorId: vendedor.id,
      antes: antes.exists() ? antes.data().percentualBps : 0,
      depois: bps,
      registradoPor: autor,
      criadoEm: stamp(),
    });
  });
}
export async function salvarBase(excluirFrete) {
  const auditoria = doc(collection(db, COL_COM.auditoria));
  const autor = uid();
  return runTransaction(db, async (tx) => {
    const destino = ref(COL_COM.config, "base");
    const antes = await tx.get(destino);
    tx.set(destino, {
      excluirFrete,
      atualizadoEm: stamp(),
      atualizadoPor: autor,
      auditoriaId: auditoria.id,
    });
    tx.set(auditoria, {
      tipo: "base",
      antes: antes.exists() ? antes.data().excluirFrete : true,
      depois: excluirFrete,
      registradoPor: autor,
      criadoEm: stamp(),
    });
  });
}
export async function gerarRetroativa(previsao) {
  const auditoria = doc(collection(db, COL_COM.auditoria));
  return runTransaction(db, async (tx) => {
    const vref = ref("pf_vendas", previsao.id),
      cref = ref(COL_COM.registros, previsao.id);
    const [v, c, base] = await Promise.all([
      tx.get(vref),
      tx.get(cref),
      tx.get(ref(COL_COM.config, "base")),
    ]);
    if (c.exists()) return false;
    if (!v.exists()) throw Error("Venda removida. Confira novamente.");
    const venda = v.data(),
      regra = politica(base);
    if (
      !venda.vendedorId ||
      (previsao.vendedorId && venda.vendedorId !== previsao.vendedorId) ||
      !elegivel(venda) ||
      totalCentavos(venda) !== previsao.total ||
      regra.excluirFrete !== previsao.excluirFrete ||
      (venda.estornoCentavos || 0) !== previsao.estorno
    )
      throw Error("Venda ou regra alterada. Confira novamente antes de gerar.");
    tx.set(cref, {
      ...registroVenda(previsao.id, venda, previsao.bps, regra, true),
      auditoriaId: auditoria.id,
    });
    tx.set(auditoria, {
      tipo: "retroativa",
      vendaId: previsao.id,
      antes: null,
      depois: previsao.bps,
      registradoPor: uid(),
      criadoEm: stamp(),
    });
    return true;
  });
}
export function novoLotePagamento() {
  return doc(collection(db, COL_COM.pagamentos)).id;
}
export async function registrarPagamento({
  loteId,
  vendedorId,
  itens,
  dataPagamento,
  forma,
  observacao = "",
}) {
  if (
    !itens.length ||
    itens.length > 3 ||
    new Set(itens.map((i) => i.id)).size !== itens.length
  )
    throw Error("Selecione de 1 a 3 comissões por pagamento.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento) ||
    dataLocal(new Date(dataPagamento + "T00:00:00")) !== dataPagamento ||
    !["PIX", "Dinheiro", "Transferência"].includes(forma)
  )
    throw Error("Informe data e forma de pagamento.");
  const autor = uid();
  return runTransaction(db, async (tx) => {
    const dados = await Promise.all(
      itens.map(async (item) => {
        const c = ref(COL_COM.registros, item.id),
          v = ref("pf_vendas", item.id),
          p = ref(COL_COM.pagamentos, loteId + "_" + item.id);
        const [cs, vs, ps] = await Promise.all([
          tx.get(c),
          tx.get(v),
          tx.get(p),
        ]);
        return { item, c, v, p, cs, vs, ps };
      }),
    );
    if (dados.every((d) => d.ps.exists())) return;
    if (dados.some((d) => d.ps.exists()))
      throw Error("Lote inconsistente. Atualize a tela.");
    const preparados = dados.map((d) => {
      if (!d.cs.exists() || !d.vs.exists())
        throw Error("Venda ou comissão não encontrada.");
      const registro = d.cs.data(),
        venda = d.vs.data();
      if (registro.vendedorId !== vendedorId)
        throw Error("Selecione comissões do mesmo vendedor.");
      return {
        ...d,
        registro,
        ajuste: validarPagamento(registro, venda, d.item.valor),
      };
    });
    for (const d of preparados) {
      tx.update(d.c, {
        ...d.ajuste,
        ultimoPagamentoId: d.p.id,
        atualizadoEm: stamp(),
        atualizadoPor: autor,
      });
      tx.set(d.p, {
        loteId,
        vendaId: d.item.id,
        vendedorId,
        valorCentavos: d.item.valor,
        saldoAnteriorCentavos: d.registro.pendenteCentavos,
        saldoPosteriorCentavos: d.ajuste.pendenteCentavos,
        comissoesVinculadas: [d.item.id],
        dataPagamento,
        forma,
        observacao,
        registradoPor: autor,
        criadoEm: stamp(),
      });
    }
  });
}
export async function ajustarVenda(
  id,
  { status, pago, estornoCentavos, motivo },
) {
  if (
    !["concluida", "cancelada", "devolvida"].includes(status) ||
    !motivo?.trim()
  )
    throw Error("Informe a situação e o motivo.");
  const auditoria = doc(collection(db, COL_COM.auditoria));
  const autor = uid();
  return runTransaction(db, async (tx) => {
    const vr = ref("pf_vendas", id),
      cr = ref(COL_COM.registros, id);
    const [vs, cs] = await Promise.all([tx.get(vr), tx.get(cr)]);
    if (!vs.exists()) throw Error("Venda não encontrada.");
    const anterior = vs.data();
    const sessaoPdv = await prepararAjustePdv(tx, anterior);
    if (
      !Number.isSafeInteger(estornoCentavos) ||
      estornoCentavos < 0 ||
      estornoCentavos > totalCentavos(anterior)
    )
      throw Error("Estorno inválido.");
    const nova = { ...anterior, status, pago, estornoCentavos };
    tx.update(vr, {
      status,
      pago,
      estornoCentavos,
      auditoriaComissaoId: auditoria.id,
    });
    if (cs.exists()) {
      const c = cs.data();
      tx.update(cr, {
        ...calcularComissao(
          nova,
          c.percentualBps,
          { excluirFrete: c.excluirFrete },
          c.pagoCentavos,
        ),
        auditoriaId: auditoria.id,
        atualizadoEm: stamp(),
        atualizadoPor: autor,
      });
    }
    gravarAjustePdv(tx,sessaoPdv,anterior,{...nova,id},cs.exists()?cs.data():null,auditoria.id,motivo.trim());
    tx.set(auditoria, {
      tipo: "ajuste-venda",
      vendaId: id,
      motivo: motivo.trim(),
      antes: {
        status: anterior.status || "concluida",
        pago:
          anterior.pago ??
          !["Fiado", "Convênio"].includes(anterior.formaPagamento),
        estornoCentavos: anterior.estornoCentavos || 0,
      },
      depois: { status, pago, estornoCentavos },
      registradoPor: autor,
      criadoEm: stamp(),
    });
  });
}
export async function carregarCadastros() {
  const [usuarios, configs, base] = await Promise.all([
    getDocs(collection(db, "usuarios")),
    getDocs(collection(db, COL_COM.vendedores)),
    getDoc(ref(COL_COM.config, "base")),
  ]);
  return {
    usuarios: usuarios.docs.map((d) => ({ ...d.data(), id: d.id })),
    configs: new Map(configs.docs.map((d) => [d.id, d.data()])),
    base: politica(base),
  };
}
export function observarPeriodo({ inicio, fim }, alterar, falhar) {
  const estado = { vendas: null, registros: null };
  function receber(chave, snap) {
    estado[chave] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    if (estado.vendas && estado.registros) alterar(estado);
  }
  const filtros = [
    where("criadoEm", ">=", inicio),
    where("criadoEm", "<", fim),
    orderBy("criadoEm", "desc"),
  ];
  const a = onSnapshot(
    query(collection(db, "pf_vendas"), ...filtros),
    (s) => receber("vendas", s),
    falhar,
  );
  const b = onSnapshot(
    query(
      collection(db, COL_COM.registros),
      where("dataVenda", ">=", inicio),
      where("dataVenda", "<", fim),
      orderBy("dataVenda", "desc"),
    ),
    (s) => receber("registros", s),
    falhar,
  );
  return () => {
    a();
    b();
  };
}
export async function consultarHistorico(
  colecao,
  campo,
  inicio,
  fim,
  cursor = null,
  vendedor = null,
) {
  const filtros = [
    where(campo, ">=", inicio),
    where(campo, "<", fim),
    orderBy(campo, "desc"),
    limit(50),
  ];
  if (vendedor) filtros.push(where("vendedorId", "==", vendedor));
  if (cursor) filtros.push(startAfter(cursor));
  const snap = await getDocs(query(collection(db, colecao), ...filtros));
  return {
    itens: snap.docs.map((d) => ({ ...d.data(), id: d.id })),
    cursor: snap.docs.length === 50 ? snap.docs.at(-1) : null,
  };
}
export async function listarPendentes(vendedorId, cursor = null) {
  const filtros = [
    where("vendedorId", "==", vendedorId),
    where("status", "==", "pendente"),
    orderBy("dataVenda", "asc"),
    limit(50),
  ];
  if (cursor) filtros.push(startAfter(cursor));
  const snap = await getDocs(
    query(collection(db, COL_COM.registros), ...filtros),
  );
  return {
    itens: snap.docs.map((d) => ({ ...d.data(), id: d.id })),
    cursor: snap.docs.length === 50 ? snap.docs.at(-1) : null,
  };
}
