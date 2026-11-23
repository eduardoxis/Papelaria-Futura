import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fixtures } from "./escalas-fixture.mjs";
import { executarEscalas } from "../server/escalas-service.mjs";
import {
  calendarioInicial,
  consultarCalendario,
  decidirFuncionamento,
} from "../server/feriados-service.mjs";

const { db } = fixtures();
db.registros.set(
  "pf_feriados_anos/BR_GO_luziania_2026",
  await calendarioInicial(2026),
);
db.registros.set(
  "pf_feriados_anos/BR_GO_luziania_2027",
  await calendarioInicial(2027),
);
db.registros.set("usuarios/admin", { nome: "Admin Teste", roles: ["admin"] });
db.registros.get("pf_escala_config/loja").turnos = [
  {
    id: "modelo",
    nome: "Meio período",
    inicio: "2026-01-01",
    fim: null,
    dias: [1, 2, 3, 4, 5, 6],
    entrada: "08:00",
    almoco: "",
    retorno: "",
    saida: "12:00",
  },
];
export async function apiTeste(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  try {
    assert.equal(req.headers.authorization, "Bearer teste_escalas");
    const partes = [];
    for await (const parte of req) partes.push(parte);
    const body = JSON.parse(Buffer.concat(partes).toString());
    const r = await executarEscalas(db, "admin", body);
    res.end(JSON.stringify(r));
  } catch (erro) {
    res.statusCode = erro.status || 500;
    res.end(JSON.stringify({ erro: erro.message, detalhes: erro.detalhes }));
  }
}
export async function apiCalendarioTeste(req, res) {
  res.setHeader("Content-Type", "application/json");
  try {
    assert.equal(req.headers.authorization, "Bearer teste_escalas");
    const q = Object.fromEntries(
      new URL(req.url, "http://localhost").searchParams,
    );
    let r;
    if (req.method === "GET")
      r = await consultarCalendario(db, {
        inicio: q.ano + "-01-01",
        fim: q.ano + "-12-31",
      });
    else {
      const partes = [];
      for await (const p of req) partes.push(p);
      const body = JSON.parse(Buffer.concat(partes).toString());
      r = await decidirFuncionamento(db, "admin", body, {
        simular: q.acao === "simular_decisao",
      });
    }
    res.end(JSON.stringify(r));
  } catch (erro) {
    res.statusCode = erro.status || 500;
    res.end(JSON.stringify({ erro: erro.message, detalhes: erro.detalhes }));
  }
}
export async function verificar({ avaliar, comando, pausa, pasta }) {
  const r = await avaliar(`(async()=>{
    const esperar=async f=>{for(let i=0;i<400;i++){if(f())return;await new Promise(r=>setTimeout(r,25));}throw Error('Tempo esgotado: '+f+' | '+document.getElementById('toastContainer').textContent);};
    const checar=(v,m)=>{if(!v)throw Error(m);};
    const clicar=acao=>document.querySelector('#escalasConteudo [data-es-acao="'+acao+'"]').click();
    const livre=()=>!document.getElementById('escalasConteudo').hasAttribute('aria-busy');
    const submeter=async()=>{await esperar(livre);document.getElementById('esFormulario').requestSubmit();};
    document.querySelector('#tabelaClientesCadastro')?.closest('body > div')?.remove();
    document.querySelector('#qaDetalhes')?.closest('body > div')?.remove();
    document.querySelectorAll('body > [data-paginacao-local-controles]').forEach(e=>e.remove());
    const fetchOriginal=window.fetch;
    let chamadasCalendario=0;
    window.fetch=async (...args)=>{
      if(String(args[0]).startsWith('/api/feriados')){chamadasCalendario++;return new Response('FUNCTION_INVOCATION_FAILED',{status:500});}
      return fetchOriginal(...args);
    };
    window.navegar('escalas');
    await esperar(()=>document.getElementById('esSemana')&&livre());
    checar(chamadasCalendario===0,'A abertura da escala ainda depende da API de calendário');
    document.querySelector('[data-es-acao="aba"][data-aba="calendario"]').click();
    await esperar(()=>document.querySelector('[data-cal="recarregar"]')&&livre());
    checar(document.querySelector('[data-es-acao="aba"][data-aba="equipe"]'),'Falha do calendário removeu as demais abas');
    window.fetch=fetchOriginal;
    document.querySelector('[data-cal="recarregar"]').click();
    await esperar(()=>document.getElementById('calMes')&&!document.getElementById('esCalendarioLoja').hasAttribute('aria-busy'));
    document.querySelector('[data-es-acao="aba"][data-aba="semana"]').click();await esperar(livre);
    const data=document.getElementById('esSemana');data.value='2027-01-04';data.dispatchEvent(new Event('change',{bubbles:true}));
    await esperar(()=>livre()&&document.getElementById('escalasConteudo').textContent.includes('04/01/2027'));
    clicar('gerar');await submeter();
    await esperar(()=>livre()&&document.querySelectorAll('.es-cartao').length===14);
    checar(document.querySelectorAll('.es-conflito').length===0,'Gerador criou conflito inesperado');
    const origem=document.querySelector('[data-es-dia="2027-01-09"] .es-tipo-trabalho');
    const cartaoId=origem.dataset.esCartao;
    const transferencia=new DataTransfer();transferencia.setData('application/x-pf-escala',JSON.stringify({cartaoId}));
    document.querySelector('[data-es-dia="2027-01-04"]').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transferencia}));
    checar(document.querySelector('#esFormulario [name="data"]').value==='2027-01-04','Arrastar não preencheu destino');
    await submeter();
    await esperar(()=>document.getElementById('esConfirmar')?.textContent==='Confirmar e salvar rascunho'&&livre());
    checar(document.getElementById('esFormulario').textContent.includes('2027-01-09'),'Prévia omitiu efeito na cobertura de origem');
    await submeter();
    await esperar(()=>livre()&&document.getElementById('modalBackdrop').style.display==='none');
    clicar('atualizar');await esperar(livre);
    checar(document.querySelector('[data-es-dia="2027-01-04"] [data-es-cartao="'+cartaoId+'"]'),'Movimento não persistiu');
    // Reabre a tela e desfaz com uma nova gravação auditada.
    clicar('editar-cartao');await esperar(()=>document.getElementById('esFormulario'));
    document.getElementById('esCancelar').click();
    // Atualizar reinicia o desfazer de propósito. Volta o cartão por arrastar.
    const dt=new DataTransfer();dt.setData('application/x-pf-escala',JSON.stringify({cartaoId}));
    document.querySelector('[data-es-dia="2027-01-09"]').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt}));
    await submeter();
    await esperar(()=>document.getElementById('esConfirmar')?.textContent==='Confirmar e salvar rascunho'&&livre());
    await submeter();await esperar(()=>livre()&&document.getElementById('modalBackdrop').style.display==='none');
    checar(document.querySelector('[data-es-acao="desfazer"]'),'Desfazer indisponível');
    const copia=document.querySelector('[data-es-dia="2027-01-09"] .es-tipo-trabalho [data-es-acao="copiar-cartao"]');
    copia.click();document.querySelector('#esFormulario [name="data"]').value='2027-01-04';
    await submeter();
    await esperar(()=>document.getElementById('esConfirmar')?.textContent==='Confirmar e salvar rascunho'&&livre());
    await submeter();await esperar(()=>livre()&&document.getElementById('modalBackdrop').style.display==='none');
    checar(document.querySelectorAll('.es-tipo-trabalho').length===7,'Copiar moveu em vez de duplicar');
    clicar('desfazer');await esperar(()=>document.getElementById('esConfirmar')?.textContent==='Confirmar e salvar rascunho'&&livre());
    await submeter();await esperar(()=>livre()&&document.querySelectorAll('.es-tipo-trabalho').length===6);
    clicar('publicar');document.querySelector('#esFormulario [name="motivo"]').value='Primeira publicação de teste';await submeter();
    await esperar(()=>livre()&&document.getElementById('escalasConteudo').textContent.includes('publicada · revisão'));
    clicar('imprimir');await esperar(()=>document.querySelector('.es-impressao')?.contentDocument?.body.textContent.includes('Versão publicada 1'));
    const impressao=document.querySelector('.es-impressao').contentDocument;
    checar(impressao.querySelector('style').textContent.includes('A4 landscape'),'Impressão fora de A4');
    checar(impressao.body.textContent.includes('08:00–12:00'),'Impressão perdeu horários');
    for(const a of ['equipe','turnos','cobertura','calendario','instrumentos','regras','historico','versoes']){
      document.querySelector('[data-es-acao="aba"][data-aba="'+a+'"]').click();
      await esperar(()=>livre()&&document.getElementById('esPainel').textContent.trim().length>0);
    }
    clicar('mais-versoes');await esperar(()=>livre()&&document.querySelector('.es-versao'));
    document.querySelector('[data-es-acao="aba"][data-aba="equipe"]').click();await esperar(livre);
    clicar('nova-pessoa');await esperar(livre);checar(document.querySelector('#esFormulario [name="semanais"]').value==='40:00','Carga semanal com mais de 24h não aparece');document.getElementById('esCancelar').click();
    document.querySelector('[data-es-acao="aba"][data-aba="semana"]').click();await esperar(livre);
    checar(document.querySelectorAll('.es-cartao').length===14,'Quadro semanal não reapareceu ao trocar de aba');
    checar(!window.__erros.length,window.__erros.join(' | '));
    return {cartoes:document.querySelectorAll('.es-cartao').length,publicacao:true,arrastar:true,copiar:true,desfazer:true,impressao:true};
  })()`);
  const atual = db.registros.get("pf_escalas/2027-01-04");
  assert.equal(atual.versao, 1);
  assert.equal(atual.status, "publicada");
  for (const width of [1280, 390]) {
    await comando("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    await pausa(100);
    const layout = await avaliar(
      `({largura:document.documentElement.clientWidth,conteudo:document.getElementById('page-escalas').scrollWidth,externo:document.getElementById('page-escalas').clientWidth})`,
    );
    assert.ok(layout.conteudo <= layout.externo + 2, JSON.stringify(layout));
  }
  await comando("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await avaliar("document.getElementById('escalasConteudo').scrollIntoView()");
  const captura = await comando("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  fs.writeFileSync(
    path.join(pasta, "escalas-desktop.png"),
    Buffer.from(captura.data, "base64"),
  );
  fs.writeFileSync(
    path.join(pasta, "escalas-resultado.json"),
    JSON.stringify(r, null, 2),
  );
  console.log("OK ESCALAS/CHROME " + JSON.stringify(r) + " · " + pasta);
  await verificarCalendario({ avaliar, comando, pausa, pasta });
}

async function verificarCalendario({ avaliar, comando, pausa, pasta }) {
  await avaliar(`(async()=>{
    const esperar=async f=>{for(let i=0;i<400;i++){if(f())return;await new Promise(r=>setTimeout(r,25));}throw Error('Calendário: tempo esgotado '+f+' | '+document.getElementById('toastContainer').textContent);};
    const livre=()=>!document.getElementById('escalasConteudo').hasAttribute('aria-busy')&&!document.getElementById('esCalendarioLoja')?.hasAttribute('aria-busy');
    document.querySelector('[data-es-acao="aba"][data-aba="calendario"]').click();
    await esperar(()=>document.getElementById('calMes')&&livre());
    const mes=document.getElementById('calMes');mes.value='2026-11';mes.dispatchEvent(new Event('change',{bubbles:true}));
    await esperar(()=>livre()&&document.querySelector('.cal-mes [data-data="2026-11-30"]'));
    document.querySelector('.cal-mes [data-data="2026-11-30"]').click();
    await esperar(()=>document.getElementById('calFormulario')&&livre());
    if(!document.getElementById('calFormulario').textContent.includes('Dia do Evangélico'))throw Error('Nome do feriado não carregado');
    document.querySelector('#calFormulario [name="situacao"][value="especial"]').click();
    document.querySelector('#calFormulario [name="entrada"]').value='08:00';
    document.querySelector('#calFormulario [name="saida"]').value='13:00';
    document.getElementById('calFormulario').requestSubmit();
    await esperar(()=>document.getElementById('calSalvar')?.textContent==='Confirmar decisão'&&!document.getElementById('calSalvar').disabled);
    document.getElementById('calFormulario').requestSubmit();
    await esperar(()=>livre()&&document.querySelector('.cal-mes [data-data="2026-11-30"]')?.textContent.includes('Aberto das 08:00 às 13:00'));
  })()`);
  assert.equal(
    db.registros.get("pf_calendario_decisoes/2026-11-30").saida,
    "13:00",
  );
  await comando("Page.reload");
  await pausa(150);
  for (let i = 0; i < 200; i++) {
    if (
      await avaliar(
        'typeof window.navegar==="function"&&document.getElementById("userName")?.textContent==="Admin Teste"',
      )
    )
      break;
    await pausa(50);
  }
  const r = await avaliar(`(async()=>{
    const esperar=async f=>{for(let i=0;i<400;i++){if(f())return;await new Promise(r=>setTimeout(r,25));}throw Error('Calendário após recarregar: '+f);};
    const livre=()=>!document.getElementById('escalasConteudo').hasAttribute('aria-busy')&&!document.getElementById('esCalendarioLoja')?.hasAttribute('aria-busy');
    window.navegar('escalas');await esperar(()=>document.getElementById('esSemana')&&livre());
    document.querySelector('[data-es-acao="aba"][data-aba="calendario"]').click();await esperar(()=>document.getElementById('calMes')&&livre());
    const mes=document.getElementById('calMes');mes.value='2026-11';mes.dispatchEvent(new Event('change',{bubbles:true}));
    await esperar(()=>livre()&&document.querySelector('.cal-mes [data-data="2026-11-30"]')?.textContent.includes('Aberto das 08:00 às 13:00'));
    document.querySelector('[data-es-acao="aba"][data-aba="semana"]').click();await esperar(livre);
    document.getElementById('esSemana').value='2026-11-30';document.getElementById('esSemana').dispatchEvent(new Event('change',{bubbles:true}));
    await esperar(()=>livre()&&document.getElementById('escalasConteudo').textContent.includes('Semana de 30/11/2026'));
    document.querySelector('[data-es-acao="gerar"]').click();await esperar(livre);document.getElementById('esFormulario').requestSubmit();
    await esperar(()=>livre()&&document.querySelectorAll('.es-cartao').length===14);
    if(!document.querySelector('[data-es-dia="2026-11-30"]').textContent.includes('08:00–13:00'))throw Error('Gerador não usou horário escolhido');
    document.querySelector('[data-es-acao="aba"][data-aba="calendario"]').click();await esperar(()=>document.getElementById('calMes')&&livre());
    document.getElementById('toastContainer').replaceChildren();
    if(window.__erros.length)throw Error(window.__erros.join(' | '));
    return {dia:'2026-11-30',nome:'Dia do Evangélico',abertura:'08:00',fechamento:'13:00',persistiuAposRecarregar:true};
  })()`);
  const escala = db.registros.get("pf_escalas/2026-11-30");
  assert.ok(escala);
  const { executarEscalas } = await import("../server/escalas-service.mjs");
  const atual = await executarEscalas(db, "admin", {
    acao: "carregar",
    semana: "2026-11-30",
  });
  const faixas = atual.resultado.cobertura.filter(
    (f) => f.data === "2026-11-30",
  );
  const min = (hora) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
  assert.equal(
    faixas.reduce((n, f) => n + min(f.saida) - min(f.entrada), 0),
    300,
  );
  for (const width of [1440, 390]) {
    await comando("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    await pausa(100);
    const layout = await avaliar(
      '({scroll:document.querySelector(".cal-card").scrollWidth,width:document.querySelector(".cal-card").clientWidth})',
    );
    assert.ok(layout.scroll <= layout.width + 2, JSON.stringify(layout));
    await avaliar("window.scrollTo(0,0)");
    const png = await comando("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.writeFileSync(
      path.join(pasta, "calendario-" + width + ".png"),
      Buffer.from(png.data, "base64"),
    );
  }
  fs.writeFileSync(
    path.join(pasta, "calendario-resultado.json"),
    JSON.stringify({ ...r, coberturaMinutos: 300 }, null, 2),
  );
  console.log(
    "OK CALENDÁRIO/CHROME " +
      JSON.stringify({ ...r, coberturaMinutos: 300 }) +
      " · " +
      pasta,
  );
}
