// ============================================================
// cotacao.js — Mini Excel + CRUD de Cotações
// ============================================================

import {
  criarCotacao, atualizarCotacao, listarCotacoes,
  excluirCotacao, buscarCotacao, formatarMoeda, formatarData
} from "./database.js";
import { badgeStatus, escHtml } from "./dashboard.js";
import { gerarPDF } from "./pdf.js";
import { exigirSenhaCotacao } from "./senhaCotacao.js";

let _usuario      = null;
let _dadosUsuario = null;
let _contadorLinhas = 0;
let _modoSomenteLeitura = false;
let _funcionarioCotacaoAtual = null; // nome de quem realmente criou/editou a cotação carregada

export function iniciarCotacao(usuario, dadosUsuario) {
  _usuario      = usuario;
  _dadosUsuario = dadosUsuario;

  // Navegação
  document.addEventListener("navegacao", (e) => {
    if (e.detail.page === "cotacoes")     carregarListaCotacoes();
    if (e.detail.page === "nova-cotacao") prepararNovaCotacao();
  });

  // Máscara CNPJ
  document.getElementById("cotCnpj")?.addEventListener("input", (e) => {
    let v = e.target.value.replace(/\D/g,"").substring(0,14);
    if (v.length > 12) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})$/,"$1.$2.$3/$4-$5");
    else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})$/,"$1.$2.$3/$4");
    else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d{0,3})$/,"$1.$2.$3");
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,3})$/,"$1.$2");
    e.target.value = v;
  });

  // Botões do formulário
  document.getElementById("btnAdicionarLinha")?.addEventListener("click", adicionarLinha);
  document.getElementById("btnSalvarCotacao")?.addEventListener("click", salvarCotacao);
  document.getElementById("btnGerarPDF")?.addEventListener("click", () => gerarPDFDaTela());
  document.getElementById("btnBuscarCotacoes")?.addEventListener("click", () => {
    const termo = document.getElementById("filtroBusca").value.trim();
    const dataInicio = document.getElementById("cotFiltroDataInicio").value || null;
    const dataFim    = document.getElementById("cotFiltroDataFim").value || null;
    carregarListaCotacoes(termo, dataInicio, dataFim);
  });
  document.getElementById("btnLimparBusca")?.addEventListener("click", () => {
    document.getElementById("filtroBusca").value = "";
    carregarListaCotacoes();
  });
  document.getElementById("filtroBusca")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") carregarListaCotacoes(e.target.value.trim());
  });

  // Busca por intervalo de datas
  document.getElementById("btnAplicarFiltroDataCotacoes")?.addEventListener("click", () => {
    const termo     = document.getElementById("filtroBusca").value.trim();
    const dataInicio = document.getElementById("cotFiltroDataInicio").value || null;
    const dataFim    = document.getElementById("cotFiltroDataFim").value || null;
    carregarListaCotacoes(termo, dataInicio, dataFim);
  });
  document.getElementById("btnLimparFiltroDataCotacoes")?.addEventListener("click", () => {
    document.getElementById("cotFiltroDataInicio").value = "";
    document.getElementById("cotFiltroDataFim").value = "";
    carregarListaCotacoes(document.getElementById("filtroBusca").value.trim());
  });

  // ── Event delegation na tabela de cotações ─────────────────
  // NÃO usa onclick inline — funciona de forma confiável em mobile.
  document.getElementById("tbodyCotacoes")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const { action, id, cliente } = btn.dataset;
    if (action === "abrir")   abrirCotacaoSomenteLeitura(id);
    if (action === "editar")  exigirSenhaCotacao(() => editarCotacaoById(id), "Editar Cotação");
    if (action === "pdf")     gerarPDFById(id);
    if (action === "excluir") exigirSenhaCotacao(() => excluirCotacaoById(id, cliente), "Excluir Cotação");
  });

  // Expor globais para o dashboard.js usar via window.*
  window.abrirCotacaoSomenteLeitura = abrirCotacaoSomenteLeitura;
  window.editarCotacaoById  = (id)          => exigirSenhaCotacao(() => editarCotacaoById(id), "Editar Cotação");
  window.excluirCotacaoById = (id, cliente) => exigirSenhaCotacao(() => excluirCotacaoById(id, cliente), "Excluir Cotação");
  window.gerarPDFById       = gerarPDFById;

  definirValidadePadrao();
}

// ================================================================
// LISTA DE COTAÇÕES
// ================================================================
async function carregarListaCotacoes(termoBusca = "", dataInicio = null, dataFim = null) {
  const tbody = document.getElementById("tbodyCotacoes");
  tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Carregando...</td></tr>`;

  const resultado = await listarCotacoes({
    cliente: termoBusca || null,
    dataInicio,
    dataFim,
    limitQtd: (dataInicio || dataFim) ? 500 : 50
  });

  if (!resultado.sucesso) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Erro ao carregar cotações.</td></tr>`;
    return;
  }

  const { cotacoes } = resultado;

  if (cotacoes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">Nenhuma cotação encontrada.</td></tr>`;
    return;
  }

  // Sem onclick inline — usa data-action + event delegation (acima)
  tbody.innerHTML = cotacoes.map(c => `
    <tr>
      <td class="td-cliente-row" title="${escHtml(c.cliente || "—")}">
        <strong>${escHtml(c.cliente || "—")}</strong>
      </td>
      <td class="td-data-col">${formatarData(c.dataCriacao)}</td>
      <td class="col-right td-valor-col"><strong class="valor-protegido">${formatarMoeda(c.valorTotal)}</strong></td>
      <td class="td-status-actions-row">
        ${badgeStatus(c.status)}
      </td>
      <td class="td-actions-col col-center">
        <div class="td-actions-wrap td-actions-wrap--cotacoes">
          <button class="btn-action btn-action--view"
            data-action="abrir" data-id="${escHtml(c.id)}">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
            Abrir
          </button>
          <button class="btn-action btn-action--pdf"
            data-action="pdf" data-id="${escHtml(c.id)}">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clip-rule="evenodd"/></svg>
            PDF
          </button>
          <button class="btn-action btn-action--edit"
            data-action="editar" data-id="${escHtml(c.id)}">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
            Editar
          </button>
          <button class="btn-action btn-action--delete"
            data-action="excluir" data-id="${escHtml(c.id)}" data-cliente="${escHtml(c.cliente || "")}">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
            Excluir
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

// ================================================================
// FORMULÁRIO DE COTAÇÃO
// ================================================================
function prepararNovaCotacao() {
  restaurarModoEdicao();
  _funcionarioCotacaoAtual = null;
  document.getElementById("cotacaoEditandoId").value = "";
  document.getElementById("titleFormCotacao").textContent = "Nova Cotação";
  const tituloMobile = document.getElementById("titleFormCotacaoMobile");
  if (tituloMobile) tituloMobile.textContent = "Nova Cotação";

  ["cotCliente","cotCnpj","cotObs"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("cotStatus").value = "ativa";
  definirValidadePadrao();

  document.getElementById("tbodyItens").innerHTML = "";
  _contadorLinhas = 0;
  adicionarLinha();
  adicionarLinha();
  adicionarLinha();

  atualizarTotalGeral();
}

function definirValidadePadrao() {
  const validade = document.getElementById("cotValidade");
  if (!validade) return;
  const data = new Date();
  data.setDate(data.getDate() + 7);
  validade.value = data.toISOString().split("T")[0];
}

// ================================================================
// MINI EXCEL — Linhas
// ================================================================
function adicionarLinha(dados = {}) {
  _contadorLinhas++;
  const n     = _contadorLinhas;
  const tbody = document.getElementById("tbodyItens");

  const vazio = tbody.querySelector(".excel-empty-row");
  if (vazio) vazio.remove();

  const tr = document.createElement("tr");
  tr.dataset.linha = n;
  const dis = _modoSomenteLeitura ? "disabled" : "";

  tr.innerHTML = `
    <td class="col-item"><span class="item-num">${n}</span></td>
    <td class="col-desc">
      <input class="excel-input" type="text" placeholder="Descrição do produto" ${dis}
        data-campo="descricao" value="${escHtml(dados.descricao || "")}" />
    </td>
    <td class="col-marca">
      <input class="excel-input" type="text" placeholder="Marca" ${dis}
        data-campo="marca" value="${escHtml(dados.marca || "")}" />
    </td>
    <td class="col-qtd">
      <input class="excel-input excel-input--center" type="number" ${dis}
        min="0" step="any" placeholder="0"
        data-campo="quantidade" value="${dados.quantidade ?? ""}" />
    </td>
    <td class="col-unit">
      <input class="excel-input excel-input--right" type="text" ${dis}
        placeholder="R$ 0,00"
        data-campo="valorUnitario" value="${dados.valorUnitario ? formatarCampoMoeda(dados.valorUnitario) : ""}" />
    </td>
    <td class="col-total cell-total" data-campo="valorTotal">
      ${formatarMoeda(calcularTotal(dados.quantidade, dados.valorUnitario))}
    </td>
    <td class="col-acao">
      <button class="btn-remove-row" aria-label="Remover linha ${n}" ${_modoSomenteLeitura ? 'style="display:none"' : ""}>
        <svg viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
      </button>
    </td>
  `;

  const inputQtd  = tr.querySelector('[data-campo="quantidade"]');
  const inputUnit = tr.querySelector('[data-campo="valorUnitario"]');
  const cellTotal = tr.querySelector('[data-campo="valorTotal"]');

  function recalcularLinha() {
    const qtd   = parsearNumero(inputQtd.value);
    const unit  = parsearMoeda(inputUnit.value);
    cellTotal.textContent = formatarMoeda(calcularTotal(qtd, unit));
    atualizarTotalGeral();
  }

  inputQtd.addEventListener("input", recalcularLinha);
  inputUnit.addEventListener("input", recalcularLinha);

  inputUnit.addEventListener("blur", () => {
    const val = parsearMoeda(inputUnit.value);
    if (val > 0) inputUnit.value = formatarCampoMoeda(val);
  });

  inputQtd.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      inputUnit.focus();
    }
  });

  tr.querySelector(".btn-remove-row").addEventListener("click", () => {
    tr.remove();
    renumerarLinhas();
    atualizarTotalGeral();
    if (document.getElementById("tbodyItens").rows.length === 0) mostrarVazio();
  });

  tbody.appendChild(tr);
  return tr;
}

function mostrarVazio() {
  document.getElementById("tbodyItens").innerHTML = `
    <tr class="excel-empty-row">
      <td colspan="7" class="excel-empty">
        <div class="excel-empty-icon">📋</div>
        Nenhum item adicionado. Clique em <strong>Adicionar Item</strong> para começar.
      </td>
    </tr>`;
}

function renumerarLinhas() {
  document.querySelectorAll("#tbodyItens tr[data-linha]").forEach((tr, i) => {
    const num = tr.querySelector(".item-num");
    if (num) num.textContent = i + 1;
  });
}

function atualizarTotalGeral() {
  let total = 0;
  document.querySelectorAll("#tbodyItens [data-campo='valorTotal']").forEach(cell => {
    total += parsearMoeda(cell.textContent);
  });
  document.getElementById("totalGeral").textContent = formatarMoeda(total);
  return total;
}

// ================================================================
// COLETA DE DADOS DO FORMULÁRIO
// ================================================================
function coletarItens() {
  const itens = [];
  document.querySelectorAll("#tbodyItens tr[data-linha]").forEach((tr, idx) => {
    const get = (campo) => tr.querySelector(`[data-campo="${campo}"]`);
    const descricao  = get("descricao")?.value?.trim()   || "";
    const marca      = get("marca")?.value?.trim()       || "";
    const quantidade = parsearNumero(get("quantidade")?.value) || 0;
    const valorUnit  = parsearMoeda(get("valorUnitario")?.value) || 0;
    const valorTotal = calcularTotal(quantidade, valorUnit);

    if (descricao || quantidade || valorUnit) {
      itens.push({ item: idx + 1, descricao, marca, quantidade, valorUnitario: valorUnit, valorTotal });
    }
  });
  return itens;
}

function coletarDadosCotacao() {
  const cliente  = document.getElementById("cotCliente").value.trim();
  const cnpj     = document.getElementById("cotCnpj").value.trim();
  const validade = document.getElementById("cotValidade").value;
  const obs      = document.getElementById("cotObs").value.trim();
  const status   = document.getElementById("cotStatus").value;
  const itens    = coletarItens();
  const valorTotal = itens.reduce((s, i) => s + i.valorTotal, 0);

  return { cliente, cnpj, validade, observacoes: obs, status, itens, valorTotal, funcionario: nomeFuncionarioLogado() };
}

// ================================================================
// SALVAR COTAÇÃO
// ================================================================
async function salvarCotacao() {
  const dados = coletarDadosCotacao();

  if (!dados.cliente) {
    window.mostrarToast?.("Informe o nome do cliente.", "warning");
    document.getElementById("cotCliente").focus();
    return;
  }
  if (!dados.validade) {
    window.mostrarToast?.("Informe a validade da cotação.", "warning");
    document.getElementById("cotValidade").focus();
    return;
  }
  if (dados.itens.length === 0) {
    window.mostrarToast?.("Adicione ao menos um item.", "warning");
    return;
  }

  const btnSalvar = document.getElementById("btnSalvarCotacao");
  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  const idEditando = document.getElementById("cotacaoEditandoId").value;
  const resultado  = idEditando
    ? await atualizarCotacao(idEditando, dados)
    : await criarCotacao(dados, _usuario.uid);

  btnSalvar.disabled = false;
  btnSalvar.innerHTML = `
    <svg viewBox="0 0 20 20" fill="currentColor"><path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z"/></svg>
    Salvar`;

  if (resultado.sucesso) {
    window.mostrarToast?.("Cotação salva com sucesso!", "success");
    if (!idEditando && resultado.id) {
      document.getElementById("cotacaoEditandoId").value = resultado.id;
      document.getElementById("titleFormCotacao").textContent = "Editar Cotação";
    }
  } else {
    window.mostrarToast?.("Erro ao salvar: " + resultado.erro, "error");
  }
}

// ================================================================
// ABRIR (SOMENTE LEITURA) — sem exigir senha
// ================================================================
async function abrirCotacaoSomenteLeitura(id) {
  window.navegar?.("nova-cotacao");
  await new Promise(r => setTimeout(r, 50));
  _modoSomenteLeitura = true;

  const resultado = await buscarCotacao(id);
  if (!resultado.sucesso) {
    window.mostrarToast?.("Cotação não encontrada.", "error");
    _modoSomenteLeitura = false;
    return;
  }

  const c = resultado.dados;
  _funcionarioCotacaoAtual = c.funcionario || null;

  document.getElementById("cotacaoEditandoId").value      = id;
  document.getElementById("titleFormCotacao").textContent = "Visualizar Cotação";
  const tituloMobile = document.getElementById("titleFormCotacaoMobile");
  if (tituloMobile) tituloMobile.textContent = "Visualizar Cotação";

  ["cotCliente","cotCnpj","cotValidade","cotStatus","cotObs"].forEach(campoId => {
    const el = document.getElementById(campoId);
    if (el) el.disabled = true;
  });
  document.getElementById("cotCliente").value  = c.cliente     || "";
  document.getElementById("cotCnpj").value     = c.cnpj        || "";
  document.getElementById("cotValidade").value = c.validade    || "";
  document.getElementById("cotObs").value      = c.observacoes || "";
  document.getElementById("cotStatus").value   = c.status      || "ativa";

  document.getElementById("btnSalvarCotacao")?.setAttribute("hidden", "true");
  document.getElementById("btnAdicionarLinha")?.setAttribute("hidden", "true");

  document.getElementById("tbodyItens").innerHTML = "";
  _contadorLinhas = 0;
  const itens = c.itens || [];
  if (itens.length === 0) {
    document.getElementById("tbodyItens").innerHTML =
      `<tr><td colspan="7" class="empty-cell">Nenhum item nesta cotação.</td></tr>`;
  } else {
    itens.forEach(item => adicionarLinha(item));
  }

  atualizarTotalGeral();
}

// Restaura o formulário ao modo normal (edição/criação) ao saída da
// tela de visualização — chamado pela navegação ao trocar de página.
function restaurarModoEdicao() {
  if (!_modoSomenteLeitura) return;
  _modoSomenteLeitura = false;
  ["cotCliente","cotCnpj","cotValidade","cotStatus","cotObs"].forEach(campoId => {
    const el = document.getElementById(campoId);
    if (el) el.disabled = false;
  });
  document.getElementById("btnSalvarCotacao")?.removeAttribute("hidden");
  document.getElementById("btnAdicionarLinha")?.removeAttribute("hidden");
}

// ================================================================
// EDITAR COTAÇÃO
// ================================================================
async function editarCotacaoById(id) {
  window.navegar?.("nova-cotacao");
  await new Promise(r => setTimeout(r, 50));

  const resultado = await buscarCotacao(id);
  if (!resultado.sucesso) {
    window.mostrarToast?.("Cotação não encontrada.", "error");
    return;
  }

  const c = resultado.dados;
  _funcionarioCotacaoAtual = c.funcionario || null;

  document.getElementById("cotacaoEditandoId").value       = id;
  document.getElementById("titleFormCotacao").textContent  = "Editar Cotação";
  document.getElementById("cotCliente").value  = c.cliente    || "";
  document.getElementById("cotCnpj").value     = c.cnpj       || "";
  document.getElementById("cotValidade").value = c.validade   || "";
  document.getElementById("cotObs").value      = c.observacoes || "";
  document.getElementById("cotStatus").value   = c.status     || "ativa";

  document.getElementById("tbodyItens").innerHTML = "";
  _contadorLinhas = 0;
  const itens = c.itens || [];
  if (itens.length === 0) {
    adicionarLinha(); adicionarLinha(); adicionarLinha();
  } else {
    itens.forEach(item => adicionarLinha(item));
  }

  atualizarTotalGeral();
}

// ================================================================
// EXCLUIR COTAÇÃO
// ================================================================
async function excluirCotacaoById(id, cliente) {
  window.abrirModal?.(
    "Excluir Cotação",
    `<div class="delete-warning">
      <strong>⚠ Atenção!</strong>
      Você está prestes a excluir permanentemente a cotação de <strong>${escHtml(cliente)}</strong>.
      Esta ação não pode ser desfeita.
    </div>`,
    `<button class="btn-ghost" id="cancelarExclusao">Cancelar</button>
     <button class="btn-danger" id="confirmarExclusao">Excluir permanentemente</button>`
  );

  // Usa addEventListener em vez de onclick inline no modal também
  document.getElementById("cancelarExclusao")?.addEventListener("click", () => {
    window.fecharModal?.();
  });

  document.getElementById("confirmarExclusao")?.addEventListener("click", async () => {
    const resultado = await excluirCotacao(id);
    window.fecharModal?.();

    if (resultado.sucesso) {
      window.mostrarToast?.("Cotação excluída.", "success");
      carregarListaCotacoes();
    } else {
      window.mostrarToast?.("Erro ao excluir: " + resultado.erro, "error");
    }
  });
}

// ================================================================
// GERAR PDF
// ================================================================
function nomeFuncionarioLogado() {
  return _dadosUsuario?.nome || _usuario?.email?.split("@")[0] || "—";
}

function gerarPDFDaTela() {
  const dados = coletarDadosCotacao();
  if (!dados.cliente) {
    window.mostrarToast?.("Informe o nome do cliente antes de gerar o PDF.", "warning");
    return;
  }
  if (dados.itens.length === 0) {
    window.mostrarToast?.("Adicione ao menos um item.", "warning");
    return;
  }
  // Só usa o usuário logado como "elaborado por" se for uma cotação nova
  // (ainda não salva). Se já existe (visualizando/editando), mantém o
  // nome de quem realmente criou/editou pela última vez via salvarCotacao.
  const idEditando = document.getElementById("cotacaoEditandoId").value;
  dados.funcionario = idEditando ? (_funcionarioCotacaoAtual || "—") : nomeFuncionarioLogado();
  gerarPDF(dados);
}

async function gerarPDFById(id) {
  const resultado = await buscarCotacao(id);
  if (!resultado.sucesso) {
    window.mostrarToast?.("Cotação não encontrada.", "error");
    return;
  }
  const dados = resultado.dados;
  // Mantém o elaborador real já salvo na cotação — apenas baixar/abrir o
  // PDF não deve mudar quem aparece como responsável.
  dados.funcionario = dados.funcionario || "—";
  gerarPDF(dados);
}

// ================================================================
// UTILITÁRIOS NUMÉRICOS
// ================================================================
function parsearNumero(valor) {
  return parseFloat(String(valor || "0").replace(",", ".")) || 0;
}

function parsearMoeda(valor) {
  if (typeof valor !== "string") return Number(valor) || 0;
  return parseFloat(
    valor.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".")
  ) || 0;
}

function calcularTotal(qtd, unit) {
  return parsearNumero(qtd) * parsearNumero(unit);
}

function formatarCampoMoeda(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL"
  }).format(Number(valor) || 0);
}
