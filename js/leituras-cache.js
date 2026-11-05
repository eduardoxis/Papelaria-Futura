// Cache somente em memória. Nenhum dado financeiro é persistido no navegador.
export function criarCacheLeituras({
  igual = (a, b) => a === b,
  agora = Date.now,
  maximo = 80,
} = {}) {
  let entradas = [],
    versao = 0;
  const metricas = { consultas: 0, reaproveitadas: 0 };
  function invalidar(colecoes = null) {
    versao++;
    entradas = colecoes
      ? entradas.filter((e) => !colecoes.includes(e.colecao))
      : [];
  }
  async function ler(
    chave,
    executar,
    { dono = "", colecao = "", ttl = 60000 } = {},
  ) {
    const instante = agora();
    entradas = entradas.filter((e) => e.pendente || e.ate > instante);
    const existente = entradas.find(
      (e) => e.dono === dono && igual(e.chave, chave),
    );
    if (existente) {
      metricas.reaproveitadas++;
      return existente.promessa;
    }
    const entrada = { chave, dono, colecao, pendente: true, ate: 0 };
    const revisao = versao;
    metricas.consultas++;
    entrada.promessa = Promise.resolve()
      .then(executar)
      .then(
        (resultado) => {
          entrada.pendente = false;
          // Respostas offline/pending não viram resultados confirmados em cache.
          if (
            revisao !== versao ||
            resultado?.sucesso === false ||
            resultado?.metadata?.fromCache ||
            resultado?.metadata?.hasPendingWrites
          ) {
            entradas = entradas.filter((e) => e !== entrada);
          } else entrada.ate = agora() + ttl;
          return resultado;
        },
        (erro) => {
          entradas = entradas.filter((e) => e !== entrada);
          throw erro;
        },
      );
    entradas.push(entrada);
    while (entradas.length > maximo) entradas.shift();
    return entrada.promessa;
  }
  return { ler, invalidar, metricas };
}
