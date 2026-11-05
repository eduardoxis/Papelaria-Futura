import { temCargo } from "./auth.js";
import { escHtml as esc } from "./index.js";
import {
  COL_COM,
  dataLocal,
  intervalo,
  centavos,
  percentualBps,
  elegivel,
  receita,
  totalCentavos,
  calcularComissao,
  montarRelatorio,
} from "./vendas-comissoes-core.js";
import {
  carregarCadastros,
  observarPeriodo,
  salvarPercentual,
  salvarBase,
  gerarRetroativa,
  novoLotePagamento,
  registrarPagamento,
  ajustarVenda,
  consultarHistorico,
  listarPendentes,
} from "./vendas-comissoes-db.js";
let perfil,
  ativo = false,
  desligar = null,
  sequencia = 0,
  estado = { vendas: [], registros: [] },
  cadastro = { usuarios: [], configs: new Map(), base: { excluirFrete: true } },
  linhas = [],
  pronto = false,
  pagina = 0;
const graficos = [],
  $ = (id) => document.getElementById(id);
const moeda = (c) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    c / 100,
  );
const pct = (b) => (b / 100).toLocaleString("pt-BR") + "%";
const dia = (v) => (v?.toDate ? v.toDate() : new Date(v));
const data = (v) => (v ? dia(v).toLocaleString("pt-BR") : "—");
const aviso = (t, tipo = "error") => window.mostrarToast?.(t, tipo, 8000);
const vendedorId = () => $("vcVendedor").value;
const regs = () => new Map(estado.registros.map((c) => [c.id, c]));
const periodo = () =>
  intervalo($("vcPeriodo").value, $("vcInicio").value, $("vcFim").value);
const periodoTexto = () => {
  const p = periodo(),
    fim = new Date(p.fim);
  fim.setDate(fim.getDate() - 1);
  return `${p.inicio.toLocaleDateString("pt-BR")} a ${fim.toLocaleDateString("pt-BR")}`;
};
const nome = (id) =>
  cadastro.usuarios.find((u) => u.id === id)?.nome ||
  cadastro.configs.get(id)?.nome ||
  estado.vendas.find((v) => v.vendedorId === id)?.vendedorNome ||
  (id === "__sem_vendedor__" ? "Vendedor não identificado" : id);
const modal = (t, c, r = "") =>
  window.abrirModal(
    t,
    `<div class="vc-form">${c}</div>`,
    r ||
      '<button class="btn-ghost" onclick="window.fecharModal()">Fechar</button>',
    { tamanho: "lg" },
  );
async function executar(b, f) {
  if (b?.disabled) return;
  const t = b?.textContent;
  if (b) {
    b.disabled = true;
    b.textContent = "Aguarde...";
  }
  try {
    await f();
  } catch (e) {
    console.error(e);
    aviso(e.message || "Não foi possível concluir.");
  } finally {
    if (b?.isConnected) {
      b.disabled = false;
      b.textContent = t;
    }
  }
}
export function iniciarVendasComissoes(u, p) {
  perfil = p;
  document.addEventListener("navegacao", (e) => {
    if (e.detail.page !== "admin") fecharPainelComissoes();
  });
}
export function fecharPainelComissoes() {
  ativo = false;
  sequencia++;
  desligar?.();
  desligar = null;
  graficos.splice(0).forEach((g) => g.destroy());
}
export async function abrirPainelComissoes() {
  if (!temCargo(perfil, "admin")) return;
  ativo = true;
  if (!$("vcPeriodo")) construir();
  await executar(null, atualizar);
}
function construir() {
  const campo = (titulo, html) => `<label>${titulo}${html}</label>`;
  $("vcConteudo").innerHTML =
    `<div class="card"><div class="vc-cabecalho"><h3>Vendas e Comissões</h3><button class="btn-secondary" id="vcAtualizar">Atualizar</button></div><p>Vendas do caixa. Configure os percentuais antes de vender: sem configuração, a comissão é 0%. Alterações valem somente para vendas futuras.</p><div class="vc-filtros">
  ${campo("Período das vendas", '<select class="field-input--plain" id="vcPeriodo"><option value="hoje">Hoje</option><option value="ontem">Ontem</option><option value="semana">Últimos 7 dias</option><option value="mes" selected>Este mês</option><option value="anterior">Mês anterior</option><option value="ano">Este ano</option><option value="personalizado">Personalizado</option></select>')}
  ${campo("De", '<input type="date" id="vcInicio" class="field-input--plain" disabled>')}${campo("Até", '<input type="date" id="vcFim" class="field-input--plain" disabled>')}
  ${campo("Vendedor", '<select class="field-input--plain" id="vcVendedor"></select>')}${campo("Pesquisar", '<input class="field-input--plain" id="vcBusca" placeholder="Nome do vendedor">')}
  ${campo("Ordenar", '<select class="field-input--plain" id="vcOrdem"><option value="faturamento">Maior faturamento</option><option value="vendas">Mais vendas</option><option value="comissao">Maior comissão</option></select>')}</div>
  <p id="vcStatus" role="status" aria-live="polite">Carregando...</p><div class="vc-acoes"><button class="btn-secondary" id="vcBase">Base de cálculo</button><button class="btn-secondary" id="vcRetro">Conferir vendas antigas</button><button class="btn-secondary" id="vcPagar">Registrar pagamento</button><button class="btn-ghost" id="vcPDF">PDF</button><button class="btn-ghost" id="vcExcel">Excel</button></div></div>
  <div class="vc-cards" id="vcCards"></div><div class="card"><h3>Vendedores</h3><p>Valores pagos e pendentes correspondem às vendas do período. O percentual atual é informativo: o cálculo usa o percentual histórico de cada venda.</p><div class="table-wrap"><table class="data-table vc-table"><thead><tr><th>Vendedor</th><th>Vendas</th><th>Faturamento</th><th>% atual</th><th>Comissão</th><th>Paga</th><th>Pendente</th><th>Ações</th></tr></thead><tbody id="vcTabela"></tbody></table></div><div id="vcPagina" class="vc-paginacao"></div></div>
  <div class="vc-graficos">${[
    ["Faturamento por vendedor", "vcGF"],
    ["Vendas por vendedor", "vcGQ"],
    ["Comissões por mês", "vcGC"],
    ["Evolução das vendas", "vcGE"],
  ]
    .map(
      ([t, id]) =>
        `<div class="card"><h3>${t}</h3><div class="vc-grafico"><canvas id="${id}"></canvas></div></div>`,
    )
    .join("")}</div>
  <div class="card"><h3>Ranking de vendedores</h3><div id="vcRanking"></div></div>
  <div class="card"><h3>Pagamentos por data de pagamento</h3><p>Consulta independente do período das vendas. Usa o vendedor selecionado acima.</p><div class="vc-filtros">${campo("De", `<input type="date" class="field-input--plain" id="vcPagInicio" value="${dataLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}">`)}${campo("Até", `<input type="date" class="field-input--plain" id="vcPagFim" value="${dataLocal()}">`)}<button class="btn-secondary" id="vcConsultarPag">Consultar pagamentos</button></div><div id="vcPagamentos"></div><button class="btn-ghost" id="vcMaisPag" hidden>Carregar mais pagamentos</button></div>
  <div class="card"><h3>Histórico administrativo</h3><p>Alterações no período selecionado, com responsável e valores anteriores e novos.</p><button class="btn-secondary" id="vcAuditoria">Consultar histórico</button><div id="vcHistorico"></div><button class="btn-ghost" id="vcMaisAudit" hidden>Carregar mais alterações</button></div>`;
  $("vcAtualizar").onclick = (e) => executar(e.currentTarget, atualizar);
  $("vcPeriodo").onchange = () => {
    const custom = $("vcPeriodo").value === "personalizado";
    $("vcInicio").disabled = !custom;
    $("vcFim").disabled = !custom;
    if (custom) {
      $("vcInicio").value = dataLocal(intervalo("mes").inicio);
      $("vcFim").value = dataLocal();
    }
    executar(null, atualizar);
  };
  for (const id of ["vcInicio", "vcFim"])
    $(id).onchange = () => executar(null, atualizar);
  $("vcVendedor").onchange = () => {
    pagina = 0;
    renderizar();
    $("vcPagamentos").textContent = "Vendedor alterado. Consulte novamente.";
    $("vcMaisPag").hidden = true;
  };
  for (const id of ["vcBusca", "vcOrdem"])
    $(id).addEventListener(id === "vcBusca" ? "input" : "change", () => {
      pagina = 0;
      renderizar();
    });
  $("vcBase").onclick = editarBase;
  $("vcRetro").onclick = () => executar(null, conferirRetroativas);
  $("vcPagar").onclick = () =>
    vendedorId() && vendedorId() !== "__sem_vendedor__"
      ? executar(null, () => abrirPagamento(vendedorId()))
      : aviso(
          "Selecione um vendedor ou clique em Pagar na linha dele.",
          "warning",
        );
  $("vcPDF").onclick = () => executar(null, exportarPdf);
  $("vcExcel").onclick = () => executar(null, exportarExcel);
  $("vcTabela").onclick = (e) => {
    const b = e.target.closest("[data-vc]");
    if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.vc === "detalhes") detalhes(id);
    if (b.dataset.vc === "percentual") editarPercentual(id);
    if (b.dataset.vc === "pagar") executar(b, () => abrirPagamento(id));
  };
  $("vcConsultarPag").onclick = (e) =>
    executar(e.currentTarget, () => historicoPag(false));
  $("vcMaisPag").onclick = (e) =>
    executar(e.currentTarget, () => historicoPag(true));
  $("vcAuditoria").onclick = (e) =>
    executar(e.currentTarget, () => historicoAudit(false));
  $("vcMaisAudit").onclick = (e) =>
    executar(e.currentTarget, () => historicoAudit(true));
}
async function atualizar() {
  const token = ++sequencia,
    selecionado = vendedorId();
  desligar?.();
  desligar = null;
  pronto = false;
  $("vcStatus").textContent = "Carregando dados do período...";
  try {
    const p = periodo();
    let recuperarFiltro = selecionado;
    cadastro = await carregarCadastros();
    if (token !== sequencia || !ativo) return;
    const ids = new Map(
      cadastro.usuarios
        .filter((u) => temCargo(u, "vendedor"))
        .map((u) => [u.id, u.nome || u.email]),
    );
    for (const [id, c] of cadastro.configs)
      if (!ids.has(id)) ids.set(id, c.nome || id);
    $("vcVendedor").innerHTML =
      '<option value="">Todos</option>' +
      [...ids]
        .map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`)
        .join("") +
      '<option value="__sem_vendedor__">Vendedor não identificado</option>';
    $("vcVendedor").value = selecionado;
    desligar = observarPeriodo(
      p,
      (d) => {
        if (token !== sequencia || !ativo) return;
        estado = d;
        for (const v of d.vendas)
          if (v.vendedorId && !ids.has(v.vendedorId)) {
            ids.set(v.vendedorId, v.vendedorNome || v.vendedorId);
            const opt = document.createElement("option");
            opt.value = v.vendedorId;
            opt.textContent = v.vendedorNome || v.vendedorId;
            $("vcVendedor").appendChild(opt);
          }
        if (recuperarFiltro) {
          $("vcVendedor").value = recuperarFiltro;
          recuperarFiltro = null;
        }
        pronto = true;
        renderizar();
      },
      (e) => {
        if (token !== sequencia) return;
        pronto = false;
        $("vcStatus").textContent = "Erro: " + e.message;
        aviso("Falha na leitura. Confira a publicação das regras e índices.");
      },
    );
  } catch (e) {
    if (token === sequencia) $("vcStatus").textContent = e.message;
    throw e;
  }
}

async function atualizarConfiguracao() {
  if (!pronto || !desligar) return atualizar();
  const token = sequencia;
  const novosCadastros = await carregarCadastros();
  if (!ativo || token !== sequencia) return;
  cadastro = novosCadastros;
  renderizar();
}

function renderizar() {
  if (!pronto) return;
  const vendedores = cadastro.usuarios.filter((u) => temCargo(u, "vendedor"));
  for (const [id, c] of cadastro.configs)
    if (!vendedores.some((u) => u.id === id))
      vendedores.push({ id, nome: c.nome || id });
  linhas = montarRelatorio(
    estado.vendas,
    regs(),
    vendedores,
    cadastro.configs,
    vendedorId(),
  ).filter((l) =>
    l.nome
      .toLocaleLowerCase("pt-BR")
      .includes($("vcBusca").value.trim().toLocaleLowerCase("pt-BR")),
  );
  const ordem = $("vcOrdem").value;
  linhas.sort((a, b) => b[ordem] - a[ordem] || a.nome.localeCompare(b.nome));
  const soma = (k) => linhas.reduce((s, l) => s + l[k], 0);
  const cards = [
    ["Faturamento total", moeda(soma("faturamento"))],
    ["Vendas realizadas", soma("vendas")],
    ["Comissões geradas", moeda(soma("comissao"))],
    ["Comissões pendentes", moeda(soma("pendente"))],
    ["Comissões pagas", moeda(soma("pago"))],
    [
      "Faturamento após comissões",
      moeda(soma("faturamento") - soma("comissao")),
    ],
  ];
  $("vcCards").innerHTML = cards
    .map(
      ([t, v]) =>
        `<div class="card vc-indicador"><span>${t}</span><strong>${v}</strong></div>`,
    )
    .join("");
  $("vcStatus").textContent =
    `${periodoTexto()} • Atualização automática ativa. ${soma("semComissao")} venda(s) elegível(is) sem comissão gerada.${soma("recuperar") ? " Atenção: " + moeda(soma("recuperar")) + " pagos excedem as comissões após estornos; valor a recuperar." : ""}`;
  pagina = Math.min(pagina, Math.max(0, Math.ceil(linhas.length / 25) - 1));
  $("vcTabela").innerHTML =
    linhas
      .slice(pagina * 25, pagina * 25 + 25)
      .map(
        (l) =>
          `<tr><td><button class="btn-ghost" data-vc="detalhes" data-id="${esc(l.id)}">${esc(l.nome)}</button></td><td>${l.vendas}</td><td>${moeda(l.faturamento)}</td><td>${pct(l.bps)}</td><td>${moeda(l.comissao)}</td><td>${moeda(l.pago)}</td><td>${moeda(l.pendente)}${l.recuperar ? "<br>A recuperar: " + moeda(l.recuperar) : ""}</td><td><div class="vc-acoes">${l.id !== "__sem_vendedor__" ? `<button class="btn-secondary btn-sm" data-vc="percentual" data-id="${esc(l.id)}">Editar comissão</button><button class="btn-ghost" data-vc="pagar" data-id="${esc(l.id)}">Pagar</button>` : ""}</div></td></tr>`,
      )
      .join("") || '<tr><td colspan="8">Nenhum vendedor encontrado.</td></tr>';
  $("vcPagina").innerHTML =
    `<button class="btn-ghost" id="vcAnt" ${pagina === 0 ? "disabled" : ""}>Anterior</button><span>${pagina + 1} / ${Math.max(1, Math.ceil(linhas.length / 25))}</span><button class="btn-ghost" id="vcProx" ${(pagina + 1) * 25 >= linhas.length ? "disabled" : ""}>Próxima</button>`;
  $("vcAnt").onclick = () => {
    pagina--;
    renderizar();
  };
  $("vcProx").onclick = () => {
    pagina++;
    renderizar();
  };
  $("vcRanking").innerHTML =
    [...linhas]
      .filter((l) => l.vendas)
      .sort((a, b) => b.faturamento - a.faturamento)
      .map(
        (l, i) =>
          `<div class="vc-ranking"><strong>${i + 1}º</strong><span>${esc(l.nome)}</span><span>${l.vendas} vendas</span><strong>${moeda(l.faturamento)}</strong></div>`,
      )
      .join("") || "<p>Nenhuma venda concluída no período.</p>";
  desenharGraficos();
}
function desenharGraficos() {
  graficos.splice(0).forEach((g) => g.destroy());
  if (!window.Chart) return;
  const ids = new Set(linhas.map((l) => l.id)),
    mensal = new Map(),
    diario = new Map(),
    registros = regs();
  for (const v of estado.vendas) {
    if (!ids.has(v.vendedorId || "__sem_vendedor__")) continue;
    const d = dataLocal(dia(v.criadoEm));
    if (elegivel(v)) diario.set(d, (diario.get(d) || 0) + receita(v));
    const c = registros.get(v.id);
    if (c)
      mensal.set(
        d.slice(0, 7),
        (mensal.get(d.slice(0, 7)) || 0) +
          calcularComissao(
            v,
            c.percentualBps,
            { excluirFrete: c.excluirFrete },
            c.pagoCentavos,
          ).valorCentavos,
      );
  }
  function grafico(id, tipo, nomes, valores, financeiro) {
    graficos.push(
      new window.Chart($(id), {
        type: tipo,
        data: {
          labels: nomes,
          datasets: [
            {
              label: financeiro ? "Valor (R$)" : "Vendas",
              data: valores.map((v) => (financeiro ? v / 100 : v)),
              backgroundColor: "#2563eb",
              borderColor: "#2563eb",
              tension: 0.25,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              ticks: financeiro
                ? { callback: (v) => moeda(Math.round(v * 100)) }
                : { precision: 0 },
            },
          },
        },
      }),
    );
  }
  const top = [...linhas]
      .sort((a, b) => b.faturamento - a.faturamento)
      .slice(0, 12),
    m = [...mensal].sort(),
    d = [...diario].sort();
  grafico(
    "vcGF",
    "bar",
    top.map((l) => l.nome),
    top.map((l) => l.faturamento),
    true,
  );
  grafico(
    "vcGQ",
    "bar",
    top.map((l) => l.nome),
    top.map((l) => l.vendas),
    false,
  );
  grafico(
    "vcGC",
    "bar",
    m.map((x) => x[0]),
    m.map((x) => x[1]),
    true,
  );
  grafico(
    "vcGE",
    "line",
    d.map((x) => x[0]),
    d.map((x) => x[1]),
    true,
  );
}
function editarPercentual(id) {
  const bps = cadastro.configs.get(id)?.percentualBps || 0;
  modal(
    "Editar comissão",
    `<p>${esc(nome(id))}. Válido somente para novas vendas.</p><label>Percentual (%)<input class="field-input--plain" id="vcNovoPct" inputmode="decimal" value="${String(bps / 100).replace(".", ",")}"></label>`,
    '<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button><button class="btn-primary" id="vcSalvarPct">Salvar percentual</button>',
  );
  $("vcSalvarPct").onclick = (e) =>
    executar(e.currentTarget, async () => {
      await salvarPercentual({ id, nome: nome(id) }, $("vcNovoPct").value);
      window.fecharModal();
      await atualizarConfiguracao();
      aviso("Percentual salvo. Comissões anteriores preservadas.", "success");
    });
}
function editarBase() {
  modal(
    "Base de cálculo",
    `<p>A base é o total após descontos, menos estornos. Somente vendas concluídas e pagas geram comissão. A regra é copiada para cada nova comissão.</p><label><input id="vcExcluirFrete" type="checkbox" ${cadastro.base.excluirFrete ? "checked" : ""}> Excluir frete da base</label><p>Alterações não mudam comissões anteriores.</p>`,
    '<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button><button class="btn-primary" id="vcSalvarBase">Salvar regra</button>',
  );
  $("vcSalvarBase").onclick = (e) =>
    executar(e.currentTarget, async () => {
      await salvarBase($("vcExcluirFrete").checked);
      window.fecharModal();
      await atualizarConfiguracao();
      aviso("Regra salva.", "success");
    });
}
function detalhes(id) {
  const lista = estado.vendas
      .filter((v) => (v.vendedorId || "__sem_vendedor__") === id)
      .sort((a, b) => dia(b.criadoEm) - dia(a.criadoEm)),
    registros = regs();
  let p = 0;
  function desenhar() {
    modal(
      "Vendas de " + nome(id),
      `<p>${periodoTexto()}. Para consultar o histórico completo, altere o período. ${lista.length} registro(s), incluindo vendas canceladas e não pagas.</p><div class="table-wrap"><table class="data-table vc-table"><thead><tr><th>Venda / Data</th><th>Valor</th><th>Base / %</th><th>Comissão</th><th>Paga / Pendente</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${
        lista
          .slice(p * 25, p * 25 + 25)
          .map((v) => {
            const r = registros.get(v.id),
              c = r
                ? calcularComissao(
                    v,
                    r.percentualBps,
                    { excluirFrete: r.excluirFrete },
                    r.pagoCentavos,
                  )
                : null;
            return `<tr><td>#${esc(String(v.numero || v.id))}<br>${data(v.criadoEm)}</td><td>${moeda(totalCentavos(v))}</td><td>${c ? moeda(c.baseCentavos) + " / " + pct(r.percentualBps) : "Não gerada"}</td><td>${c ? moeda(c.valorCentavos) : "—"}</td><td>${c ? moeda(c.pagoCentavos) + " / " + moeda(c.pendenteCentavos) : "—"}</td><td>${!elegivel(v) ? "Cancelada / não paga" : c ? c.status : "Sem comissão"}</td><td><button class="btn-ghost" data-venda="${esc(v.id)}">Ver / ajustar</button></td></tr>`;
          })
          .join("") || '<tr><td colspan="7">Nenhuma venda.</td></tr>'
      }</tbody></table></div>`,
      `<button class="btn-ghost" id="vcDetAnt" ${p === 0 ? "disabled" : ""}>Anterior</button><span>Página ${p + 1}</span><button class="btn-ghost" id="vcDetProx" ${(p + 1) * 25 >= lista.length ? "disabled" : ""}>Próxima</button><button class="btn-ghost" onclick="window.fecharModal()">Fechar</button>`,
    );
    $("vcDetAnt").onclick = () => {
      p--;
      desenhar();
    };
    $("vcDetProx").onclick = () => {
      p++;
      desenhar();
    };
    document
      .querySelectorAll("[data-venda]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            detalheVenda(lista.find((v) => v.id === b.dataset.venda))),
      );
  }
  desenhar();
}
function detalheVenda(v) {
  modal(
    "Venda #" + (v.numero || v.id),
    `<p>${esc(v.vendedorNome || "Vendedor não identificado")} • ${data(v.criadoEm)} • ${moeda(totalCentavos(v))}</p><ul>${(v.itens || []).map((i) => `<li>${esc(i.nome || "Item")} — ${esc(String(i.qtd || 0))} × ${moeda(centavos(i.unitario || 0))}</li>`).join("")}</ul><label>Situação<select id="vcSituacao" class="field-input--plain"><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option><option value="devolvida">Devolvida integralmente</option></select></label><label><input type="checkbox" id="vcVendaPaga" ${v.pago === true || (v.pago == null && !["Fiado", "Convênio"].includes(v.formaPagamento)) ? "checked" : ""}> Cliente já pagou</label><label>Devolução / estorno parcial acumulado (R$)<input id="vcEstorno" class="field-input--plain" inputmode="decimal" value="${((v.estornoCentavos || 0) / 100).toFixed(2).replace(".", ",")}"></label><label>Motivo do ajuste<input id="vcMotivo" class="field-input--plain" maxlength="500"></label><p>Pagamentos já realizados são preservados e eventuais valores a recuperar são destacados. Este ajuste não movimenta estoque nem devolve dinheiro ao cliente.</p>`,
    '<button class="btn-ghost" onclick="window.fecharModal()">Fechar</button><button class="btn-primary" id="vcSalvarAjuste">Confirmar ajuste</button>',
  );
  $("vcSituacao").value = ["cancelada", "devolvida"].includes(v.status)
    ? v.status
    : "concluida";
  $("vcSalvarAjuste").onclick = (e) =>
    executar(e.currentTarget, async () => {
      await ajustarVenda(v.id, {
        status: $("vcSituacao").value,
        pago: $("vcVendaPaga").checked,
        estornoCentavos: centavos($("vcEstorno").value),
        motivo: $("vcMotivo").value,
      });
      window.fecharModal();
      aviso("Venda e comissão atualizadas.", "success");
    });
}
async function conferirRetroativas() {
  if (!pronto) throw Error("Aguarde os dados do período.");
  const registros = regs(),
    candidatas = estado.vendas.filter(
      (v) =>
        elegivel(v) &&
        v.vendedorId &&
        !registros.has(v.id) &&
        (!vendedorId() || v.vendedorId === vendedorId()),
    );
  let p = 0;
  const selecionadas = new Map();
  function desenhar() {
    modal(
      "Conferir comissões retroativas",
      `<p>${periodoTexto()}. Somente vendas pagas e sem comissão. Confira o percentual histórico: a sugestão é o percentual atual. Até 25 por confirmação.</p><div class="table-wrap"><table class="data-table vc-table"><thead><tr><th>Gerar</th><th>Venda</th><th>Vendedor</th><th>Total</th><th>% histórico</th><th>Prevista</th></tr></thead><tbody>${
        candidatas
          .slice(p * 25, p * 25 + 25)
          .map((v) => {
            const bps =
              selecionadas.get(v.id)?.bps ??
              cadastro.configs.get(v.vendedorId)?.percentualBps ??
              0;
            return `<tr><td><input type="checkbox" data-retro="${esc(v.id)}" ${selecionadas.has(v.id) ? "checked" : ""}></td><td>#${esc(String(v.numero || v.id))}<br>${data(v.criadoEm)}</td><td>${esc(v.vendedorNome || v.vendedorId)}</td><td>${moeda(totalCentavos(v))}</td><td><input class="field-input--plain vc-valor" data-retropct="${esc(v.id)}" value="${bps / 100}" inputmode="decimal"></td><td data-previsto="${esc(v.id)}">${moeda(calcularComissao(v, bps, cadastro.base).valorCentavos)}</td></tr>`;
          })
          .join("") ||
        '<tr><td colspan="6">Nenhuma venda elegível aguardando comissão.</td></tr>'
      }</tbody></table></div><p id="vcRetroTotal">${selecionadas.size} selecionada(s).</p>`,
      `<button class="btn-ghost" id="vcRetAnt" ${p === 0 ? "disabled" : ""}>Anterior</button><button class="btn-ghost" id="vcRetProx" ${(p + 1) * 25 >= candidatas.length ? "disabled" : ""}>Próxima</button><button class="btn-primary" id="vcGerarRetro">Gerar selecionadas</button>`,
    );
    const atualizarLinha = (id) => {
      const v = candidatas.find((v) => v.id === id),
        input = [...document.querySelectorAll("[data-retropct]")].find(
          (e) => e.dataset.retropct === id,
        ),
        check = [...document.querySelectorAll("[data-retro]")].find(
          (e) => e.dataset.retro === id,
        );
      try {
        const bps = percentualBps(input.value);
        [...document.querySelectorAll("[data-previsto]")].find(
          (e) => e.dataset.previsto === id,
        ).textContent = moeda(
          calcularComissao(v, bps, cadastro.base).valorCentavos,
        );
        if (check.checked) {
          if (selecionadas.size >= 25 && !selecionadas.has(id))
            throw Error("Selecione até 25 vendas.");
          selecionadas.set(id, {
            id,
            vendedorId: v.vendedorId,
            total: totalCentavos(v),
            estorno: v.estornoCentavos || 0,
            bps,
            excluirFrete: cadastro.base.excluirFrete,
          });
        } else selecionadas.delete(id);
      } catch (e) {
        selecionadas.delete(id);
        check.checked = false;
        aviso(e.message);
      }
      $("vcRetroTotal").textContent = selecionadas.size + " selecionada(s).";
    };
    document
      .querySelectorAll("[data-retro]")
      .forEach((e) => (e.onchange = () => atualizarLinha(e.dataset.retro)));
    document
      .querySelectorAll("[data-retropct]")
      .forEach((e) => (e.onchange = () => atualizarLinha(e.dataset.retropct)));
    $("vcRetAnt").onclick = () => {
      p--;
      desenhar();
    };
    $("vcRetProx").onclick = () => {
      p++;
      desenhar();
    };
    $("vcGerarRetro").onclick = (e) =>
      executar(e.currentTarget, async () => {
        if (!selecionadas.size) throw Error("Selecione pelo menos uma venda.");
        let feitas = 0;
        for (const [id, prev] of [...selecionadas]) {
          if (await gerarRetroativa(prev)) feitas++;
          selecionadas.delete(id);
        }
        window.fecharModal();
        aviso(
          `${feitas} comissão(ões) gerada(s). Registros existentes foram preservados.`,
          "success",
        );
      });
  }
  desenhar();
}
async function abrirPagamento(id) {
  const loteId = novoLotePagamento();
  let pendentes = [],
    cursor = null;
  const selecionadas = new Map(),
    form = { data: dataLocal(), forma: "PIX", observacao: "" };
  const carregar = async () => {
    const r = await listarPendentes(id, cursor);
    pendentes.push(...r.itens);
    cursor = r.cursor;
  };
  await carregar();
  function desenhar() {
    modal(
      "Registrar pagamento — " + nome(id),
      `<p>Pendentes de todos os períodos. Selecione até 3 comissões por operação. Você pode informar valores parciais.</p><div class="table-wrap"><table class="data-table vc-table"><thead><tr><th>Pagar</th><th>Venda / Data</th><th>Saldo</th><th>Valor a pagar (R$)</th></tr></thead><tbody>${
        pendentes
          .filter((c) => c.pendenteCentavos > 0)
          .map(
            (c) =>
              `<tr><td><input type="checkbox" data-pagar="${esc(c.id)}" ${selecionadas.has(c.id) ? "checked" : ""}></td><td>#${esc(c.vendaId)}<br>${data(c.dataVenda)}</td><td>${moeda(c.pendenteCentavos)}</td><td><input class="field-input--plain vc-valor" data-valor="${esc(c.id)}" value="${((selecionadas.get(c.id) || c.pendenteCentavos) / 100).toFixed(2).replace(".", ",")}" inputmode="decimal"></td></tr>`,
          )
          .join("") ||
        '<tr><td colspan="4">Nenhuma comissão pendente.</td></tr>'
      }</tbody></table></div><button class="btn-ghost" id="vcMaisPend" ${!cursor ? "hidden" : ""}>Carregar mais pendentes</button><div class="vc-filtros"><label>Data do pagamento<input type="date" class="field-input--plain" id="vcDataPag" value="${form.data}"></label><label>Forma<select class="field-input--plain" id="vcFormaPag"><option>PIX</option><option>Dinheiro</option><option>Transferência</option></select></label><label>Observação<input id="vcObsPag" class="field-input--plain" maxlength="500" value="${esc(form.observacao)}"></label></div><strong id="vcTotalPag">Total: ${moeda([...selecionadas.values()].reduce((s, v) => s + v, 0))}</strong>`,
      '<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button><button class="btn-primary" id="vcConfirmarPag">Confirmar pagamento</button>',
    );
    $("vcFormaPag").value = form.forma;
    const ler = (id) => {
      const c = pendentes.find((c) => c.id === id),
        check = [...document.querySelectorAll("[data-pagar]")].find(
          (e) => e.dataset.pagar === id,
        ),
        input = [...document.querySelectorAll("[data-valor]")].find(
          (e) => e.dataset.valor === id,
        );
      try {
        const valor = centavos(input.value);
        if (check.checked) {
          if (selecionadas.size >= 3 && !selecionadas.has(id))
            throw Error("Selecione até 3 comissões por operação.");
          if (valor <= 0 || valor > c.pendenteCentavos)
            throw Error("Valor inválido ou maior que o saldo.");
          selecionadas.set(id, valor);
        } else selecionadas.delete(id);
      } catch (e) {
        selecionadas.delete(id);
        check.checked = false;
        aviso(e.message);
      }
      $("vcTotalPag").textContent =
        "Total: " +
        moeda([...selecionadas.values()].reduce((s, v) => s + v, 0));
    };
    document
      .querySelectorAll("[data-pagar]")
      .forEach((e) => (e.onchange = () => ler(e.dataset.pagar)));
    document
      .querySelectorAll("[data-valor]")
      .forEach((e) => (e.onchange = () => ler(e.dataset.valor)));
    const guardar = () => {
      form.data = $("vcDataPag").value;
      form.forma = $("vcFormaPag").value;
      form.observacao = $("vcObsPag").value;
    };
    $("vcMaisPend").onclick = (e) =>
      executar(e.currentTarget, async () => {
        guardar();
        await carregar();
        desenhar();
      });
    $("vcConfirmarPag").onclick = (e) =>
      executar(e.currentTarget, async () => {
        guardar();
        await registrarPagamento({
          loteId,
          vendedorId: id,
          itens: [...selecionadas].map(([id, valor]) => ({ id, valor })),
          dataPagamento: form.data,
          forma: form.forma,
          observacao: form.observacao,
        });
        window.fecharModal();
        aviso("Pagamento registrado com segurança.", "success");
      });
  }
  desenhar();
}
let pagamentos = [],
  cursorPag = null,
  consultaPag = null;
async function historicoPag(mais) {
  if (!mais) {
    pagamentos = [];
    cursorPag = null;
    consultaPag = {
      ...intervalo(
        "personalizado",
        $("vcPagInicio").value,
        $("vcPagFim").value,
      ),
      vendedor: vendedorId(),
    };
  }
  const p = consultaPag;
  if (!p) return;
  const r = await consultarHistorico(
    COL_COM.pagamentos,
    "dataPagamento",
    dataLocal(p.inicio),
    dataLocal(p.fim),
    cursorPag,
    p.vendedor || null,
  );
  cursorPag = r.cursor;
  pagamentos.push(...r.itens);
  const lista = pagamentos.filter(
    (a) => !p.vendedor || a.vendedorId === p.vendedor,
  );
  $("vcPagamentos").innerHTML =
    `<p>Total dos pagamentos carregados: <strong>${moeda(lista.reduce((s, a) => s + a.valorCentavos, 0))}</strong>${cursorPag ? " — existem mais registros." : ""}</p><div class="table-wrap"><table class="data-table vc-table"><thead><tr><th>Data paga</th><th>Vendedor</th><th>Venda</th><th>Valor</th><th>Forma</th><th>Observação</th><th>Responsável</th></tr></thead><tbody>${lista.map((a) => `<tr><td>${esc(a.dataPagamento)}</td><td>${esc(nome(a.vendedorId))}</td><td>${esc(a.vendaId)}</td><td>${moeda(a.valorCentavos)}</td><td>${esc(a.forma)}</td><td>${esc(a.observacao || "—")}</td><td>${esc(cadastro.usuarios.find((u) => u.id === a.registradoPor)?.nome || a.registradoPor)}</td></tr>`).join("") || '<tr><td colspan="7">Nenhum pagamento nesta página.</td></tr>'}</tbody></table></div>`;
  $("vcMaisPag").hidden = !cursorPag;
}
let audits = [],
  cursorAudit = null,
  consultaAudit = null;
function valorHistorico(a, campo) {
  const valor = a[campo];
  if (valor == null) return "—";
  if (a.tipo === "percentual" || a.tipo === "retroativa") return pct(valor);
  if (a.tipo === "base") return valor ? "Frete excluído" : "Frete incluído";
  if (a.tipo === "ajuste-venda")
    return (
      valor.status +
      " / " +
      (valor.pago ? "Cliente pagou" : "Cliente não pagou") +
      " / Estorno: " +
      moeda(valor.estornoCentavos || 0)
    );
  return JSON.stringify(valor);
}
async function historicoAudit(mais) {
  if (!mais) {
    audits = [];
    cursorAudit = null;
    consultaAudit = periodo();
  }
  const r = await consultarHistorico(
    COL_COM.auditoria,
    "criadoEm",
    consultaAudit.inicio,
    consultaAudit.fim,
    cursorAudit,
  );
  audits.push(...r.itens);
  cursorAudit = r.cursor;
  $("vcHistorico").innerHTML =
    `<div class="table-wrap"><table class="data-table vc-table"><thead><tr><th>Data</th><th>Alteração</th><th>Responsável</th><th>Antes</th><th>Depois</th><th>Motivo</th></tr></thead><tbody>${audits.map((a) => `<tr><td>${data(a.criadoEm)}</td><td>${esc(a.tipo)}<br>${esc(a.vendaId || a.vendedorId || "")}</td><td>${esc(cadastro.usuarios.find((u) => u.id === a.registradoPor)?.nome || a.registradoPor)}</td><td>${esc(valorHistorico(a, "antes"))}</td><td>${esc(valorHistorico(a, "depois"))}</td><td>${esc(a.motivo || "—")}</td></tr>`).join("") || '<tr><td colspan="6">Nenhuma alteração nesta página.</td></tr>'}</tbody></table></div>`;
  $("vcMaisAudit").hidden = !cursorAudit;
}
function dadosExportacao() {
  if (!pronto) throw Error("Aguarde os dados.");
  return {
    periodo: periodoTexto(),
    gerado: new Date().toLocaleString("pt-BR"),
    vendedor: vendedorId() ? nome(vendedorId()) : "Todos",
  };
}
function vendasExportacao() {
  const registros = regs(),
    ids = new Set(linhas.map((l) => l.id));
  return estado.vendas
    .filter((v) => ids.has(v.vendedorId || "__sem_vendedor__"))
    .map((v) => {
      const r = registros.get(v.id),
        c = r
          ? calcularComissao(
              v,
              r.percentualBps,
              { excluirFrete: r.excluirFrete },
              r.pagoCentavos,
            )
          : null;
      return [
        v.id,
        data(v.criadoEm),
        v.vendedorId || "",
        v.vendedorNome || "Vendedor não identificado",
        totalCentavos(v) / 100,
        c ? c.baseCentavos / 100 : null,
        r ? r.percentualBps / 100 : null,
        c ? c.valorCentavos / 100 : null,
        c ? c.pagoCentavos / 100 : null,
        c ? c.pendenteCentavos / 100 : null,
        c ? c.status : "Não gerada",
      ];
    });
}
function exportarExcel() {
  const d = dadosExportacao(),
    X = window.XLSX;
  if (!X) throw Error("Biblioteca Excel indisponível.");
  const livro = X.utils.book_new(),
    soma = (k) => linhas.reduce((s, l) => s + l[k], 0);
  const tabela = [
    ["Papelaria Futura — Vendas e Comissões"],
    ["Período das vendas", d.periodo],
    ["Vendedor", d.vendedor],
    ["Gerado em", d.gerado],
    [],
    [
      "Vendedor",
      "Vendas",
      "Faturamento (R$)",
      "Comissão atual (%)",
      "Comissão gerada (R$)",
      "Paga (R$)",
      "Pendente (R$)",
      "A recuperar (R$)",
      "Após comissões (R$)",
    ],
    ...linhas.map((l) => [
      l.nome,
      l.vendas,
      l.faturamento / 100,
      l.bps / 100,
      l.comissao / 100,
      l.pago / 100,
      l.pendente / 100,
      l.recuperar / 100,
      (l.faturamento - l.comissao) / 100,
    ]),
    [
      "TOTAL",
      soma("vendas"),
      soma("faturamento") / 100,
      null,
      soma("comissao") / 100,
      soma("pago") / 100,
      soma("pendente") / 100,
      soma("recuperar") / 100,
      (soma("faturamento") - soma("comissao")) / 100,
    ],
  ];
  const folha = X.utils.aoa_to_sheet(tabela);
  folha["!cols"] = [
    { wch: 35 },
    { wch: 12 },
    ...Array.from({ length: 7 }, () => ({ wch: 23 })),
  ];
  for (let r = 6; r < tabela.length; r++)
    for (const c of [2, 4, 5, 6, 7, 8]) {
      const cel = folha[X.utils.encode_cell({ r, c })];
      if (cel) cel.z = '"R$" #,##0.00';
    }
  X.utils.book_append_sheet(livro, folha, "Vendedores");
  const vendas = [
      [
        "Venda ID",
        "Data",
        "Vendedor ID",
        "Vendedor",
        "Total (R$)",
        "Base (R$)",
        "Percentual aplicado (%)",
        "Comissão (R$)",
        "Paga (R$)",
        "Pendente (R$)",
        "Status",
      ],
      ...vendasExportacao(),
    ],
    det = X.utils.aoa_to_sheet(vendas);
  det["!cols"] = Array.from({ length: 11 }, () => ({ wch: 24 }));
  for (let r = 1; r < vendas.length; r++)
    for (const c of [4, 5, 7, 8, 9]) {
      const cel = det[X.utils.encode_cell({ r, c })];
      if (cel) cel.z = '"R$" #,##0.00';
    }
  X.utils.book_append_sheet(livro, det, "Vendas e percentuais históricos");
  X.writeFile(livro, "Vendas_Comissoes_" + dataLocal() + ".xlsx");
}
function exportarPdf() {
  const d = dadosExportacao();
  if (!window.jspdf?.jsPDF) throw Error("Biblioteca PDF indisponível.");
  const doc = new window.jspdf.jsPDF({ orientation: "landscape" });
  doc.setFontSize(15);
  doc.text("Papelaria Futura — Vendas e Comissões", 14, 17);
  doc.setFontSize(9);
  doc.text(
    `Período: ${d.periodo} | Vendedor: ${d.vendedor} | Gerado: ${d.gerado}`,
    14,
    25,
  );
  doc.text(
    "Percentual atual é informativo. O cálculo usa o percentual histórico de cada venda.",
    14,
    32,
  );
  const soma = (k) => linhas.reduce((s, l) => s + l[k], 0);
  doc.text(
    `Vendas: ${soma("vendas")} | Faturamento: ${moeda(soma("faturamento"))} | Geradas: ${moeda(soma("comissao"))} | Pagas: ${moeda(soma("pago"))} | Pendentes: ${moeda(soma("pendente"))}`,
    14,
    39,
  );
  doc.text(
    `Faturamento após comissões: ${moeda(soma("faturamento") - soma("comissao"))} | A recuperar: ${moeda(soma("recuperar"))}`,
    14,
    46,
  );
  doc.autoTable({
    startY: 51,
    head: [
      [
        "Vendedor",
        "Vendas",
        "Faturamento",
        "% atual",
        "Comissão",
        "Paga",
        "Pendente",
        "A recuperar",
      ],
    ],
    body: linhas.map((l) => [
      l.nome,
      l.vendas,
      moeda(l.faturamento),
      pct(l.bps),
      moeda(l.comissao),
      moeda(l.pago),
      moeda(l.pendente),
      moeda(l.recuperar),
    ]),
    styles: { fontSize: 8 },
  });
  doc.addPage();
  doc.text("Vendas e percentuais históricos — " + d.periodo, 14, 16);
  doc.autoTable({
    startY: 22,
    head: [
      [
        "Venda",
        "Data",
        "Vendedor",
        "Total",
        "Base",
        "% aplicada",
        "Comissão",
        "Paga",
        "Pendente",
        "Status",
      ],
    ],
    body: vendasExportacao().map((r) => [
      r[0],
      r[1],
      r[3],
      moeda(Math.round(r[4] * 100)),
      r[5] === null ? "—" : moeda(Math.round(r[5] * 100)),
      r[6] === null ? "—" : pct(Math.round(r[6] * 100)),
      ...r
        .slice(7, 10)
        .map((v) => (v === null ? "—" : moeda(Math.round(v * 100)))),
      r[10],
    ]),
    styles: { fontSize: 7 },
  });
  doc.save("Vendas_Comissoes_" + dataLocal() + ".pdf");
}
