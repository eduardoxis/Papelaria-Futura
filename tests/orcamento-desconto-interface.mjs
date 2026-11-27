import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

export async function verificarDesconto({ avaliar, comando, pausa, pasta }) {
  await avaliar(
    `document.querySelector('#tabelaClientesCadastro')?.closest('body > div')?.remove();document.querySelector('#qaDetalhes')?.closest('body > div')?.remove();document.querySelectorAll('body > [data-paginacao-local-controles]').forEach(e=>e.remove());document.documentElement.classList.remove('intro-on','site-in');window.fecharModal();`,
  );
  const casos = [];
  for (const [modelo, largura] of [
    ["original", 320],
    ["fw3", 390],
    ["avenida", 1440],
  ]) {
    await comando("Emulation.setDeviceMetricsOverride", {
      width: largura,
      height: 900,
      deviceScaleFactor: 1,
      mobile: largura < 768,
    });
    const resultado = await avaliar(`(async()=>{
      const checar=(v,m)=>{if(!v)throw Error(m);};
      const esperar=async f=>{for(let i=0;i<250;i++){if(f())return;await new Promise(r=>setTimeout(r,25));}throw Error('Tempo esgotado: '+f+' | '+document.getElementById('toastContainer').textContent);};
      const campo=id=>document.getElementById(id);
      const escrever=(el,valor)=>{el.value=valor;el.dispatchEvent(new Event('input',{bubbles:true}));};
      const tipo=valor=>{campo('cotDescontoTipo').value=valor;campo('cotDescontoTipo').dispatchEvent(new Event('change',{bubbles:true}));};
      const dinheiro=id=>Number(campo(id).textContent.replace(/[^0-9,-]/g,'').replace(',','.'));
      window.navegar('nova-cotacao',${JSON.stringify(modelo)});
      await esperar(()=>!!campo('cotDescontoValor'));
      checar(campo('cotDescontoValor').value==='0','Novo orçamento herdou desconto anterior');
      escrever(campo('cotCliente'),'Cliente do desconto ${modelo}');campo('cotValidade').value='2026-12-31';
      const linha=document.querySelector('#tbodyItens tr[data-linha]');
      escrever(linha.querySelector('[data-campo="descricao"]'),'Produto do teste');
      escrever(linha.querySelector('[data-campo="quantidade"]'),'2');
      escrever(linha.querySelector('[data-campo="valorUnitario"]'),'R$ 50,00');
      checar(dinheiro('totalGeral')===100,'Subtotal incorreto');
      tipo('real');escrever(campo('cotDescontoValor'),'12.34');
      checar(dinheiro('totalGeral')===87.66,'Desconto em reais incorreto');
      checar(!campo('cotDescontoResumo').hidden,'Resumo do desconto oculto');
      tipo('percentual');escrever(campo('cotDescontoValor'),'12.5');
      checar(dinheiro('totalGeral')===87.5,'Desconto percentual incorreto');
      escrever(linha.querySelector('[data-campo="quantidade"]'),'3');
      checar(dinheiro('totalGeral')===131.25,'Quantidade não recalculou desconto');
      escrever(linha.querySelector('[data-campo="valorUnitario"]'),'R$ 40,00');
      checar(dinheiro('totalGeral')===105,'Preço não recalculou desconto');
      escrever(campo('cotDescontoValor'),'101');
      checar(!campo('cotDescontoErro').hidden&&!campo('cotDescontoValor').checkValidity(),'Percentual inválido foi aceito');
      tipo('real');escrever(campo('cotDescontoValor'),'121');
      checar(!campo('cotDescontoErro').hidden&&!campo('cotDescontoValor').checkValidity(),'Desconto maior que subtotal foi aceito');
      escrever(campo('cotDescontoValor'),'0');
      checar(campo('cotDescontoResumo').hidden&&dinheiro('totalGeral')===120,'Remover desconto não restaurou total');
      tipo('percentual');escrever(campo('cotDescontoValor'),'10');
      campo('btnSalvarCotacao').click();
      await esperar(()=>!!campo('cotacaoEditandoId').value&&window.__gravacoesCotacao.length>0);
      const id=campo('cotacaoEditandoId').value, salvo=window.__cotacoesTeste.find(c=>c.id===id);
      checar(salvo.desconto.tipo==='percentual'&&salvo.desconto.valor===10&&salvo.valorTotal===108&&salvo.subtotal===120,'Gravação perdeu desconto ou total');
      await esperar(()=>campo("envioCotacaoStatus")&&campo("envioCotacaoStatus").textContent!=="Preparando PDF...");
      window.fecharModal();
      await window.abrirCotacaoSomenteLeitura(id);
      checar(campo('cotDescontoTipo').disabled&&campo('cotDescontoValor').disabled,'Visualização permite mudar desconto');
      checar(campo('cotDescontoTipo').value==='percentual'&&campo('cotDescontoValor').value==='10'&&dinheiro('totalGeral')===108,'Reabertura perdeu desconto');
      await window.editarCotacaoById(id);
      checar(!campo('cotDescontoTipo').disabled&&!campo('cotDescontoValor').disabled,'Edição não liberou desconto');
      const statusAnterior=campo('envioCotacaoStatus');
      tipo('real');escrever(campo('cotDescontoValor'),'15');campo('btnSalvarCotacao').click();
      await esperar(()=>window.__cotacoesTeste.find(c=>c.id===id).desconto.tipo==='real');
      checar(window.__cotacoesTeste.find(c=>c.id===id).valorTotal===105,'Atualização não persistiu reais');
      await esperar(()=>campo('envioCotacaoStatus')!==statusAnterior&&!campo('btnSalvarCotacao').disabled);
      await esperar(()=>campo("envioCotacaoStatus")&&campo("envioCotacaoStatus").textContent!=="Preparando PDF...");
      window.fecharModal();
      const largura=document.documentElement.scrollWidth;
      checar(largura<=innerWidth+2,'Formulário estourou largura da tela: '+largura);
      return {modelo:${JSON.stringify(modelo)},largura:innerWidth,valorSalvo:105,tipoSalvo:'real',reabertura:true,validacao:true};
    })()`);
    casos.push(resultado);
    await avaliar(
      "document.getElementById('toastContainer').replaceChildren();document.querySelector('.cotacao-desconto').scrollIntoView({block:'center'})",
    );
    await pausa(150);
    const captura = await comando("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.writeFileSync(
      path.join(pasta, "desconto-" + modelo + "-" + largura + ".png"),
      Buffer.from(captura.data, "base64"),
    );
  }
  assert.equal(casos.length, 3);
  fs.writeFileSync(
    path.join(pasta, "desconto-resultado.json"),
    JSON.stringify(casos, null, 2),
  );
  console.log("OK DESCONTO/CHROME " + JSON.stringify(casos) + " · " + pasta);
}
