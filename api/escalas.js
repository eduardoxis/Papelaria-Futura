import { executarEscalas, ErroEscala } from "../server/escalas-service.mjs";
import { sessaoServidor } from "../server/firebase-servidor.mjs";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "POST")
    return res.status(405).json({ erro: "Utilize POST." });
  try {
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token)
      throw new ErroEscala("Entre no sistema para acessar escalas.", 401);
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || Buffer.byteLength(JSON.stringify(body)) > 700000)
      throw new ErroEscala("Solicitação inválida ou muito grande.", 413);
    const { db, uid } = await sessaoServidor(req);
    const resultado = await executarEscalas(db, uid, body);
    return res.status(200).json(resultado);
  } catch (erro) {
    if (erro instanceof SyntaxError)
      return res
        .status(400)
        .json({ erro: "Dados enviados em formato inválido." });
    if (erro instanceof ErroEscala)
      return res
        .status(erro.status)
        .json({ erro: erro.message, detalhes: erro.detalhes });
    console.error("Falha na API de escalas", erro.code || erro.name);
    const quota = erro.code === 8 || erro.code === "resource-exhausted";
    return res.status(quota ? 429 : 500).json({
      erro: quota
        ? "O Firebase atingiu sua cota. Aguarde antes de tentar novamente."
        : "Não foi possível concluir a operação de escalas. Tente novamente.",
    });
  }
}
