import { auth } from "./firebase-config.js";
import { escHtml as e } from "./index.js";
import {
  montarMes,
  eventosDoDia,
  textoDecisao,
  feriadoDaLoja,
  horarioHabitual,
} from "./calendario-core.js";
import { dataValida, somarDias } from "./escalas-core.js";
import { showLoading, hideLoading } from "./loading.js";

const cache = new Map();
let mesSelecionado = new Date()
  .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  .slice(0, 7);
let soPendentes = false;
let dataParaAbrir = null;
export function selecionarDataCalendario(data) {
  mesSelecionado = data.slice(0, 7);
  dataParaAbrir = data;
}
const dataTexto = (data) =>
  new Date(data + "T12:00:00Z").toLocaleDateString("pt-BR");
const rotuloTipo = {
  feriado: "Feriado",
  ponto_facultativo: "Ponto facultativo",
  suspensao: "Suspensão de expediente",
};
const rotuloEsfera = { uniao: "União", goias: "Goiás", luziania: "Luziânia" };
const rotuloAplicacao = {
  confirmada: "Aplicável ao comércio",
  nao_aplicavel: "Informativo; não aplicável ao comércio",
  pendente: "Aplicabilidade ao comércio pendente",
};
export function invalidarCalendario() {
  cache.clear();
}
export async function requisitarCalendario(parametros = {}, corpo = null) {
  if (!auth.currentUser)
    throw Error("Entre novamente para consultar o calendário.");
  const token = await auth.currentUser.getIdToken();
  const query = new URLSearchParams(parametros);
  const resposta = await fetch("/api/feriados?" + query, {
    method: corpo ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + token,
      ...(corpo ? { "Content-Type": "application/json" } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: "no-store",
  });
  const resultado = await resposta
    .json()
    .catch(() => ({ erro: "Servidor de calendário indisponível." }));
  if (!resposta.ok) {
    const erro = Error(resultado.erro);
    erro.status = resposta.status;
    erro.detalhes = resultado.detalhes;
    throw erro;
  }
  return resultado;
}
async function obterAno(ano, forcar = false) {
  const mem = cache.get(ano);
  if (!forcar && mem && Date.now() - mem.em < 300000) return mem.dados;
  const dados = await requisitarCalendario({
    ano: String(ano),
    uf: "GO",
    municipio: "luziania",
  });
  cache.set(ano, { em: Date.now(), dados });
  return dados;
}
export async function garantirCalendarioDaSemana(semana) {
  await obterAno(Number(semana.slice(0, 4)));
  if (somarDias(semana, 6).slice(0, 4) !== semana.slice(0, 4))
    await obterAno(Number(somarDias(semana, 6).slice(0, 4)));
}
function detalhesEvento(evento) {
  return `<article class="cal-evento"><strong>${e(evento.nome)}</strong><p>${rotuloTipo[evento.natureza] || e(evento.natureza)} · ${e(evento.abrangencia)} · ${e(evento.localidade)}</p><p>${e(rotuloAplicacao[evento.aplicabilidade])}</p><p>Público atingido ${e(evento.publico === "geral" ? "Geral" : evento.publico === "administracao_publica" ? "Administração pública" : evento.publico)}</p>${!evento.periodo?.diaInteiro ? `<p>Período ${e(evento.periodo?.inicio)}–${e(evento.periodo?.fim)}</p>` : ""}${(evento.fontes || []).map((f) => `<div class="cal-fonte"><a href="${e(f.url)}" target="_blank" rel="noopener noreferrer">Ver documento oficial</a><small>${e(f.orgao)} · ${e(f.ato)} · ${e(f.artigo)}</small><small>Ato ${e(f.dataAto || "data não identificada")} · Publicação ${e(f.publicadoEm || "não identificada no documento")} · verificado em ${e(f.ultimaVerificacao?.slice(0, 10) || "—")}</small></div>`).join("")}${evento.historicoOficial?.length ? `<details><summary>Versões oficiais anteriores</summary>${evento.historicoOficial.map((v) => `<p>${dataTexto(v.data)} · ato de ${e(v.atoEm)} ${v.fontes.map((f) => `<a href="${e(f.url)}" target="_blank" rel="noopener noreferrer">Documento anterior</a>`).join(" ")}</p>`).join("")}</details>` : ""}</article>`;
}
function painelFontes(dados) {
  return (dados.status || [])
    .map(
      (ano) =>
        `<div class="cal-fontes-status">${Object.entries(ano.esferas || {})
          .map(
            ([esfera, s]) =>
              `<details class="cal-esfera ${s.cobertura === "completa" ? "cal-completa" : ""}"><summary>${rotuloEsfera[esfera]} · ${ano.ano} · ${e(s.cobertura.replaceAll("_", " "))}</summary><p>Última consulta ${e(s.ultimaConsulta?.slice(0, 19).replace("T", " ") || "aguardando")}</p><p>Último sucesso ${e(s.ultimoSucesso?.slice(0, 19).replace("T", " ") || "ainda não registrado")}</p>${(s.pendencias || []).map((p) => `<p>${e(p.erro)} ${p.url ? `<a href="${e(p.url)}" target="_blank" rel="noopener noreferrer">Consultar fonte</a>` : ""}</p>`).join("")}<p>${s.aplicabilidadesPendentes?.length || 0} classificação(ões) para comércio pendente(s).</p></details>`,
          )
          .join("")}</div>`,
    )
    .join("");
}
export function montarCalendarioLoja({
  container,
  config,
  pessoas = [],
  aoSalvar = async () => {},
}) {
  let dados = null,
    ocupado = false;
  const executar = async (tarefa) => {
    if (ocupado) return;
    ocupado = true;
    container.setAttribute("aria-busy", "true");
    try {
      await tarefa();
    } catch (erro) {
      window.mostrarToast?.(erro.message, "error");
      if (!dados)
        container.innerHTML = `<div class="card" role="alert"><h3>Calendário da Loja</h3><p>${e(erro.message)}</p><button type="button" class="btn-secondary" data-cal="recarregar">Tentar novamente</button></div>`;
    } finally {
      ocupado = false;
      container.removeAttribute("aria-busy");
    }
  };
  const carregar = async (forcar = false) => {
    const loader = showLoading(container, "Carregando feriados oficiais");
    try {
      dados = await obterAno(Number(mesSelecionado.slice(0, 4)), forcar);
    } finally {
      await hideLoading(container, loader);
    }
    render();
    if (dataParaAbrir) {
      const data = dataParaAbrir;
      dataParaAbrir = null;
      await abrirDia(data);
    }
  };
  const render = () => {
    const [ano, mes] = mesSelecionado.split("-").map(Number),
      dias = montarMes(ano, mes);
    const hoje = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    });
    const escolha = (data) => dados.decisoes.find((d) => d.data === data);
    const proximos = dados.eventos.filter(
      (f) =>
        feriadoDaLoja(f) &&
        f.data >= (hoje.slice(0, 4) === String(ano) ? hoje : ano + "-01-01") &&
        (!soPendentes || !escolha(f.data) || escolha(f.data).revisaoPendente),
    );
    container.innerHTML = `<div class="card cal-card"><div class="cal-cabecalho"><div><h3>Calendário da Loja</h3><p>Feriados oficiais de Brasil, Goiás e Luziânia · decisões da Papelaria Futura por data</p></div><button type="button" class="btn-secondary" data-cal="sincronizar">Atualizar agora</button></div><div class="cal-navegacao"><button class="btn-ghost" data-cal="ano-anterior" aria-label="Ano anterior">« Ano</button><button class="btn-secondary" data-cal="anterior" aria-label="Mês anterior">← Mês</button><label>Mês e ano<input type="month" id="calMes" value="${mesSelecionado}" min="2026-01" max="2100-12"></label><button class="btn-secondary" data-cal="proximo" aria-label="Próximo mês">Mês →</button><button class="btn-ghost" data-cal="ano-proximo" aria-label="Próximo ano">Ano »</button></div>
      <p class="cal-dica-celular">Deslize o calendário para ver todos os dias.</p><div class="cal-grade-rolagem" tabindex="0" role="region" aria-label="Dias do mês"><div class="cal-semana-nomes" aria-hidden="true">${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => `<span>${d}</span>`).join("")}</div><div class="cal-mes" aria-label="Calendário mensal">${dias
        .map((data) => {
          const eventos = eventosDoDia(dados.eventos, data),
            decisao = escolha(data);
          return `<button type="button" class="cal-dia ${data.slice(0, 7) !== mesSelecionado ? "cal-fora" : ""} ${data === hoje ? "cal-hoje" : ""} ${eventos.some(feriadoDaLoja) ? "cal-feriado" : ""}" data-cal="dia" data-data="${data}" aria-label="${dataTexto(data)} ${e(eventos.map((f) => f.nome).join(", "))}"><span class="cal-numero">${Number(data.slice(-2))}</span>${eventos.map((f) => `<span class="cal-marcador ${f.aplicabilidade === "nao_aplicavel" ? "cal-informativo" : ""}"><strong>${e(f.nome)}</strong><small>${rotuloTipo[f.natureza]} · ${e(f.abrangencia)}</small><small>${feriadoDaLoja(f) ? e(textoDecisao(decisao)) : "Informativo — repartições públicas"}</small></span>`).join("")}${decisao && !eventos.some(feriadoDaLoja) ? `<span class="cal-horario-loja">Horário da loja · ${e(textoDecisao(decisao))}</span>` : ""}${decisao?.impactoPendente ? '<span class="cal-revisao">Escala publicada precisa de revisão</span>' : ""}</button>`;
        })
        .join(
          "",
        )}</div></div><p class="cal-legenda">Clique em qualquer dia para definir o funcionamento. Datas administrativas são informativas. Cada feriado de um novo ano aguarda sua própria decisão.</p></div>
      <div class="card"><div class="cal-cabecalho"><h3>Próximos feriados</h3><label class="es-check"><input type="checkbox" id="calPendentes" ${soPendentes ? "checked" : ""}>Aguardando decisão</label></div><div class="cal-proximos">${proximos.map((f) => `<button type="button" class="cal-proximo" data-cal="dia" data-data="${f.data}"><strong>${dataTexto(f.data)} · ${e(f.nome)}</strong><span>${e(f.abrangencia)} · ${e(textoDecisao(escolha(f.data)))}</span>${f.aplicabilidade === "pendente" ? "<small>Aplicabilidade ao comércio pendente</small>" : ""}</button>`).join("") || "<p>Nenhum feriado identificado neste filtro com as fontes disponíveis. Confira abaixo a cobertura de cada esfera.</p>"}</div></div>
      ${dados.avisos?.length ? `<div class="card"><h3>Retificações oficiais para revisar</h3>${dados.avisos.map((a) => `<article class="es-alerta"><strong>${e(a.antes?.nome || a.depois?.nome)}</strong><p>${e(a.tipo.replaceAll("_", " "))} · datas ${a.datas.map(dataTexto).join(", ")}</p><p>Turnos publicados atingidos ${(a.turnosAtingidos || []).map((t) => `${e(t.nome || t.pessoaId)} ${e(t.data)} ${e(t.entrada)}–${e(t.saida)}`).join(", ") || "nenhum identificado"}</p>${a.datas.map((d) => `<button class="btn-secondary" data-cal="dia" data-data="${d}">Revisar ${dataTexto(d)}</button>`).join("")}</article>`).join("")}</div>` : ""}
      <div class="card"><h3>Cobertura das fontes oficiais</h3><p>Os dados já verificados continuam disponíveis quando um portal falha. Classificações pendentes permanecem identificadas.</p>${painelFontes(dados)}</div>`;
  };
  const abrirDia = async (data) => {
    const atual = await obterAno(Number(data.slice(0, 4))),
      eventos = eventosDoDia(atual.eventos, data),
      decisao = atual.decisoes.find((d) => d.data === data);
    const habitual = horarioHabitual(config, data),
      base = decisao || habitual || { entrada: "", saida: "" };
    window.abrirModal(
      "Calendário da Loja — " + dataTexto(data),
      `<form id="calFormulario" class="es-form"><div>${eventos.length ? eventos.map(detalhesEvento).join("") : "<p>Dia comum nas fontes disponíveis. O horário especial será identificado como decisão da loja.</p>"}</div>${decisao?.revisaoPendente ? `<div class="es-alerta">${e(decisao.motivoRevisao)}</div>` : ""}<fieldset class="cal-opcoes"><legend>Funcionamento da Futura nesta data</legend>${[
        ["normal", "Abrir no horário normal"],
        ["especial", "Abrir em horário especial"],
        ["fechado", "Fechar a loja"],
      ]
        .map(
          ([v, t]) =>
            `<label><input type="radio" name="situacao" value="${v}" ${(decisao?.situacao || "normal") === v ? "checked" : ""}>${t}</label>`,
        )
        .join(
          "",
        )}</fieldset>${!habitual ? "<p>Esse dia não tem horário habitual. Para abrir no domingo, informe abertura e fechamento.</p>" : ""}<div class="es-form-grid"><label class="es-campo">Abertura<input type="time" name="entrada" value="${e(base.entrada || "")}"></label><label class="es-campo">Fechamento<input type="time" name="saida" value="${e(base.saida || "")}"></label></div><label class="es-campo">Previsão se houver trabalho no feriado<select name="compensacaoFeriado"><option value="pagamento" ${decisao?.compensacaoFeriado !== "banco" ? "selected" : ""}>Pagamento em dobro (2×)</option><option value="banco" ${decisao?.compensacaoFeriado === "banco" ? "selected" : ""}>Banco em dobro (2:1), conforme instrumento aplicável</option></select></label><p class="es-ajuda">A equivalência usa as horas líquidas de cada colaborador. A jornada contratual conta as horas efetivamente planejadas. O banco exige cláusula válida; a escala apresenta uma previsão.</p><div id="calImpacto" aria-live="polite"></div><p id="calErro" role="alert"></p></form>`,
      `<button type="button" class="btn-ghost" id="calCancelar">Cancelar</button><button type="submit" form="calFormulario" class="btn-primary" id="calSalvar">Conferir e salvar</button>`,
    );
    let previa = null,
      salvando = false;
    const form = document.getElementById("calFormulario"),
      salvar = document.getElementById("calSalvar");
    document.getElementById("calCancelar").onclick = () => window.fecharModal();
    const definirCampos = () => {
      const modo = form.querySelector('[name="situacao"]:checked').value;
      for (const nome of ["entrada", "saida"]) {
        const input = form.elements[nome];
        input.disabled = modo === "fechado";
        input.required = modo !== "fechado";
        if (modo === "normal" && habitual) input.value = habitual[nome];
      }
    };
    form.addEventListener("change", (evento) => {
      previa = null;
      salvar.textContent = "Conferir e salvar";
      if (evento.target.name === "situacao") definirCampos();
    });
    definirCampos();
    form.onsubmit = async (evento) => {
      evento.preventDefault();
      if (salvando || !form.reportValidity()) return;
      salvando = true;
      salvar.disabled = true;
      try {
        const f = new FormData(form),
          valor = {
            data,
            situacao: String(f.get("situacao")),
            entrada: String(f.get("entrada") || ""),
            saida: String(f.get("saida") || ""),
            compensacaoFeriado: String(f.get("compensacaoFeriado")),
          };
        if (!previa || previa.valorConferido !== JSON.stringify(valor)) {
          previa = await requisitarCalendario(
            { acao: "simular_decisao" },
            { decisao: valor },
          );
          previa.valorConferido = JSON.stringify(valor);
          const impacto = previa.impacto,
            linhas = [...impacto.publicados, ...impacto.rascunho];
          document.getElementById("calImpacto").innerHTML =
            `<div class="${impacto.publicados.length ? "es-alerta" : "cal-confirmacao"}"><strong>${impacto.publicados.length ? "Há escala publicada atingida" : "Confira a decisão"}</strong><p>${dataTexto(data)} · ${e(textoDecisao(valor))}</p>${linhas.length ? `<p>Colaboradores e turnos afetados</p><ul>${linhas.map((t) => `<li>${e(t.nome || pessoas.find((p) => p.id === t.pessoaId)?.nome || t.pessoaId)} · ${e(t.entrada)}–${e(t.saida)} ${e(t.funcao || "")}</li>`).join("")}</ul>` : "<p>Nenhum turno existente identificado para esta data.</p>"}<p>A versão já publicada ficará disponível aos colaboradores até uma nova publicação da escala.</p></div>`;
          salvar.textContent = "Confirmar decisão";
          return;
        }
        const r = await requisitarCalendario(
          { acao: "decisao" },
          {
            decisao: valor,
            revisao: decisao?.revisao || 0,
            configRevisao: previa.configRevisao,
            confirmarImpacto: true,
          },
        );
        atual.decisoes = atual.decisoes
          .filter((d) => d.data !== data)
          .concat(r.decisao);
        cache.set(Number(data.slice(0, 4)), { em: Date.now(), dados: atual });
        window.fecharModal();
        await carregar(true);
        await aoSalvar();
        window.mostrarToast?.(
          "Funcionamento salvo para " + dataTexto(data) + ".",
          "success",
        );
      } catch (erro) {
        const campo = document.getElementById("calErro");
        if (campo) campo.replaceChildren(document.createTextNode(erro.message));
        else window.mostrarToast?.(erro.message, "error");
      } finally {
        salvando = false;
        if (salvar.isConnected) salvar.disabled = false;
      }
    };
  };
  container.addEventListener("click", (evento) => {
    const b = evento.target.closest("[data-cal]");
    if (!b) return;
    executar(async () => {
      const acao = b.dataset.cal;
      if (acao === "dia") {
        await abrirDia(b.dataset.data);
        return;
      }
      if (acao === "sincronizar") {
        await requisitarCalendario(
          { acao: "sincronizar" },
          { ano: Number(mesSelecionado.slice(0, 4)) },
        );
        cache.delete(Number(mesSelecionado.slice(0, 4)));
        await carregar(true);
        await aoSalvar();
        return;
      }
      if (acao === "recarregar") {
        await carregar(true);
        return;
      }
      const [ano, mes] = mesSelecionado.split("-").map(Number),
        data = new Date(Date.UTC(ano, mes - 1, 1));
      if (acao === "ano-anterior" || acao === "ano-proximo")
        data.setUTCFullYear(ano + (acao === "ano-anterior" ? -1 : 1));
      else
        data.setUTCMonth(data.getUTCMonth() + (acao === "anterior" ? -1 : 1));
      const novo = data.toISOString().slice(0, 7);
      if (novo < "2026-01" || novo > "2100-12")
        throw Error("Calendário disponível a partir de 2026.");
      mesSelecionado = novo;
      await carregar();
    });
  });
  container.addEventListener("change", (evento) => {
    if (evento.target.id === "calPendentes") {
      soPendentes = evento.target.checked;
      render();
    }
    if (evento.target.id === "calMes")
      executar(async () => {
        const valor = evento.target.value;
        if (!dataValida(valor + "-01")) throw Error("Escolha mês e ano.");
        mesSelecionado = valor;
        await carregar();
      });
  });
  executar(() => carregar());
}
