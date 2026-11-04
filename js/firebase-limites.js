export const MENSAGEM_COTA_FIREBASE =
  "O Firebase atingiu a cota de operações do projeto. Aguarde a liberação da cota antes de tentar novamente.";
export function ehCotaFirebase(erro) {
  return (
    String(erro?.code || "").replace(/^firestore\//, "") ===
      "resource-exhausted" ||
    /quota exceeded/i.test(String(erro?.message || ""))
  );
}
export function criarControleCotaFirebase({
  agora = () => Date.now(),
  armazenamento = () => globalThis.localStorage,
  pausaMs = 60000,
} = {}) {
  let pausaAte = 0;
  const chave = "pf_firestore_pausa_cota_ate";
  function lerPausa() {
    const instante = agora();
    if (pausaAte > instante + pausaMs) pausaAte = 0;
    try {
      const v = Number(armazenamento()?.getItem(chave));
      if (Number.isFinite(v) && v > instante && v <= instante + pausaMs)
        pausaAte = Math.max(pausaAte, v);
    } catch {}
    return pausaAte;
  }
  function erroCota() {
    return Object.assign(new Error(MENSAGEM_COTA_FIREBASE), {
      code: "resource-exhausted",
      bloqueioLocal: true,
    });
  }
  function verificar() {
    if (lerPausa() > agora()) throw erroCota();
  }
  function registrar(erro) {
    if (!ehCotaFirebase(erro)) return false;
    if (!erro.bloqueioLocal) {
      pausaAte = agora() + pausaMs;
      try {
        armazenamento()?.setItem(chave, String(pausaAte));
      } catch {}
    }
    return true;
  }
  async function executar(operacao) {
    verificar();
    try {
      return await operacao();
    } catch (erro) {
      if (registrar(erro)) throw erroCota();
      throw erro;
    }
  }
  return {
    executar,
    verificar,
    registrar,
    pausado: () => lerPausa() > agora(),
  };
}
const controle = criarControleCotaFirebase();
export const executarFirebaseComLimite = controle.executar;
export const verificarCotaFirebase = controle.verificar;
export const firebaseEmPausa = controle.pausado;
export const registrarCotaFirebase = controle.registrar;
