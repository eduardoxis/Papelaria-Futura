import { timingSafeEqual } from "node:crypto";
import {
  firebaseServidor,
  sessaoServidor,
} from "../server/firebase-servidor.mjs";
import { ErroEscala } from "../server/escalas-acesso.mjs";
import {
  consultarCalendario,
  sincronizarAno,
  decidirFuncionamento,
  autorizarGestorCalendario,
} from "../server/feriados-service.mjs";

function periodo(query) {
  if (query.ano) {
    const ano = Number(query.ano);
    if (!Number.isInteger(ano) || ano < 2026 || ano > 2100)
      throw new ErroEscala("Informe um ano entre 2026 e 2100.");
    return { inicio: ano + "-01-01", fim: ano + "-12-31" };
  }
  return { inicio: query.inicio, fim: query.fim };
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Authorization");
  try {
    const query = {
      ...Object.fromEntries(
        new URL(req.url, "https://papelaria-futura.vercel.app").searchParams,
      ),
      ...req.query,
    };
    if (query.acao === "cron") {
      const esperado = process.env.CRON_SECRET,
        recebido = req.headers.authorization?.replace(/^Bearer /, "");
      if (
        req.method !== "GET" ||
        !esperado ||
        !recebido ||
        Buffer.byteLength(esperado) !== Buffer.byteLength(recebido) ||
        !timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido))
      )
        throw new ErroEscala("Sincronização automática não autorizada.", 401);
      const { db } = await firebaseServidor();
      const ano = Number(
        new Intl.DateTimeFormat("en", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
        }).format(new Date()),
      );
      const resultados = await Promise.all(
        [ano, ano + 1].map((atual) => sincronizarAno(db, atual)),
      );
      return res
        .status(200)
        .json({
          sincronizados: resultados.map((r) => ({
            ano: r.ano,
            status: r.esferas,
          })),
        });
    }
    if (!["GET", "POST"].includes(req.method))
      throw new ErroEscala("Utilize GET ou POST.", 405);
    const { db, uid } = await sessaoServidor(req);
    await autorizarGestorCalendario(db, uid);
    if (
      (query.uf && query.uf !== "GO") ||
      (query.municipio &&
        query.municipio
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase() !== "luziania")
    )
      throw new ErroEscala(
        "Esta API está configurada para Brasil, Goiás e Luziânia.",
      );
    if (req.method === "POST") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      if (Buffer.byteLength(JSON.stringify(body)) > 20000)
        throw new ErroEscala("Solicitação muito grande.", 413);
      const acao = query.acao || body.acao;
      if (acao === "sincronizar") {
        const ano = Number(body.ano || query.ano);
        periodo({ ano: String(ano) });
        const dados = await sincronizarAno(db, ano);
        return res
          .status(200)
          .json({ ano, status: dados.esferas, eventos: dados.eventos });
      }
      if (acao === "decisao" || acao === "simular_decisao")
        return res
          .status(200)
          .json(
            await decidirFuncionamento(db, uid, body, {
              simular: acao === "simular_decisao",
            }),
          );
      throw new ErroEscala("Ação de calendário não reconhecida.");
    }
    const dados = await consultarCalendario(db, {
      ...periodo(query),
      tipo: query.tipo,
      abrangencia: query.abrangencia,
    });
    if (query.acao === "status")
      return res
        .status(200)
        .json({
          localidade: { pais: "BR", uf: "GO", municipio: "Luziânia" },
          status: dados.status,
        });
    return res
      .status(200)
      .json({
        ...dados,
        localidade: {
          pais: "BR",
          uf: "GO",
          municipio: "Luziânia",
          fuso: "America/Sao_Paulo",
        },
      });
  } catch (erro) {
    const status =
      erro instanceof ErroEscala
        ? erro.status
        : erro instanceof SyntaxError
          ? 400
          : 500;
    if (status === 500)
      console.error("Falha no calendário oficial", erro.code || erro.name);
    return res
      .status(status)
      .json({
        erro:
          status === 500
            ? "Não foi possível consultar o calendário oficial. Os dados já confirmados serão preservados."
            : erro.message,
        detalhes: erro.detalhes || null,
      });
  }
}
