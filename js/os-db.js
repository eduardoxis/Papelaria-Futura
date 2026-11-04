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
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db, auth } from "./firebase-config.js";
import {
  COL_OS,
  ativoOs,
  validarDadosOs,
  nomePainelOs,
  numeroOs,
  transicaoOs,
  projecaoOs,
  filtrarOs,
  compararFilaOs,
} from "./os-core.js";
const r = (c, id) => doc(db, c, id),
  stamp = () => serverTimestamp(),
  usuario = () => {
    if (!auth.currentUser) throw Error("Entre novamente.");
    return auth.currentUser.uid;
  };
export const novoIdOs = () => doc(collection(db, COL_OS.ordens)).id;
function conferirVersao(o, revisao) {
  if (o.revisao !== revisao)
    throw Error(
      "Esta OS foi alterada em outra tela. Atualize e confira antes de tentar novamente.",
    );
}
function gravar(tx, id, antes, depois, tipo, motivo, eventoId, ator) {
  const registro = {
    ...depois,
    atualizadoEm: stamp(),
    atualizadoPor: usuario(),
    revisao: (antes?.revisao || 0) + 1,
    ultimoEventoId: eventoId,
  };
  tx.set(r(COL_OS.ordens, id), registro);
  tx.set(r(COL_OS.eventos, eventoId), {
    osId: id,
    revisao: registro.revisao,
    tipo,
    motivo: String(motivo || "")
      .trim()
      .slice(0, 1000),
    usuarioId: usuario(),
    usuarioNome: ator.nome || usuario(),
    criadoEm: stamp(),
    antes: antes || null,
    depois: registro,
  });
  tx.set(r(COL_OS.painel, id), projecaoOs(id, registro));
  return registro;
}
async function transacaoSequencialOs(fn) {
  let versao = null;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      return await runTransaction(db, (tx) =>
        fn(tx, (m) => {
          versao = m.revisao;
        }),
      );
    } catch (e) {
      if (e.code !== "permission-denied" || versao === null || tentativa === 4)
        throw e;
      const atual = await getDoc(r(COL_OS.controle, "fila"));
      if ((atual.data()?.revisao || 0) === versao) throw e;
    }
  }
}
export async function salvarOs(
  dados,
  { id = novoIdOs(), revisao = null, motivo = "", eventoId = novoIdOs() } = {},
) {
  const limpo = validarDadosOs(dados);
  return transacaoSequencialOs(async (tx, registrarMeta) => {
    const ator = (await tx.get(r("usuarios", usuario()))).data();
    const [anterior, evento, servico, responsavel, cliente, controle] =
      await Promise.all([
        tx.get(r(COL_OS.ordens, id)),
        tx.get(r(COL_OS.eventos, eventoId)),
        tx.get(r("pf_servicos", limpo.servicoId)),
        tx.get(r("usuarios", limpo.responsavelId)),
        limpo.clienteId
          ? tx.get(r("clientes_cadastro", limpo.clienteId))
          : Promise.resolve(null),
        tx.get(r(COL_OS.controle, "fila")),
      ]);
    if (evento.exists()) {
      if (evento.data().osId !== id) throw Error("Operação inválida.");
      return id;
    }
    const antes = anterior.exists() ? anterior.data() : null;
    if (antes && revisao === null) return id;
    if (antes) {
      conferirVersao(antes, revisao);
      if (!ativoOs(antes)) throw Error("OS encerrada: consulte o histórico.");
    }
    if (!servico.exists() || servico.data().ativo === false)
      throw Error("Selecione um serviço ativo.");
    const u = responsavel.data();
    if (
      !responsavel.exists() ||
      u.ativo === false ||
      !(u.roles || [u.role]).some((c) => ["admin", "operador_os"].includes(c))
    )
      throw Error("O responsável precisa ter permissão de Ordens de Serviço.");
    if (limpo.clienteId && !cliente?.exists())
      throw Error("Cliente não encontrado.");
    const meta = controle.exists()
      ? controle.data()
      : { sequencia: 0, revisao: 0 };
    registrarMeta(meta);
    const proximo = meta.sequencia + 1;
    const c = cliente?.data();
    const novo = {
      ...antes,
      ...limpo,
      clienteNome: c?.nome || limpo.clienteNome,
      clienteTelefone: limpo.clienteTelefone || c?.telefone || "",
      servicoNome: servico.data().nome,
      responsavelNome: u.nome || limpo.responsavelId,
      previsaoConclusao: Timestamp.fromDate(limpo.previsaoConclusao),
      previsaoEntrega: Timestamp.fromDate(limpo.previsaoEntrega),
    };
    novo.clienteExibicao = nomePainelOs(novo.clienteNome);
    if (!antes)
      Object.assign(novo, {
        numero: numeroOs(proximo),
        sequencia: proximo,
        posicaoFila: proximo,
        status: "aguardando",
        ativo: true,
        dataEntrada: stamp(),
        criadoPor: usuario(),
        criadoPorNome: ator.nome || usuario(),
        previsaoOriginalConclusao: novo.previsaoConclusao,
        previsaoOriginalEntrega: novo.previsaoEntrega,
        dataInicio: null,
        dataConclusao: null,
        dataEntrega: null,
        entreguePor: null,
        entregaId: null,
      });
    gravar(
      tx,
      id,
      antes,
      novo,
      antes ? "edicao" : "criacao",
      motivo,
      eventoId,
      ator,
    );
    if (!antes)
      tx.set(r(COL_OS.controle, "fila"), {
        sequencia: proximo,
        revisao: meta.revisao + 1,
        ultimaOsId: id,
        tipo: "criacao",
        atualizadoEm: stamp(),
      });
    return id;
  });
}
export async function mudarStatusOs(
  id,
  status,
  revisao,
  { motivo = "", eventoId = novoIdOs(), local = "Retirada na loja" } = {},
) {
  return runTransaction(db, async (tx) => {
    const ator = (await tx.get(r("usuarios", usuario()))).data();
    const [s, e] = await Promise.all([
      tx.get(r(COL_OS.ordens, id)),
      tx.get(r(COL_OS.eventos, eventoId)),
    ]);
    if (e.exists()) {
      if (e.data().osId !== id) throw Error("Operação inválida.");
      return id;
    }
    if (!s.exists()) throw Error("OS não encontrada.");
    const antes = s.data();
    conferirVersao(antes, revisao);
    if (!transicaoOs(antes.status, status))
      throw Error("Mudança de status inválida.");
    if (status === "cancelado" && !String(motivo).trim())
      throw Error("Informe o motivo do cancelamento.");
    const entregaId = "os_" + id;
    const depois = {
      ...antes,
      status,
      ativo: !["entregue", "cancelado"].includes(status),
    };
    if (status === "em_producao") depois.dataInicio = stamp();
    if (status === "pronto") depois.dataConclusao = stamp();
    if (status === "entregue") {
      depois.dataEntrega = stamp();
      depois.entreguePor = usuario();
      depois.entregaId = entregaId;
      const d = new Date();
      tx.set(r("pf_entregas", entregaId), {
        origem: "os",
        osId: id,
        osNumero: antes.numero,
        cliente: antes.clienteNome,
        local: String(local || "Retirada na loja").slice(0, 250),
        data:
          d.getFullYear() +
          "-" +
          String(d.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(d.getDate()).padStart(2, "0"),
        horaSaida: d.toTimeString().slice(0, 5),
        horaVolta: "",
        criadoPor: usuario(),
        criadoEm: stamp(),
        entregueEm: stamp(),
      });
    }
    gravar(tx, id, antes, depois, "status", motivo, eventoId, ator);
    return id;
  });
}
export async function moverOs(
  id,
  outroId,
  revisao,
  outraRevisao,
  { eventoId = novoIdOs() } = {},
) {
  if (id === outroId) throw Error("Selecione outra posição.");
  return transacaoSequencialOs(async (tx, registrarMeta) => {
    const ator = (await tx.get(r("usuarios", usuario()))).data();
    const [a, b, e, m] = await Promise.all([
      tx.get(r(COL_OS.ordens, id)),
      tx.get(r(COL_OS.ordens, outroId)),
      tx.get(r(COL_OS.eventos, eventoId)),
      tx.get(r(COL_OS.controle, "fila")),
    ]);
    if (e.exists()) return;
    registrarMeta(m.data());
    if (!a.exists() || !b.exists()) throw Error("Fila alterada. Atualize.");
    const x = a.data(),
      y = b.data();
    conferirVersao(x, revisao);
    conferirVersao(y, outraRevisao);
    if (!ativoOs(x) || !ativoOs(y)) throw Error("A OS saiu da fila. Atualize.");
    gravar(
      tx,
      id,
      x,
      { ...x, posicaoFila: y.posicaoFila, parTrocaId: outroId },
      "reordenacao",
      "Troca de posição",
      eventoId,
      ator,
    );
    gravar(
      tx,
      outroId,
      y,
      { ...y, posicaoFila: x.posicaoFila, parTrocaId: id },
      "reordenacao",
      "Troca de posição",
      eventoId + "_par",
      ator,
    );
    tx.set(r(COL_OS.controle, "fila"), {
      ...m.data(),
      revisao: m.data().revisao + 1,
      ultimaOsId: id,
      outraOsId: outroId,
      tipo: "reordenacao",
      atualizadoEm: stamp(),
    });
  });
}
export const buscarOs = async (id) => {
  const s = await getDoc(r(COL_OS.ordens, id));
  if (!s.exists()) throw Error("OS não encontrada.");
  return { ...s.data(), id: s.id };
};
export function observarFilaOs(
  { admin = false, uid = usuario(), painel = false } = {},
  sucesso,
  erro,
) {
  // A fila já carrega todas as OS ativas. Ordenar o snapshot mantém a posição
  // manual sem exigir o índice composto ativo + posicaoFila no Firestore.
  const filtros = painel
    ? [where("ativo", "==", true)]
    : [
        where("ativo", "==", true),
        ...(!admin ? [where("responsavelId", "==", uid)] : []),
      ];
  return onSnapshot(
    query(collection(db, painel ? COL_OS.painel : COL_OS.ordens), ...filtros),
    { includeMetadataChanges: true },
    (s) =>
      sucesso(
        s.docs.map((d) => ({ ...d.data(), id: d.id })).sort(compararFilaOs),
        s.metadata,
      ),
    erro,
  );
}
export async function historicoOs({
  admin = false,
  uid = usuario(),
  cursor = null,
  filtros = {},
  continuar = () => true,
} = {}) {
  const base = [];
  const responsavel = admin ? filtros.responsavel : uid;
  if (responsavel) base.push(where("responsavelId", "==", responsavel));
  // Um filtro seletivo no servidor; os demais são combinados sem multiplicar índices.
  if (filtros.status) base.push(where("status", "==", filtros.status));
  else if (filtros.servico)
    base.push(where("servicoId", "==", filtros.servico));
  else if (filtros.prioridade)
    base.push(where("prioridade", "==", filtros.prioridade));
  if (filtros.entradaDe)
    base.push(
      where(
        "dataEntrada",
        ">=",
        Timestamp.fromDate(new Date(filtros.entradaDe + "T00:00:00")),
      ),
    );
  if (filtros.entradaAte) {
    const fim = new Date(filtros.entradaAte + "T00:00:00");
    fim.setDate(fim.getDate() + 1);
    base.push(where("dataEntrada", "<", Timestamp.fromDate(fim)));
  }
  const itens = [];
  let ultimo = cursor,
    mais = true;
  while (itens.length < 40 && mais && continuar()) {
    const f = [...base, orderBy("dataEntrada", "desc"), limit(40)];
    if (ultimo) f.push(startAfter(ultimo));
    const s = await getDocs(query(collection(db, COL_OS.ordens), ...f));
    mais = s.size === 40;
    for (let i = 0; i < s.docs.length; i++) {
      const d = s.docs[i];
      ultimo = d;
      const ordem = { ...d.data(), id: d.id };
      if (filtrarOs([ordem], filtros).length) itens.push(ordem);
      if (itens.length === 40) {
        mais = mais || i < s.docs.length - 1;
        break;
      }
    }
  }
  return { itens, cursor: ultimo, mais, cancelado: !continuar() };
}
export async function eventosOs(id, cursor = null) {
  const f = [where("osId", "==", id), orderBy("revisao", "desc"), limit(30)];
  if (cursor) f.push(startAfter(cursor));
  const s = await getDocs(query(collection(db, COL_OS.eventos), ...f));
  return {
    itens: s.docs.map((d) => ({ ...d.data(), id: d.id })),
    cursor: s.docs.at(-1),
    mais: s.size === 30,
  };
}
export async function referenciasOs() {
  const [a, b] = await Promise.all([
    getDocs(query(collection(db, "pf_servicos"), orderBy("nome"))),
    getDocs(collection(db, "usuarios")),
  ]);
  return {
    servicos: a.docs.map((d) => ({ ...d.data(), id: d.id })),
    funcionarios: b.docs
      .map((d) => ({ ...d.data(), id: d.id }))
      .filter(
        (u) =>
          u.ativo !== false &&
          (u.roles || [u.role]).some((c) =>
            ["admin", "operador_os"].includes(c),
          ),
      ),
  };
}
export async function clientesOs(busca = "") {
  const f = busca
    ? [
        where("nomeBusca", ">=", busca.toLocaleLowerCase("pt-BR")),
        where("nomeBusca", "<=", busca.toLocaleLowerCase("pt-BR") + "\uf8ff"),
        orderBy("nomeBusca"),
      ]
    : [orderBy("nome")];
  const s = await getDocs(
    query(collection(db, "clientes_cadastro"), ...f, limit(40)),
  );
  return s.docs.map((d) => ({ ...d.data(), id: d.id }));
}
