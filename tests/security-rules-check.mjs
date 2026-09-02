import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rulesPath = resolve(process.cwd(), "firestore.rules");
const rules = readFileSync(rulesPath, "utf8");

function blocoDaColecao(caminho) {
  const inicio = rules.indexOf(`match /${caminho}`);
  if (inicio < 0) throw new Error(`Coleção não encontrada: ${caminho}`);
  const proximo = rules.indexOf("\n    match /", inicio + 1);
  return rules.slice(inicio, proximo < 0 ? rules.length : proximo);
}

const proibidos = [
  ["leitura pública de usuários", blocoDaColecao("usuarios/{uid}"), /allow read:\s*if estaAutenticado\(\);/],
  ["leitura pública de cotações", blocoDaColecao("cotacoes/{cotacaoId}"), /allow read:\s*if estaAutenticado\(\);/],
  ["alteração pública de produtos", blocoDaColecao("pf_produtos/{produtoId}"), /allow update:\s*if estaAutenticado\(\);/],
  ["alteração pública de entregas", blocoDaColecao("pf_entregas/{entregaId}"), /allow update:\s*if estaAutenticado\(\);/]
];

const encontrados = proibidos.filter(([, bloco, regra]) => regra.test(bloco)).map(([nome]) => nome);
if (encontrados.length) {
  throw new Error(`Regra insegura encontrada: ${encontrados.join(", ")}`);
}

for (const trecho of [
  "allow read: if donoDoDocumento() || ehAdmin();",
  "allow create, update, delete: if ehAdmin();"
]) {
  if (!rules.includes(trecho)) throw new Error(`Proteção esperada ausente: ${trecho}`);
}

console.log("Validação de segurança das regras concluída com sucesso.");
