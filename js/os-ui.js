import { temCargo } from "./auth.js";
import {
  STATUS_OS,
  PRIORIDADES_OS,
  ativoOs,
  prazoOs,
  milisOs,
  filtrarOs,
  normalizarOs,
  erroConsultaOs,
} from "./os-core.js";
import {
  novoIdOs,
  salvarOs,
  mudarStatusOs,
  moverOs,
  buscarOs,
  observarFilaOs,
  historicoOs,
  eventosOs,
  referenciasOs,
  clientesOs,
} from "./os-db.js";
export const escOs = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const horaOs = (v) =>
  Number.isFinite(milisOs(v))
    ? new Date(milisOs(v)).toLocaleString("pt-BR")
    : "—";
const $ = (id) => document.getElementById(id),
  esc = escOs;
let usuario,
  perfil,
  admin = false,
  ordens = [],
  historico = [],
  cursor = null,
  mais = false,
  modo = "fila",
  estadoFila = "carregando",
  desligar = null,
  timer = null,
  consultaHistorico = 0,
  filtroTimer = null,
  references = { servicos: [], funcionarios: [] };
const podeOs = (p) => temCargo(p, "admin") || temCargo(p, "operador_os");
const toast = (t, k = "error") => window.mostrarToast?.(t, k, 8000);
async function fazer(b, fn) {
  if (b?.disabled) return;
  if (b) b.disabled = true;
  try {
    await fn();
  } catch (e) {
    console.error(e);
    const aviso = erroConsultaOs(e);
    if (aviso.indice) {
      $("osConexao").textContent = aviso.mensagem;
      if (admin) {
        const link = document.createElement("a");
        link.href = aviso.indice;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = " Criar índice no Firebase";
        $("osConexao").append(link);
      }
    }
    toast(aviso.mensagem);
  } finally {
    if (b?.isConnected) b.disabled = false;
  }
}
function modal(t, b, f) {
  window.abrirModal(t, b, f, { tamanho: "lg" });
  $("modalBody").scrollTop = 0;
}
function filtros() {
  return {
    busca: $("osBusca").value,
    status: $("osStatus").value,
    responsavel: $("osResponsavel").value,
    servico: $("osServico").value,
    prioridade: $("osPrioridade").value,
    atrasado: $("osAtrasado").checked,
    entradaDe: $("osEntradaDe").value,
    entradaAte: $("osEntradaAte").value,
    previsaoDe: $("osPrevisaoDe").value,
    previsaoAte: $("osPrevisaoAte").value,
  };
}
function botao(acao, id, texto, desabilitado = false) {
  return (
    '<button class="btn-secondary" data-os-acao="' +
    acao +
    '" data-os-id="' +
    esc(id) +
    '" ' +
    (desabilitado ? "disabled" : "") +
    ">" +
    texto +
    "</button>"
  );
}
function acoes(o) {
  const index = ordens.findIndex((a) => a.id === o.id);
  let h =
    botao("detalhes", o.id, "Detalhes") + botao("eventos", o.id, "Histórico");
  if (ativoOs(o)) {
    if (admin)
      h +=
        botao("editar", o.id, "Editar") +
        botao("subir", o.id, "↑ Subir", index <= 0) +
        botao(
          "descer",
          o.id,
          "↓ Descer",
          index < 0 || index === ordens.length - 1,
        );
    const t = {
      aguardando: ["em_producao", "Iniciar produção"],
      em_producao: ["pronto", "Marcar pronto"],
      pronto: ["entregue", "Registrar entrega"],
    }[o.status];
    if (t) h += botao(t[0], o.id, t[1]);
    if (admin) h += botao("cancelado", o.id, "Cancelar");
  }
  return h;
}
function render() {
  if (!$("osLista")) return;
  const lista = filtrarOs(modo === "fila" ? ordens : historico, filtros());
  $("osModoTitulo").textContent =
    modo === "fila" ? "Fila de execução" : "Histórico de OS";
  if (modo === "fila" && estadoFila !== "pronta" && !ordens.length) {
    const mensagem =
      estadoFila === "erro"
        ? "Fila indisponível. Confira o aviso acima e clique em Atualizar."
        : "Carregando ordens de serviço…";
    $("osResumo").textContent =
      estadoFila === "erro"
        ? "Não foi possível consultar as ordens."
        : "Consultando a fila…";
    $("osLista").innerHTML = "<p>" + esc(mensagem) + "</p>";
    $("osMais").hidden = true;
    return;
  }
  $("osResumo").textContent =
    lista.length +
    " ordens exibidas" +
    (modo === "historico"
      ? " · Pesquisa em todo o histórico."
      : " · " + ordens.length + " ativas");
  $("osMais").hidden = modo !== "historico" || !mais;
  $("osLista").innerHTML =
    '<div class="table-wrap"><table class="data-table os-tabela"><thead><tr><th>OS / prioridade</th><th>Cliente / serviço</th><th>Quem está fazendo</th><th>Entrada</th><th>Conclusão prevista</th><th>Entrega prevista</th><th>Status / prazo</th><th>Ações</th></tr></thead><tbody>' +
    lista
      .map((o) => {
        const prazo = prazoOs(o);
        return (
          "<tr><td><strong>" +
          esc(o.numero) +
          '</strong><br><span class="os-prioridade-' +
          esc(o.prioridade) +
          '">' +
          esc(PRIORIDADES_OS[o.prioridade]) +
          "</span></td><td>" +
          esc(o.clienteNome) +
          "<br><strong>" +
          esc(o.servicoNome) +
          "</strong></td><td>" +
          esc(o.responsavelNome) +
          "</td><td>" +
          esc(horaOs(o.dataEntrada)) +
          "</td><td>" +
          esc(horaOs(o.previsaoConclusao)) +
          "</td><td>" +
          esc(horaOs(o.previsaoEntrega)) +
          '</td><td><span class="os-pill os-status-' +
          esc(o.status) +
          '">' +
          esc(STATUS_OS[o.status]) +
          '</span><br><span class="os-pill ' +
          prazo.classe +
          '">' +
          esc(prazo.texto) +
          '</span></td><td><div class="os-acoes">' +
          acoes(o) +
          "</div></td></tr>"
        );
      })
      .join("") +
    "</tbody></table></div>" +
    (!lista.length ? "<p>Nenhuma ordem encontrada.</p>" : "");
}
function preencherFiltros() {
  const fontes = [
    ...ordens,
    ...historico,
    ...references.funcionarios.map((u) => ({
      responsavelId: u.id,
      responsavelNome: u.nome,
    })),
    ...references.servicos.map((s) => ({
      servicoId: s.id,
      servicoNome: s.nome,
    })),
  ];
  for (const [id, campo, nome] of [
    ["osResponsavel", "responsavelId", "responsavelNome"],
    ["osServico", "servicoId", "servicoNome"],
  ]) {
    const el = $(id),
      atual = el.value;
    const valores = [
      ...new Map(
        fontes.filter((o) => o[campo]).map((o) => [o[campo], o[nome]]),
      ).entries(),
    ];
    if (atual && !valores.some(([k]) => k === atual))
      valores.push([atual, el.selectedOptions[0]?.textContent || atual]);
    el.innerHTML =
      '<option value="">Todos</option>' +
      valores
        .map(
          ([k, v]) => '<option value="' + esc(k) + '">' + esc(v) + "</option>",
        )
        .join("");
    el.value = valores.some(([k]) => k === atual) ? atual : "";
  }
}
async function carregarHistorico(reiniciar = false) {
  clearTimeout(filtroTimer);
  const consulta = ++consultaHistorico;
  if (reiniciar) {
    historico = [];
    cursor = null;
  }
  $("osResumo").textContent = "Pesquisando no histórico…";
  const s = await historicoOs({
    admin,
    uid: usuario.uid,
    cursor,
    filtros: filtros(),
    continuar: () => consulta === consultaHistorico && modo === "historico",
  });
  if (s.cancelado) return;
  historico.push(...s.itens);
  cursor = s.cursor;
  mais = s.mais;
  preencherFiltros();
  render();
}
function conectar() {
  if (desligar || !podeOs(perfil)) return;
  $("osConexao").textContent = "Conectando…";
  desligar = observarFilaOs(
    { admin, uid: usuario.uid },
    (itens, m) => {
      estadoFila = m.fromCache ? "carregando" : "pronta";
      ordens = itens;
      $("osConexao").textContent = m.fromCache
        ? "Sem confirmação do servidor. As informações podem estar desatualizadas."
        : "Fila atualizada em tempo real";
      $("osConexao").classList.toggle("erro", m.fromCache);
      preencherFiltros();
      render();
      renderEntregas();
    },
    (e) => {
      const aviso = erroConsultaOs(e);
      estadoFila = "erro";
      if (["permission-denied", "unauthenticated"].includes(e.code))
        ordens = [];
      $("osConexao").textContent = aviso.mensagem;
      if (aviso.indice && admin) {
        const link = document.createElement("a");
        link.href = aviso.indice;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = " Criar índice no Firebase";
        $("osConexao").append(link);
      }
      $("osConexao").classList.add("erro");
      render();
      renderEntregas();
      toast(aviso.mensagem);
      desligar?.();
      desligar = null;
      clearInterval(timer);
      timer = null;
    },
  );
  timer = setInterval(() => {
    render();
    renderEntregas();
  }, 30000);
}
function desconectar() {
  desligar?.();
  desligar = null;
  clearInterval(timer);
  timer = null;
}
export function iniciarOs(u, p) {
  usuario = u;
  perfil = p;
  admin = temCargo(p, "admin");
  if (!podeOs(p)) return;
  $("osConteudo").innerHTML =
    '<div class="os-toolbar"><div><h3 id="osModoTitulo">Fila de execução</h3><p id="osResumo"></p></div><div class="os-acoes"><button class="btn-secondary" id="osFila">Gerenciar fila</button><button class="btn-secondary" id="osHistorico">Histórico de OS</button><a class="btn-secondary" href="/os/painel" target="_blank" rel="noopener">Abrir painel da fila</a>' +
    (admin
      ? '<button class="btn-secondary" id="osTipos">Tipos de serviço</button><button class="btn-primary" id="osNova">Nova Ordem de Serviço</button>'
      : "") +
    '</div></div><p class="os-conexao" id="osConexao" role="status"></p><div class="os-filtros"><label>Pesquisar OS, cliente, serviço ou responsável<input id="osBusca" type="search"></label><label>Status<select id="osStatus"><option value="">Todos</option>' +
    Object.entries(STATUS_OS)
      .map(([k, v]) => '<option value="' + k + '">' + v + "</option>")
      .join("") +
    '</select></label><label>Funcionário<select id="osResponsavel"><option value="">Todos</option></select></label><label>Serviço<select id="osServico"><option value="">Todos</option></select></label><label>Prioridade<select id="osPrioridade"><option value="">Todas</option>' +
    Object.entries(PRIORIDADES_OS)
      .map(([k, v]) => '<option value="' + k + '">' + v + "</option>")
      .join("") +
    '</select></label><label>Entrada de<input type="date" id="osEntradaDe"></label><label>Entrada até<input type="date" id="osEntradaAte"></label><label>Conclusão prevista de<input type="date" id="osPrevisaoDe"></label><label>Conclusão prevista até<input type="date" id="osPrevisaoAte"></label><label><span><input type="checkbox" id="osAtrasado" style="width:auto;min-height:0"> Somente atrasados</span></label><button class="btn-secondary" id="osLimpar">Limpar filtros</button><button class="btn-secondary" id="osAtualizar">Atualizar</button></div><div id="osLista"></div><button class="btn-secondary" id="osMais" hidden>Carregar mais ordens</button>';
  $("osFila").onclick = () => {
    consultaHistorico++;
    clearTimeout(filtroTimer);
    modo = "fila";
    render();
  };
  $("osHistorico").onclick = (e) =>
    fazer(e.currentTarget, async () => {
      modo = "historico";
      await carregarHistorico(true);
    });
  $("osMais").onclick = (e) =>
    fazer(e.currentTarget, () => carregarHistorico());
  $("osAtualizar").onclick = (e) =>
    fazer(e.currentTarget, async () => {
      desconectar();
      conectar();
      if (modo === "historico") await carregarHistorico(true);
    });
  $("osLimpar").onclick = () => {
    document
      .querySelectorAll(
        "#osConteudo .os-filtros input,#osConteudo .os-filtros select",
      )
      .forEach((e) => {
        if (e.type === "checkbox") e.checked = false;
        else e.value = "";
      });
    render();
    if (modo === "historico") fazer(null, () => carregarHistorico(true));
  };
  document
    .querySelectorAll(
      "#osConteudo .os-filtros input,#osConteudo .os-filtros select",
    )
    .forEach((e) =>
      e.addEventListener("input", () => {
        render();
        if (modo === "historico") {
          consultaHistorico++;
          clearTimeout(filtroTimer);
          filtroTimer = setTimeout(
            () => fazer(null, () => carregarHistorico(true)),
            350,
          );
        }
      }),
    );
  if (admin)
    referenciasOs()
      .then((r) => {
        references = r;
        preencherFiltros();
      })
      .catch((e) => toast(e.message));
  $("osNova")?.addEventListener("click", (e) =>
    fazer(e.currentTarget, () => formOs()),
  );
  $("osTipos")?.addEventListener("click", () => window.navegar("servicos"));
  $("osLista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-os-acao]");
    if (b) fazer(b, () => acaoOs(b.dataset.osAcao, b.dataset.osId));
  });
  const entrega = $("page-entrega");
  const area = document.createElement("div");
  area.id = "osEntregas";
  area.className = "card os-entregas";
  entrega.prepend(area);
  area.addEventListener("click", (e) => {
    const b = e.target.closest("[data-os-entregar]");
    if (b) fazer(b, () => acaoOs("entregue", b.dataset.osEntregar));
  });
  document.addEventListener("navegacao", (e) => {
    if (["os", "entrega"].includes(e.detail.page)) {
      conectar();
      render();
      renderEntregas();
    } else desconectar();
  });
  window.addEventListener("pagehide", desconectar, { once: true });
}
function renderEntregas() {
  const el = $("osEntregas");
  if (!el) return;
  const prontas = ordens.filter((o) => o.status === "pronto");
  el.innerHTML =
    "<h3>Ordens de serviço prontas para entrega / retirada</h3>" +
    (prontas.length
      ? prontas
          .map(
            (o) =>
              '<div class="os-toolbar"><div><strong>' +
              esc(o.numero) +
              " · " +
              esc(o.clienteNome) +
              "</strong><p>" +
              esc(o.servicoNome) +
              " · Entrega prevista: " +
              esc(horaOs(o.previsaoEntrega)) +
              '</p></div><button class="btn-primary" data-os-entregar="' +
              esc(o.id) +
              '">Registrar entrega</button></div>',
          )
          .join("")
      : "<p>Nenhuma OS pronta para entrega.</p>");
}
const input = (id, label, v = "", tipo = "text", extra = "") =>
  "<label>" +
  label +
  '<input name="' +
  id +
  '" type="' +
  tipo +
  '" value="' +
  esc(v) +
  '" ' +
  extra +
  "></label>";
function localData(v) {
  if (!v) return "";
  const d = new Date(milisOs(v));
  if (Number.isNaN(+d)) return "";
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0") +
    "T" +
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}
async function formOs(o = null) {
  references = await referenciasOs();
  const clientes = await clientesOs();
  let encontrados = clientes;
  const v = o || { quantidade: 1, prioridade: "normal" };
  const op = (lista, chave, nome, selecionado) =>
    lista
      .map(
        (x) =>
          '<option value="' +
          esc(x[chave]) +
          '" ' +
          (x[chave] === selecionado ? "selected" : "") +
          ">" +
          esc(x[nome]) +
          "</option>",
      )
      .join("");
  modal(
    o ? "Editar " + o.numero : "Nova Ordem de Serviço",
    '<form id="osForm" class="os-form"><label class="os-largo">Buscar cliente cadastrado<input id="osBuscaCliente" type="search" placeholder="Digite o início do nome"><select name="clienteId" id="osCliente" aria-label="Cliente cadastrado"><option value="">Informar cliente manualmente</option>' +
      op(clientes, "id", "nome", v.clienteId) +
      '</select><small id="osClienteAviso">Digite para pesquisar outros clientes.</small></label>' +
      input(
        "clienteNome",
        "Nome do cliente *",
        v.clienteNome,
        "text",
        'required maxlength="120"',
      ) +
      input(
        "clienteTelefone",
        "Telefone",
        v.clienteTelefone,
        "text",
        'maxlength="40"',
      ) +
      '<label>Tipo de serviço *<select name="servicoId" required><option value="">Selecione</option>' +
      op(
        references.servicos.filter((s) => s.ativo !== false),
        "id",
        "nome",
        v.servicoId,
      ) +
      '</select></label><label>Quem está fazendo *<select name="responsavelId" required><option value="">Selecione</option>' +
      op(references.funcionarios, "id", "nome", v.responsavelId) +
      '</select></label><label class="os-largo">Descrição *<textarea name="descricao" required maxlength="2000">' +
      esc(v.descricao || "") +
      "</textarea></label>" +
      input(
        "previsaoConclusao",
        "Previsão de conclusão *",
        localData(v.previsaoConclusao),
        "datetime-local",
        "required",
      ) +
      input(
        "previsaoEntrega",
        "Previsão de entrega *",
        localData(v.previsaoEntrega),
        "datetime-local",
        "required",
      ) +
      input(
        "quantidade",
        "Quantidade *",
        v.quantidade,
        "number",
        'min="0.001" max="1000000" step="any" required',
      ) +
      '<label>Prioridade<select name="prioridade">' +
      Object.entries(PRIORIDADES_OS)
        .map(
          ([k, t]) =>
            '<option value="' +
            k +
            '" ' +
            (v.prioridade === k ? "selected" : "") +
            ">" +
            t +
            "</option>",
        )
        .join("") +
      "</select></label>" +
      input(
        "material",
        "Material utilizado",
        v.material,
        "text",
        'maxlength="250"',
      ) +
      input(
        "dimensao",
        "Tamanho / dimensão",
        v.dimensao,
        "text",
        'maxlength="150"',
      ) +
      input(
        "acabamento",
        "Acabamento",
        v.acabamento,
        "text",
        'maxlength="250"',
      ) +
      '<label class="os-largo">Observações internas<textarea name="observacoes" maxlength="2000">' +
      esc(v.observacoes || "") +
      "</textarea></label>" +
      input(
        "motivo",
        "Motivo da alteração (opcional)",
        "",
        "text",
        'maxlength="1000"',
      ) +
      "</form>",
    '<button class="btn-ghost" id="osCancelarForm">Cancelar</button><button class="btn-primary" id="osSalvar">Salvar OS</button>',
  );
  const form = $("osForm");
  if (o?.clienteId && !clientes.some((c) => c.id === o.clienteId)) {
    const opt = new Option(o.clienteNome, o.clienteId, true, true);
    $("osCliente").add(opt);
  }
  let buscaTimer,
    geracao = 0;
  $("osBuscaCliente").oninput = () => {
    clearTimeout(buscaTimer);
    const termo = $("osBuscaCliente").value.trim(),
      g = ++geracao;
    buscaTimer = setTimeout(async () => {
      try {
        const lista = await clientesOs(termo);
        if (g !== geracao || !$("osCliente")) return;
        encontrados = lista;
        $("osCliente").innerHTML =
          '<option value="">Informar cliente manualmente</option>' +
          op(lista, "id", "nome", "");
        $("osClienteAviso").textContent = lista.length
          ? "Selecione um cliente ou informe o nome manualmente."
          : "Nenhum cliente encontrado. Informe o nome manualmente.";
      } catch {
        if ($("osClienteAviso"))
          $("osClienteAviso").textContent =
            "Não foi possível pesquisar os clientes.";
      }
    }, 300);
  };
  $("osCliente").onchange = () => {
    const c = encontrados.find((c) => c.id === $("osCliente").value);
    if (c) {
      form.elements.clienteNome.value = c.nome;
      form.elements.clienteTelefone.value = c.telefone || "";
    }
  };
  form.elements.clienteNome.oninput = () => {
    $("osCliente").value = "";
  };
  const id = o?.id || novoIdOs(),
    eventoId = novoIdOs();
  $("osCancelarForm").onclick = () => window.fecharModal();
  $("osSalvar").onclick = (e) =>
    fazer(e.currentTarget, async () => {
      if (!form.reportValidity()) return;
      const d = Object.fromEntries(new FormData(form));
      await salvarOs(d, {
        id,
        revisao: o?.revisao ?? null,
        motivo: d.motivo,
        eventoId,
      });
      window.fecharModal();
      toast("Ordem de serviço salva.", "success");
      if (modo === "historico") await carregarHistorico(true);
    });
}
export async function acaoOs(acao, id) {
  const o = await buscarOs(id);
  if (acao === "editar") return formOs(o);
  if (acao === "detalhes") return detalhes(o);
  if (acao === "eventos") return mostrarEventos(o);
  if (acao === "subir" || acao === "descer") {
    const i = ordens.findIndex((a) => a.id === id),
      par = ordens[i + (acao === "subir" ? -1 : 1)];
    if (!par) return;
    await moverOs(id, par.id, o.revisao, par.revisao);
    return;
  }
  const status = acao;
  if (!STATUS_OS[status]) return;
  const eventoId = novoIdOs();
  modal(
    STATUS_OS[status] + " · " + o.numero,
    '<div class="os-form"><p class="os-largo">' +
      esc(o.clienteNome) +
      " · " +
      esc(o.servicoNome) +
      "</p>" +
      input(
        "osMotivo",
        status === "cancelado"
          ? "Motivo do cancelamento *"
          : "Motivo / observação (opcional)",
        "",
        "text",
        'id="osMotivo" maxlength="1000"',
      ) +
      (status === "entregue"
        ? input(
            "osLocal",
            "Local / retirada na loja",
            "Retirada na loja",
            "text",
            'id="osLocal" maxlength="250"',
          )
        : "") +
      "</div>",
    '<button class="btn-ghost" id="osVoltar">Voltar</button><button class="btn-primary" id="osConfirmar">Confirmar ' +
      esc(STATUS_OS[status]) +
      "</button>",
  );
  $("osVoltar").onclick = () => window.fecharModal();
  $("osConfirmar").onclick = (e) =>
    fazer(e.currentTarget, async () => {
      await mudarStatusOs(id, status, o.revisao, {
        motivo: $("osMotivo").value,
        local: $("osLocal")?.value,
        eventoId,
      });
      window.fecharModal();
      toast("OS atualizada.", "success");
      if (modo === "historico") await carregarHistorico(true);
      document.dispatchEvent(new CustomEvent("os:atualizada"));
    });
}
function detalhes(o) {
  const campos = {
    Número: o.numero,
    Cliente: o.clienteNome,
    Telefone: o.clienteTelefone,
    Serviço: o.servicoNome,
    Descrição: o.descricao,
    Responsável: o.responsavelNome,
    Quantidade: o.quantidade,
    Material: o.material,
    Dimensão: o.dimensao,
    Acabamento: o.acabamento,
    Prioridade: PRIORIDADES_OS[o.prioridade],
    Status: STATUS_OS[o.status],
    "Data de entrada": horaOs(o.dataEntrada),
    "Conclusão original": horaOs(o.previsaoOriginalConclusao),
    "Conclusão prevista": horaOs(o.previsaoConclusao),
    "Entrega original": horaOs(o.previsaoOriginalEntrega),
    "Entrega prevista": horaOs(o.previsaoEntrega),
    "Início real": horaOs(o.dataInicio),
    "Conclusão real": horaOs(o.dataConclusao),
    "Entrega real": horaOs(o.dataEntrega),
    "Entregue por": o.entreguePor,
    "Cadastrado por": o.criadoPorNome || o.criadoPor,
    Prazo: prazoOs(o).texto,
    "Observações internas": o.observacoes,
  };
  modal(
    "Detalhes · " + o.numero,
    '<dl class="os-detalhes">' +
      Object.entries(campos)
        .map(
          ([k, v]) =>
            "<div><dt>" + esc(k) + "</dt><dd>" + esc(v ?? "—") + "</dd></div>",
        )
        .join("") +
      "</dl>",
    '<button class="btn-secondary" id="osVerEventos">Histórico de alterações</button><button class="btn-primary" id="osConcluir">Concluir</button>',
  );
  $("osConcluir").onclick = () => window.fecharModal();
  $("osVerEventos").onclick = (e) =>
    fazer(e.currentTarget, () => mostrarEventos(o));
}
async function mostrarEventos(o) {
  const rotulos = {
    status: "Status",
    responsavelNome: "Responsável",
    previsaoConclusao: "Previsão de conclusão",
    previsaoEntrega: "Previsão de entrega",
    posicaoFila: "Posição na fila",
    clienteNome: "Cliente",
    servicoNome: "Serviço",
    descricao: "Descrição",
    quantidade: "Quantidade",
    prioridade: "Prioridade",
    material: "Material",
    dimensao: "Dimensão",
    acabamento: "Acabamento",
    observacoes: "Observações internas",
    clienteTelefone: "Telefone",
  };
  const tipos = {
    criacao: "Criação",
    edicao: "Edição",
    status: "Mudança de status",
    reordenacao: "Reordenação da fila",
  };
  let cursor = null;
  modal(
    "Histórico · " + o.numero,
    '<div id="osEventos"></div>',
    '<button class="btn-secondary" id="osMaisEventos">Carregar mais alterações</button><button class="btn-primary" id="osConcluir">Concluir</button>',
  );
  async function carregar() {
    const s = await eventosOs(o.id, cursor);
    cursor = s.cursor;
    $("osMaisEventos").hidden = !s.mais;
    $("osEventos").insertAdjacentHTML(
      "beforeend",
      s.itens
        .map((e) => {
          const a = e.antes,
            b = e.depois;
          const chaves = [
            "status",
            "responsavelNome",
            "previsaoConclusao",
            "previsaoEntrega",
            "posicaoFila",
            "clienteNome",
            "servicoNome",
            "descricao",
            "quantidade",
            "prioridade",
            "material",
            "dimensao",
            "acabamento",
            "observacoes",
            "clienteTelefone",
          ];
          const alteracoes = chaves
            .filter((k) => JSON.stringify(a?.[k]) !== JSON.stringify(b[k]))
            .map((k) => {
              const fmt = (x) =>
                k.startsWith("previsao")
                  ? horaOs(x)
                  : k === "status"
                    ? STATUS_OS[x] || "—"
                    : String(x ?? "—");
              return rotulos[k] + ": " + fmt(a?.[k]) + " → " + fmt(b[k]);
            });
          return (
            '<section class="os-evento"><strong>' +
            esc(tipos[e.tipo] || e.tipo) +
            " · " +
            esc(horaOs(e.criadoEm)) +
            "</strong><p>Usuário: " +
            esc(e.usuarioNome || e.usuarioId) +
            " · Revisão " +
            esc(e.revisao) +
            "</p><p>" +
            esc(e.motivo) +
            "</p><pre>" +
            esc(alteracoes.join("\n")) +
            "</pre></section>"
          );
        })
        .join(""),
    );
  }
  $("osConcluir").onclick = () => window.fecharModal();
  $("osMaisEventos").onclick = (e) => fazer(e.currentTarget, carregar);
  await carregar();
}
