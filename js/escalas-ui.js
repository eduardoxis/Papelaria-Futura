import { auth } from "./firebase-config.js";
import { temCargo } from "./auth.js";
import { escHtml } from "./index.js";
import { showLoading, hideLoading } from "./loading.js";
import {
  montarCalendarioLoja,
  invalidarCalendario,
  selecionarDataCalendario,
} from "./calendario-ui.js";
import {
  segunda,
  somarDias,
  diasSemana,
  diaSemana,
  hora,
  minutos,
  duracao,
  jornada,
  contratoEm,
  funcionamentoEm,
  escalaPublica,
  modelosEm,
  feriadoEm,
} from "./escalas-core.js";

const e = escHtml;
const NOMES_DIAS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
let estado = null,
  root,
  gestor = false,
  carregando = false,
  ultimaEdicao = null,
  buscaEquipe = "",
  aba = "semana";
let semanaAtual = "2026-12-14",
  usuarios = [],
  cursorUsuarios = null;
const dataTexto = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("pt-BR");
const botao = (id, texto, classe = "btn-secondary") =>
  `<button type="button" class="${classe}" data-es-acao="${id}">${texto}</button>`;
const entrada = (nome, rotulo, tipo = "text", valor = "", attrs = "") =>
  `<label class="es-campo">${rotulo}<input name="${nome}" type="${tipo}" value="${e(valor ?? "")}" ${attrs}></label>`;
const selecao = (nome, rotulo, opcoes, valor = "") =>
  `<label class="es-campo">${rotulo}<select name="${nome}">${opcoes.map(([v, t]) => `<option value="${e(v)}" ${String(v) === String(valor) ? "selected" : ""}>${e(t)}</option>`).join("")}</select></label>`;
const check = (nome, rotulo, marcado = false) =>
  `<label class="es-check"><input name="${nome}" type="checkbox" ${marcado ? "checked" : ""}>${rotulo}</label>`;
function opcoesPessoas() {
  return (estado?.pessoas || []).map((p) => [p.id, p.nome]);
}
function pessoaNome(id) {
  return estado?.pessoas?.find((p) => p.id === id)?.nome || id;
}
function textoTurno(t) {
  return t.tipo === "trabalho"
    ? `${t.entrada || "—"}–${t.saida || "—"} · ${duracao(jornada(t).liquidos)}${t.trocas?.length ? " · " + t.trocas.map((v) => v.hora + " " + v.funcao).join(", ") : ""}`
    : {
        folga: "Folga",
        ferias: "Férias",
        afastamento: "Afastamento",
        feriado: "Feriado",
        indisponivel: "Indisponível",
      }[t.tipo] || "Pendente";
}
function aviso(mensagem, tipo = "success") {
  window.mostrarToast?.(mensagem, tipo);
}
async function api(acao, dados = {}) {
  if (!auth.currentUser) throw Error("Entre novamente no sistema.");
  const token = await auth.currentUser.getIdToken();
  const resposta = await fetch("/api/escalas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ acao, ...dados }),
    cache: "no-store",
  });
  const resultado = await resposta
    .json()
    .catch(() => ({ erro: "O servidor de escalas está indisponível." }));
  if (!resposta.ok) {
    const erro = Error(
      resultado.erro || "Não foi possível concluir a operação.",
    );
    erro.detalhes = resultado.detalhes;
    erro.status = resposta.status;
    throw erro;
  }
  return resultado;
}
async function executar(tarefa) {
  if (carregando) return;
  carregando = true;
  root.setAttribute("aria-busy", "true");
  try {
    await tarefa();
  } catch (erro) {
    if (erro.detalhes && estado) {
      estado.resultado = erro.detalhes;
      render();
    }
    aviso(erro.message, "error");
    if (erro.status === 409)
      aviso(
        "Clique em Atualizar para conferir a versão mais recente.",
        "warning",
      );
  } finally {
    carregando = false;
    root.removeAttribute("aria-busy");
  }
}
export function iniciarEscalas(usuario, perfil) {
  root = document.getElementById("escalasConteudo");
  if (!root) return;
  gestor = temCargo(perfil, "admin") || temCargo(perfil, "gestor_escalas");
  semanaAtual = segunda(
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
  );
  if (semanaAtual < "2026-12-14") semanaAtual = "2026-12-14";
  document.addEventListener("navegacao", (evento) => {
    const ativo = evento.detail.page === "escalas";
    if (ativo && !estado) executar(carregar);
  });
  root.addEventListener("click", (evento) => {
    const b = evento.target.closest("[data-es-acao]");
    if (b) executar(() => acao(b.dataset.esAcao, b));
  });
  root.addEventListener("change", (evento) => {
    if (evento.target.id === "esSemana")
      executar(async () => {
        semanaAtual = segunda(evento.target.value);
        ultimaEdicao = null;
        await carregar();
      });
    if (
      evento.target.id === "esCoberturaData" ||
      evento.target.id === "esCoberturaHora"
    )
      renderCobertura();
  });
  root.addEventListener("input", (evento) => {
    if (evento.target.id === "esBuscaEquipe") {
      buscaEquipe = evento.target.value;
      renderListaEquipe();
    }
  });
  root.addEventListener("dragstart", (evento) => {
    const el = evento.target.closest("[data-es-pessoa], [data-es-cartao]");
    if (!el || !gestor) return;
    evento.dataTransfer.setData(
      "application/x-pf-escala",
      JSON.stringify({
        pessoaId: el.dataset.esPessoa,
        cartaoId: el.dataset.esCartao,
      }),
    );
    evento.dataTransfer.effectAllowed = "move";
  });
  root.addEventListener("dragover", (evento) => {
    if (gestor && evento.target.closest("[data-es-dia]")) {
      evento.preventDefault();
      evento.dataTransfer.dropEffect = "move";
    }
  });
  root.addEventListener("drop", (evento) => {
    const dia = evento.target.closest("[data-es-dia]");
    if (!dia || !gestor) return;
    evento.preventDefault();
    try {
      const dados = JSON.parse(
        evento.dataTransfer.getData("application/x-pf-escala"),
      );
      const t = estado.atual.turnos.find((t) => t.id === dados.cartaoId);
      if (t?.fixado) {
        aviso("Desfixe o cartão antes de mover.", "warning");
        return;
      }
      editarTurno(
        t || { pessoaId: dados.pessoaId, tipo: "trabalho" },
        dia.dataset.esDia,
      );
    } catch {
      aviso("Arraste um colaborador ou um cartão da escala.", "warning");
    }
  });
}
async function carregar() {
  const loader = showLoading(root, "Carregando escalas");
  try {
    // A API da escala já lê o calendário consolidado na mesma transação.
    // Não condicionar toda a seção a uma segunda chamada de inicialização.
    const dados = await api(gestor ? "carregar" : "minha", {
      semana: semanaAtual,
    });
    estado = dados;
    if (gestor) estado.sugestoes = [];
  } catch (erro) {
    if (!estado)
      root.innerHTML = `<div class="card" role="alert"><h2>Gestão de Escalas</h2><p>${e(erro.message)}</p>${botao("atualizar", "Tentar novamente")}</div>`;
    throw erro;
  } finally {
    await hideLoading(root, loader);
  }
  render();
}
function render() {
  if (!estado) return;
  root.innerHTML = `<div class="es-toolbar"><div><h2>Gestão de Escalas</h2><p>Luziânia–GO · America/Sao_Paulo · regime 5×2 a partir de 15/12/2026</p></div>
    <div class="es-acoes">${botao("anterior", "← Semana anterior")}${entrada("semana", "Semana de referência", "date", semanaAtual, 'id="esSemana"')}${botao("proxima", "Próxima semana →")}${botao("atualizar", "Atualizar")}</div></div>
    ${
      gestor
        ? `<nav class="es-abas" aria-label="Gestão de escalas">${[
            ["semana", "Semana"],
            ["equipe", "Equipe e contratos"],
            ["turnos", "Modelos de turno"],
            ["cobertura", "Cobertura mínima"],
            ["calendario", "Calendário da Loja"],
            ["instrumentos", "Instrumentos coletivos"],
            ["regras", "Regras e vigências"],
            ["historico", "Histórico anterior"],
            ["versoes", "Versões salvas"],
          ]
            .map(
              ([id, nome]) =>
                `<button type="button" data-es-acao="aba" data-aba="${id}" aria-pressed="${aba === id}">${nome}</button>`,
            )
            .join("")}</nav>`
        : ""
    }
    <div id="esPainel"></div>`;
  if (!gestor) {
    renderMinha();
    return;
  }
  const painel = document.getElementById("esPainel");
  if (aba === "semana") {
    renderSemana();
    return;
  }
  if (aba === "equipe") {
    painel.innerHTML = `<div class="card"><h3>Colaboradores e contratos</h3><p>Vincule um usuário existente ou cadastre uma pessoa. Novos acessos ao sistema são criados na Administração.</p><div class="es-acoes">${botao("nova-pessoa", "Adicionar colaborador", "btn-primary")}${botao("usuarios", "Buscar usuários cadastrados")}</div><div id="esUsuarios"></div><div id="esEquipeTabela"></div></div>`;
    renderEquipeTabela(0);
    return;
  }
  if (aba === "turnos") {
    painel.innerHTML = `<div class="card"><h3>Modelos de turno com vigência</h3><p>Crie modelos separados para os sábados e almoços alternados para cobrir o atendimento. Para mudar um modelo, crie nova vigência com o mesmo nome.</p>${botao("novo-turno", "Novo modelo", "btn-primary")}<div class="es-grade-cadastros">${estado.config.turnos.map((t) => `<article><h4>${e(t.nome)}</h4><p>${e(t.entrada)}–${e(t.saida)} · ${duracao(jornada({ ...t, tipo: "trabalho" }).liquidos)}</p><p>Almoço ${e(t.almoco || "sem intervalo")} ${e(t.retorno || "")}</p><p>${t.dias.map((d) => NOMES_DIAS[d]).join(", ")}</p><small>${dataTexto(t.inicio)} a ${t.fim ? dataTexto(t.fim) : "prazo aberto"}</small></article>`).join("") || "<p>Nenhum modelo cadastrado.</p>"}</div></div>`;
    return;
  }
  if (aba === "cobertura") {
    painel.innerHTML = `<div class="card"><h3>Cobertura mínima por função e faixa de horário</h3><p>Faixas sobrepostas da mesma função usam o maior mínimo. A mesma pessoa ocupa uma única função em cada instante.</p>${botao("nova-cobertura", "Adicionar cobertura", "btn-primary")}${check("confirmada", "Cobertura conferida e completa", estado.config.coberturaConfirmada)}${botao("confirmar-cobertura", "Salvar confirmação")}<div class="table-wrap"><table class="data-table"><thead><tr><th>Dia/data</th><th>Função</th><th>Horário</th><th>Mínimo</th><th>Indispensável</th><th>Vigência</th><th>Ações</th></tr></thead><tbody>${estado.config.cobertura.map((c, i) => `<tr><td>${e(c.data || NOMES_DIAS[c.dia])}</td><td>${e(c.funcao)}</td><td>${e(c.entrada)}–${e(c.saida)}</td><td>${c.quantidade}</td><td>${c.indispensavel ? "Sim" : "Não"}</td><td>${e(c.inicio)} / ${e(c.fim || "aberta")}</td><td><button class="btn-ghost" data-es-acao="remover-cobertura" data-indice="${i}">Remover</button></td></tr>`).join("")}</tbody></table></div></div>`;
    return;
  }
  if (aba === "calendario") {
    painel.innerHTML =
      '<div class="es-acoes">' +
      botao("funcionamento", "Editar horário habitual") +
      '</div><div id="esCalendarioLoja"></div>';
    montarCalendarioLoja({
      container: document.getElementById("esCalendarioLoja"),
      config: estado.config,
      pessoas: estado.pessoas,
      aoSalvar: carregar,
    });
    return;
  }
  if (aba === "instrumentos") {
    painel.innerHTML = `<div class="card"><h3>Convenções e acordos coletivos</h3><p>A aplicabilidade depende da categoria, município, vigência, pessoas abrangidas e cláusula. O documento fica vinculado por um endereço HTTPS de acesso controlado.</p>${botao("novo-instrumento", "Cadastrar instrumento", "btn-primary")}<div class="es-grade-cadastros">${estado.config.instrumentos.map((i) => `<article><h4>${e(i.nome)} · ${e(i.especie)}</h4><p>${e(i.tipo)} · ${e(i.categoria)} · ${e(i.municipio)}/${e(i.uf)}</p><p>${e(i.inicio)} a ${e(i.fim || "prazo aberto")}</p><p>${e(i.clausula)}</p><p>Aplicabilidade ${i.confirmado ? "confirmada pelo gestor" : "pendente"}</p><a href="${e(i.documento)}" target="_blank" rel="noopener noreferrer">Consultar documento</a></article>`).join("")}</div></div>`;
    return;
  }
  if (aba === "regras") {
    painel.innerHTML = `<div class="card"><h3>Regras aplicadas e vigências</h3><p>O teto semanal limita a programação e preserva contratos mais curtos. A Futura mantém a política interna de 8h diárias sem instrumento coletivo. A compensação mensal excepcional permanece desativada.</p><div class="es-acoes">${botao("nova-regra", "Regra complementar mais restritiva")}${botao("transicao", "Registrar critério de semana de transição")}</div><div class="es-grade-cadastros">${[...estado.regras, ...estado.config.regras].map((r) => `<article><h4>${e(r.nome)}</h4><p>${e(r.artigo)}</p><p>${e(r.abrangencia)}</p><p>${e(r.inicio)} a ${e(r.fim || "prazo aberto")}</p><a href="${e(r.fonte)}" target="_blank" rel="noopener noreferrer">Fonte da regra</a></article>`).join("")}</div></div>`;
    return;
  }
  if (aba === "historico") {
    const registros = estado.contexto.turnos.filter(
      (t) => t.data < semanaAtual,
    );
    painel.innerHTML = `<div class="card"><h3>Histórico necessário ao descanso</h3><p>Informe turnos e repousos anteriores com origem conhecida. Na implantação, registre também segunda-feira, 14/12. Um dia desconhecido permanece pendente.</p>${botao("novo-historico", "Registrar dia anterior", "btn-primary")}<div class="table-wrap"><table class="data-table"><thead><tr><th>Data</th><th>Pessoa</th><th>Situação / horários</th></tr></thead><tbody>${registros.map((t) => `<tr><td>${e(t.data)}</td><td>${e(pessoaNome(t.pessoaId))}</td><td>${e(textoTurno(t))}</td></tr>`).join("")}</tbody></table></div></div>`;
    return;
  }
  if (aba === "versoes") {
    painel.innerHTML = `<div class="card"><h3>Histórico da semana ${dataTexto(semanaAtual)}</h3><div id="esVersoes"></div>${botao("mais-versoes", "Carregar versões")}</div>`;
  }
}
function renderSemana() {
  const { atual, resultado } = estado;
  document.getElementById("esPainel").innerHTML =
    `<div class="es-resumo"><div><span>Semana de ${dataTexto(semanaAtual)}</span><strong>${e(atual.status)} · revisão ${atual.revisao} · publicação ${atual.versao}</strong></div><div><span>Pendências obrigatórias</span><strong>${resultado.alertas.filter((a) => a.nivel === "erro").length}</strong></div><div><span>Equipe cadastrada</span><strong>${estado.pessoas.length}</strong></div></div>
    <div class="es-acoes es-operacoes">${botao("gerar", "Gerar escala", "btn-primary")}${selecao(
      "quantidadeSemanas",
      "Período de geração",
      [
        [1, "Uma semana"],
        [2, "Duas semanas"],
        [3, "Três semanas"],
        [4, "Quatro semanas"],
      ],
      1,
    )}${botao("novo-cartao", "Adicionar turno ou folga")}${botao("validar", "Conferir no servidor")}${ultimaEdicao ? botao("desfazer", "Desfazer última edição") : ""}${botao("publicar", "Publicar semana", "btn-primary")}${botao("imprimir", "Imprimir publicação A4")}</div>
    <div class="es-quadro"><aside class="es-equipe"><h3>Colaboradores</h3><p>Arraste para um dia ou toque em Adicionar.</p><input id="esBuscaEquipe" class="field-input--plain" placeholder="Pesquisar pessoa" value="${e(buscaEquipe)}" aria-label="Pesquisar colaborador"><div id="esListaEquipe"></div></aside><div class="es-semana" role="region" aria-label="Quadro semanal">${diasSemana(
      semanaAtual,
    )
      .map((data) => {
        const loja = funcionamentoEm(estado.config, data),
          lista = atual.turnos.filter((t) => t.data === data);
        return `<section class="es-dia" data-es-dia="${data}" aria-label="${NOMES_DIAS[diaSemana(data)]} ${dataTexto(data)}"><header><h3>${NOMES_DIAS[diaSemana(data)]}</h3><span>${dataTexto(data)}</span><small>${loja.aberto ? loja.entrada + "–" + loja.saida : "Loja fechada"}</small>${feriadoEm(estado.config, data) ? `<small class="es-feriado-dia">${e(feriadoEm(estado.config, data).nome)} · ${e(feriadoEm(estado.config, data).abrangencia || "cadastrado")}</small><button type="button" class="btn-ghost" data-es-acao="abrir-calendario" data-data="${data}">Ver feriado e fonte</button>` : ""}</header><div class="es-cartoes">${lista.map(cartaoHtml).join("") || '<p class="es-vazio">Sem cartões</p>'}</div><button class="btn-ghost" data-es-acao="novo-cartao" data-data="${data}">+ Adicionar</button></section>`;
      })
      .join("")}</div></div>
    <div class="card"><h3>Jornada por colaborador</h3><p>Diferenças indicam programação a conferir. Eventos, férias e implantação exigem avaliação própria do período.</p><div class="table-wrap"><table class="data-table"><thead><tr><th>Colaborador</th><th>Contrato</th><th>Limite aplicável</th><th>Planejadas</th><th>A programar</th><th>Dias</th><th>Folgas</th><th>Sábados</th><th>Sábados anteriores (12 sem.)</th><th>Horas em feriado</th><th>Equivalência prevista 2×</th></tr></thead><tbody>${resultado.resumos.map((r) => `<tr><td>${e(r.nome)}</td><td>${duracao(r.contratadas)}</td><td>${duracao(r.limite)}</td><td>${duracao(r.planejadas)}</td><td>${r.diferenca === null ? "Conferir período" : duracao(r.diferenca)}</td><td>${r.dias}</td><td>${r.repousos}</td><td>${r.sabados}</td><td>${r.sabadosHistorico}</td><td>${duracao(r.minutosFeriado || 0)}</td><td>${duracao(r.equivalenciaFeriado || 0)}</td></tr>`).join("")}</tbody></table></div></div>
    <div class="card"><h3>Cobertura da loja</h3><div class="es-acoes">${selecao(
      "coberturaData",
      "Dia",
      diasSemana(semanaAtual).map((d) => [
        d,
        NOMES_DIAS[diaSemana(d)] + " " + dataTexto(d),
      ]),
      somarDias(semanaAtual, 5),
    ).replace(
      "<select ",
      '<select id="esCoberturaData" ',
    )}${entrada("coberturaHora", "Horário", "time", "12:30", 'id="esCoberturaHora"')}</div><div id="esCobertura"></div></div>
    <div class="card"><h3>Previsão de feriados</h3><p>Horas líquidas e equivalência de pagamento ou banco, conforme a decisão da data e a CCT. Confira a execução antes de lançar.</p>${(resultado.previsoesFeriados || []).map((v) => `<p><strong>${e(pessoaNome(v.pessoaId))}</strong> · ${e(v.data)} · ${e(v.feriado)} · ${duracao(v.trabalhados)} trabalhadas → ${duracao(v.equivalentes)} equivalentes · ${v.modo === "banco" ? "banco 2:1" : "pagamento 2×"}</p>`).join("") || "<p>Sem trabalho planejado em feriado nesta semana.</p>"}</div><div class="card"><h3>Conferência e regras</h3><div class="es-alertas">${alertasHtml(resultado.alertas)}</div><div id="esSugestoes">${sugestoesHtml()}</div></div>`;
  renderListaEquipe();
  renderCobertura();
}
function cartaoHtml(t) {
  const conflitos = estado.resultado.alertas.filter(
    (a) =>
      a.pessoaId === t.pessoaId &&
      (!a.data || a.data === t.data) &&
      a.nivel === "erro",
  );
  return `<article class="es-cartao es-tipo-${e(t.tipo)} ${conflitos.length ? "es-conflito" : ""}" draggable="${!t.fixado}" data-es-cartao="${e(t.id)}"><button type="button" class="es-cartao-abrir" data-es-acao="editar-cartao" data-id="${e(t.id)}"><strong>${e(pessoaNome(t.pessoaId))}</strong><span>${e(t.funcao || "")}</span><span>${e(textoTurno(t))}</span>${t.almoco ? `<small>Almoço ${e(t.almoco)}–${e(t.retorno)}</small>` : ""}${t.fixado ? "<small>Fixado</small>" : ""}${conflitos.length ? `<small>⚠ ${conflitos.length} pendência(s)</small>` : ""}</button><button type="button" class="es-copiar" data-es-acao="copiar-cartao" data-id="${e(t.id)}">Copiar</button></article>`;
}
function renderListaEquipe() {
  const el = document.getElementById("esListaEquipe");
  if (!el) return;
  el.innerHTML =
    estado.pessoas
      .filter((p) =>
        p.nome
          .toLocaleLowerCase("pt-BR")
          .includes(buscaEquipe.toLocaleLowerCase("pt-BR")),
      )
      .map(
        (p) =>
          `<div class="es-colaborador" draggable="true" data-es-pessoa="${e(p.id)}"><strong>${e(p.nome)}</strong><small>${e(contratoEm(p, semanaAtual)?.principal || "Sem contrato no início da semana")}</small><button type="button" class="btn-ghost" data-es-acao="novo-cartao" data-pessoa="${e(p.id)}">Adicionar</button></div>`,
      )
      .join("") ||
    "<p>Nenhuma pessoa encontrada. Cadastre a equipe na aba correspondente.</p>";
}
function alertasHtml(lista) {
  return (
    lista
      .map(
        (a) =>
          `<article class="es-alerta es-alerta-${a.nivel}"><strong>${a.nivel === "erro" ? "Pendência" : "Aviso"}${a.pessoaId ? " · " + e(pessoaNome(a.pessoaId)) : ""}</strong><p>${e(a.mensagem)}</p><small>${e(a.regra.artigo)} · ${e(a.regra.inicio)}${a.regra.fim ? " a " + e(a.regra.fim) : ""}</small>${a.regra.fonte ? `<a href="${e(a.regra.fonte)}" target="_blank" rel="noopener noreferrer">Consultar fonte</a>` : ""}</article>`,
      )
      .join("") || "<p>Conferência concluída sem pendências obrigatórias.</p>"
  );
}
function sugestoesHtml() {
  const lista = estado.sugestoes || [];
  return lista.length
    ? `<h4>Trocas concretas para revisar</h4>${lista.map((s, i) => `<p>${e(s.mensagem)} <button class="btn-secondary" data-es-acao="sugestao" data-indice="${i}">Revisar efeito</button></p>`).join("")}`
    : "<p>Sem troca válida encontrada pelo gerador para as pendências atuais. Ajuste disponibilidades, modelos ou equipe. A geração usa uma busca heurística e pode exigir revisão do gestor.</p>";
}
function renderCobertura() {
  const el = document.getElementById("esCobertura");
  if (!el) return;
  const data = document.getElementById("esCoberturaData").value,
    m = minutos(document.getElementById("esCoberturaHora").value);
  const faixa = estado.resultado.cobertura.find(
    (c) => c.data === data && minutos(c.entrada) <= m && minutos(c.saida) > m,
  );
  el.innerHTML = faixa
    ? `<p><strong>${e(faixa.entrada)}–${e(faixa.saida)}</strong> · Trabalhando ${faixa.trabalhando.map(pessoaNome).map(e).join(", ") || "ninguém"}.</p><p>Almoço ${faixa.almocando.map(pessoaNome).map(e).join(", ") || "ninguém"}.</p><div class="es-grade-cadastros">${faixa.funcoes.map((f) => `<article class="${f.faltam ? "es-conflito" : ""}"><h4>${e(f.funcao)}</h4><p>${f.presentes.map(pessoaNome).map(e).join(", ") || "Sem pessoa escalada"}</p><p>Mínimo ${f.minimo} · faltam ${f.faltam}</p></article>`).join("")}</div>`
    : "<p>Loja fechada ou horário fora do atendimento ao público.</p>";
}
function renderMinha() {
  const pub = estado.publicacao;
  document.getElementById("esPainel").innerHTML = pub
    ? `<div class="card"><h3>Minha escala publicada · versão ${pub.versao}</h3><div class="es-acoes">${botao("imprimir-minha", "Imprimir A4")}</div><div class="es-grade-cadastros">${pub.turnos.map((t) => `<article><h4>${NOMES_DIAS[diaSemana(t.data)]} · ${dataTexto(t.data)}</h4><strong>${e(t.nome)}</strong><p>${e(t.funcao)}</p><p>${e(textoTurno(t))}</p>${t.almoco ? `<p>Almoço ${e(t.almoco)}–${e(t.retorno)}</p>` : ""}</article>`).join("") || "<p>Não há cartões vinculados ao seu usuário nesta publicação. Confira o vínculo com o gestor.</p>"}</div></div>`
    : '<div class="card"><p>Ainda não há escala publicada para esta semana.</p></div>';
}
function abrirFormulario(titulo, corpo, confirmar, label = "Salvar") {
  window.abrirModal(
    titulo,
    `<form id="esFormulario" class="es-form">${corpo}</form>`,
    `<button class="btn-ghost" id="esCancelar" type="button">Cancelar</button><button class="btn-primary" id="esConfirmar" type="submit" form="esFormulario">${label}</button>`,
  );
  document.getElementById("esCancelar").onclick = () => window.fecharModal();
  document.getElementById("esFormulario").onsubmit = (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    if (!form.reportValidity()) return;
    executar(async () => {
      const b = document.getElementById("esConfirmar");
      b.disabled = true;
      try {
        await confirmar(new FormData(form), form);
      } finally {
        if (b.isConnected) b.disabled = false;
      }
    });
  };
}
async function salvarSemana(turnos, motivo, publicar = false) {
  if (publicar) invalidarCalendario();
  const antes = structuredClone(estado.atual.turnos);
  const dados = await api(publicar ? "publicar" : "salvar", {
    semana: semanaAtual,
    revisao: estado.atual.revisao,
    turnos,
    motivo,
  });
  estado = { ...estado, ...dados };
  ultimaEdicao = antes;
  window.fecharModal();
  render();
  aviso(
    publicar
      ? "Escala publicada. Os colaboradores já podem consultar."
      : "Rascunho salvo.",
  );
}
async function previa(turnos, titulo = "Conferir alteração") {
  const resposta = await api("avaliar", {
    semana: semanaAtual,
    revisao: estado.atual.revisao,
    turnos,
  });
  const anteriores = estado.resultado.resumos;
  abrirFormulario(
    titulo,
    `<p>Confira jornada e cobertura antes de salvar. As pendências abaixo correspondem ao resultado da alteração.</p><div class="es-previa-horas">${resposta.resultado.resumos.map((r) => `<p><strong>${e(r.nome)}</strong> · ${duracao(anteriores.find((a) => a.pessoaId === r.pessoaId)?.planejadas || 0)} → ${duracao(r.planejadas)} · ${r.dias} dias</p>`).join("")}</div>${entrada("motivo", "Motivo da alteração", "text", "", estado.atual.versao ? 'required maxlength="1000"' : 'maxlength="1000"')}<div class="es-alertas">${alertasHtml(resposta.resultado.alertas)}</div>`,
    (f) =>
      salvarSemana(turnos, String(f.get("motivo") || "Ajuste de rascunho")),
    "Confirmar e salvar rascunho",
  );
}
function editarTurno(
  original = {},
  destino = null,
  copiar = false,
  historico = false,
) {
  if (!estado.pessoas.length) {
    aviso("Cadastre a equipe primeiro.", "warning");
    return;
  }
  const data = destino || original.data || semanaAtual,
    modelo = modelosEm(estado.config, data)[0];
  const t = { ...modelo, ...original, data };
  const p =
    estado.pessoas.find((p) => p.id === t.pessoaId) || estado.pessoas[0];
  t.pessoaId = p.id;
  abrirFormulario(
    historico
      ? "Registrar histórico conhecido"
      : copiar
        ? "Copiar cartão"
        : "Editar turno ou folga",
    `${selecao("pessoaId", "Colaborador", opcoesPessoas(), t.pessoaId)}${entrada("data", "Data", "date", data, "required")}${selecao(
      "tipo",
      "Situação",
      [
        ["trabalho", "Trabalho"],
        ["folga", "Folga"],
        ["ferias", "Férias"],
        ["afastamento", "Afastamento"],
        ["feriado", "Feriado"],
      ],
      t.tipo || "trabalho",
    )}${entrada("funcao", "Função neste turno", "text", t.funcao || contratoEm(p, data)?.principal || "")}
    <div class="es-form-grid">${entrada("entrada", "Entrada", "time", t.entrada)}${entrada("almoco", "Saída para almoço", "time", t.almoco)}${entrada("retorno", "Retorno", "time", t.retorno)}${entrada("saida", "Saída final", "time", t.saida)}</div>
    <fieldset><legend>Mudanças de função durante a jornada</legend><div id="esTrocasFuncao"></div><button type="button" class="btn-secondary" id="esNovaTroca">Adicionar mudança de função</button></fieldset>
    <div id="esHorasDia" role="status"></div>${check("fixado", "Fixar este turno ou folga ao gerar novamente", !!t.fixado)}
    ${selecao(
      "compensacaoFeriado",
      "Previsão para este colaborador no feriado",
      [
        ["", "Seguir a decisão da data"],
        ["pagamento", "Pagamento em dobro (2×)"],
        ["banco", "Banco em dobro (2:1), conforme CCT"],
      ],
      t.compensacaoFeriado || "",
    )}
    ${entrada("atividadeInterna", "Atividade real fora do atendimento (quando houver)", "text", t.atividadeInterna, 'maxlength="1000"')}${entrada("autorizadoPor", "Responsável pela autorização da atividade", "text", t.autorizadoPor)}${entrada("condicoesFeriado", "Condições da CCT atendidas no feriado", "text", t.condicoesFeriado, 'maxlength="2000"')}
    ${historico ? entrada("motivo", "Origem dos dados / motivo", "text", "", 'required maxlength="1000"') : ""}
    ${original.id && !historico ? '<button type="button" class="btn-danger" id="esRemoverCartao">Remover cartão e conferir efeito</button>' : ""}`,
    async (f) => {
      const novo = {
        id: copiar || !original.id ? crypto.randomUUID() : original.id,
        pessoaId: String(f.get("pessoaId")),
        data: String(f.get("data")),
        tipo: String(f.get("tipo")),
        funcao: String(f.get("funcao")).trim(),
        entrada: String(f.get("entrada")),
        almoco: String(f.get("almoco")),
        retorno: String(f.get("retorno")),
        saida: String(f.get("saida")),
        fixado: f.has("fixado"),
        atividadeInterna: String(f.get("atividadeInterna")).trim(),
        autorizadoPor: String(f.get("autorizadoPor")).trim(),
        condicoesFeriado: String(f.get("condicoesFeriado")).trim(),
        compensacaoFeriado: String(f.get("compensacaoFeriado") || ""),
      };
      novo.trocas = [
        ...document.querySelectorAll("#esTrocasFuncao .es-troca"),
      ].map((linha) => ({
        hora: linha.querySelector("[data-hora-troca]").value,
        funcao: linha.querySelector("[data-funcao-troca]").value.trim(),
      }));
      if (historico) {
        novo.id = `${novo.pessoaId}_${novo.data}`;
        const existente = estado.contexto.turnos.find((t) => t.id === novo.id);
        await api("cadastro", {
          tipo: "historico",
          id: novo.id,
          revisao: existente?.revisao || 0,
          valor: novo,
          motivo: String(f.get("motivo")),
        });
        window.fecharModal();
        await carregar();
        aviso("Histórico registrado.");
        return;
      }
      if (!diasSemana(semanaAtual).includes(novo.data))
        throw Error(
          "Escolha uma data da semana aberta. Para outra semana, use o seletor na tela principal.",
        );
      const destinoExistente = estado.atual.turnos.find(
        (t) =>
          t.id !== novo.id &&
          t.pessoaId === novo.pessoaId &&
          t.data === novo.data,
      );
      if (
        destinoExistente &&
        (destinoExistente.fixado || destinoExistente.tipo !== "folga")
      )
        throw Error(
          "Já existe um cartão de trabalho, evento ou folga fixada no destino. Edite esse cartão primeiro.",
        );
      const turnos = estado.atual.turnos.filter(
        (t) =>
          (copiar || t.id !== original.id) && t.id !== destinoExistente?.id,
      );
      if (
        !copiar &&
        original.id &&
        (original.data !== novo.data || original.pessoaId !== novo.pessoaId)
      )
        turnos.push({
          id: crypto.randomUUID(),
          pessoaId: original.pessoaId,
          data: original.data,
          tipo: "folga",
          fixado: false,
        });
      turnos.push(novo);
      await previa(turnos, "Efeito da edição na jornada e cobertura");
    },
    historico ? "Salvar histórico" : "Conferir efeito",
  );
  const form = document.getElementById("esFormulario");
  const adicionarTroca = (v = {}) => {
    const linha = document.createElement("div");
    linha.className = "es-troca es-form-grid";
    linha.innerHTML = `<label class="es-campo">Mudar às<input type="time" required data-hora-troca value="${e(v.hora || "")}"></label><label class="es-campo">Nova função<input type="text" required maxlength="60" data-funcao-troca value="${e(v.funcao || "")}"></label><button type="button" class="btn-ghost">Remover mudança</button>`;
    linha.querySelector("button").onclick = () => linha.remove();
    document.getElementById("esTrocasFuncao").append(linha);
  };
  document.getElementById("esNovaTroca").onclick = () => adicionarTroca();
  (t.trocas || []).forEach(adicionarTroca);
  const atualizar = () => {
    const f = new FormData(form),
      j = jornada(Object.fromEntries(f));
    document.getElementById("esHorasDia").textContent = j.valida
      ? "Horas líquidas do dia " + duracao(j.liquidos)
      : "Horário incompleto ou fora de ordem.";
  };
  form.addEventListener("input", atualizar);
  atualizar();
  document.getElementById("esRemoverCartao")?.addEventListener("click", () =>
    executar(() =>
      previa(
        estado.atual.turnos.filter((t) => t.id !== original.id),
        "Conferir remoção do cartão",
      ),
    ),
  );
}
async function salvarConfig(
  config,
  motivo = "Atualização de cadastro de escala",
) {
  const r = await api("cadastro", {
    tipo: "config",
    revisao: estado.config.revisao,
    valor: config,
    motivo,
  });
  estado.config = r.valor;
  window.fecharModal();
  await carregar();
  aviso("Configuração salva.");
}
function adicionarConfig(campo, valor) {
  const c = structuredClone(estado.config);
  c[campo].push(valor);
  return salvarConfig(c);
}
function periodoHtml(valor = {}) {
  return `<div class="es-form-grid">${entrada("inicio", "Início da vigência", "date", valor.inicio || semanaAtual, "required")}${entrada("fim", "Fim da vigência (opcional)", "date", valor.fim)}</div>`;
}
function periodoForm(f) {
  return { inicio: String(f.get("inicio")), fim: String(f.get("fim")) || null };
}
function horarioHtml(t = {}) {
  return `<div class="es-form-grid">${entrada("entrada", "Entrada", "time", t.entrada || "08:00", "required")}${entrada("almoco", "Saída para almoço", "time", t.almoco || "12:00")}${entrada("retorno", "Retorno do almoço", "time", t.retorno || "13:00")}${entrada("saida", "Saída final", "time", t.saida || "17:00", "required")}</div>`;
}
function contratoHtml(c = {}) {
  return `${periodoHtml(c)}${entrada("principal", "Função principal", "text", c.principal, "required")}${entrada("funcoes", "Funções que pode cobrir (separadas por vírgula)", "text", c.funcoes?.join(", "), "required")}${entrada("categoria", "Categoria profissional aplicável", "text", c.categoria || estado.config.categoria, "required")}<div class="es-form-grid">${entrada("semanais", "Carga contratual semanal (horas e minutos)", "text", hora(c.semanais || 2400), 'required pattern="[0-9]{1,2}:[0-5][0-9]"')}${entrada("limiteDiario", "Limite diário contratual", "time", hora(c.limiteDiario || 480), "required")}</div>
    <p class="es-ajuda">Na carga semanal use o formato horas:minutos, por exemplo 36:00 ou 40:00.</p>${check("podeAbrir", "Pode abrir a loja", c.podeAbrir)}${check("podeFechar", "Pode fechar a loja", c.podeFechar)}
    ${selecao("modeloPadrao", "Modelo de turno preferido", [["", "Escolher conforme a cobertura"], ...[...new Set(estado.config.turnos.map((t) => t.nome))].map((nome) => [nome, nome])], c.modeloPadrao || "")}
    <fieldset><legend>Disponibilidade obrigatória</legend>${[
      1, 2, 3, 4, 5, 6, 0,
    ]
      .map((d) => {
        const faixa = c.disponibilidade?.find((f) => f.dia === d);
        return `<div class="es-disponibilidade">${check("dia" + d, NOMES_DIAS[d], c.disponibilidade ? !!faixa : d !== 0)}${entrada("de" + d, "Disponível de", "time", faixa?.entrada || "08:00")}${entrada("ate" + d, "Até", "time", faixa?.saida || (d === 6 ? "16:00" : "18:30"))}</div>`;
      })
      .join("")}</fieldset>`;
}
function lerContrato(f) {
  return {
    ...periodoForm(f),
    principal: String(f.get("principal")).trim(),
    funcoes: [
      ...new Set(
        String(f.get("funcoes"))
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ],
    categoria: String(f.get("categoria")).trim(),
    modeloPadrao: String(f.get("modeloPadrao") || ""),
    semanais: lerCarga(String(f.get("semanais"))),
    limiteDiario: minutos(String(f.get("limiteDiario"))),
    podeAbrir: f.has("podeAbrir"),
    podeFechar: f.has("podeFechar"),
    disponibilidade: [1, 2, 3, 4, 5, 6, 0]
      .filter((d) => f.has("dia" + d))
      .map((d) => ({
        dia: d,
        entrada: String(f.get("de" + d)),
        saida: String(f.get("ate" + d)),
      })),
  };
}
function lerCarga(valor) {
  if (!/^\d{1,2}:[0-5]\d$/.test(valor))
    throw Error("Use horas:minutos na carga semanal.");
  const [h, m] = valor.split(":").map(Number);
  return h * 60 + m;
}
function novaPessoa(usuario = null) {
  const cadastroId = crypto.randomUUID();
  abrirFormulario(
    "Cadastrar colaborador",
    `${entrada("nome", "Nome", "text", usuario?.nome, "required")}${entrada("uid", "Usuário vinculado (opcional)", "text", usuario?.id, "readonly")}<p>O vínculo permite consultar a própria escala publicada.</p>${contratoHtml()}`,
    async (f) => {
      const r = await api("cadastro", {
        tipo: "pessoa",
        id: cadastroId,
        revisao: 0,
        valor: {
          nome: String(f.get("nome")).trim(),
          uid: String(f.get("uid")) || null,
          contratos: [lerContrato(f)],
          eventos: [],
        },
      });
      estado.pessoas.push(r.valor);
      window.fecharModal();
      await carregar();
      aviso("Colaborador cadastrado.");
    },
  );
}
function renderEquipeTabela(pagina) {
  const tamanho = 20,
    lista = estado.pessoas.slice(pagina * tamanho, (pagina + 1) * tamanho);
  document.getElementById("esEquipeTabela").innerHTML =
    `<div class="table-wrap"><table class="data-table"><thead><tr><th>Nome</th><th>Função atual</th><th>Vínculo</th><th>Contratos</th><th>Ações</th></tr></thead><tbody>${lista.map((p) => `<tr><td>${e(p.nome)}</td><td>${e(contratoEm(p, semanaAtual)?.principal || "Sem vigência")}</td><td>${p.uid ? "Usuário vinculado" : "Sem acesso vinculado"}</td><td>${p.contratos.length} versão(ões)</td><td><button class="btn-secondary" data-es-acao="contrato" data-id="${p.id}">Contrato / vínculo</button><button class="btn-ghost" data-es-acao="evento" data-id="${p.id}">Férias / restrições</button></td></tr>`).join("")}</tbody></table></div><div class="es-acoes"><button class="btn-secondary" data-es-acao="pagina-equipe" data-pagina="${pagina - 1}" ${pagina ? "" : "disabled"}>Anterior</button><span>Página ${pagina + 1}</span><button class="btn-secondary" data-es-acao="pagina-equipe" data-pagina="${pagina + 1}" ${(pagina + 1) * tamanho < estado.pessoas.length ? "" : "disabled"}>Próxima</button></div>`;
}
function editarContrato(p) {
  const ultimo = p.contratos.at(-1);
  abrirFormulario(
    "Contrato e vínculo de " + p.nome,
    `${entrada("nome", "Nome", "text", p.nome, "required")}${entrada("uid", "ID do usuário vinculado (opcional)", "text", p.uid)}<p>Use “Buscar usuários cadastrados” para consultar os IDs. Uma alteração contratual cria nova vigência e encerra a anterior no dia precedente.</p>${check("novoContrato", "Criar nova vigência contratual")}<details><summary>Histórico de contratos</summary>${p.contratos.map((c) => `<p>${e(c.inicio)} a ${e(c.fim || "aberto")} · ${duracao(c.semanais)} · ${e(c.principal)}</p>`).join("")}</details>${contratoHtml({ ...ultimo, inicio: somarDias(ultimo.inicio, 1) })}`,
    async (f) => {
      const valor = structuredClone(p);
      valor.nome = String(f.get("nome")).trim();
      valor.uid = String(f.get("uid")).trim() || null;
      if (f.has("encerrarContrato")) {
        if (f.has("novoContrato"))
          throw Error(
            "Escolha encerrar o contrato atual ou criar uma nova vigência.",
          );
        const fim = String(f.get("fim"));
        if (!fim)
          throw Error("Informe a data final da vigência para o desligamento.");
        valor.contratos.at(-1).fim = fim;
      }
      if (f.has("novoContrato")) {
        const c = lerContrato(f);
        if (c.inicio <= ultimo.inicio)
          throw Error(
            "A nova vigência deve começar após o início da última versão.",
          );
        if (!valor.contratos.at(-1).fim)
          valor.contratos.at(-1).fim = somarDias(c.inicio, -1);
        valor.contratos.push(c);
      }
      await api("cadastro", {
        tipo: "pessoa",
        id: p.id,
        revisao: p.revisao,
        valor,
      });
      window.fecharModal();
      await carregar();
      aviso("Cadastro salvo.");
    },
  );
  const opcaoEncerrar = document.createElement("div");
  opcaoEncerrar.innerHTML = check(
    "encerrarContrato",
    "Encerrar contrato atual (preencha a data final da vigência)",
  );
  document.getElementById("esFormulario").prepend(opcaoEncerrar);
}
function editarEvento(p) {
  abrirFormulario(
    "Férias, afastamentos e restrições de " + p.nome,
    `<p>Detalhes pessoais são visíveis somente aos gestores.</p>${selecao(
      "tipo",
      "Tipo",
      [
        ["ferias", "Férias"],
        ["afastamento", "Afastamento"],
        ["obrigatoria", "Indisponibilidade obrigatória"],
        ["preferencia", "Preferência negociável"],
      ],
    )}${periodoHtml()}<div class="es-form-grid">${entrada("entrada", "Horário inicial (opcional)", "time")}${entrada("saida", "Horário final (opcional)", "time")}</div>${entrada("descricao", "Descrição / restrição", "text", "", 'maxlength="1000"')}<details><summary>Eventos cadastrados</summary>${p.eventos.map((ev, i) => `<p>${e(ev.tipo)} · ${e(ev.inicio)} a ${e(ev.fim)} · ${e(ev.descricao || "")} <button class="btn-ghost" type="button" data-es-evento-remover="${i}">Remover evento</button></p>`).join("")}</details>`,
    async (f) => {
      const valor = structuredClone(p);
      valor.eventos.push({
        ...periodoForm(f),
        tipo: String(f.get("tipo")),
        entrada: String(f.get("entrada")),
        saida: String(f.get("saida")),
        descricao: String(f.get("descricao")).trim(),
      });
      await api("cadastro", {
        tipo: "pessoa",
        id: p.id,
        revisao: p.revisao,
        valor,
      });
      window.fecharModal();
      await carregar();
      aviso("Evento salvo.");
    },
  );
  document.querySelectorAll("[data-es-evento-remover]").forEach(
    (b) =>
      (b.onclick = () =>
        executar(async () => {
          const valor = structuredClone(p);
          valor.eventos.splice(Number(b.dataset.esEventoRemover), 1);
          await api("cadastro", {
            tipo: "pessoa",
            id: p.id,
            revisao: p.revisao,
            valor,
            motivo: "Remoção de evento da escala",
          });
          window.fecharModal();
          await carregar();
        })),
  );
}
function novoModelo() {
  abrirFormulario(
    "Novo modelo de turno",
    `${entrada("nome", "Nome do modelo", "text", "", "required")}${periodoHtml()}${horarioHtml()}<fieldset><legend>Dias aplicáveis</legend>${[1, 2, 3, 4, 5, 6, 0].map((d) => check("dia" + d, NOMES_DIAS[d], d !== 6 && d !== 0)).join("")}</fieldset>`,
    (f) =>
      adicionarConfig("turnos", {
        id: crypto.randomUUID(),
        nome: String(f.get("nome")).trim(),
        ...periodoForm(f),
        entrada: String(f.get("entrada")),
        almoco: String(f.get("almoco")),
        retorno: String(f.get("retorno")),
        saida: String(f.get("saida")),
        dias: [1, 2, 3, 4, 5, 6, 0].filter((d) => f.has("dia" + d)),
      }),
  );
}
function novaCobertura() {
  abrirFormulario(
    "Cobertura mínima",
    `${selecao(
      "dia",
      "Dia da semana",
      [1, 2, 3, 4, 5, 6].map((d) => [d, NOMES_DIAS[d]]),
      6,
    )}${entrada("data", "Ou somente uma data específica", "date")}${periodoHtml()}${entrada("funcao", "Função", "text", "", "required")}${entrada("quantidade", "Mínimo de pessoas", "number", 1, 'required min="1" max="200"')}<div class="es-form-grid">${entrada("entrada", "De", "time", "08:00", "required")}${entrada("saida", "Até", "time", "16:00", "required")}</div>${check("indispensavel", "Indispensável para publicar", true)}`,
    (f) =>
      adicionarConfig("cobertura", {
        ...periodoForm(f),
        dia: Number(f.get("dia")),
        data: String(f.get("data")) || null,
        funcao: String(f.get("funcao")).trim(),
        quantidade: Number(f.get("quantidade")),
        entrada: String(f.get("entrada")),
        saida: String(f.get("saida")),
        indispensavel: f.has("indispensavel"),
      }),
  );
}
function editarData(indice = null) {
  const v = indice === null ? {} : estado.config.datas[indice];
  abrirFormulario(
    "Calendário por data",
    `${entrada("data", "Data", "date", v.data || semanaAtual, "required")}${entrada("nome", "Nome / motivo", "text", v.nome, "required")}${selecao(
      "tipo",
      "Classificação",
      [
        ["feriado", "Feriado"],
        ["facultativo", "Ponto facultativo"],
        ["especial", "Horário especial"],
      ],
      v.tipo,
    )}${entrada("localidade", "Localidade", "text", v.localidade || "Luziânia–GO", "required")}${entrada("fonte", "Fonte oficial ou documento do horário especial", "url", v.fonte, "required")}${check("fechado", "Loja fechada nesta data", v.fechado)}<div class="es-form-grid">${entrada("entrada", "Abertura", "time", v.entrada || "08:00")}${entrada("saida", "Fechamento", "time", v.saida || "16:00")}</div>`,
    (f) => {
      const c = structuredClone(estado.config),
        valor = {
          data: String(f.get("data")),
          nome: String(f.get("nome")).trim(),
          tipo: String(f.get("tipo")),
          localidade: String(f.get("localidade")).trim(),
          fonte: String(f.get("fonte")).trim(),
          fechado: f.has("fechado"),
          entrada: String(f.get("entrada")),
          saida: String(f.get("saida")),
        };
      if (indice === null) c.datas.push(valor);
      else c.datas[indice] = valor;
      return salvarConfig(c);
    },
  );
}
function novoInstrumento() {
  abrirFormulario(
    "Cadastrar convenção ou acordo coletivo",
    `${entrada("nome", "Nome", "text", "", "required")}${selecao(
      "especie",
      "Espécie",
      [
        ["CCT", "Convenção coletiva (CCT)"],
        ["ACT", "Acordo coletivo (ACT)"],
      ],
    )}${selecao("tipo", "Finalidade", [
      ["ampliacao", "Ampliação diária na transição"],
      ["intervalo", "Intervalo reduzido"],
      ["feriado", "Trabalho no feriado"],
    ])}${periodoHtml()}${entrada("documento", "Link HTTPS do documento", "url", "", "required")}${entrada("registro", "Número de registro (quando disponível)")}${entrada("sindicatos", "Sindicatos e partes", "text", "", "required")}${entrada("categoria", "Categoria abrangida", "text", estado.config.categoria, "required")}${entrada("municipio", "Município abrangido", "text", "Luziânia", "required")}${entrada("uf", "UF", "text", "GO", 'required maxlength="2"')}<label class="es-campo">Cláusula e artigo<textarea name="clausula" required maxlength="5000"></textarea></label>${entrada("minutos", "Limite diário ou intervalo autorizado (minutos)", "number", 504, 'min="30" max="600"')}${entrada("pessoas", "IDs das pessoas abrangidas (vírgulas, vazio para a categoria inteira)")}${entrada("regraMunicipal", "Link da regra municipal para feriados", "url")}${entrada("datasAutorizadas", "Datas de feriado autorizadas (AAAA-MM-DD, separadas por vírgula)")}<label class="es-campo">Condições da cláusula para feriados<textarea name="condicoes" maxlength="5000"></textarea></label>${check("permiteBancoFeriado", "A cláusula autoriza banco de horas para trabalho em feriado, em 2:1")}${entrada("clausulaBancoFeriado", "Cláusula e condições do banco de feriados", "text", "", "maxlength=5000")}${check("confirmado", "Aplicabilidade e documento conferidos pelo gestor")}`,
    (f) =>
      adicionarConfig("instrumentos", {
        id: crypto.randomUUID(),
        ...Object.fromEntries(
          [
            "nome",
            "especie",
            "tipo",
            "documento",
            "registro",
            "sindicatos",
            "categoria",
            "municipio",
            "uf",
            "clausula",
            "regraMunicipal",
            "condicoes",
          ].map((k) => [k, String(f.get(k)).trim()]),
        ),
        ...periodoForm(f),
        minutos: Number(f.get("minutos")),
        pessoas: String(f.get("pessoas"))
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        datasAutorizadas: String(f.get("datasAutorizadas"))
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        confirmado: f.has("confirmado"),
        permiteBancoFeriado: f.has("permiteBancoFeriado"),
        fatorBancoFeriado: 2,
        clausulaBancoFeriado: String(f.get("clausulaBancoFeriado") || ""),
      }),
  );
}
async function listarUsuarios(cursor = null) {
  const r = await api("usuarios", { cursor });
  usuarios = r.usuarios;
  cursorUsuarios = r.cursor;
  document.getElementById("esUsuarios").innerHTML =
    `<div class="es-grade-cadastros">${usuarios.map((u) => `<article><strong>${e(u.nome)}</strong><p>${e(u.email)}</p><small>ID ${e(u.id)}</small><button class="btn-secondary" data-es-acao="usuario-pessoa" data-id="${e(u.id)}">Cadastrar na equipe</button></article>`).join("")}</div>${cursorUsuarios ? botao("mais-usuarios", "Próxima página de usuários") : ""}`;
}
let cursorVersoes = null;
async function listarVersoes() {
  const r = await api("versoes", {
    semana: semanaAtual,
    cursor: cursorVersoes,
  });
  cursorVersoes = r.cursor;
  document
    .getElementById("esVersoes")
    .insertAdjacentHTML(
      "beforeend",
      r.versoes
        .map(
          (v) =>
            `<article class="es-versao"><strong>${e(v.tipo)} · revisão ${v.revisao} · publicação ${v.versao}</strong><p>${new Date(v.criadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · ${e(v.usuario)} · ${e(v.motivo)}</p><button class="btn-secondary" data-es-acao="ver-versao" data-id="${e(v.id)}">Visualizar versão</button></article>`,
        )
        .join("") || "<p>Nenhuma versão encontrada.</p>",
    );
  const b = document.querySelector('[data-es-acao="mais-versoes"]');
  b.disabled = !cursorVersoes;
}
function imprimir(publicacao) {
  const janela = document.createElement("iframe");
  janela.className = "es-impressao";
  janela.title = "Impressão da escala";
  document.body.append(janela);
  const datas = diasSemana(publicacao.semana),
    nomes = [...new Set(publicacao.turnos.map((t) => t.pessoaId))];
  const doc = janela.contentDocument;
  doc.open();
  doc.write(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Escala Papelaria Futura</title><style>@page{size:A4 landscape;margin:12mm}body{font:11px Arial,sans-serif;color:#102449}header{display:flex;gap:20px;align-items:center;border-bottom:2px solid #0038b8}img{width:60px}table{border-collapse:collapse;width:100%;margin-top:20px;table-layout:fixed}td,th{border:1px solid #94a3b8;padding:6px;overflow-wrap:anywhere;vertical-align:top}th{background:#eef3ff}tr{break-inside:avoid}small{display:block;margin-top:3px}footer{margin-top:15px}</style></head><body><header><img src="${location.origin}/img/logo.png" alt=""><div><h1>Papelaria Futura · Escala semanal</h1><p>${dataTexto(datas[0])} a ${dataTexto(datas[6])} · Versão publicada ${publicacao.versao}</p></div></header><table><thead><tr><th>Colaborador</th>${datas.map((d) => `<th>${NOMES_DIAS[diaSemana(d)]}<small>${dataTexto(d)}</small></th>`).join("")}</tr></thead><tbody>${nomes
      .map(
        (id) =>
          `<tr><th>${e(publicacao.turnos.find((t) => t.pessoaId === id).nome)}</th>${datas
            .map((d) => {
              const t = publicacao.turnos.find(
                (t) => t.pessoaId === id && t.data === d,
              );
              return `<td>${t ? e(textoTurno(t)) : "—"}${t?.tipo === "trabalho" ? `<small>${e(t.funcao)}</small>${t.almoco ? `<small>Almoço ${e(t.almoco)}–${e(t.retorno)}</small>` : ""}` : ""}</td>`;
            })
            .join("")}</tr>`,
      )
      .join(
        "",
      )}</tbody></table><footer>Publicada em ${e(publicacao.publicadoEm)} · America/Sao_Paulo · Emitida em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</footer></body></html>`,
  );
  doc.close();
  const concluir = () => {
    janela.contentWindow.focus();
    janela.contentWindow.print();
  };
  janela.onload = concluir;
  janela.contentWindow.onafterprint = () => janela.remove();
}
async function acao(id, b) {
  if (id === "anterior" || id === "proxima") {
    semanaAtual = somarDias(semanaAtual, id === "anterior" ? -7 : 7);
    ultimaEdicao = null;
    cursorVersoes = null;
    await carregar();
    return;
  }
  if (id === "atualizar") {
    ultimaEdicao = null;
    await carregar();
    return;
  }
  if (id === "imprimir-minha") {
    imprimir(estado.publicacao);
    return;
  }
  if (!gestor) throw Error("Ação disponível apenas ao gestor.");
  if (id === "abrir-calendario") {
    selecionarDataCalendario(b.dataset.data);
    aba = "calendario";
    render();
    return;
  }
  if (id === "aba") {
    aba = b.dataset.aba;
    cursorVersoes = null;
    render();
    return;
  }
  if (id === "nova-pessoa") {
    novaPessoa();
    return;
  }
  if (id === "usuarios" || id === "mais-usuarios") {
    await listarUsuarios(id === "mais-usuarios" ? cursorUsuarios : null);
    return;
  }
  if (id === "usuario-pessoa") {
    novaPessoa(usuarios.find((u) => u.id === b.dataset.id));
    return;
  }
  if (id === "pagina-equipe") {
    renderEquipeTabela(Number(b.dataset.pagina));
    return;
  }
  if (id === "contrato") {
    editarContrato(estado.pessoas.find((p) => p.id === b.dataset.id));
    return;
  }
  if (id === "evento") {
    editarEvento(estado.pessoas.find((p) => p.id === b.dataset.id));
    return;
  }
  if (id === "novo-turno") {
    novoModelo();
    return;
  }
  if (id === "nova-cobertura") {
    novaCobertura();
    return;
  }
  if (id === "remover-cobertura") {
    const c = structuredClone(estado.config);
    c.cobertura.splice(Number(b.dataset.indice), 1);
    c.coberturaConfirmada = false;
    await salvarConfig(c, "Remoção de cobertura mínima");
    return;
  }
  if (id === "confirmar-cobertura") {
    const c = structuredClone(estado.config);
    c.coberturaConfirmada = root.querySelector('[name="confirmada"]').checked;
    await salvarConfig(c);
    return;
  }
  if (id === "conferir-calendario") {
    const c = structuredClone(estado.config);
    c.calendarioConferidoAte = root.querySelector(
      '[name="conferidoAte"]',
    ).value;
    await salvarConfig(c);
    return;
  }
  if (id === "nova-data" || id === "editar-data") {
    editarData(id === "editar-data" ? Number(b.dataset.indice) : null);
    return;
  }
  if (id === "funcionamento") {
    abrirFormulario(
      "Funcionamento semanal",
      `<p>Domingos fechados. Datas especiais são cadastradas separadamente.</p>${[
        1, 2, 3, 4, 5, 6,
      ]
        .map((d) => {
          const v = estado.config.funcionamento.find((v) => v.dia === d);
          return `<div class="es-disponibilidade">${check("dia" + d, NOMES_DIAS[d], !!v)}${entrada("de" + d, "Abertura", "time", v?.entrada || "08:00")}${entrada("ate" + d, "Fechamento", "time", v?.saida || "18:30")}</div>`;
        })
        .join("")}`,
      (f) => {
        const c = structuredClone(estado.config);
        c.funcionamento = [1, 2, 3, 4, 5, 6]
          .filter((d) => f.has("dia" + d))
          .map((d) => ({
            dia: d,
            entrada: String(f.get("de" + d)),
            saida: String(f.get("ate" + d)),
          }));
        return salvarConfig(c);
      },
    );
    return;
  }
  if (id === "novo-instrumento") {
    novoInstrumento();
    return;
  }
  if (id === "nova-regra") {
    abrirFormulario(
      "Regra complementar",
      `${entrada("nome", "Nome", "text", "", "required")}${entrada("artigo", "Artigo ou cláusula", "text", "", "required")}${entrada("fonte", "Fonte oficial", "url", "", "required")}${entrada("abrangencia", "Abrangência", "text", "Papelaria Futura, Luziânia–GO", "required")}${periodoHtml()}${entrada("minutos", "Limite diário mais restritivo (minutos)", "number", 480, 'required min="1" max="480"')}`,
      (f) =>
        adicionarConfig("regras", {
          id: crypto.randomUUID(),
          tipo: "diaria",
          ...periodoForm(f),
          nome: String(f.get("nome")),
          artigo: String(f.get("artigo")),
          fonte: String(f.get("fonte")),
          abrangencia: String(f.get("abrangencia")),
          minutos: Number(f.get("minutos")),
        }),
    );
    return;
  }
  if (id === "transicao") {
    abrirFormulario(
      "Critério de transição da semana",
      `${selecao("pessoaId", "Colaborador", opcoesPessoas())}${entrada("semana", "Segunda-feira da semana", "date", semanaAtual, "required")}${entrada("minutos", "Máximo a programar na semana (minutos)", "number", 2400, 'required min="0" max="2640"')}${entrada("motivo", "Critério confirmado pelo responsável", "text", "", 'required maxlength="2000"')}${entrada("fonte", "Fonte / parecer aplicável", "url", "", "required")}`,
      (f) =>
        adicionarConfig("criterioTransicao", {
          pessoaId: String(f.get("pessoaId")),
          semana: String(f.get("semana")),
          minutos: Number(f.get("minutos")),
          motivo: String(f.get("motivo")),
          fonte: String(f.get("fonte")),
        }),
    );
    return;
  }
  if (id === "novo-historico") {
    editarTurno({ tipo: "folga" }, somarDias(semanaAtual, -1), false, true);
    return;
  }
  if (id === "mais-versoes") {
    await listarVersoes();
    return;
  }
  if (id === "ver-versao") {
    const r = await api("versao", { id: b.dataset.id }),
      v = r.versao;
    abrirFormulario(
      "Versão " + v.revisao,
      `<p>${e(v.tipo)} · ${e(v.criadoEm)} · ${e(v.nomeUsuario || v.usuario)}</p><p>${e(v.motivo)}</p><h4>Horários anteriores</h4>${(v.antes || []).map((t) => `<p>${e(v.pessoas.find((p) => p.id === t.pessoaId)?.nome || t.pessoaId)} · ${e(t.data)} · ${e(textoTurno(t))}</p>`).join("")}<h4>Horários desta versão</h4>${v.turnos.map((t) => `<p>${e(v.pessoas.find((p) => p.id === t.pessoaId)?.nome || t.pessoaId)} · ${e(t.data)} · ${e(textoTurno(t))}</p>`).join("")}`,
      async () => {
        if (v.tipo !== "publicacao")
          throw Error(
            "Esta versão é um rascunho. Escolha uma publicação para imprimir.",
          );
        imprimir(escalaPublica(v, v.pessoas));
      },
      "Imprimir esta publicação",
    );
    return;
  }
  if (id === "novo-cartao") {
    editarTurno(
      { pessoaId: b.dataset.pessoa, tipo: "trabalho" },
      b.dataset.data,
    );
    return;
  }
  if (id === "editar-cartao" || id === "copiar-cartao") {
    editarTurno(
      estado.atual.turnos.find((t) => t.id === b.dataset.id),
      null,
      id === "copiar-cartao",
    );
    return;
  }
  if (id === "desfazer") {
    await previa(ultimaEdicao, "Conferir desfazer última edição");
    return;
  }
  if (id === "sugestao") {
    await previa(
      estado.sugestoes[Number(b.dataset.indice)].turnos,
      "Conferir troca sugerida",
    );
    return;
  }
  if (id === "validar") {
    const r = await api("avaliar", {
      semana: semanaAtual,
      revisao: estado.atual.revisao,
      turnos: estado.atual.turnos,
    });
    estado.resultado = r.resultado;
    estado.sugestoes = r.sugestoes;
    render();
    aviso("Conferência atualizada pelo servidor.");
    return;
  }
  if (id === "gerar") {
    const quantidade = Number(
      root.querySelector('[name="quantidadeSemanas"]').value,
    );
    abrirFormulario(
      "Gerar rascunho da escala",
      `<p>Serão geradas ${quantidade} semana(s). Turnos e folgas fixados serão preservados. Se a equipe ou os modelos forem insuficientes, o rascunho terá pendências.</p>${entrada("motivo", "Motivo da geração", "text", "Geração de rascunho", "required")}`,
      async (f) => {
        const primeira = semanaAtual;
        for (let i = 0; i < quantidade; i++) {
          const semana = somarDias(primeira, 7 * i),
            dados = i === 0 ? estado : await api("carregar", { semana });
          await api("gerar", {
            semana,
            revisao: dados.atual.revisao,
            turnos: dados.atual.turnos,
            motivo: String(f.get("motivo")),
          });
        }
        window.fecharModal();
        ultimaEdicao = null;
        await carregar();
        aviso("Rascunhos gerados. Revise as pendências em cada semana.");
      },
      "Gerar e salvar rascunhos",
    );
    return;
  }
  if (id === "publicar") {
    abrirFormulario(
      "Publicar escala semanal",
      `<p>O servidor vai recalcular jornadas, descansos, dados contratuais e cobertura antes de disponibilizar a escala aos colaboradores.</p>${entrada("motivo", "Motivo / observação da publicação", "text", "", 'required maxlength="1000"')}`,
      (f) => salvarSemana(estado.atual.turnos, String(f.get("motivo")), true),
      "Confirmar publicação",
    );
    return;
  }
  if (id === "imprimir") {
    const r = await api("minha", { semana: semanaAtual });
    if (!r.publicacao) throw Error("Publique uma versão antes de imprimir.");
    imprimir(r.publicacao);
  }
}
