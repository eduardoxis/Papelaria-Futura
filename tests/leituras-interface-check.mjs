// Navegador isolado com dados de teste. Nenhuma conexão ao Firebase de produção.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const repo = fileURLToPath(new URL("../", import.meta.url));
const pasta = fileURLToPath(
  new URL("../../leituras-ui/" + Date.now() + "/", import.meta.url),
);
fs.mkdirSync(pasta, { recursive: true });
const chrome =
  process.env.CHROME_BIN ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const sdk = `
window.__leituras=[];
export class Timestamp {constructor(seconds){this.seconds=seconds;this.nanoseconds=0;}static fromDate(d){return new Timestamp(d.getTime()/1000);}static now(){return Timestamp.fromDate(new Date());}toDate(){return new Date(this.seconds*1000);}valueOf(){return this.seconds*1000;}}
const ts=Timestamp.fromDate(new Date('2026-11-04T12:00:00Z'));
const registros={pf_produtos:Array.from({length:450},(_,i)=>({id:String(i).padStart(4,'0'),nome:'Produto '+String(i).padStart(4,'0'),codigo:String(i),estoque:5,preco:10,precoCusto:5,categoria:'Papelaria'})),pf_servicos:Array.from({length:75},(_,i)=>({id:String(i).padStart(4,'0'),nome:'Serviço '+String(i).padStart(4,'0'),codigo:String(i),ativo:true})),usuarios:Array.from({length:65},(_,i)=>({id:String(i).padStart(4,'0'),nome:'Pessoa '+i,email:'teste'+i+'@example.test',roles:['vendedor']})),comissoes:Array.from({length:65},(_,i)=>({id:String(i).padStart(4,'0'),titulo:'Planilha '+i,dataCriacao:ts,criadoPor:'admin'})),pf_entregas:Array.from({length:65},(_,i)=>({id:String(i).padStart(4,'0'),cliente:'Cliente '+i,data:'2026-11-04',horaSaida:'10:00',horaVolta:'11:00',local:'Centro',criadoPor:'admin'})),prom_clientes:Array.from({length:75},(_,i)=>({id:String(i).padStart(4,'0'),nome:'Cliente '+String(i).padStart(4,'0'),ativo:true})),prom_compras:Array.from({length:150},(_,i)=>({id:String(i),clienteId:String(Math.floor(i/2)).padStart(4,'0'),valor:10,vencimento:ts})),prom_pagamentos:Array.from({length:75},(_,i)=>({id:String(i),clienteId:String(i).padStart(4,'0'),valor:5})),pf_estoque_historico:Array.from({length:120},(_,i)=>({id:String(i).padStart(4,'0'),produtoId:'0000',nomeProduto:'Produto 0000',tipo:'entrada',qtdAntes:i,qtdDepois:i+1,delta:1,criadoEm:ts,operador:'Admin'}))};
registros.clientes_cadastro=registros.prom_clientes.map(c=>({...c,nomeBusca:c.nome.toLowerCase()}));
export const collection=(db,...p)=>({type:'collection',path:p.join('/')});
export const collectionGroup=collection;
export const doc=(base,...p)=>({type:'document',path:base?.path ? base.path+'/'+(p.join('/')||'novo') : p.join('/'),id:p.at(-1)||'novo'});
export const query=(q,...f)=>({...q,f:[...(q.f||[]),...f]});
export const where=(campo,op,valor)=>({campo,op,valor}),orderBy=(ordem,direcao='asc')=>({ordem,direcao}),limit=n=>({limite:n}),startAfter=d=>({apos:d.id}),documentId=()=> '__name__';
export const queryEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const refEqual=queryEqual;
const snap=(p,d)=>({id:d.id,ref:{path:p+'/'+d.id},data:()=>({...d}),exists:()=>true});
export async function getDocs(q){let a=[...(registros[q.path]||[])];for(const f of q.f||[]){if(!f.campo)continue;a=a.filter(d=>{const v=d[f.campo],t=f.valor;switch(f.op){case '==':return v===t;case 'in':return t.includes(v);case 'array-contains':return v?.includes(t);case '>=':return v>=t;case '<=':return v<=t;case '<':return v<t;default:return true;}});}for(const f of (q.f||[]).filter(f=>f.ordem).reverse())a.sort((x,y)=>{const a=f.ordem==='__name__'?x.id:x[f.ordem],b=f.ordem==='__name__'?y.id:y[f.ordem];return (a<b?-1:a>b?1:0)*(f.direcao==='desc'?-1:1);});const apos=q.f?.find(f=>f.apos);if(apos)a=a.slice(a.findIndex(d=>d.id===apos.apos)+1);const n=q.f?.find(f=>f.limite)?.limite;if(n)a=a.slice(0,n);window.__leituras.push({colecao:q.path,quantidade:a.length,limitada:!!n});const docs=a.map(d=>snap(q.path,d));return {docs,size:docs.length,empty:!docs.length,forEach:fn=>docs.forEach(fn),metadata:{fromCache:false,hasPendingWrites:false}};}
export const getDocsFromServer=getDocs;
export async function getDoc(r){const p=r.path.split('/');const d=(registros[p[0]]||[]).find(d=>d.id===p[1]);return d?snap(p[0],d):{exists:()=>false,data:()=>({}),id:p.at(-1)};}
export const getDocFromServer=getDoc;
export const count=()=>({}),sum=()=>({}),arrayUnion=(...a)=>a,serverTimestamp=()=>ts;
export async function getAggregateFromServer(){return {data:()=>({quantidade:0,valor:0})};}
export function onSnapshot(q,...a){const fn=a.find(v=>typeof v==='function');getDocs(q).then(s=>fn(s));return()=>{};}
export function writeBatch(){throw Error('Gravação não esperada neste teste');}
export async function runTransaction(){throw Error('Gravação não esperada neste teste');}
export const addDoc=runTransaction,setDoc=runTransaction,updateDoc=runTransaction,deleteDoc=runTransaction;
`;
const servidor = http.createServer((req, res) => {
  let p = new URL(req.url, "http://localhost").pathname;
  if (p === "/__sdk.js") {
    res.setHeader("content-type", "text/javascript");
    return res.end(sdk);
  }
  if (p === "/__authsdk.js") {
    res.setHeader("content-type", "text/javascript");
    return res.end("export function onAuthStateChanged(){}");
  }
  if (p === "/js/firebase-config.js") {
    res.setHeader("content-type", "text/javascript");
    return res.end(
      'export const db={};export const auth={currentUser:{uid:"admin",email:"teste@example.test"}};export default {};',
    );
  }
  if (p === "/js/auth.js") {
    res.setHeader("content-type", "text/javascript");
    return res.end(
      'export const temCargo=(p,c)=>(p?.roles||[p?.role]).includes(c);export const cargosDoUsuario=p=>p?.roles||[p?.role];export function protegerRota(f){queueMicrotask(()=>f({uid:"admin",email:"teste@example.test"},{nome:"Admin Teste",roles:["admin"]}));}export function logoutUsuario(){}export async function criarContaUsuario(){}',
    );
  }
  if (p === "/") p = "/index.html";
  const arquivo = path.resolve(repo, "." + p);
  if (!arquivo.startsWith(path.resolve(repo) + path.sep)) {
    res.statusCode = 403;
    return res.end();
  }
  if (!fs.existsSync(arquivo)) {
    res.statusCode = 404;
    return res.end();
  }
  let b = fs.readFileSync(arquivo);
  if (p.endsWith(".js")) {
    res.setHeader("content-type", "text/javascript");
    b = b
      .toString()
      .replaceAll(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js",
        "/__sdk.js",
      )
      .replaceAll(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js",
        "/__authsdk.js",
      );
  } else if (p.endsWith(".html")) {
    res.setHeader("content-type", "text/html");
    b = b
      .toString()
      .replace(/<script\b[^>]*src="https:[\s\S]*?<\/script>/g, "")
      .replace(/<link\b[^>]*href="https:[^>]*>/g, "")
      .replaceAll("navigator.serviceWorker.register", "Promise.resolve");
    b = b.replace(
      "<head>",
      '<head><script>window.__erros=[];addEventListener("error",e=>window.__erros.push(e.message));addEventListener("unhandledrejection",e=>window.__erros.push(String(e.reason?.stack||e.reason)));</script>',
    );
  } else if (p.endsWith(".css")) res.setHeader("content-type", "text/css");
  res.end(b);
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const processo = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    "--user-data-dir=" + pasta,
    "about:blank",
  ],
  { windowsHide: true, stdio: "ignore" },
);
let ws;
const pendentes = new Map();
let id = 0;
function comando(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id;
    pendentes.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}
try {
  const portaArquivo = path.join(pasta, "DevToolsActivePort");
  for (let i = 0; i < 200 && !fs.existsSync(portaArquivo); i++) await pausa(50);
  const porta = fs.readFileSync(portaArquivo, "utf8").split("\n")[0];
  const abas = await (
    await fetch("http://127.0.0.1:" + porta + "/json")
  ).json();
  ws = new WebSocket(abas.find((t) => t.type === "page").webSocketDebuggerUrl);
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pendentes.get(m.id);
      pendentes.delete(m.id);
      m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
    }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const avaliar = async (expression) => {
    const r = await comando("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw Error(
        r.exceptionDetails.text +
          ": " +
          r.exceptionDetails.exception?.description,
      );
    return r.result.value;
  };
  await comando("Page.navigate", {
    url: "http://127.0.0.1:" + servidor.address().port + "/",
  });
  for (let i = 0; i < 200; i++) {
    if (await avaliar('typeof window.navegar === "function"')) break;
    await pausa(50);
  }
  const resultado = await avaliar(`(async()=>{
    const checar=(v,m)=>{if(!v)throw Error(m);};
    const esperar=async f=>{for(let i=0;i<200;i++){if(f())return;await new Promise(r=>setTimeout(r,25));}throw Error('Tempo esgotado: '+f);};
    const linhas=id=>document.getElementById(id)?.querySelectorAll('tr').length;
    await esperar(()=>document.getElementById('userName')?.textContent==='Admin Teste');
    checar(!document.querySelector('.btn-notificacoes'),'Sino ainda presente');
    const {COLECOES_INATIVAS}=await import('/js/backup.js');
    for(const pagina of ['estoque','promissoria','modelos-anuencia']){
      checar(!document.querySelector('[data-page="'+pagina+'"]'),'Área ainda no menu: '+pagina);
      checar(!document.getElementById('page-'+pagina),'Área ainda no HTML: '+pagina);
      window.navegar(pagina);
      checar(document.querySelector('.page--active')?.id==='page-dashboard','Rota removida alterou o painel');
    }
    const relatorio=[];
    for(const [pagina,tbody,colecao] of [['servicos','tbodyServicos','pf_servicos'],['entrega','tbodyEntrega','pf_entregas'],['comissao','comissaoCards','comissoes'],['admin','tbodyUsuarios','usuarios']]){
      window.navegar(pagina);await esperar(()=>document.getElementById(tbody+'Paginador')?.querySelector('[data-pag="1"]')?.disabled===false);
      const primeira=document.getElementById(tbody).textContent;
      const antes=window.__leituras.length;
      document.querySelector('#'+tbody+'Paginador [data-pag="1"]').click();
      await esperar(()=>document.getElementById(tbody+'Paginador')?.textContent.includes('Página 2'));
      checar(document.getElementById(tbody).textContent!==primeira,'Próxima não mudou '+pagina);
      const depois=window.__leituras.length;
      document.querySelector('#'+tbody+'Paginador [data-pag="-1"]').click();
      await esperar(()=>document.getElementById(tbody+'Paginador')?.textContent.includes('Página 1'));
      checar(window.__leituras.length===depois,'Voltar releu '+pagina);
      checar(window.__leituras.filter(l=>l.colecao===colecao).every(l=>l.limitada),'Lista completa em '+pagina);
      relatorio.push({pagina,leiturasProxima:depois-antes});
    }
    const cadastro=document.createElement('div');cadastro.innerHTML='<span id="contagemClientesCadastro"></span><div><table><tbody id="tabelaClientesCadastro"></tbody></table></div>';document.body.append(cadastro);
    const clientes=await import('/js/clientes.js');await clientes.renderListaClientesCadastro();
    checar(linhas('tabelaClientesCadastro')===30,'Cadastro não paginou');
    document.querySelector('#tabelaClientesCadastroPaginador [data-pag="1"]').click();
    await esperar(()=>document.getElementById('tabelaClientesCadastroPaginador').textContent.includes('Página 2'));
    const sugestoes=await clientes.buscarClientesPorNome('Cliente 000');checar(sugestoes.length===6,'Autocomplete sem limite');
    checar(!window.__leituras.some(l=>l.colecao==='pf_vendas'),'ADM consultou vendas com painel oculto');
    checar(!window.__leituras.some(l=>COLECOES_INATIVAS.includes(l.colecao)),'Consulta em área removida');
    const tabela=document.createElement('div');tabela.innerHTML='<table><tbody id="qaDetalhes">'+Array.from({length:65},(_,i)=>'<tr><td>'+i+'</td></tr>').join('')+'</tbody></table>';document.body.append(tabela);
    await esperar(()=>tabela.parentElement.querySelector('[data-paginacao-local-controles]'));
    checar([...document.querySelectorAll('#qaDetalhes tr')].filter(r=>r.style.display!=='none').length===30,'Paginação local incorreta');
    checar(!window.__erros.length,window.__erros.join(' | '));
    return {relatorio,erros:window.__erros,consultas:window.__leituras.length};
  })()`);
  assert.equal(resultado.erros.length, 0);
  fs.writeFileSync(
    path.join(pasta, "resultado.json"),
    JSON.stringify(resultado, null, 2),
  );
  console.log(
    "OK INTERFACE/CHROME: listas ativas, próxima/anterior, autocomplete, paginação dos detalhes e áreas removidas sem consultas. " +
      JSON.stringify(resultado),
  );
} finally {
  if (ws?.readyState === 1) {
    await Promise.race([comando("Browser.close").catch(() => {}), pausa(1000)]);
    ws.close();
  }
  processo.kill();
  servidor.close();
}
