import { randomUUID } from "node:crypto";
import {
  configuracaoInicial,
  dataValida,
  segunda,
  somarDias,
  diasSemana,
  jornada,
  validarEscala,
  gerarEscala,
  sugerirTrocas,
  escalaPublica,
  REGRAS_ESCALAS,
  minutos,
  diaSemana,
} from "../js/escalas-core.js";

import { ErroEscala, ehGestorEscalas } from "./escalas-acesso.mjs";
import { lerCalendarioTx } from "./feriados-service.mjs";
export { ErroEscala, ehGestorEscalas } from "./escalas-acesso.mjs";
const exigir = (ok, mensagem, status = 400) => {
  if (!ok) throw new ErroEscala(mensagem, status);
};
const json = (v) => JSON.parse(JSON.stringify(v));
const idValido = (id) =>
  typeof id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
const texto = (s, max = 200) =>
  typeof s === "string" && s.trim().length > 0 && s.length <= max;
const inteiro = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const periodo = (v) =>
  dataValida(v.inicio) && (!v.fim || (dataValida(v.fim) && v.fim >= v.inicio));
const link = (s) => {
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
};
const faixas = (v) =>
  minutos(v.entrada) !== null &&
  minutos(v.saida) !== null &&
  minutos(v.entrada) < minutos(v.saida);
const dados = (s) => (s.exists ? { ...s.data(), id: s.id } : null);
const docs = (s) => s.docs.map(dados);

export function validarPessoa(p) {
  exigir(
    texto(p.nome) && (!p.uid || idValido(p.uid)),
    "Informe nome e vínculo de usuário válidos.",
  );
  exigir(
    Array.isArray(p.contratos) &&
      p.contratos.length > 0 &&
      p.contratos.length <= 100,
    "Cadastre de 1 a 100 versões de contrato.",
  );
  const contratos = [...p.contratos].sort((a, b) =>
    a.inicio.localeCompare(b.inicio),
  );
  contratos.forEach((c, n) => {
    exigir(
      typeof c.podeAbrir === "boolean" && typeof c.podeFechar === "boolean",
      "Informe as autorizações de abertura e fechamento.",
    );
    exigir(
      periodo(c) &&
        inteiro(c.semanais, 1, 2640) &&
        inteiro(c.limiteDiario, 1, 600),
      "Vigência ou minutos contratuais inválidos.",
    );
    exigir(
      texto(c.principal) &&
        texto(c.categoria) &&
        Array.isArray(c.funcoes) &&
        c.funcoes.includes(c.principal) &&
        c.funcoes.length <= 20 &&
        c.funcoes.every((f) => texto(f, 60)),
      "Informe categoria e funções habilitadas, incluindo a função principal.",
    );
    exigir(
      Array.isArray(c.disponibilidade) &&
        c.disponibilidade.length > 0 &&
        c.disponibilidade.length <= 28 &&
        c.disponibilidade.every((d) => inteiro(d.dia, 0, 6) && faixas(d)),
      "Informe a disponibilidade obrigatória por dia e horário.",
    );
    exigir(
      n === 0 || (contratos[n - 1].fim && contratos[n - 1].fim < c.inicio),
      "Contratos não podem sobrepor vigências.",
    );
  });
  exigir(
    Array.isArray(p.eventos) && p.eventos.length <= 300,
    "Lista de eventos inválida.",
  );
  p.eventos.forEach((e) =>
    exigir(
      periodo(e) &&
        e.fim &&
        ["ferias", "afastamento", "obrigatoria", "preferencia"].includes(
          e.tipo,
        ) &&
        ((!e.entrada && !e.saida) || faixas(e)),
      "Evento, restrição ou preferência inválidos.",
    ),
  );
}
export function validarConfig(c) {
  exigir(
    typeof c.coberturaConfirmada === "boolean",
    "Confirmação de cobertura inválida.",
  );
  exigir(
    c.adocao === "2026-12-15" &&
      c.fuso === "America/Sao_Paulo" &&
      c.compensacaoMensal === false,
    "Adoção, fuso ou regime de compensação incompatível.",
  );
  exigir(
    c.municipio === "Luziânia" && c.uf === "GO",
    "A abrangência desta instalação é Luziânia–GO.",
  );
  exigir(
    !c.calendarioConferidoAte || dataValida(c.calendarioConferidoAte),
    "Data de conferência do calendário inválida.",
  );
  for (const [nome, max] of [
    ["funcionamento", 6],
    ["datas", 800],
    ["cobertura", 150],
    ["turnos", 100],
    ["instrumentos", 100],
    ["regras", 100],
    ["criterioTransicao", 300],
  ])
    exigir(
      Array.isArray(c[nome]) && c[nome].length <= max,
      "Limite ou formato inválido em " + nome + ".",
    );
  c.funcionamento.forEach((v) =>
    exigir(
      inteiro(v.dia, 1, 6) && faixas(v),
      "Funcionamento inválido. Domingo permanece fechado.",
    ),
  );
  exigir(
    new Set(c.funcionamento.map((v) => v.dia)).size === c.funcionamento.length,
    "Dia de funcionamento duplicado.",
  );
  c.datas.forEach((v) =>
    exigir(
      dataValida(v.data) &&
        ["feriado", "facultativo", "especial"].includes(v.tipo) &&
        texto(v.nome) &&
        texto(v.localidade) &&
        link(v.fonte) &&
        (v.fechado === true || faixas(v)),
      "Informe data, tipo, fonte oficial, localidade e horário ou fechamento.",
    ),
  );
  exigir(
    new Set(c.datas.map((v) => v.data)).size === c.datas.length,
    "Data especial duplicada.",
  );
  c.turnos.forEach((v) =>
    exigir(
      idValido(v.id) &&
        texto(v.nome) &&
        periodo(v) &&
        jornada({ ...v, tipo: "trabalho" }).valida &&
        Array.isArray(v.dias) &&
        v.dias.length > 0 &&
        v.dias.every((d) => inteiro(d, 0, 6)),
      "Modelo de turno inválido.",
    ),
  );
  c.cobertura.forEach((v) =>
    exigir(
      periodo(v) &&
        faixas(v) &&
        texto(v.funcao, 60) &&
        inteiro(v.quantidade, 1, 200) &&
        typeof v.indispensavel === "boolean" &&
        (dataValida(v.data) || inteiro(v.dia, 0, 6)),
      "Cobertura mínima inválida.",
    ),
  );
  c.instrumentos.forEach((v) => {
    exigir(
      idValido(v.id) &&
        periodo(v) &&
        texto(v.nome) &&
        ["CCT", "ACT"].includes(v.especie) &&
        ["ampliacao", "intervalo", "feriado"].includes(v.tipo) &&
        link(v.documento) &&
        texto(v.sindicatos) &&
        texto(v.clausula, 5000) &&
        texto(v.categoria) &&
        texto(v.municipio) &&
        texto(v.uf),
      "Instrumento coletivo incompleto.",
    );
    exigir(
      v.tipo !== "ampliacao" || inteiro(v.minutos, 481, 600),
      "Ampliação diária deve estar entre 8h01 e 10h.",
    );
    exigir(
      v.tipo !== "intervalo" || inteiro(v.minutos, 30, 120),
      "Intervalo coletivo deve respeitar ao menos 30 minutos.",
    );
    if (v.tipo === "feriado")
      exigir(
        v.especie === "CCT" &&
          link(v.regraMunicipal) &&
          texto(v.condicoes, 5000) &&
          Array.isArray(v.datasAutorizadas) &&
          v.datasAutorizadas.every(dataValida),
        "Feriados exigem CCT, regra municipal, condições e datas autorizadas.",
      );
    if (v.permiteBancoFeriado)
      exigir(
        v.tipo === "feriado" &&
          v.fatorBancoFeriado === 2 &&
          texto(v.clausulaBancoFeriado, 5000),
        "Banco de feriado exige cláusula aplicável e fator 2:1 cadastrado.",
      );
  });
  c.regras.forEach((r) =>
    exigir(
      idValido(r.id) &&
        texto(r.nome) &&
        texto(r.artigo) &&
        link(r.fonte) &&
        texto(r.abrangencia) &&
        periodo(r) &&
        r.tipo === "diaria" &&
        inteiro(r.minutos, 1, 480),
      "Regra complementar inválida. Use a área de instrumentos para exceções.",
    ),
  );
  c.criterioTransicao.forEach((r) =>
    exigir(
      idValido(r.pessoaId) &&
        dataValida(r.semana) &&
        segunda(r.semana) === r.semana &&
        inteiro(r.minutos, 0, 2640) &&
        texto(r.motivo, 2000) &&
        link(r.fonte),
      "Critério de transição incompleto.",
    ),
  );
}
function validarCartoes(turnos, semana) {
  exigir(
    Array.isArray(turnos) && turnos.length <= 1400,
    "Quantidade de cartões inválida.",
  );
  const datas = diasSemana(semana);
  turnos.forEach((t) => {
    exigir(
      !t.compensacaoFeriado ||
        ["pagamento", "banco"].includes(t.compensacaoFeriado),
      "Forma de compensação de feriado inválida.",
    );
    exigir(
      idValido(t.id) &&
        idValido(t.pessoaId) &&
        datas.includes(t.data) &&
        ["trabalho", "folga", "ferias", "afastamento", "feriado"].includes(
          t.tipo,
        ) &&
        typeof t.fixado === "boolean",
      "Cartão fora da semana ou com formato inválido.",
    );
    // Rascunhos incompletos são preservados para correção; publicação é recalculada.
    for (const campo of ["entrada", "almoco", "retorno", "saida"])
      exigir(!t[campo] || minutos(t[campo]) !== null, "Horário inválido.");
    for (const campo of [
      "funcao",
      "atividadeInterna",
      "autorizadoPor",
      "condicoesFeriado",
    ])
      exigir(
        !t[campo] || (typeof t[campo] === "string" && t[campo].length <= 2000),
        "Texto de cartão inválido.",
      );
    exigir(
      !t.trocas ||
        (Array.isArray(t.trocas) &&
          t.trocas.length <= 20 &&
          t.trocas.every(
            (v) => minutos(v.hora) !== null && texto(v.funcao, 60),
          )),
      "Mudanças de função inválidas.",
    );
  });
}
function preservarVersoes(antes, depois, campo) {
  for (const v of antes[campo] || []) {
    const nova = (depois[campo] || []).find((n) => n.id === v.id);
    exigir(
      nova && JSON.stringify(nova) === JSON.stringify(v),
      "Uma versão já salva não pode ser alterada ou removida. Acrescente nova versão com vigência própria.",
    );
  }
}

async function carregar(tx, db, semana) {
  const [configSnap, pessoasSnap, semanasSnap, historicoSnap] =
    await Promise.all([
      tx.get(db.doc("pf_escala_config/loja")),
      tx.get(db.collection("pf_escala_pessoas").orderBy("__name__").limit(201)),
      tx.get(
        db
          .collection("pf_escalas")
          .where("semana", ">=", somarDias(semana, -84))
          .where("semana", "<=", somarDias(semana, 14))
          .orderBy("semana")
          .limit(16),
      ),
      tx.get(
        db
          .collection("pf_escala_historico")
          .where("data", ">=", somarDias(semana, -7))
          .where("data", "<=", somarDias(semana, 13))
          .limit(4501),
      ),
    ]);
  exigir(
    pessoasSnap.docs.length <= 200 && historicoSnap.docs.length <= 4500,
    "Período excede a capacidade desta consulta. Reduza a equipe ativa ou o histórico duplicado.",
  );
  const calendario = await lerCalendarioTx(
    tx,
    db,
    semana,
    somarDias(semana, 6),
  );
  const config = {
      ...(configSnap.exists ? configSnap.data() : configuracaoInicial()),
      feriadosOficiais: calendario.eventos,
      decisoesCalendario: calendario.decisoes,
      calendarioStatus: calendario.status,
      avisosCalendario: calendario.avisos,
    },
    pessoas = docs(pessoasSnap),
    semanas = docs(semanasSnap),
    historico = docs(historicoSnap);
  const atual = semanas.find((s) => s.semana === semana) || {
    semana,
    revisao: 0,
    versao: 0,
    status: "novo",
    turnos: [],
  };
  const registros = new Map(
    historico.map((t) => [`${t.pessoaId}/${t.data}`, t]),
  );
  for (const s of semanas.filter(
    (s) => s.semana !== semana && s.semana >= somarDias(semana, -7),
  )) {
    for (const t of s.turnos) registros.set(`${t.pessoaId}/${t.data}`, t);
  }
  const contexto = { turnos: [...registros.values()], sabados: {} };
  for (const s of semanas.filter((s) => s.semana < semana))
    for (const t of s.turnos.filter(
      (t) => t.tipo === "trabalho" && diaSemana(t.data) === 6,
    ))
      contexto.sabados[t.pessoaId] = (contexto.sabados[t.pessoaId] || 0) + 1;
  // Histórico importado do próprio período cobre, em especial, 14/12/2026.
  const anteriores = historico.filter(
    (t) => diasSemana(semana).includes(t.data) && t.data < config.adocao,
  );
  if (!atual.revisao)
    atual.turnos = anteriores.map((t) => ({
      ...t,
      id: `${t.pessoaId}_${t.data}`,
      fixado: true,
    }));
  return { config, pessoas, semanas, semana, atual, contexto };
}

// Toda gravação e toda publicação leem dados e papel de acesso na mesma transação.
export async function executarEscalas(db, uid, entrada) {
  exigir(idValido(uid), "Sessão inválida.", 401);
  const { acao } = entrada || {};
  exigir(typeof acao === "string", "Ação ausente.");
  const agora = new Date().toISOString(),
    eventoId = randomUUID();
  return db.runTransaction(async (tx) => {
    const perfilSnap = await tx.get(db.doc("usuarios/" + uid));
    exigir(perfilSnap.exists, "Usuário sem cadastro.", 403);
    const perfil = perfilSnap.data(),
      gestor = ehGestorEscalas(perfil);
    exigir(perfil.ativo !== false, "Usuário desativado.", 403);
    if (acao === "minha") {
      exigir(dataValida(entrada.semana), "Semana inválida.");
      const semana = segunda(entrada.semana);
      const indice = await tx.get(db.doc("pf_escala_publicacoes/" + semana));
      if (!indice.exists) return { gestor, publicacao: null };
      const snap = await tx.get(
        db.doc("pf_escalas_publicadas/" + indice.data().id),
      );
      const publicacao = snap.exists ? snap.data() : null;
      if (!publicacao) return { gestor, publicacao: null };
      return {
        gestor,
        publicacao: gestor
          ? publicacao
          : {
              ...publicacao,
              turnos: publicacao.turnos.filter((t) => t.uid === uid),
            },
      };
    }
    exigir(
      gestor,
      "Somente administradores e gestores de escalas podem acessar estes dados.",
      403,
    );
    if (acao === "usuarios") {
      exigir(!entrada.cursor || idValido(entrada.cursor), "Cursor inválido.");
      let consulta = db.collection("usuarios").orderBy("__name__").limit(21);
      if (entrada.cursor) consulta = consulta.startAfter(entrada.cursor);
      const lista = docs(await tx.get(consulta));
      return {
        usuarios: lista.slice(0, 20).map((p) => ({
          id: p.id,
          nome: p.nome || p.email || p.id,
          email: p.email || "",
        })),
        cursor: lista.length > 20 ? lista[19].id : null,
      };
    }
    if (acao === "versoes") {
      exigir(
        dataValida(entrada.semana) &&
          (!entrada.cursor || idValido(entrada.cursor)),
        "Semana ou cursor inválidos.",
      );
      let q = db
        .collection("pf_escalas_versoes")
        .where("semana", "==", segunda(entrada.semana))
        .orderBy("criadoEm", "desc")
        .orderBy("__name__", "desc")
        .limit(11);
      if (entrada.cursor) {
        const cursor = await tx.get(
          db.doc("pf_escalas_versoes/" + entrada.cursor),
        );
        exigir(
          cursor.exists && cursor.data().semana === segunda(entrada.semana),
          "Cursor não pertence a esta semana.",
        );
        q = q.startAfter(cursor);
      }
      const lista = docs(await tx.get(q));
      return {
        versoes: lista.slice(0, 10).map((v) => ({
          id: v.id,
          semana: v.semana,
          versao: v.versao,
          revisao: v.revisao,
          tipo: v.tipo,
          criadoEm: v.criadoEm,
          usuario: v.usuario,
          motivo: v.motivo,
        })),
        cursor: lista.length > 10 ? lista[9].id : null,
      };
    }
    if (acao === "versao") {
      exigir(idValido(entrada.id), "Versão inválida.");
      const v = await tx.get(db.doc("pf_escalas_versoes/" + entrada.id));
      exigir(v.exists, "Versão não encontrada.", 404);
      return { versao: v.data() };
    }
    if (acao === "cadastro") {
      const tipo = entrada.tipo;
      exigir(
        ["config", "pessoa", "historico"].includes(tipo),
        "Tipo de cadastro inválido.",
      );
      exigir(
        tipo !== "pessoa" || idValido(entrada.id),
        "O cadastro de pessoa exige um identificador estável.",
      );
      exigir(
        entrada.valor &&
          typeof entrada.valor === "object" &&
          !Array.isArray(entrada.valor),
        "Dados de cadastro inválidos.",
      );
      const valor = json(entrada.valor),
        id = tipo === "config" ? "loja" : entrada.id || randomUUID();
      exigir(idValido(id), "Identificador inválido.");
      const colecao = {
        config: "pf_escala_config",
        pessoa: "pf_escala_pessoas",
        historico: "pf_escala_historico",
      }[tipo];
      const ref = db.doc(colecao + "/" + id),
        anterior = await tx.get(ref),
        antes = anterior.exists ? anterior.data() : { revisao: 0 };
      const trava = await tx.get(db.doc("pf_escala_controle/revisao"));
      exigir(
        entrada.revisao === antes.revisao,
        "Outra pessoa alterou este cadastro. Atualize antes de salvar.",
        409,
      );
      if (tipo === "config") {
        for (const campo of [
          "feriadosOficiais",
          "decisoesCalendario",
          "calendarioStatus",
          "avisosCalendario",
        ])
          delete valor[campo];
        validarConfig(valor);
        for (const campo of ["turnos", "instrumentos", "regras"])
          preservarVersoes(antes, valor, campo);
      }
      if (tipo === "pessoa") {
        validarPessoa(valor);
        if (valor.uid) {
          const vinculo = await tx.get(db.doc("usuarios/" + valor.uid));
          exigir(vinculo.exists, "O usuário escolhido não existe.");
          const duplicados = await tx.get(
            db
              .collection("pf_escala_pessoas")
              .where("uid", "==", valor.uid)
              .limit(2),
          );
          exigir(
            duplicados.docs.every((d) => d.id === id),
            "Este usuário já está vinculado a outra pessoa.",
          );
        }
        for (const contrato of antes.contratos || []) {
          const novo = valor.contratos.find(
            (c) => c.inicio === contrato.inicio,
          );
          exigir(novo, "Contrato histórico removido.");
          const comparar = { ...novo, fim: contrato.fim };
          exigir(
            JSON.stringify(comparar) === JSON.stringify(contrato),
            "Para alterar o contrato, crie uma nova vigência.",
          );
          exigir(
            novo.fim === contrato.fim ||
              (!contrato.fim &&
                dataValida(novo.fim) &&
                novo.fim >= contrato.inicio),
            "Encerramento contratual inválido.",
          );
        }
      }
      if (tipo === "historico") {
        exigir(
          idValido(valor.pessoaId) &&
            dataValida(valor.data) &&
            ["trabalho", "folga", "ferias", "afastamento", "feriado"].includes(
              valor.tipo,
            ),
          "Histórico inválido.",
        );
        exigir(
          valor.tipo !== "trabalho" || jornada(valor).valida,
          "Histórico exige os horários reais completos.",
        );
        exigir(
          texto(entrada.motivo, 1000),
          "Informe a origem ou o motivo do registro histórico.",
        );
        exigir(
          id === `${valor.pessoaId}_${valor.data}`,
          "O histórico deve usar o identificador pessoa_data.",
        );
        const pessoa = await tx.get(
          db.doc("pf_escala_pessoas/" + valor.pessoaId),
        );
        exigir(pessoa.exists, "Pessoa não cadastrada.");
        valor.id = id;
        valor.fixado = true;
        validarCartoes([valor], segunda(valor.data));
      }
      const salvo = {
        ...valor,
        revisao: antes.revisao + 1,
        atualizadoEm: agora,
        atualizadoPor: uid,
      };
      tx.set(ref, salvo);
      tx.set(db.doc("pf_escala_controle/revisao"), {
        revisao: (trava.data()?.revisao || 0) + 1,
      });
      tx.create(db.doc("pf_escala_auditoria/" + eventoId), {
        tipo,
        alvo: ref.path,
        antes: anterior.exists ? antes : null,
        depois: salvo,
        usuario: uid,
        nome: perfil.nome || uid,
        criadoEm: agora,
        motivo: entrada.motivo || "Cadastro de escala",
      });
      return { valor: { ...salvo, id } };
    }
    exigir(
      ["carregar", "avaliar", "gerar", "salvar", "publicar"].includes(acao),
      "Ação não reconhecida.",
    );
    exigir(
      dataValida(entrada.semana) && segunda(entrada.semana) === entrada.semana,
      "Selecione uma segunda-feira válida.",
    );
    const conjunto = await carregar(tx, db, entrada.semana);
    const { config, pessoas, atual, semana, contexto, semanas } = conjunto;
    if (acao === "carregar")
      return {
        ...conjunto,
        regras: REGRAS_ESCALAS,
        gestor: true,
        resultado: validarEscala({ ...conjunto, turnos: atual.turnos }),
      };
    exigir(
      entrada.revisao === atual.revisao,
      "A semana mudou desde sua última leitura. Recarregue para preservar a edição do outro gestor.",
      409,
    );
    let turnos = json(entrada.turnos || atual.turnos);
    validarCartoes(turnos, semana);
    if (acao === "gerar") turnos = gerarEscala({ ...conjunto, turnos }).turnos;
    const resultado = validarEscala({ ...conjunto, turnos });
    // Recalcula também semanas vizinhas. Turnos já publicados entram como restrições.
    const conflitosVizinhos = [];
    for (const vizinha of semanas.filter(
      (s) =>
        s.semana !== semana &&
        Math.abs(Date.parse(s.semana) - Date.parse(semana)) <= 7 * 86400000,
    )) {
      const antes = validarEscala({
        ...conjunto,
        semana: vizinha.semana,
        turnos: vizinha.turnos,
        contexto: {
          turnos: [
            ...contexto.turnos.filter(
              (t) =>
                !diasSemana(vizinha.semana).includes(t.data) &&
                !diasSemana(semana).includes(t.data),
            ),
            ...atual.turnos,
          ],
        },
      });
      const depois = validarEscala({
        ...conjunto,
        semana: vizinha.semana,
        turnos: vizinha.turnos,
        contexto: {
          turnos: [
            ...contexto.turnos.filter(
              (t) =>
                !diasSemana(vizinha.semana).includes(t.data) &&
                !diasSemana(semana).includes(t.data),
            ),
            ...turnos,
          ],
        },
      });
      for (const a of depois.alertas.filter(
        (a) =>
          a.nivel === "erro" &&
          ["interjornada", "repouso-continuo", "repouso35"].includes(a.codigo),
      )) {
        if (!antes.alertas.some((b) => JSON.stringify(b) === JSON.stringify(a)))
          conflitosVizinhos.push({
            ...a,
            mensagem: "Afeta semana " + vizinha.semana + ": " + a.mensagem,
          });
      }
    }
    resultado.alertas.push(...conflitosVizinhos);
    resultado.podePublicar = !resultado.alertas.some((a) => a.nivel === "erro");
    if (acao === "avaliar")
      return {
        resultado,
        sugestoes: sugerirTrocas({ ...conjunto, turnos }, resultado),
      };
    const publicar = acao === "publicar";
    if (publicar && !resultado.podePublicar)
      throw new ErroEscala(
        "Publicação bloqueada. Corrija as pendências obrigatórias.",
        422,
        resultado,
      );
    exigir(
      atual.versao === 0 || texto(entrada.motivo, 1000),
      "Informe o motivo da alteração de uma semana já publicada.",
    );
    // Um único documento de semana participa de toda transação concorrente.
    // Bloqueio adicional serializa cadastros/históricos com publicações.
    const trava = await tx.get(db.doc("pf_escala_controle/revisao"));
    const revisao = atual.revisao + 1,
      versao = publicar ? atual.versao + 1 : atual.versao;
    const escala = {
      semana,
      revisao,
      versao,
      status: publicar ? "publicada" : "rascunho",
      turnos,
      atualizadoEm: agora,
      atualizadoPor: uid,
      publicadoEm: publicar ? agora : atual.publicadoEm || null,
      publicadoPor: publicar ? uid : atual.publicadoPor || null,
    };
    const versaoId = `${semana}_${String(revisao).padStart(6, "0")}`;
    const snapshot = {
      ...escala,
      criadoEm: agora,
      usuario: uid,
      nomeUsuario: perfil.nome || uid,
      tipo: publicar ? "publicacao" : "rascunho",
      motivo: entrada.motivo || "Planejamento inicial",
      antes: atual.turnos,
      config,
      pessoas,
      resultado,
    };
    exigir(
      Buffer.byteLength(JSON.stringify(snapshot)) < 850000,
      "Snapshot muito grande. Reduza os cadastros do período.",
    );
    tx.set(db.doc("pf_escalas/" + semana), escala);
    tx.create(db.doc("pf_escalas_versoes/" + versaoId), snapshot);
    tx.set(db.doc("pf_escala_controle/revisao"), {
      revisao: (trava.data()?.revisao || 0) + 1,
    });
    if (publicar) {
      const publico = escalaPublica(
        { ...escala, feriados: config.feriadosOficiais },
        pessoas,
      );
      const publicacaoId = `${semana}_v${versao}`;
      tx.create(db.doc("pf_escalas_publicadas/" + publicacaoId), publico);
      tx.set(db.doc("pf_escala_publicacoes/" + semana), {
        id: publicacaoId,
        semana,
        versao,
      });
      for (const decisao of config.decisoesCalendario || []) {
        if (decisao.impactoPendente)
          tx.set(db.doc("pf_calendario_decisoes/" + decisao.data), {
            ...decisao,
            impactoPendente: false,
            revisao: decisao.revisao + 1,
            conferidoNaPublicacao: publicacaoId,
          });
      }
    }
    return {
      atual: escala,
      resultado,
      sugestoes: sugerirTrocas({ ...conjunto, turnos }, resultado),
    };
  });
}
