// Porta única para consultas de listas e invalidação após gravações.
// getDoc/getDocsFromServer/tx.get continuam sendo as operações originais do SDK.
export * from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import * as sdk from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { criarCacheLeituras } from "./leituras-cache.js";
import { executarFirebaseComLimite } from "./firebase-limites.js";

const consultas = new WeakMap();
const cache = criarCacheLeituras({ igual: sdk.queryEqual });
const resumos = criarCacheLeituras();
const catalogos = new Set([
  "pf_servicos",
  "pf_marcas",
  "usuarios",
  "clientes_cadastro",
  "pf_comissao_vendedores",
]);
const caminhoConsulta = (referencia) =>
  referencia.path || consultas.get(referencia) || "";
const caminhoGravacao = (referencia) => {
  const partes = referencia.path.split("/");
  if (referencia.type !== "collection") partes.pop();
  return partes.join("/");
};
export function collection(...args) {
  const referencia = sdk.collection(...args);
  consultas.set(referencia, caminhoConsulta(referencia));
  return referencia;
}
export function query(origem, ...filtros) {
  const consulta = sdk.query(origem, ...filtros);
  consultas.set(consulta, caminhoConsulta(origem));
  return consulta;
}
export function getDocs(consulta) {
  const colecao = caminhoConsulta(consulta);
  return cache.ler(
    consulta,
    () => executarFirebaseComLimite(() => sdk.getDocs(consulta)),
    {
      dono: auth.currentUser?.uid || "",
      colecao,
      ttl: catalogos.has(colecao) ? 300000 : 60000,
    },
  );
}
let canal;
if (typeof window !== "undefined") {
  try {
    canal = new BroadcastChannel("pf-listas-invalidadas");
    canal.onmessage = (e) => invalidarLeituras(e.data?.colecoes || null);
  } catch {}
  window.addEventListener("storage", (e) => {
    if (e.key === "pf_listas_revisao") invalidarLeituras();
  });
  // Atualizar explícito sempre busca dados novos, inclusive em outra máquina.
  document.addEventListener(
    "click",
    (e) => {
      const botao = e.target.closest?.("button");
      if (
        botao &&
        /atualizar|consultar novamente|tentar novamente/i.test(
          botao.textContent,
        )
      )
        invalidarLeituras();
    },
    true,
  );
}
if (auth.app) onAuthStateChanged(auth, () => invalidarLeituras());
export function invalidarLeituras(colecoes = null, avisar = false) {
  cache.invalidar(colecoes);
  resumos.invalidar(colecoes);
  if (avisar) {
    if (canal) canal.postMessage({ colecoes });
    else
      try {
        localStorage.setItem(
          "pf_listas_revisao",
          String(Date.now()) + Math.random(),
        );
      } catch {}
  }
}
export const estatisticasLeituras = () => ({ ...cache.metricas });
export function memorizarResumo(chave, colecao, executar, ttl = 60000) {
  return resumos.ler(chave, () => executarFirebaseComLimite(executar), {
    dono: auth.currentUser?.uid || "",
    colecao,
    ttl,
  });
}
async function gravar(acao, colecoes) {
  invalidarLeituras(colecoes);
  try {
    return await executarFirebaseComLimite(acao);
  } finally {
    invalidarLeituras(colecoes, true);
  }
}
export const addDoc = (r, ...a) => gravar(() => sdk.addDoc(r, ...a), [caminhoGravacao(r)]);
export const setDoc = (r, ...a) => gravar(() => sdk.setDoc(r, ...a), [caminhoGravacao(r)]);
export const updateDoc = (r, ...a) =>
  gravar(() => sdk.updateDoc(r, ...a), [caminhoGravacao(r)]);
export const deleteDoc = (r) => gravar(() => sdk.deleteDoc(r), [caminhoGravacao(r)]);
export function writeBatch(db) {
  const lote = sdk.writeBatch(db),
    colecoes = new Set();
  const fachada = { commit: () => gravar(() => lote.commit(), [...colecoes]) };
  for (const metodo of ["set", "update", "delete"])
    fachada[metodo] = (r, ...a) => {
      colecoes.add(caminhoGravacao(r));
      lote[metodo](r, ...a);
      return fachada;
    };
  return fachada;
}
export async function runTransaction(db, executar, opcoes) {
  const colecoes = new Set();
  try {
    return await executarFirebaseComLimite(() =>
      sdk.runTransaction(
        db,
        (tx) => {
          const fachada = { get: (r) => tx.get(r) };
          for (const metodo of ["set", "update", "delete"])
            fachada[metodo] = (r, ...a) => {
              colecoes.add(caminhoGravacao(r));
              tx[metodo](r, ...a);
              return fachada;
            };
          return executar(fachada);
        },
        opcoes,
      ),
    );
  } finally {
    invalidarLeituras([...colecoes], true);
  }
}
