// ============================================================
// cotacao.js — Mini Excel + CRUD de Cotações
// ============================================================

import {
  criarCotacao, atualizarCotacao, listarCotacoes,
  excluirCotacao, buscarCotacao, formatarMoeda, formatarData,
  buscarConfigLembreteCotacao, marcarLembreteEnviado
} from "./database.js";
import { badgeStatus, escHtml } from "./index.js";
import { gerarPDF } from "./pdf.js";

let _usuario      = null;
let _dadosUsuario = null;
let _contadorLinhas = 0;
let _modoSomenteLeitura = false;
let _funcionarioCotacaoAtual = null; // nome de quem realmente criou/editou a cotação carregada
let _tipoPessoaAtual = "pf"; // "pf" (CPF) ou "pj" (CNPJ) — controla a máscara do campo cotCnpj

// Aplica a máscara de CPF ou CNPJ de acordo com o tipo informado.
function aplicarMascaraDocumento(valorBruto, tipo) {
  if (tipo === "pj") {
    let v = valorBruto.replace(/\D/g,"").substring(0,14);
    if (v.length > 12) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})$/,"$1.$2.$3/$4-$5");
    else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})$/,"$1.$2.$3/$4");
    else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d{0,3})$/,"$1.$2.$3");
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,3})$/,"$1.$2");
    return v;
  }
  let v = valorBruto.replace(/\D/g,"").substring(0,11);
  if (v.length > 9) v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2})$/,"$1.$2.$3-$4");
  else if (v.length > 6) v = v.replace(/^(\d{3})(\d{3})(\d{0,3})$/,"$1.$2.$3");
  else if (v.length > 3) v = v.replace(/^(\d{3})(\d{0,3})$/,"$1.$2");
  return v;
}

// Alterna o tipo de pessoa selecionado, atualizando botões, label,
// placeholder do campo e reformatando o valor já digitado.
function definirTipoPessoa(tipo) {
  _tipoPessoaAtual = tipo;

  const btnPf = document.getElementById("btnTipoPessoaFisica");
  const btnPj = document.getElementById("btnTipoPessoaJuridica");
  btnPf?.classList.toggle("is-active", tipo === "pf");
  btnPj?.classList.toggle("is-active", tipo === "pj");

  const label = document.getElementById("labelCotCnpj");
  const input = document.getElementById("cotCnpj");
  if (label) label.textContent = tipo === "pj" ? "CNPJ" : "CPF";
  if (input) {
    input.placeholder = tipo === "pj" ? "00.000.000/0001-00" : "000.000.000-00";
    input.value = aplicarMascaraDocumento(input.value, tipo);
  }
}

// Detecta pf/pj a partir da quantidade de dígitos de um documento já
// salvo (11 = CPF, 14 = CNPJ) — usado ao abrir uma cotação existente.
function detectarTipoPessoaPorDocumento(documento) {
  const digitos = (documento || "").replace(/\D/g,"");
  return digitos.length > 11 ? "pj" : "pf";
}

// Paginação da lista de cotações
const COTACOES_POR_PAGINA = 30;
let _cotFiltroAtual   = { termoBusca: "", dataInicio: null, dataFim: null };
let _cotPaginaCursor  = null;
let _cotTemMais       = false;
let _cotCarregandoMais = false;

export function iniciarCotacao(usuario, dadosUsuario) {
  _usuario      = usuario;
  _dadosUsuario = dadosUsuario;

  carregarConfigLembrete();

  // Navegação
  document.addEventListener("navegacao", (e) => {
    if (e.detail.page === "cotacoes")     carregarListaCotacoes();
    if (e.detail.page === "nova-cotacao") prepararNovaCotacao();
  });

  // Toggle Pessoa Física / Pessoa Jurídica
  document.getElementById("btnTipoPessoaFisica")?.addEventListener("click", () => definirTipoPessoa("pf"));
  document.getElementById("btnTipoPessoaJuridica")?.addEventListener("click", () => definirTipoPessoa("pj"));

  // Máscara CPF / CNPJ, conforme o tipo selecionado
  document.getElementById("cotCnpj")?.addEventListener("input", (e) => {
    e.target.value = aplicarMascaraDocumento(e.target.value, _tipoPessoaAtual);
  });

  // Máscara + validação de Telefone/WhatsApp
  document.getElementById("cotTelefone")?.addEventListener("input", (e) => {
    let v = e.target.value.replace(/\D/g,"").substring(0,11);
    if (v.length > 10) v = v.replace(/^(\d{2})(\d{5})(\d{0,4})$/,"($1) $2-$3");
    else if (v.length > 6) v = v.replace(/^(\d{2})(\d{4})(\d{0,4})$/,"($1) $2-$3");
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,5})$/,"($1) $2");
    else if (v.length > 0) v = v.replace(/^(\d{0,2})$/,"($1");
    e.target.value = v;
    esconderErroTelefone();
  });
  document.getElementById("cotTelefone")?.addEventListener("blur", (e) => {
    validarECorrigirTelefone(e.target.value);
  });

  // Botões do formulário
  document.getElementById("btnAdicionarLinha")?.addEventListener("click", adicionarLinha);
  document.getElementById("btnImportarJsonItens")?.addEventListener("click", () => {
    document.getElementById("inputImportarJsonItens")?.click();
  });
  document.getElementById("inputImportarJsonItens")?.addEventListener("change", importarItensJson);
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

  document.getElementById("btnCarregarMaisCotacoes")?.addEventListener("click", carregarMaisCotacoes);

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
    if (action === "editar")  editarCotacaoById(id);
    if (action === "pdf")     gerarPDFById(id);
    if (action === "excluir") excluirCotacaoById(id, cliente);
    if (action === "lembrete") abrirLembreteCotacao(id);
  });

  // Expor globais para o index.js usar via window.*
  window.abrirCotacaoSomenteLeitura = abrirCotacaoSomenteLeitura;
  window.editarCotacaoById  = editarCotacaoById;
  window.excluirCotacaoById = excluirCotacaoById;
  window.gerarPDFById       = gerarPDFById;

  definirValidadePadrao();
}

// ================================================================
// LISTA DE COTAÇÕES
// ================================================================
async function carregarListaCotacoes(termoBusca = "", dataInicio = null, dataFim = null) {
  const tbody = document.getElementById("tbodyCotacoes");
  tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Carregando...</td></tr>`;

  _cotFiltroAtual  = { termoBusca, dataInicio, dataFim };
  _cotPaginaCursor = null;
  _cotTemMais      = false;

  const resultado = await listarCotacoes({
    cliente: termoBusca || null,
    dataInicio,
    dataFim,
    limitQtd: COTACOES_POR_PAGINA
  });

  if (!resultado.sucesso) {
    tbody.innerHTML = `<tr><td colspan="5" class="loading-cell">Erro ao carregar cotações.</td></tr>`;
    atualizarBotaoCarregarMais();
    return;
  }

  const { cotacoes, proximoCursor, temMais } = resultado;
  _cotPaginaCursor = proximoCursor;
  _cotTemMais      = !!temMais;

  if (cotacoes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">Nenhuma cotação encontrada.</td></tr>`;
    atualizarBotaoCarregarMais();
    return;
  }

  tbody.innerHTML = cotacoes.map(linhaCotacaoHtml).join("");
  atualizarBotaoCarregarMais();
}

// ----------------------------------------------------------------
// Carregar mais — busca a próxima página (mesmo filtro atual) e
// acrescenta as linhas no final da tabela, sem recarregar tudo.
// ----------------------------------------------------------------
async function carregarMaisCotacoes() {
  if (_cotCarregandoMais || !_cotTemMais) return;
  _cotCarregandoMais = true;

  const btn = document.getElementById("btnCarregarMaisCotacoes");
  if (btn) { btn.disabled = true; btn.textContent = "Carregando..."; }

  const { termoBusca, dataInicio, dataFim } = _cotFiltroAtual;

  const resultado = await listarCotacoes({
    cliente: termoBusca || null,
    dataInicio,
    dataFim,
    limitQtd: COTACOES_POR_PAGINA,
    cursor: _cotPaginaCursor
  });

  _cotCarregandoMais = false;

  if (!resultado.sucesso) {
    window.mostrarToast?.("Erro ao carregar mais cotações.", "error");
    if (btn) { btn.disabled = false; btn.textContent = "Carregar mais"; }
    return;
  }

  const { cotacoes, proximoCursor, temMais } = resultado;
  _cotPaginaCursor = proximoCursor;
  _cotTemMais      = !!temMais;

  const tbody = document.getElementById("tbodyCotacoes");
  tbody.insertAdjacentHTML("beforeend", cotacoes.map(linhaCotacaoHtml).join(""));

  atualizarBotaoCarregarMais();
}

function atualizarBotaoCarregarMais() {
  const wrap = document.getElementById("wrapCarregarMaisCotacoes");
  const btn  = document.getElementById("btnCarregarMaisCotacoes");
  if (!wrap || !btn) return;
  wrap.style.display = _cotTemMais ? "flex" : "none";
  btn.disabled = false;
  btn.textContent = "Carregar mais";
}

function linhaCotacaoHtml(c) {
  const diasParado = precisaLembrete(c);
  const ultimoEnvioDias = diasDesde(c.ultimoLembreteEm);
  return `
    <tr>
      <td class="td-cliente-row" title="${escHtml(c.cliente || "—")}">
        <strong>${escHtml(c.cliente || "—")}</strong>
      </td>
      <td class="td-data-col">${formatarData(c.dataCriacao)}</td>
      <td class="col-right td-valor-col"><strong class="valor-protegido">${formatarMoeda(c.valorTotal)}</strong></td>
      <td class="td-status-actions-row">
        ${badgeStatus(c.status)}
        ${diasParado ? `
          <button class="btn-lembrete" data-action="lembrete" data-id="${escHtml(c.id)}" title="Cotação parada há ${diasParado} dias — enviar lembrete">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6c0 1.887.87 3.4 2.026 4.474.66.614 1.05 1.155 1.208 1.526h5.532c.158-.371.548-.912 1.208-1.526A5.99 5.99 0 0016 8a6 6 0 00-6-6zM8.5 17a.5.5 0 000 1h3a.5.5 0 000-1h-3z"/></svg>
            Lembrete
          </button>` : ""}
        ${!diasParado && ultimoEnvioDias !== null ? `
          <span class="lembrete-enviado-tag" title="${escHtml(c.ultimoLembreteTipo || "Mensagem enviada")}">
            ${escHtml(c.ultimoLembreteTipo || "Lembrete enviado")} ${ultimoEnvioDias === 0 ? "hoje" : `há ${ultimoEnvioDias} dia${ultimoEnvioDias > 1 ? "s" : ""}`}
          </span>` : ""}
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
  `;
}

// ================================================================
// LEMBRETE DE FOLLOW-UP (dias sem fechar, prazo configurável)
// ================================================================
let _diasParaLembrete = 4; // valor padrão até carregar a config real

async function carregarConfigLembrete() {
  const resultado = await buscarConfigLembreteCotacao();
  _diasParaLembrete = resultado.sucesso ? resultado.dias : 4;
}

// Quantidade de dias completos desde uma data/Timestamp, ou null se vazio
function diasDesde(timestamp) {
  if (!timestamp) return null;
  const data = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  return Math.floor((Date.now() - data.getTime()) / 86400000);
}

// Retorna a quantidade de dias parada se a cotação precisar de lembrete
// (ainda "ativa", e sem retorno há _diasParaLembrete dias ou mais, contando
// a partir do último lembrete enviado — se nunca enviou, conta da criação).
function precisaLembrete(c) {
  if (c.status !== "ativa" || !c.dataCriacao) return 0;
  const referencia = c.ultimoLembreteEm || c.dataCriacao;
  const diffDias = diasDesde(referencia);
  return diffDias !== null && diffDias >= _diasParaLembrete ? diffDias : 0;
}

// Monta a mensagem de lembrete com saudação de acordo com o horário atual
function gerarMensagemLembrete() {
  const hora = new Date().getHours();
  let saudacao;
  if (hora >= 5 && hora < 12) saudacao = "Bom dia";
  else if (hora >= 12 && hora < 18) saudacao = "Boa tarde";
  else saudacao = "Boa noite";

  const nomeAtendente = nomeFuncionarioLogado();

  return `Oi, tudo bem? ${saudacao}! Me chamo ${nomeAtendente}, sou o responsável pelo setor de cotações aqui da Papelaria Futura do Centro, e queria saber se restou alguma dúvida sobre a cotação que te enviamos. Ficamos à disposição para fechar quando for melhor pra você.`;
}

// Normaliza um número de telefone para o formato usado pelo link do WhatsApp
function _telefoneParaWhatsapp(telefone) {
  const digitos = String(telefone || "").replace(/\D/g, "");
  if (!digitos) return null;
  return digitos.startsWith("55") ? digitos : `55${digitos}`;
}

async function abrirLembreteCotacao(id) {
  const resultado = await buscarCotacao(id);
  if (!resultado.sucesso) {
    window.mostrarToast?.("Cotação não encontrada.", "error");
    return;
  }
  const c = { id, ...resultado.dados };
  const mensagem = gerarMensagemLembrete();
  const numeroWhats = _telefoneParaWhatsapp(c.telefone);

  const body = `
    <p style="color:var(--gray-500);font-size:13px;margin-bottom:10px">
      Essa cotação está parada há ${precisaLembrete(c)} dias sem retorno do cliente.
    </p>
    <label class="field-label">Mensagem sugerida</label>
    <textarea class="field-input--plain field-textarea" id="textoLembreteCotacao" rows="5" style="width:100%">${escHtml(mensagem)}</textarea>
    ${!numeroWhats ? `<p style="color:#B45309;font-size:13px;margin-top:8px">Essa cotação não tem telefone cadastrado — copie a mensagem e envie manualmente, ou edite a cotação para adicionar o número.</p>` : ""}
    <label class="field-label" style="margin-top:12px">Tipo de contato</label>
    <select class="field-input--plain" id="tipoLembreteCotacao" style="width:100%">
      <option value="Mensagem enviada">Mensagem enviada</option>
      <option value="Conversei com o cliente">Conversei com o cliente</option>
      <option value="Cliente confirmou (OK)">Cliente confirmou (OK)</option>
      <option value="Sem retorno">Sem retorno</option>
    </select>
  `;

  const footer = `
    <button class="btn-ghost" id="btnFecharLembrete">Fechar</button>
    <button class="btn-secondary" id="btnCopiarLembrete">Copiar Mensagem</button>
    ${numeroWhats ? `<button class="btn-primary" id="btnEnviarWhatsapp">Enviar pelo WhatsApp</button>` : ""}
    <button class="btn-primary" id="btnConfirmarTipoLembrete">Confirmar</button>
  `;

  window.abrirModal(`Lembrete — ${c.cliente || "Cliente"}`, body, footer);

  document.getElementById("btnFecharLembrete").onclick = () => window.fecharModal();

  document.getElementById("btnCopiarLembrete").onclick = () => {
    const texto = document.getElementById("textoLembreteCotacao").value;
    const tipo = document.getElementById("tipoLembreteCotacao")?.value;
    navigator.clipboard.writeText(texto).then(async () => {
      window.mostrarToast?.("Mensagem copiada!", "success");
      await marcarLembreteEnviado(id, tipo);
      carregarListaCotacoes(document.getElementById("filtroBusca")?.value.trim() || "");
    }).catch(() => {
      window.mostrarToast?.("Não foi possível copiar. Selecione o texto manualmente.", "error");
    });
  };

  document.getElementById("btnEnviarWhatsapp")?.addEventListener("click", async () => {
    const texto = document.getElementById("textoLembreteCotacao").value;
    const tipo = document.getElementById("tipoLembreteCotacao")?.value;
    const url = `https://wa.me/${numeroWhats}?text=${encodeURIComponent(texto)}`;
    window.open(url, "_blank");
    window.fecharModal();
    await marcarLembreteEnviado(id, tipo);
    carregarListaCotacoes(document.getElementById("filtroBusca")?.value.trim() || "");
  });

  document.getElementById("btnConfirmarTipoLembrete").onclick = async () => {
    const tipo = document.getElementById("tipoLembreteCotacao")?.value;
    await marcarLembreteEnviado(id, tipo);
    window.mostrarToast?.("Lembrete atualizado!", "success");
    window.fecharModal();
    carregarListaCotacoes(document.getElementById("filtroBusca")?.value.trim() || "");
  };
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
  definirTipoPessoa("pf");
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
  data.setDate(data.getDate() + 30);
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
        data-campo="descricao" value="${escHtml(dados.descricao || "")}" autocomplete="off" />
    </td>
    <td class="col-marca">
      <input class="excel-input" type="text" placeholder="Marca" ${dis}
        data-campo="marca" value="${escHtml(dados.marca || "")}" autocomplete="off" />
    </td>
    <td class="col-unidade">
      <input class="excel-input excel-input--center" type="text" list="listaUnidadesMedida" placeholder="UND" ${dis}
        data-campo="unidade" value="${escHtml(dados.unidade || "")}" autocomplete="off" />
    </td>
    <td class="col-qtd">
      <input class="excel-input excel-input--center" type="number" ${dis}
        min="0" step="any" placeholder="0"
        data-campo="quantidade" value="${dados.quantidade ?? ""}" autocomplete="off" />
    </td>
    <td class="col-unit">
      <input class="excel-input excel-input--right" type="text" ${dis}
        placeholder="R$ 0,00"
        data-campo="valorUnitario" value="${dados.valorUnitario ? formatarCampoMoeda(dados.valorUnitario) : ""}" autocomplete="off" />
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

// ================================================================
// IMPORTAR ITENS VIA JSON
// ================================================================
// Formatos aceitos:
//   1) Lista simples de nomes:      ["Caneta azul", "Caderno 10 matérias"]
//   2) Lista de objetos:            [{ "descricao": "Caneta azul", "marca": "BIC",
//                                      "unidade": "UND", "quantidade": 10, "valorUnitario": 2.5 }]
//      Aceita variações de nome de campo: descricao/produto/nome/item,
//      marca, unidade/un, quantidade/qtd/qtde, valorUnitario/valor/preco/valorunit.
function _normalizarItemImportado(entrada) {
  if (typeof entrada === "string") {
    const descricao = entrada.trim();
    return descricao ? { descricao } : null;
  }
  if (!entrada || typeof entrada !== "object") return null;

  const pegar = (chaves) => {
    for (const chave of chaves) {
      const encontrada = Object.keys(entrada).find(k => k.toLowerCase() === chave);
      if (encontrada && entrada[encontrada] !== undefined && entrada[encontrada] !== null && entrada[encontrada] !== "") {
        return entrada[encontrada];
      }
    }
    return "";
  };

  const descricao = String(pegar(["descricao", "descrição", "produto", "nome", "item"])).trim();
  if (!descricao) return null;

  const qtdBruta = pegar(["quantidade", "qtd", "qtde", "quant"]);
  const valorBruto = pegar(["valorunitario", "valor", "preco", "preço", "valorunit"]);

  return {
    descricao,
    marca: String(pegar(["marca"])).trim(),
    unidade: String(pegar(["unidade", "un", "und"])).trim(),
    quantidade: qtdBruta !== "" ? parsearNumero(qtdBruta) : "",
    valorUnitario: valorBruto !== "" ? parsearMoeda(valorBruto) : ""
  };
}

async function importarItensJson(evento) {
  const input = evento.target;
  const arquivo = input.files?.[0];
  if (!arquivo) return;

  try {
    const texto = await arquivo.text();
    const dados = JSON.parse(texto);
    const listaBruta = Array.isArray(dados) ? dados : (Array.isArray(dados?.itens) ? dados.itens : null);

    if (!listaBruta) {
      alert("JSON inválido: esperado uma lista de produtos (array). Ex.: [\"Produto A\", \"Produto B\"] ou [{ \"descricao\": \"Produto A\" }].");
      return;
    }

    const itensValidos = listaBruta.map(_normalizarItemImportado).filter(Boolean);
    if (itensValidos.length === 0) {
      alert("Nenhum item válido encontrado no arquivo JSON.");
      return;
    }

    // Remove linhas em branco (sem descrição) já presentes na tabela,
    // para não deixar linhas vazias misturadas com as importadas.
    document.querySelectorAll("#tbodyItens tr[data-linha]").forEach(tr => {
      const descricao = tr.querySelector('[data-campo="descricao"]')?.value.trim();
      if (!descricao) tr.remove();
    });

    itensValidos.forEach(item => adicionarLinha(item));
    renumerarLinhas();
    atualizarTotalGeral();
  } catch (erro) {
    console.error("Erro ao importar JSON de itens:", erro);
    alert("Não foi possível ler o arquivo JSON. Verifique se o formato está correto.");
  } finally {
    input.value = ""; // permite importar o mesmo arquivo novamente
  }
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
    const unidade    = get("unidade")?.value?.trim()     || "";
    const quantidade = parsearNumero(get("quantidade")?.value) || 0;
    const valorUnit  = parsearMoeda(get("valorUnitario")?.value) || 0;
    const valorTotal = calcularTotal(quantidade, valorUnit);

    if (descricao || quantidade || valorUnit) {
      itens.push({ item: idx + 1, descricao, marca, unidade, quantidade, valorUnitario: valorUnit, valorTotal });
    }
  });
  return itens;
}

// ================================================================
// VALIDAÇÃO DE TELEFONE
// ================================================================
// Telefone brasileiro válido: DDD (2 dígitos) + número (8 ou 9 dígitos) = 10 ou 11 dígitos
function validarTelefone(telefone) {
  const digitos = String(telefone || "").replace(/\D/g, "");
  if (digitos.length === 0) return true; // campo opcional — vazio é válido
  return digitos.length === 10 || digitos.length === 11;
}

function esconderErroTelefone() {
  const erroEl = document.getElementById("cotTelefoneErro");
  const inputEl = document.getElementById("cotTelefone");
  if (erroEl) erroEl.style.display = "none";
  inputEl?.classList.remove("field-input--erro");
}

function validarECorrigirTelefone(valor) {
  const erroEl = document.getElementById("cotTelefoneErro");
  const inputEl = document.getElementById("cotTelefone");
  if (!erroEl || !inputEl) return true;

  if (validarTelefone(valor)) {
    esconderErroTelefone();
    return true;
  }

  erroEl.textContent = "Telefone incompleto. Informe o DDD + número (10 ou 11 dígitos).";
  erroEl.style.display = "block";
  inputEl.classList.add("field-input--erro");
  return false;
}

function coletarDadosCotacao() {
  const cliente  = document.getElementById("cotCliente").value.trim();
  const cnpj     = document.getElementById("cotCnpj").value.trim();
  const telefone = document.getElementById("cotTelefone")?.value.trim() || "";
  const validade = document.getElementById("cotValidade").value;
  const obs      = document.getElementById("cotObs").value.trim();
  const status   = document.getElementById("cotStatus").value;
  const itens    = coletarItens();
  const valorTotal = itens.reduce((s, i) => s + i.valorTotal, 0);

  return { cliente, cnpj, telefone, validade, observacoes: obs, status, itens, valorTotal, funcionario: nomeFuncionarioLogado() };
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
  if (!validarECorrigirTelefone(dados.telefone)) {
    window.mostrarToast?.("Telefone incompleto. Corrija antes de salvar.", "warning");
    document.getElementById("cotTelefone").focus();
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

  ["cotCliente","cotCnpj","cotTelefone","cotValidade","cotStatus","cotObs"].forEach(campoId => {
    const el = document.getElementById(campoId);
    if (el) el.disabled = true;
  });
  document.getElementById("cotCliente").value  = c.cliente     || "";
  definirTipoPessoa(detectarTipoPessoaPorDocumento(c.cnpj));
  document.getElementById("cotCnpj").value     = c.cnpj        || "";
  document.getElementById("cotTelefone").value = c.telefone    || "";
  document.getElementById("cotValidade").value = c.validade    || "";
  document.getElementById("cotObs").value      = c.observacoes || "";
  document.getElementById("cotStatus").value   = c.status      || "ativa";
  document.getElementById("btnTipoPessoaFisica").disabled  = true;
  document.getElementById("btnTipoPessoaJuridica").disabled = true;

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
  ["cotCliente","cotCnpj","cotTelefone","cotValidade","cotStatus","cotObs"].forEach(campoId => {
    const el = document.getElementById(campoId);
    if (el) el.disabled = false;
  });
  document.getElementById("btnTipoPessoaFisica").disabled  = false;
  document.getElementById("btnTipoPessoaJuridica").disabled = false;
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
  definirTipoPessoa(detectarTipoPessoaPorDocumento(c.cnpj));
  document.getElementById("cotCnpj").value     = c.cnpj       || "";
  document.getElementById("cotTelefone").value = c.telefone   || "";
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
