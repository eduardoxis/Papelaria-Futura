import {
  doc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
} from "./firestore-operacoes.js";
import { db, auth } from "./firebase-config.js";
import { temCargo } from "./auth.js";
import { centavos, dataLocal, intervalo } from "./vendas-comissoes-core.js";
import { conferirFechamento } from "./pdv-core.js";
import {
  sessaoAtual,
  conferirSessao,
  confirmarFechamento,
  buscarFechamento,
  buscarVenda,
  historicoFechamentos,
  listarVendasPdv,
  listarAjustes,
  listarMovimentos,
  registrarMovimento,
  configuracaoPdv,
  salvarConfiguracaoPdv,
  encerrarSessaoLegada,
  registrarCorrecaoFechamento,
} from "./pdv-db.js";
import {
  htmlComprovante,
  htmlFechamentoLegado,
  pdfFechamentoLegado,
  htmlFechamento,
  comprovanteDaVenda,
  pdfComprovante,
  pdfFechamento,
  imprimirHtml,
  ESTILO_DOCUMENTOS,
  reais,
  horario,
  escapeHtml as esc,
} from "./pdv-documentos.js";
let perfil = null;
const $ = (id) => document.getElementById(id),
  toast = (t, k = "error") => window.mostrarToast?.(t, k, 8000);
const preview = (html) =>
  `<style>${ESTILO_DOCUMENTOS.replaceAll("body{", ".pdv-previa{")}.pdv-previa{max-height:65vh;overflow:auto;background:#eef2f6;padding:14px}.pdv-previa .papel{background:white;width:794px;max-width:none}.pdv-previa .doc-tabela thead{display:table-header-group}.pdv-previa .doc-tabela tbody tr{display:table-row}.pdv-previa .doc-tabela td{display:table-cell}.pdv-form{display:flex;flex-wrap:wrap;align-items:end;gap:12px;margin:14px 0}.pdv-form label{display:flex;flex-direction:column;gap:6px;flex:1 1 160px}.pdv-form input,.pdv-form select{min-height:42px;width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}</style><div class="pdv-previa">${html}</div>`;
async function fazer(b, fn) {
  if (b?.disabled) return;
  const t = b?.textContent;
  if (b) {
    b.disabled = true;
    b.textContent = "Aguarde...";
  }
  try {
    await fn();
  } catch (e) {
    console.error(e);
    toast(e.message || "Não foi possível concluir.");
  } finally {
    if (b?.isConnected) {
      b.disabled = false;
      b.textContent = t;
    }
  }
}
export function iniciarPdvUi(dados) {
  perfil = dados;
}
export async function mostrarComprovante(id, finalizada = false) {
  const venda = await buscarVenda(id),
    c = comprovanteDaVenda(venda);
  window.abrirModal(
    finalizada ? "VENDA FINALIZADA COM SUCESSO!" : "Comprovante da venda",
    `<div class="pdv-form"><label>Formato de impressão<select id="pdvFormato"><option value="a4">A4</option><option value="58">Térmica 58 mm</option><option value="80">Térmica 80 mm</option></select></label></div><div id="pdvCupomPrevia">${preview(htmlComprovante(c, c.empresa?.formato || "a4"))}</div>`,
    `<button class="btn-secondary" id="pdvImprimirCupom">Imprimir comprovante</button><button class="btn-secondary" id="pdvPdfCupom">Baixar PDF</button><button class="btn-primary" id="pdvNovaVenda">${finalizada ? "Nova venda" : "Concluir"}</button>`,
    { tamanho: "lg" },
  );
  $("modalBody").scrollTop = 0;
  $("pdvFormato").value = c.empresa?.formato || "a4";
  $("pdvFormato").onchange = () => {
    $("pdvCupomPrevia").innerHTML = preview(
      htmlComprovante(c, $("pdvFormato").value),
    );
  };
  $("pdvImprimirCupom").onclick = (e) =>
    fazer(e.currentTarget, () =>
      imprimirHtml(
        htmlComprovante(c, $("pdvFormato").value),
        $("pdvFormato").value,
      ),
    );
  $("pdvPdfCupom").onclick = (e) =>
    fazer(e.currentTarget, () => pdfComprovante(c, $("pdvFormato").value));
  $("pdvNovaVenda").onclick = () => {
    window.fecharModal();
    $("caixaTerminalInput")?.focus();
  };
}
export async function fecharPdv(sessaoId, nome, aposFechar) {
  const s = await conferirSessao(sessaoId);
  if (s.versaoPdv !== 2) return fecharLegado(s, aposFechar);
  if (s.status !== "aberto") throw Error("Caixa já fechado.");
  const montar = () => ({
    ...s,
    ...conferirFechamento(s, centavos($("pdvContado").value)),
    sessaoId: s.id,
    operadorNome: nome,
  });
  window.abrirModal(
    "Conferência do fechamento de caixa",
    `<p>Confira as movimentações. O valor contado é somente o dinheiro físico da gaveta.</p><div class="pdv-form"><label>Dinheiro contado (R$)<input id="pdvContado" inputmode="decimal" placeholder="Informe o valor contado" required></label><strong id="pdvDiferenca"></strong></div><div id="pdvConferencia"><p>Troco inicial: <strong>${reais(s.inicialCentavos)}</strong></p><p>Vendas recebidas em dinheiro: <strong>${reais(s.resumo.dinheiro)}</strong></p><p>Suprimentos: ${reais(s.resumo.suprimentos)} • Sangrias: ${reais(s.resumo.sangrias)} • Devoluções em dinheiro: ${reais(s.resumo.devolucoesDinheiro)}</p><p>Saldo esperado em dinheiro: <strong>${reais(conferirFechamento(s, 0).esperadoCentavos)}</strong></p><p>O relatório completo fica no ADM.</p></div>`,
    `<button class="btn-ghost" onclick="window.fecharModal()">Voltar</button><button class="btn-primary" id="pdvConfirmarFechamento">Confirmar fechamento de caixa</button>`,
    { tamanho: "lg" },
  );
  $("pdvContado").oninput = () => {
    try {
      const f = montar();
      $("pdvDiferenca").textContent =
        f.situacao + ": " + reais(f.diferencaCentavos);
    } catch {
      $("pdvDiferenca").textContent = "Informe um valor válido.";
    }
  };
  $("pdvConfirmarFechamento").onclick = (e) =>
    fazer(e.currentTarget, async () => {
      if (!$("pdvContado").value.trim())
        throw Error("Informe o dinheiro contado.");
      const f = montar();
      await confirmarFechamento(s.id, s.revisao, f.contadoCentavos, nome);
      await aposFechar?.();
      toast("Fechamento realizado e armazenado com sucesso.", "success");
      window.abrirModal(
        "Caixa fechado com sucesso",
        "<p>Conferência registrada. O relatório completo está disponível no ADM, em Histórico de Caixas.</p>",
        '<button class="btn-primary" onclick="window.fecharModal()">Concluir</button>',
      );
    });
}
export async function visualizarFechamento(id) {
  const f = await buscarFechamento(id);
  window.abrirModal(
    "Fechamento de caixa confirmado",
    preview(htmlFechamento(f)) + `<div id="pdvAjustes"></div>`,
    `<button class="btn-secondary" id="pdvBaixarFechamento">Baixar relatório PDF</button><button class="btn-secondary" id="pdvImprimirFechamento">Imprimir relatório</button><button class="btn-ghost" id="pdvVisualizarFechamento">Visualizar fechamento</button><button class="btn-ghost" id="pdvConsultarMovimentos">Movimentações registradas</button><button class="btn-ghost" id="pdvConsultarAjustes">Ajustes posteriores</button>${temCargo(perfil, "admin") ? '<button class="btn-ghost" id="pdvCorrigirFechamento">Registrar correção</button>' : ""}<button class="btn-primary" onclick="window.fecharModal()">Concluir</button>`,
    { tamanho: "lg" },
  );
  $("pdvBaixarFechamento").onclick = (e) =>
    fazer(e.currentTarget, () => pdfFechamento(f));
  $("pdvImprimirFechamento").onclick = (e) =>
    fazer(e.currentTarget, () => imprimirHtml(htmlFechamento(f)));
  $("pdvVisualizarFechamento").onclick = () =>
    imprimirVisualizacao(htmlFechamento(f));
  if ($("pdvCorrigirFechamento"))
    $("pdvCorrigirFechamento").onclick = () => corrigirFechamento(id);
  let ajustes = [],
    cursorA = null,
    movs = [],
    cursorM = null;
  const lerAjustes = async () => {
    const r = await listarAjustes(id, cursorA);
    ajustes.push(...r.itens);
    cursorA = r.cursor;
    $("pdvAjustes").innerHTML =
      "<h3>Ajustes posteriores - relatório original preservado</h3>" +
      ajustes
        .map(
          (a) =>
            "<p>" +
            horario(a.criadoEm) +
            " • " +
            esc(a.vendaId || "Correção administrativa") +
            " • " +
            esc(a.motivo) +
            " • Responsável: " +
            esc(a.operadorUid) +
            (a.tipo === "correcao_fechamento"
              ? " • Contado corrigido: " +
                reais(a.depois.contadoCentavos) +
                " • Diferença corrigida: " +
                reais(a.depois.diferencaCentavos)
              : "") +
            "</p>",
        )
        .join("") +
      (ajustes.length ? "" : "<p>Nenhum ajuste registrado.</p>") +
      (cursorA
        ? '<button class="btn-secondary" id="pdvMaisAjustes">Carregar mais ajustes</button>'
        : "");
    if (cursorA)
      $("pdvMaisAjustes").onclick = (e) => fazer(e.currentTarget, lerAjustes);
  };
  $("pdvConsultarAjustes").onclick = (e) =>
    fazer(e.currentTarget, async () => {
      ajustes = [];
      cursorA = null;
      await lerAjustes();
    });
  const lerMovs = async () => {
    const r = await listarMovimentos(id, cursorM);
    movs.push(...r.itens);
    cursorM = r.cursor;
    $("pdvAjustes").innerHTML =
      "<h3>Movimentações registradas</h3>" +
      movs
        .map(
          (m) =>
            "<p>" +
            horario(m.criadoEm) +
            " • " +
            esc(m.tipo) +
            " • " +
            reais(m.valorCentavos) +
            " • " +
            esc(m.motivo) +
            " • Operador: " +
            esc(m.operadorUid) +
            (m.vendaId ? " • Venda: " + esc(m.vendaId) : "") +
            "</p>",
        )
        .join("") +
      (movs.length ? "" : "<p>Nenhuma movimentação registrada.</p>") +
      (cursorM
        ? '<button class="btn-secondary" id="pdvMaisMovs">Carregar mais movimentações</button>'
        : "");
    if (cursorM)
      $("pdvMaisMovs").onclick = (e) => fazer(e.currentTarget, lerMovs);
  };
  $("pdvConsultarMovimentos").onclick = (e) =>
    fazer(e.currentTarget, async () => {
      movs = [];
      cursorM = null;
      await lerMovs();
    });
}
function imprimirVisualizacao(html) {
  const w = window.open("", "_blank");
  if (!w) throw Error("Permita abrir a visualização.");
  w.document.write(
    `<html><head><meta charset="utf-8"><title>Papelaria Futura - Fechamento</title><style>${ESTILO_DOCUMENTOS}</style></head><body>${html}</body></html>`,
  );
  w.document.close();
}
export async function movimentarPdv() {
  const abertos = await getDocs(
    query(collection(db, "pf_caixa_sessoes"), where("status", "==", "aberto")),
  );
  const sessoes = abertos.docs
    .map((d) => ({ ...d.data(), id: d.id }))
    .filter((s) => s.versaoPdv === 2);
  if (!sessoes.length)
    throw Error("Não há caixa vinculado aberto para movimentar.");
  const s =
    sessoes.find((s) => s.operadorAberturaUid === auth.currentUser.uid) ||
    sessoes[0];
  const id = doc(collection(db, "pf_caixa_movimentos")).id;
  window.abrirModal(
    "Movimentação de dinheiro",
    `<p>Caixa ${esc(s.caixaNumero)}. Registre somente valores efetivamente movimentados na gaveta.</p><div class="pdv-form"><label>Caixa aberto<select id="pdvSessaoMov">${sessoes.map((o) => `<option value="${esc(o.id)}">${esc(o.caixaNumero)} — ${esc(o.operadorAberturaNome)}</option>`).join("")}</select></label><label>Tipo<select id="pdvTipoMov"><option value="suprimento">Suprimento / reforço</option><option value="sangria">Sangria / retirada</option><option value="devolucao">Devolução em dinheiro</option></select></label><label>Valor (R$)<input id="pdvValorMov" inputmode="decimal"></label><label>Motivo<input id="pdvMotivoMov" maxlength="500"></label><label>ID da venda (para devolução)<input id="pdvVendaMov"></label></div>`,
    '<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button><button class="btn-primary" id="pdvSalvarMov">Registrar movimentação</button>',
  );
  $("pdvSessaoMov").value = s.id;
  $("pdvSalvarMov").onclick = (e) =>
    fazer(e.currentTarget, async () => {
      const tipo = $("pdvTipoMov").value,
        vendaId = $("pdvVendaMov").value.trim() || null;
      if (tipo === "devolucao" && !vendaId)
        throw Error("Informe o ID da venda para rastrear a devolução.");
      await registrarMovimento(
        {
          sessaoId: $("pdvSessaoMov").value,
          tipo,
          valor: centavos($("pdvValorMov").value),
          motivo: $("pdvMotivoMov").value,
          vendaId,
        },
        id,
      );
      window.fecharModal();
      toast("Movimentação registrada.", "success");
    });
}
export async function historicoVendasPdv() {
  let cursor = null;
  const vendas = [];
  const admin = temCargo(perfil, "admin");
  async function carregar() {
    const r = await listarVendasPdv(
      cursor,
      admin ? null : auth.currentUser.uid,
    );
    cursor = r.cursor;
    vendas.push(...r.itens);
    window.abrirModal(
      "Histórico de vendas",
      `<div class="table-wrap"><table class="data-table pdv-tabela"><thead><tr><th>Venda / Data</th><th>Vendedor</th><th>Itens</th><th>Total</th><th>Ações</th></tr></thead><tbody>${vendas.map((v) => `<tr><td>#${esc(String(v.numero || v.id))}<br>${horario(v.criadoEm)}</td><td>${esc(v.vendedorNome || "Vendedor não identificado")}</td><td>${v.itens?.length || 0}</td><td>${reais(v.totalCentavos ?? centavos(v.total || 0))}</td><td><button class="btn-ghost" data-cupom="${esc(v.id)}">Visualizar venda / produtos</button><button class="btn-ghost" data-cupom="${esc(v.id)}">Gerar comprovante</button><button class="btn-ghost" data-cupompdf="${esc(v.id)}">Baixar PDF</button><button class="btn-ghost" data-cupomprint="${esc(v.id)}">Reimprimir</button></td></tr>`).join("") || '<tr><td colspan="5">Nenhuma venda.</td></tr>'}</tbody></table></div>`,
      `<button class="btn-secondary" id="pdvMaisVendas" ${cursor ? "" : "disabled"}>Carregar mais</button><button class="btn-ghost" onclick="window.fecharModal()">Concluir</button>`,
      { tamanho: "lg" },
    );
    $("pdvMaisVendas").onclick = (e) => fazer(e.currentTarget, carregar);
    document
      .querySelectorAll("[data-cupom]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            fazer(b, () => mostrarComprovante(b.dataset.cupom))),
      );
    document
      .querySelectorAll("[data-cupompdf]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            fazer(b, () =>
              pdfComprovante(
                comprovanteDaVenda(
                  vendas.find((v) => v.id === b.dataset.cupompdf),
                ),
              ),
            )),
      );
    document
      .querySelectorAll("[data-cupomprint]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            imprimirHtml(
              htmlComprovante(
                comprovanteDaVenda(
                  vendas.find((v) => v.id === b.dataset.cupomprint),
                ),
              ),
            )),
      );
  }
  await carregar();
}
export async function iniciarHistoricoCaixas() {
  if (!temCargo(perfil, "admin")) return;
  const raiz = $("pdvHistoricoCaixas");
  if (!raiz) return;
  raiz.innerHTML = `<div class="card"><h3>Histórico de caixas</h3><div class="pdv-form"><label>Mês<input type="month" id="pdvMesHist" value="${dataLocal().slice(0, 7)}"></label><label>De<input type="date" id="pdvInicioHist"></label><label>Até<input type="date" id="pdvFimHist"></label><label>Operador<select id="pdvOperadorHist"><option value="">Todos</option></select></label><label>Número do caixa<input id="pdvNumeroHist" placeholder="Todos"></label><button class="btn-secondary" id="pdvFiltrarHist">Consultar</button><button class="btn-ghost" id="pdvConfigLoja">Dados da loja / impressão</button><button class="btn-secondary" id="pdvMovimentarAdm">Movimentação de dinheiro</button><button class="btn-ghost" id="pdvLegados">Fechamentos antigos</button></div><div id="pdvListaFechamentos"></div><button class="btn-secondary" id="pdvMaisFechamentos" hidden>Carregar mais</button></div>`;
  const p = intervalo("mes");
  $("pdvInicioHist").value = dataLocal(p.inicio);
  $("pdvFimHist").value = dataLocal();
  const usuarios = await getDocs(collection(db, "usuarios"));
  $("pdvOperadorHist").innerHTML += [...usuarios.docs]
    .map(
      (d) =>
        `<option value="${esc(d.id)}">${esc(d.data().nome || d.id)}</option>`,
    )
    .join("");
  let cursor = null,
    itens = [],
    filtro = null;
  const carregar = async (mais = false) => {
    if (!mais) {
      cursor = null;
      itens = [];
      filtro = {
        ...intervalo(
          "personalizado",
          $("pdvInicioHist").value,
          $("pdvFimHist").value,
        ),
        operador: $("pdvOperadorHist").value,
        numero: $("pdvNumeroHist").value.trim(),
      };
    }
    const r = await historicoFechamentos({ ...filtro, cursor });
    cursor = r.cursor;
    itens.push(...r.itens);
    $("pdvListaFechamentos").innerHTML =
      `<div class="table-wrap"><table class="data-table pdv-tabela"><thead><tr>${["Fechamento / Caixa", "Data", "Operador", "Abertura", "Fechamento", "Total vendido", "Comissões válidas", "Diferença", "Status", "Ações"].map((t) => "<th>" + t + "</th>").join("")}</tr></thead><tbody>${itens.map((f) => `<tr><td>${esc(f.numero)}<br>${esc(f.caixaNumero)}</td><td>${horario(f.fechadoEm)}</td><td>${esc(f.operadorNome)}</td><td>${horario(f.abertoEm)}</td><td>${horario(f.fechadoEm)}</td><td>${reais(f.resumo.liquido)}</td><td>${reais(f.resumo.comissaoValida)}</td><td>${reais(f.diferencaCentavos)}</td><td>${esc(f.status)}</td><td><button class="btn-ghost" data-fechamento="${esc(f.id)}">Visualizar</button><button class="btn-ghost" data-fechapdf="${esc(f.id)}">Baixar PDF</button><button class="btn-ghost" data-fechaprint="${esc(f.id)}">Imprimir</button></td></tr>`).join("") || '<tr><td colspan="10">Nenhum fechamento neste período.</td></tr>'}</tbody></table></div>`;
    $("pdvMaisFechamentos").hidden = !cursor;
    document
      .querySelectorAll("[data-fechamento]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            fazer(b, () => visualizarFechamento(b.dataset.fechamento))),
      );
    document
      .querySelectorAll("[data-fechapdf]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            fazer(b, () =>
              pdfFechamento(itens.find((f) => f.id === b.dataset.fechapdf)),
            )),
      );
    document
      .querySelectorAll("[data-fechaprint]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            imprimirHtml(
              htmlFechamento(itens.find((f) => f.id === b.dataset.fechaprint)),
            )),
      );
  };
  $("pdvMesHist").onchange = () => {
    const [a, m] = $("pdvMesHist").value.split("-").map(Number);
    $("pdvInicioHist").value = dataLocal(new Date(a, m - 1, 1));
    $("pdvFimHist").value = dataLocal(new Date(a, m, 0));
    fazer(null, () => carregar());
  };
  $("pdvFiltrarHist").onclick = (e) => fazer(e.currentTarget, () => carregar());
  $("pdvMaisFechamentos").onclick = (e) =>
    fazer(e.currentTarget, () => carregar(true));
  $("pdvConfigLoja").onclick = () => fazer(null, configurarLoja);
  $("pdvMovimentarAdm").onclick = () => fazer(null, movimentarPdv);
  $("pdvLegados").onclick = () => fazer(null, legados);
  await carregar();
}
async function configurarLoja() {
  const c = await configuracaoPdv();
  window.abrirModal(
    "Dados da Papelaria Futura",
    `<div class="pdv-form">${[
      ["endereco", "Endereço"],
      ["telefone", "Telefone"],
      ["cnpj", "CNPJ"],
      ["agradecimento", "Mensagem de agradecimento"],
    ]
      .map(
        ([id, l]) =>
          `<label>${l}<input id="pdvConfig_${id}" value="${esc(c[id] || "")}"></label>`,
      )
      .join(
        "",
      )}<label>Formato padrão<select id="pdvConfig_formato"><option value="a4">A4</option><option value="58">58 mm</option><option value="80">80 mm</option></select></label></div><p>Os dados da loja e o formato padrão serão usados nos novos comprovantes. Os documentos anteriores preservam os dados registrados na venda.</p>`,
    '<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button><button class="btn-primary" id="pdvSalvarConfig">Salvar configuração</button>',
  );
  $("pdvConfig_formato").value = c.formato || "a4";
  $("pdvSalvarConfig").onclick = (e) =>
    fazer(e.currentTarget, async () => {
      const d = Object.fromEntries(
        ["endereco", "telefone", "cnpj", "agradecimento", "formato"].map(
          (k) => [k, $("pdvConfig_" + k).value],
        ),
      );
      await salvarConfiguracaoPdv(d);
      window.fecharModal();
      toast("Dados e formato padrão salvos.", "success");
    });
}
async function legados() {
  const p = intervalo(
    "personalizado",
    $("pdvInicioHist").value,
    $("pdvFimHist").value,
  );
  let cursor = null;
  const itens = [];
  async function carregar() {
    const filtros = [
      where("status", "==", "fechado"),
      where("fechadoEm", ">=", p.inicio),
      where("fechadoEm", "<", p.fim),
      orderBy("fechadoEm", "desc"),
      limit(30),
    ];
    if (cursor) filtros.push(startAfter(cursor));
    const s = await getDocs(
      query(collection(db, "pf_caixa_sessoes"), ...filtros),
    );
    cursor = s.docs.length === 30 ? s.docs.at(-1) : null;
    itens.push(
      ...s.docs
        .map((d) => ({ ...d.data(), id: d.id }))
        .filter((d) => d.versaoPdv !== 2),
    );
    window.abrirModal(
      "Fechamentos anteriores à atualização",
      `<p>Estes registros foram preservados como estavam. Campos não guardados pelo sistema antigo não podem ser reconstruídos automaticamente.</p>${itens.map((s) => `<details><summary>${esc(s.id)} • ${horario(s.fechadoEm)} • ${esc(s.operadorFechamentoNome || s.operadorAberturaNome)}</summary><pre style="white-space:pre-wrap">${esc(JSON.stringify(s.resumo || {}, null, 2))}</pre><button class="btn-ghost" data-legado="${esc(s.id)}">Visualizar</button><button class="btn-ghost" data-legadopdf="${esc(s.id)}">Baixar PDF</button><button class="btn-ghost" data-legadoprint="${esc(s.id)}">Imprimir</button></details>`).join("") || "<p>Nenhum fechamento antigo nesta página.</p>"}`,
      `<button class="btn-secondary" id="pdvMaisLegados" ${cursor ? "" : "disabled"}>Carregar mais</button><button class="btn-ghost" onclick="window.fecharModal()">Fechar</button>`,
      { tamanho: "lg" },
    );
    document
      .querySelectorAll("[data-legado]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            imprimirVisualizacao(
              htmlFechamentoLegado(
                itens.find((s) => s.id === b.dataset.legado),
              ),
            )),
      );
    document
      .querySelectorAll("[data-legadopdf]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            fazer(b, () =>
              pdfFechamentoLegado(
                itens.find((s) => s.id === b.dataset.legadopdf),
              ),
            )),
      );
    document
      .querySelectorAll("[data-legadoprint]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            imprimirHtml(
              htmlFechamentoLegado(
                itens.find((s) => s.id === b.dataset.legadoprint),
              ),
            )),
      );
    $("pdvMaisLegados").onclick = (e) => fazer(e.currentTarget, carregar);
  }
  await carregar();
}

export async function acaoVendaPdv(id, acao) {
  if (acao === "visualizar") return mostrarComprovante(id);
  const c = comprovanteDaVenda(await buscarVenda(id));
  if (acao === "pdf") return pdfComprovante(c, c.empresa?.formato || "a4");
  if (acao === "imprimir")
    return imprimirHtml(
      htmlComprovante(c, c.empresa?.formato || "a4"),
      c.empresa?.formato || "a4",
    );
}

function fecharLegado(s, aposFechar) {
  window.abrirModal(
    "Encerrar sessão anterior à atualização",
    '<p>Esta sessão foi aberta antes do vínculo de vendas ao caixa. Nenhuma venda será atribuída automaticamente a ela. Os dados antigos serão preservados no Histórico de Caixas.</p><div class="pdv-form"><label>Dinheiro contado (R$)<input id="pdvContadoLegado" inputmode="decimal"></label><label>Motivo da transição<input id="pdvMotivoLegado" value="Encerramento da sessão anterior para iniciar o caixa vinculado"></label></div>',
    '<button class="btn-ghost" onclick="window.fecharModal()">Voltar</button><button class="btn-primary" id="pdvEncerrarLegado">Confirmar encerramento da sessão anterior</button>',
  );
  $("pdvEncerrarLegado").onclick = (e) =>
    fazer(e.currentTarget, async () => {
      if (!$("pdvContadoLegado").value.trim())
        throw Error("Informe o dinheiro contado.");
      await encerrarSessaoLegada(
        s.id,
        centavos($("pdvContadoLegado").value),
        $("pdvMotivoLegado").value,
      );
      await aposFechar?.();
      window.fecharModal();
      toast(
        "Sessão anterior arquivada. Abra uma nova sessão para passar as próximas vendas.",
        "success",
      );
    });
}
function corrigirFechamento(id) {
  const operacao = doc(collection(db, "pf_caixa_ajustes")).id;
  window.abrirModal(
    "Correção administrativa de conferência",
    '<p>O relatório original será preservado. A correção fica registrada separadamente com motivo, data e responsável.</p><div class="pdv-form"><label>Dinheiro contado corrigido (R$)<input id="pdvContadoCorrigido" inputmode="decimal"></label><label>Motivo obrigatório<input id="pdvMotivoCorrecao" maxlength="500"></label></div>',
    '<button class="btn-ghost" onclick="window.fecharModal()">Cancelar</button><button class="btn-primary" id="pdvSalvarCorrecao">Confirmar correção</button>',
  );
  $("pdvSalvarCorrecao").onclick = (e) =>
    fazer(e.currentTarget, async () => {
      if (!$("pdvContadoCorrigido").value.trim())
        throw Error("Informe o dinheiro contado.");
      await registrarCorrecaoFechamento(
        id,
        centavos($("pdvContadoCorrigido").value),
        $("pdvMotivoCorrecao").value,
        operacao,
      );
      await visualizarFechamento(id);
      toast("Correção registrada sem alterar o relatório original.", "success");
    });
}
