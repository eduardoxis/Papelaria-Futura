// Executa consultas reais. --fontes-dir reutiliza documentos oficiais já baixados
// quando a rede local impede o acesso direto do Node ao portal federal.
import fs from "node:fs/promises";
import path from "node:path";
import {
  consultarFontesOficiais,
  baixarOficial,
  FONTES_INICIAIS,
  hashConteudo,
} from "../server/feriados-fontes.mjs";
import { consolidarEventos } from "../js/calendario-core.js";
const ano = Number(process.argv[2] || 2026);
const indice = process.argv.indexOf("--fontes-dir");
const pasta = indice >= 0 ? path.resolve(process.argv[indice + 1]) : null;
const arquivos = new Map(
  FONTES_INICIAIS.uniao.map((url, i) => [
    url,
    ["federal-lei662.html", "federal-lei6802.html", "federal-lei14759.html"][i],
  ]),
);
const registros = [];
const leitor = async (url) => {
  if (pasta && arquivos.has(url)) {
    const arquivo = path.join(pasta, arquivos.get(url));
    const [bytes, stat] = await Promise.all([
      fs.readFile(arquivo),
      fs.stat(arquivo),
    ]);
    registros.push({
      url,
      documentoLocal: arquivos.get(url),
      hash: hashConteudo(bytes),
      baixadoEm: stat.mtime.toISOString(),
    });
    return {
      url,
      bytes,
      tipo: "text/html",
      verificadoEm: stat.mtime.toISOString(),
    };
  }
  const doc = await baixarOficial(url);
  registros.push({
    url: doc.url,
    hash: hashConteudo(doc.bytes),
    verificadoEm: doc.verificadoEm,
  });
  return doc;
};
const esferas = await consultarFontesOficiais(ano, { leitor });
const eventos = consolidarEventos(
  Object.values(esferas).flatMap((e) => e.eventos),
);
const resultado = {
  ano,
  verificadoEm: new Date().toISOString(),
  eventos,
  esferas,
  documentosLidos: registros,
};
const destino = new URL(
  `../data/feriados-inicial-${ano}.json`,
  import.meta.url,
);
await fs.writeFile(destino, JSON.stringify(resultado, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      ano,
      eventos: eventos.length,
      esferas: Object.fromEntries(
        Object.entries(esferas).map(([k, v]) => [
          k,
          {
            cobertura: v.status.cobertura,
            eventos: v.eventos.length,
            pendencias: v.status.pendencias,
            aplicabilidadesPendentes: v.status.aplicabilidadesPendentes,
          },
        ]),
      ),
      municipais: eventos
        .filter((e) => e.abrangencia === "municipal")
        .map((e) => ({
          data: e.data,
          nome: e.nome,
          aplicabilidade: e.aplicabilidade,
        })),
      arquivo: destino.pathname,
    },
    null,
    2,
  ),
);
