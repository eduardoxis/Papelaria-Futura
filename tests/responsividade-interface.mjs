import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

export async function verificarResponsividade({
  avaliar,
  comando,
  pausa,
  pasta,
}) {
  const falhas = [],
    resultados = [];
  await avaliar(
    `document.querySelector('#tabelaClientesCadastro')?.closest('body > div')?.remove();document.querySelector('#qaDetalhes')?.closest('body > div')?.remove();document.querySelectorAll('body > [data-paginacao-local-controles]').forEach(e=>e.remove());sessionStorage.setItem('futura-intro','1');document.documentElement.classList.remove('intro-on','site-in');`,
  );
  const esperar = async (expressao) => {
    for (let i = 0; i < 200; i++) {
      if (await avaliar(expressao)) return;
      await pausa(40);
    }
    throw Error(
      "Tempo esgotado: " +
        expressao +
        " | " +
        JSON.stringify(
          await avaliar(
            '({toast:document.getElementById("toastContainer").textContent,erros:window.__erros})',
          ),
        ),
    );
  };
  const conferir = async (
    nome,
    largura,
    escopo = ".page--active",
    capturar = false,
  ) => {
    await pausa(120);
    const r = await avaliar(
      `(()=>{const root=document.querySelector(${JSON.stringify(escopo)});const w=innerWidth;const dentroRolagem=el=>{for(let p=el.parentElement;p&&p!==root;p=p.parentElement){if(['auto','scroll','hidden','clip'].includes(getComputedStyle(p).overflowX))return true;}return false;};return {pagina:${JSON.stringify(nome)},largura:w,documento:document.documentElement.scrollWidth,raiz:root?.getBoundingClientRect().width,overflow:[...(root?.querySelectorAll('*')||[])].filter(el=>el.getClientRects().length&&el.getBoundingClientRect().right>w+2&&!dentroRolagem(el)).slice(0,12).map(el=>({tag:el.tagName,id:el.id,classe:el.className,largura:Math.round(el.getBoundingClientRect().width),direita:Math.round(el.getBoundingClientRect().right)}))};})()`,
    );
    resultados.push(r);
    fs.writeFileSync(
      path.join(pasta, "responsividade-parcial.json"),
      JSON.stringify({ resultados, falhas }, null, 2),
    );
    if (r.documento > largura + 2 || r.overflow.length) falhas.push(r);
    if (capturar) {
      await avaliar("window.scrollTo(0,0)");
      const png = await comando("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      fs.writeFileSync(
        path.join(pasta, "responsivo-" + nome + "-" + largura + ".png"),
        Buffer.from(png.data, "base64"),
      );
    }
  };
  for (const largura of [320, 360, 390, 768, 1024, 1440]) {
    await comando("Emulation.setDeviceMetricsOverride", {
      width: largura,
      height: 900,
      deviceScaleFactor: 1,
      mobile: largura <= 768,
    });
    for (const pagina of [
      "dashboard",
      "cotacoes",
      "nova-cotacao",
      "comissao",
      "entrega",
      "servicos",
      "admin",
      "os",
      "caixa",
    ]) {
      await avaliar(
        `window.fecharModal?.();window.navegar(${JSON.stringify(pagina)});`,
      );
      await pausa(350);
      await conferir(
        pagina,
        largura,
        ".page--active",
        ["caixa", "comissao"].includes(pagina) &&
          [320, 390, 1440].includes(largura),
      );
    }
    await avaliar(`window.navegar('comissao');`);
    await esperar(
      `!!document.querySelector('#comissaoCards [data-action="editar"]')`,
    );
    await avaliar(
      `document.querySelector('#comissaoCards [data-action="editar"]').click()`,
    );
    if (await avaliar(`!!document.getElementById('inputSenhaComissao')`)) {
      await pausa(200);
      await avaliar(
        `document.getElementById('inputSenhaComissao').value='123';document.getElementById('btnConfirmarSenhaC').click()`,
      );
    }
    await esperar(
      `!document.getElementById('comissaoDetalhePanel').hidden&&!!document.querySelector('#tbodyComissao [data-campo]')`,
    );
    await conferir(
      "comissao-edicao",
      largura,
      ".page--active",
      [320, 390, 1440].includes(largura),
    );
    const editavel = await avaliar(
      `(()=>{const el=document.querySelector('#tbodyComissao [data-campo="descricao"]');el.value='Descrição editada no celular';el.focus();el.dispatchEvent(new Event('input',{bubbles:true}));return !el.disabled&&el.value==='Descrição editada no celular';})()`,
    );
    assert.ok(editavel, "Campo de comissão não permite edição");
    const tabela = await avaliar(
      `({thead:getComputedStyle(document.querySelector('#tbodyComissao').closest('table').querySelector('thead')).display,campo:document.querySelector('#tbodyComissao [data-campo="descricao"]').getBoundingClientRect().width})`,
    );
    if (tabela.thead === "none" || tabela.campo < 100)
      falhas.push({ pagina: "comissao-campos", largura, ...tabela });
    if (largura === 320) {
      const rolagem = await avaliar(
        `(()=>{const el=document.getElementById('tableWrapComissao');el.scrollLeft=el.scrollWidth;const r={max:el.scrollWidth-el.clientWidth,atual:el.scrollLeft};el.scrollLeft=0;return r;})()`,
      );
      assert.ok(
        rolagem.max > 0 && rolagem.atual > 0,
        "Tabela da comissão não permite alcançar as últimas colunas",
      );
    }
    await avaliar(
      `document.getElementById('btnVoltarComissao').click();window.navegar('caixa');`,
    );
    await pausa(150);
    if (
      await avaliar(
        `!document.querySelector('#tbodyCaixaItens tr [data-action]')`,
      )
    ) {
      await avaliar(`document.querySelector('[data-atalho="P"]').click()`);
      await esperar(`!!document.querySelector('#mCaixaListaProd [data-id]')`);
      await conferir("caixa-busca", largura, "#modal", [390].includes(largura));
      await avaliar(
        `document.querySelector('#mCaixaListaProd [data-preco-id]').value='10';document.querySelector('#mCaixaListaProd [data-id]').click()`,
      );
      await esperar(
        `!!document.querySelector('#tbodyCaixaItens tr [data-action]')`,
      );
    }
    await avaliar(
      `document.getElementById('selCaixaFormaPagto').value='Misto';document.getElementById('selCaixaFormaPagto').dispatchEvent(new Event('change',{bubbles:true}));`,
    );
    await conferir(
      "caixa-itens-misto",
      largura,
      ".page--active",
      [320, 390, 1440].includes(largura),
    );
    if (largura === 320) {
      const rolagem = await avaliar(
        `(()=>{const el=document.querySelector('.caixa-itens-card .table-wrap');el.scrollLeft=el.scrollWidth;const r={max:el.scrollWidth-el.clientWidth,atual:el.scrollLeft};el.scrollLeft=0;return r;})()`,
      );
      assert.ok(
        rolagem.max > 0 && rolagem.atual > 0,
        "Tabela do caixa não permite alcançar as últimas colunas",
      );
    }
    await avaliar(
      `document.getElementById('selCaixaFormaPagto').value='Pix';document.getElementById('selCaixaFormaPagto').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('inputValorRecebido').value='10';document.getElementById('btnFinalizarVenda').click();`,
    );
    await esperar(`!!document.getElementById('mCaixaListaVendedores')`);
    if (largura <= 768)
      assert.ok(
        await avaliar(
          'Number(getComputedStyle(document.getElementById("modalBackdrop")).zIndex)>Number(getComputedStyle(document.getElementById("btnMobileHamburger")).zIndex)',
        ),
        "O menu ficou acima do modal",
      );
    await conferir(
      "caixa-finalizacao",
      largura,
      "#modal",
      [320, 390].includes(largura),
    );
    await avaliar(
      `window.fecharModal();document.querySelector('[data-atalho="H"]').click()`,
    );
    await esperar(
      `document.getElementById('modalBackdrop').style.display!=='none'`,
    );
    await conferir(
      "caixa-historico",
      largura,
      "#modal",
      [390].includes(largura),
    );
    await avaliar("window.fecharModal()");
    for (const [pagina, botao] of [
      ["entrega", "btnNovaEntrega"],
      ["servicos", "btnNovoServico"],
    ]) {
      await avaliar(
        `window.navegar(${JSON.stringify(pagina)});document.getElementById(${JSON.stringify(botao)}).click();`,
      );
      await conferir(
        pagina + "-formulario",
        largura,
        "#modal",
        largura === 390,
      );
      await avaliar("window.fecharModal()");
    }
    if (largura <= 768) {
      await avaliar('document.getElementById("btnMobileHamburger").click()');
      assert.ok(
        await avaliar(
          'document.getElementById("sidebar").classList.contains("sidebar--open")',
        ),
      );
      await pausa(350); // aguarda o drawer terminar a transição
      await conferir("menu-mobile", largura, "#sidebar");
      await avaliar('document.getElementById("btnFecharSidebar").click()');
    }
  }
  await comando("Emulation.setDeviceMetricsOverride", {
    width: 844,
    height: 390,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await avaliar(`window.navegar('caixa')`);
  await conferir("caixa-paisagem", 844, ".page--active", true);
  await avaliar(`document.getElementById('btnFinalizarVenda').click()`);
  await esperar(`!!document.getElementById('mCaixaListaVendedores')`);
  await conferir("caixa-finalizacao-paisagem", 844, "#modal", true);
  const alturaModal = await avaliar(
    '({altura:document.getElementById("modal").getBoundingClientRect().height,tela:innerHeight})',
  );
  if (alturaModal.altura > alturaModal.tela)
    falhas.push({ pagina: "modal-paisagem", ...alturaModal });
  await avaliar("window.fecharModal()");
  fs.writeFileSync(
    path.join(pasta, "responsividade.json"),
    JSON.stringify({ resultados, falhas }, null, 2),
  );
  console.log(
    "RESPONSIVIDADE " +
      JSON.stringify({ casos: resultados.length, falhas, pasta }),
  );
  assert.equal(
    falhas.length,
    0,
    "Há layouts excedendo a tela; veja responsividade.json",
  );
}
