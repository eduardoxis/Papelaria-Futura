// Executar apenas em computador confiável, usando credenciais administrativas.
// Por padrão apenas confere; --apply recria documentos ausentes, sem sobrescrever.
import fs from 'node:fs/promises';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { pathToFileURL } from 'node:url';
const modulo = await fs.readFile(new URL('../js/backup.js', import.meta.url), 'utf8');
const { decodificarValor, COLECOES_BACKUP, SUBCOLECOES_BACKUP } = await import('data:text/javascript;base64,' + Buffer.from(modulo).toString('base64'));
const arquivo = process.argv[2];
if (!arquivo) throw new Error('Informe o arquivo .json. Adicione --apply somente depois de conferir a simulação.');
const backup = JSON.parse(await fs.readFile(arquivo, 'utf8'));
if (backup.formato !== 'papelaria-futura-backup' || backup.versao !== 1 || backup.projectId !== 'papelaria-futura' || !Array.isArray(backup.documentos) || backup.documentos.length !== backup.totalDocumentos) throw new Error('Backup inválido ou de outro projeto.');
initializeApp({ credential: applicationDefault(), projectId: backup.projectId });
const db = getFirestore();
const tipos = { timestamp: (s,n) => new Timestamp(s,n), bytes: b => Buffer.from(b,'base64'), geopoint:(a,b)=>new GeoPoint(a,b), reference:p=>db.doc(p) };
const vistos = new Set();
// Valida e decodifica todos os registros antes de qualquer gravação.
const registros = backup.documentos.map(registro => {
  const partes = registro.path?.split('/') || [];
  if (!COLECOES_BACKUP.includes(partes[0]) || ![2,4].includes(partes.length) || partes.some(p=>!p || p==='.' || p==='..') || (partes.length===4 && !SUBCOLECOES_BACKUP[partes[0]]?.includes(partes[2])) || vistos.has(registro.path)) throw new Error('Caminho inválido ou repetido no backup.');
  vistos.add(registro.path);
  const dados = decodificarValor(registro.dados, tipos);
  if (registro.dados.tipo !== 'map') throw new Error('Documento inválido.');
  return { ref: db.doc(registro.path), dados };
});
let existentes = 0;
const ausentes = [];
for (const registro of registros) {
  if ((await registro.ref.get()).exists) existentes++;
  else ausentes.push(registro);
}
console.log(`Projeto: ${backup.projectId}. Backup: ${backup.concluidoEm}. Existentes preservados: ${existentes}. Ausentes: ${ausentes.length}.`);
if (!process.argv.includes('--apply')) {
  console.log('Simulação concluída. Nada foi gravado.');
} else {
  let criados = 0;
  for (const registro of ausentes) {
    try { await registro.ref.create(registro.dados); criados++; }
    catch (erro) { if (erro.code !== 6) throw erro; } // Não sobrescreve uma criação concorrente.
  }
  console.log(`${criados} documentos recriados. Nenhum documento existente foi sobrescrito ou excluído. Preferências do navegador não foram alteradas.`);
}
