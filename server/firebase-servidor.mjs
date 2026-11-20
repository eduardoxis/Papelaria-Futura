import { ErroEscala } from "./escalas-acesso.mjs";

let servicos;
export async function firebaseServidor() {
  if (!servicos)
    servicos = (async () => {
      const { initializeApp, getApps, cert } =
        await import("firebase-admin/app");
      const { getFirestore } = await import("firebase-admin/firestore");
      const { getAuth } = await import("firebase-admin/auth");
      if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
        throw new ErroEscala(
          "Gestão de Escalas aguarda a configuração segura do servidor na Vercel.",
          503,
        );
      let conta;
      try {
        conta = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      } catch {
        throw new ErroEscala(
          "A variável segura de configuração do servidor está inválida.",
          503,
        );
      }
      if (conta.project_id !== "papelaria-futura")
        throw new ErroEscala(
          "A conta do servidor deve pertencer ao projeto papelaria-futura.",
          503,
        );
      const app =
        getApps().find((a) => a.name === "escalas-servidor") ||
        initializeApp(
          { credential: cert(conta), projectId: conta.project_id },
          "escalas-servidor",
        );
      return { db: getFirestore(app), auth: getAuth(app) };
    })().catch((erro) => {
      servicos = null;
      throw erro;
    });
  return servicos;
}
export async function sessaoServidor(req) {
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token)
    throw new ErroEscala("Entre no sistema para acessar escalas.", 401);
  const servicos = await firebaseServidor();
  let usuario;
  try {
    usuario = await servicos.auth.verifyIdToken(token, true);
  } catch {
    throw new ErroEscala("Sua sessão expirou. Entre novamente.", 401);
  }
  return { db: servicos.db, uid: usuario.uid };
}
