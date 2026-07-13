// ============================================================
// anuencia-modelos.js — "Modelos de Carta de Anuência"
// Editor simples e independente: dois modelos prontos (Padrão
// e Em Branco), com formatação básica, impressão e PDF.
// Papelaria Futura
// ============================================================

let _dadosUsuario = null;

export function iniciarAnuenciaModelos(usuario, dadosUsuario) {
  _dadosUsuario = dadosUsuario;

  document.querySelectorAll(".modelo-card__btn").forEach(btn => {
    btn.addEventListener("click", () => abrirEditorModelo(btn.dataset.modelo));
  });
}

function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function hojeExtenso() {
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const d = new Date();
  return `Luziânia/GO, ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

// ----------------------------------------------------------------
// Conteúdo dos dois modelos
// ----------------------------------------------------------------
function _gerarConteudoPadrao() {
  return `
    <h1>CARTA DE ANUÊNCIA</h1>

    <p>Eu, <span class="anmod-var" contenteditable="true" data-placeholder="Nome completo">João da Silva Santos</span>,
    portador(a) do CPF/CNPJ nº <span class="anmod-var" contenteditable="true" data-placeholder="CPF/CNPJ">000.000.000-00</span>,
    residente e domiciliado(a) à <span class="anmod-var" contenteditable="true" data-placeholder="Endereço completo">Av. Exemplo, nº 100, Setor Central, Luziânia/GO</span>,
    venho, por meio desta, declarar minha <strong>ANUÊNCIA</strong> em relação ao objeto abaixo descrito, para os devidos fins de direito.</p>

    <p><strong>1. OBJETO DA ANUÊNCIA</strong><br>
    Declaro estar plenamente ciente e de acordo com
    <span class="anmod-var" contenteditable="true" data-placeholder="Descreva o objeto da anuência">a regularização do débito referente à compra a prazo (convênio) realizada junto à Papelaria Futura LTDA</span>,
    no valor de <span class="anmod-var" contenteditable="true" data-placeholder="R$ 0,00">R$ 41,98</span> (quarenta e um reais e noventa e oito centavos),
    conforme condições acordadas entre as partes.</p>

    <p><strong>2. CONDIÇÕES</strong><br>
    O pagamento será realizado até a data de
    <span class="anmod-var" contenteditable="true" data-placeholder="dd/mm/aaaa">15/08/2026</span>,
    podendo ser quitado de forma total ou parcelada, conforme acordo prévio firmado entre as partes envolvidas.</p>

    <p><strong>3. DECLARAÇÃO FINAL</strong><br>
    Declaro que as informações acima são verdadeiras e que esta carta tem validade como documento de anuência formal,
    podendo ser utilizada para os fins que se fizerem necessários.</p>

    <p>${hojeExtenso()}.</p>

    <div class="anmod-assinaturas">
      <div class="anmod-assinatura">
        <div class="linha"></div>
        <div class="rotulo">Assinatura do Cliente</div>
      </div>
      <div class="anmod-assinatura">
        <div class="linha"></div>
        <div class="rotulo">Papelaria Futura LTDA</div>
      </div>
    </div>
  `;
}

function _gerarConteudoBranco() {
  return `
    <h1>CARTA DE ANUÊNCIA</h1>

    <p>Eu, <span class="anmod-var" contenteditable="true" data-placeholder="Nome completo"></span>,
    portador(a) do CPF/CNPJ nº <span class="anmod-var" contenteditable="true" data-placeholder="CPF/CNPJ"></span>,
    residente e domiciliado(a) à <span class="anmod-var" contenteditable="true" data-placeholder="Endereço completo"></span>,
    venho, por meio desta, declarar minha <strong>ANUÊNCIA</strong> em relação ao objeto abaixo descrito, para os devidos fins de direito.</p>

    <p><strong>1. OBJETO DA ANUÊNCIA</strong><br>
    <span class="anmod-var" contenteditable="true" data-placeholder="Descreva o objeto da anuência"></span></p>

    <p><strong>2. CONDIÇÕES</strong><br>
    <span class="anmod-var" contenteditable="true" data-placeholder="Descreva as condições, valores e prazos"></span></p>

    <p><strong>3. DECLARAÇÃO FINAL</strong><br>
    Declaro que as informações acima são verdadeiras e que esta carta tem validade como documento de anuência formal,
    podendo ser utilizada para os fins que se fizerem necessários.</p>

    <p><span class="anmod-var" contenteditable="true" data-placeholder="Local e data">${hojeExtenso()}</span>.</p>

    <div class="anmod-assinaturas">
      <div class="anmod-assinatura">
        <div class="linha"></div>
        <div class="rotulo">Assinatura do Cliente</div>
      </div>
      <div class="anmod-assinatura">
        <div class="linha"></div>
        <div class="rotulo">Papelaria Futura LTDA</div>
      </div>
    </div>
  `;
}

// ----------------------------------------------------------------
// Editor
// ----------------------------------------------------------------
function abrirEditorModelo(tipo) {
  const conteudo = tipo === "padrao" ? _gerarConteudoPadrao() : _gerarConteudoBranco();
  const titulo   = tipo === "padrao" ? "Modelo Padrão" : "Modelo em Branco";

  const backdrop = document.createElement("div");
  backdrop.className = "anmod-backdrop";
  backdrop.innerHTML = `
    <div class="anmod-topbar">
      <div class="anmod-topbar__titulo">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/></svg>
        Carta de Anuência — ${titulo}
      </div>
      <div class="anmod-topbar__acoes">
        <button class="anmod-btn" id="anmodImprimir">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9v-1h8v1H6zm8-4a1 1 0 11-2 0 1 1 0 012 0z" clip-rule="evenodd"/></svg>
          Imprimir
        </button>
        <button class="anmod-btn anmod-btn--primary" id="anmodPdf">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM9 3a1 1 0 012 0v6.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414L9 9.586V3z" clip-rule="evenodd"/></svg>
          Baixar PDF
        </button>
        <button class="anmod-btn anmod-btn--ghost" id="anmodFechar">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
          Fechar
        </button>
      </div>
    </div>

    <div class="anmod-toolbar">
      <div class="anmod-toolbar__grupo">
        <button type="button" class="anmod-toolbar__btn" data-cmd="bold" title="Negrito"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M6 4a1 1 0 011-1h4.5a3.5 3.5 0 012.121 6.28A3.75 3.75 0 0112.25 16H7a1 1 0 01-1-1V4zm3 1v4h2.5a2 2 0 000-4H9zm0 6v4h3.25a2.25 2.25 0 000-4.5H9v.5z"/></svg></button>
        <button type="button" class="anmod-toolbar__btn" data-cmd="italic" title="Itálico" style="font-style:italic">I</button>
        <button type="button" class="anmod-toolbar__btn" data-cmd="underline" title="Sublinhado" style="text-decoration:underline">S</button>
      </div>
      <div class="anmod-toolbar__grupo">
        <button type="button" class="anmod-toolbar__btn" data-cmd="justifyLeft" title="Alinhar à esquerda">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 000 2h14a1 1 0 100-2H3zm0 4a1 1 0 000 2h9a1 1 0 100-2H3zm0 4a1 1 0 100 2h14a1 1 0 100-2H3zm0 4a1 1 0 100 2h9a1 1 0 100-2H3z" clip-rule="evenodd"/></svg>
        </button>
        <button type="button" class="anmod-toolbar__btn" data-cmd="justifyCenter" title="Centralizar">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 000 2h14a1 1 0 100-2H3zm3 4a1 1 0 100 2h8a1 1 0 100-2H6zm-3 4a1 1 0 100 2h14a1 1 0 100-2H3zm3 4a1 1 0 100 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/></svg>
        </button>
        <button type="button" class="anmod-toolbar__btn" data-cmd="justifyRight" title="Alinhar à direita">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 000 2h14a1 1 0 100-2H3zm8 4a1 1 0 100 2h6a1 1 0 100-2h-6zm-8 4a1 1 0 100 2h14a1 1 0 100-2H3zm8 4a1 1 0 100 2h6a1 1 0 100-2h-6z" clip-rule="evenodd"/></svg>
        </button>
        <button type="button" class="anmod-toolbar__btn" data-cmd="justifyFull" title="Justificar">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 000 2h14a1 1 0 100-2H3zm0 4a1 1 0 000 2h14a1 1 0 100-2H3zm0 4a1 1 0 100 2h14a1 1 0 100-2H3zm0 4a1 1 0 100 2h14a1 1 0 100-2H3z" clip-rule="evenodd"/></svg>
        </button>
      </div>
      <div class="anmod-toolbar__grupo">
        <select class="anmod-toolbar__select" id="anmodFonte" title="Tamanho da fonte">
          <option value="2">Pequeno</option>
          <option value="3" selected>Normal</option>
          <option value="4">Médio</option>
          <option value="5">Grande</option>
          <option value="6">Muito Grande</option>
        </select>
      </div>
    </div>

    <div class="anmod-canvas">
      <div class="anmod-folha" id="anmodFolha" contenteditable="true">${conteudo}</div>
    </div>

    <div class="anmod-dica">Clique nos campos destacados para editar. Use a barra de ferramentas para formatar o texto selecionado.</div>
  `;
  document.body.appendChild(backdrop);
  document.body.style.overflow = "hidden";

  const folha = backdrop.querySelector("#anmodFolha");

  // Formatação básica via document.execCommand (suficiente para negrito/itálico/alinhamento)
  backdrop.querySelectorAll(".anmod-toolbar__btn[data-cmd]").forEach(btn => {
    btn.addEventListener("click", () => {
      folha.focus();
      document.execCommand(btn.dataset.cmd, false, null);
      btn.classList.toggle("ativo");
    });
  });

  backdrop.querySelector("#anmodFonte").addEventListener("change", (e) => {
    folha.focus();
    document.execCommand("fontSize", false, e.target.value);
  });

  backdrop.querySelector("#anmodFechar").addEventListener("click", () => _fecharEditorModelo(backdrop));
  backdrop.addEventListener("keydown", (e) => { if (e.key === "Escape") _fecharEditorModelo(backdrop); });

  backdrop.querySelector("#anmodImprimir").addEventListener("click", () => _imprimirModelo(folha.innerHTML, titulo, true));
  backdrop.querySelector("#anmodPdf").addEventListener("click", () => _imprimirModelo(folha.innerHTML, titulo, true));
}

function _fecharEditorModelo(backdrop) {
  backdrop.remove();
  document.body.style.overflow = "";
}

// ----------------------------------------------------------------
// Impressão / PDF — abre uma janela dedicada com o conteúdo em
// formato A4, igual ao padrão usado no restante do sistema
// (o próprio navegador oferece "Salvar como PDF" na tela de impressão).
// ----------------------------------------------------------------
function _imprimirModelo(htmlConteudo, titulo, autoImprimir) {
  const win = window.open("", "_blank");
  if (!win) {
    window.mostrarToast?.("O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente novamente.", "error", 6000);
    return;
  }

  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8"><title>Carta de Anuência — ${escHtml(titulo)}</title>
    <style>
      * { box-sizing: border-box; }
      body{font-family:Georgia,"Times New Roman",serif;margin:0;padding:0;background:#fff;color:#1a1a1a}
      .folha{max-width:794px;margin:0 auto;padding:72px 64px;font-size:14px;line-height:1.8}
      h1{font-family:Arial,Helvetica,sans-serif;text-align:center;color:#111;margin:0 0 28px;letter-spacing:.03em;font-size:20px}
      p{margin:0 0 16px}
      .anmod-var{background:transparent;border-bottom:1px solid #999;padding:0 2px;color:#111;font-weight:600}
      .anmod-assinaturas{margin-top:64px;display:flex;justify-content:space-between;gap:40px}
      .anmod-assinatura{flex:1;text-align:center}
      .anmod-assinatura .linha{border-top:1px solid #333;margin-bottom:6px}
      .anmod-assinatura .rotulo{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#555}
      @page{size:A4;margin:0}
      @media print{.folha{padding:56px 48px}}
    </style></head><body>
    <div class="folha">${htmlConteudo}</div>
    <script>window.onload=()=>{${autoImprimir ? "window.print();" : ""}}<\/script>
    </body></html>`);
  win.document.close();
}
