import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const fonte = readFileSync(new URL('../js/backup.js', import.meta.url), 'utf8');
const { coletarBackup, codificarValor, decodificarValor, COLECOES_BACKUP, COLECOES_INATIVAS } = await import('data:text/javascript;base64,' + Buffer.from(fonte).toString('base64'));
class Timestamp { constructor(s,n){this.seconds=s;this.nanoseconds=n;} toDate(){return new Date(this.seconds*1000);} }
class GeoPoint { constructor(a,b){this.latitude=a;this.longitude=b;} }
class Bytes { toBase64(){return 'AQID';} }
class Ref { constructor(p){this.path=p;this.type='document';} }
const original = { id:'campo-original', itens:[{nome:'Produto',qtd:3,valor:45.7}], anexo:'x'.repeat(40000),
  data:new Timestamp(123,987654321), ponto:new GeoPoint(1,2), referencia:new Ref('comissoes/a'), bytes:new Bytes(),
  nulo:null, ativo:true, negativo:-1, infinito:Infinity, nan:NaN,
  mapa:{latitude:1,longitude:2,extra:3}, outro:{tipo:'timestamp',valor:'texto',type:'document',path:'texto'} };
const tipos = {timestamp:(s,n)=>new Timestamp(s,n),geopoint:(a,b)=>new GeoPoint(a,b),bytes:()=>new Bytes(),reference:p=>new Ref(p)};
const restaurado=decodificarValor(JSON.parse(JSON.stringify(codificarValor(original))),tipos);
assert.deepEqual(restaurado, original);
const storage={getItem:k=>k==='comissao_autosave'?'1':null};
const backup=await coletarBackup({projectId:'teste',storage,
  lerColecao:async p=>p==='comissoes'?[{id:'a',dados:original}]:[],
  lerGrupo:async g=>g==='registros'?[{path:'comissoes/a/registros/r',dados:{valor:45.7}},{path:'comissoes/sem-pai/registros/antigo',dados:{valor:10}}]:[]});
assert.equal(backup.totalDocumentos,3);
assert.equal(backup.documentos[0].path,'comissoes/a');
assert.equal(backup.documentos[2].path,'comissoes/sem-pai/registros/antigo');
assert.equal(Object.keys(backup.contagens).length,COLECOES_BACKUP.length+3);
assert.equal(backup.preferencias.comissao_autosave,'1');
const consultasAtivas = [];
const gruposAtivos = [];
const backupAtivo = await coletarBackup({
  projectId: 'teste', storage, excluirColecoes: COLECOES_INATIVAS,
  lerColecao: async nome => { consultasAtivas.push(nome); return []; },
  lerGrupo: async nome => { gruposAtivos.push(nome); return []; }
});
assert.deepEqual(backupAtivo.colecoesExcluidas, COLECOES_INATIVAS);
assert.deepEqual(consultasAtivas, COLECOES_BACKUP.filter(nome => !COLECOES_INATIVAS.includes(nome)));
assert.deepEqual(gruposAtivos, ['lembretes', 'registros']);
await assert.rejects(()=>coletarBackup({projectId:'teste',storage,lerColecao:async()=>{throw Error('permission-denied');},lerGrupo:async()=>[]}),/permission-denied/);
// Testa paginação real do adaptador, sem Firebase de produção.
const admin=readFileSync(new URL('../js/admin.js',import.meta.url),'utf8');
const trecho=admin.slice(admin.indexOf('async function buscarColecaoCompletaBackup('),admin.indexOf('async function gerarBackupCompleto()'));
const documentos=Array.from({length:1001},(_,i)=>({id:String(i),ref:{path:'comissoes/'+i},data:()=>({valor:i})}));
let chamadas=0;
const contexto={ db:{}, collection:(db,p)=>p,collectionGroup:(db,p)=>p,orderBy:()=>null,documentId:()=>null,limit:()=>null,startAfter:cursor=>cursor,query:(origem,...filtros)=>({origem,cursor:filtros.find(f=>f?.id)}),getDocsFromServer:async q=>{chamadas++;const inicio=q.cursor?Number(q.cursor.id)+1:0;return {docs:documentos.slice(inicio,inicio+500)};} };
const exclusoesConfig = [];
contexto.where = (campo, operador, id) => { exclusoesConfig.push([operador, id]); return null; };
vm.createContext(contexto);vm.runInContext(trecho,contexto);
const lista=await contexto.buscarColecaoCompletaBackup('comissoes');
assert.equal(lista.length,1001);assert.equal(chamadas,3);assert.equal(lista[1000].dados.valor,1000);
const listaGrupo=await contexto.buscarColecaoCompletaBackup('registros',true);assert.equal(listaGrupo.length,1001);
await contexto.buscarColecaoCompletaBackup('config');
assert.deepEqual(exclusoesConfig, Array.from({length:3}, () => ['!=', 'prom_metas']));
// Cada coleção declarada nos módulos e nas regras deve estar no inventário.
const { readdirSync } = await import('node:fs');
for(const file of readdirSync(new URL('../js',import.meta.url)).filter(f=>f.endsWith('.js'))) {
 const text=readFileSync(new URL('../js/'+file,import.meta.url),'utf8');
 for(const m of text.matchAll(/(?:const|export const)\s+(?:COL\w*|COLECAO\w*)\s*=\s*["']([^"']+)["']/g)) assert.ok(COLECOES_BACKUP.includes(m[1]),'Coleção fora do backup: '+m[1]);
}
console.log('OK: todas as áreas, anexos longos, campos completos, tipos e precisão, órfãos, falha de leitura, preferências e paginação de 1001 registros.');
