import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const ler = (n) =>
  fs.readFileSync(new URL("../js/" + n, import.meta.url), "utf8");
const fonte = ler("auth.js")
  .replace(/^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "")
  .replace(/^export /gm, "");
const adiar = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const pausa = () => new Promise((r) => setImmediate(r));
async function estabilizar() {
  for (let i = 0; i < 5; i++) await pausa();
}
function ambiente({
  pronto = Promise.resolve(),
  perfil = { roles: ["admin"] },
  getPerfil,
  transacao,
  signOut = async () => {},
} = {}) {
  const rotas = [],
    avisos = [],
    escritas = [],
    eventos = {},
    ouvintes = [],
    toasts = [];
  const auth = { currentUser: { uid: "admin" }, authStateReady: () => pronto };
  const doc = {
    body: { style: {}, append: (aviso) => avisos.push(aviso) },
    createElement: () => ({
      style: {},
      setAttribute() {},
      querySelector() {
        return this.botao || (this.botao = {});
      },
    }),
  };
  const ctx = {
    console: { error() {} },
    auth,
    db: {},
    app: { options: {} },
    document: doc,
    window: {
      location: {
        replace: (p) => rotas.push(p),
        reload: () => rotas.push("reload"),
      },
      addEventListener: (n, f) => {
        (eventos[n] ||= []).push(f);
      },
      mostrarToast: (...args) => toasts.push(args),
    },
    doc: (db, c, id) => ({ c, id }),
    getDocFromServer:
      getPerfil || (async () => ({ exists: () => true, data: () => perfil })),
    runTransaction: async (db, fn) =>
      fn({
        get: async () => transacao || { exists: () => false },
        set: (...args) => escritas.push(args),
      }),
    serverTimestamp: () => ({ timestamp: true }),
    onAuthStateChanged: (auth, f) => {
      const o = { f, ativo: true };
      ouvintes.push(o);
      return () => (o.ativo = false);
    },
    signOut,
    sendPasswordResetEmail: async () => {},
    updatePassword: async () => {},
    initializeApp() {},
    deleteApp() {},
    getAuth() {},
    setPersistence() {},
    inMemoryPersistence: {},
    createUserWithEmailAndPassword() {},
    crypto: globalThis.crypto,
  };
  vm.createContext(ctx);
  vm.runInContext(fonte, ctx);
  return {
    ctx,
    auth,
    rotas,
    avisos,
    escritas,
    eventos,
    toasts,
    emitir: (u) => {
      auth.currentUser = u;
      ouvintes.filter((o) => o.ativo).forEach((o) => o.f(u));
    },
  };
}
{
  const pronto = adiar(),
    a = ambiente({ pronto: pronto.promise });
  a.auth.currentUser = null;
  let inicializacoes = 0;
  a.ctx.protegerRota(() => inicializacoes++);
  await estabilizar();
  assert.deepEqual(a.rotas, []);
  a.auth.currentUser = { uid: "admin" };
  pronto.resolve();
  await estabilizar();
  assert.equal(inicializacoes, 1);
  a.emitir({ uid: "admin" });
  a.emitir({ uid: "admin" });
  assert.equal(inicializacoes, 1);
  a.emitir(null);
  assert.deepEqual(a.rotas, ["/login.html"]);
  assert.equal(a.ctx.document.body.style.visibility, "hidden");
}
{
  const consulta = adiar(),
    a = ambiente({ getPerfil: () => consulta.promise });
  let inicializacoes = 0;
  a.ctx.protegerRota(() => inicializacoes++);
  await estabilizar();
  a.emitir({ uid: "outro" });
  consulta.resolve({ exists: () => true, data: () => ({ roles: ["admin"] }) });
  await estabilizar();
  assert.equal(inicializacoes, 0);
  assert.deepEqual(a.rotas, ["reload"]);
}
{
  const a = ambiente({
    getPerfil: async () => {
      throw Error("rede indisponível");
    },
  });
  let inicio = false;
  a.ctx.protegerRota(() => (inicio = true));
  await estabilizar();
  assert.equal(inicio, false);
  assert.equal(a.avisos.length, 1);
  assert.equal(a.escritas.length, 0);
  a.avisos[0].botao.onclick();
  assert.deepEqual(a.rotas, ["reload"]);
}
{
  const a = ambiente({
    getPerfil: async () => ({ exists: () => false }),
    transacao: {
      exists: () => true,
      data: () => ({ roles: ["admin"], nome: "Já configurado" }),
    },
  });
  const p = await a.ctx.buscarDadosUsuario("admin");
  assert.deepEqual(p.roles, ["admin"]);
  assert.equal(a.escritas.length, 0);
  const b = ambiente({ getPerfil: async () => ({ exists: () => false }) });
  const novo = await b.ctx.buscarDadosUsuario("admin");
  assert.equal(novo.roles[0], "user");
  assert.equal(b.escritas.length, 1);
}
{
  const a = ambiente({
    signOut: async () => {
      throw Error("falha");
    },
  });
  await a.ctx.logoutUsuario();
  assert.deepEqual(a.rotas, []);
  assert.equal(a.toasts.length, 1);
  const b = ambiente();
  let iniciou = 0;
  const encerrar = b.ctx.protegerRota(() => iniciou++);
  await estabilizar();
  encerrar();
  b.emitir(null);
  assert.deepEqual(b.rotas, []);
  b.eventos.pageshow[0]({ persisted: true });
  assert.deepEqual(b.rotas, ["reload"]);
}
function prepararLogin(persistencia) {
  const campos = new Map();
  const handlers = new Map();
  for (const id of [
    "btnLogin",
    "email",
    "senha",
    "manterConectado",
    "alertErro",
    "alertErroTexto",
    "alertSucesso",
    "alertSucessoTexto",
    "formLogin",
    "formRecuperacao",
    "btnEsqueciSenha",
    "btnVoltarLogin",
    "btnEnviarReset",
    "emailRecuperar",
    "toggleSenha",
    "iconOlhoAberto",
    "iconOlhoFechado",
  ])
    campos.set(id, {
      value: "",
      checked: true,
      style: {},
      querySelector: () => ({}),
      addEventListener: (n, f) => handlers.set(id + ":" + n, f),
      setAttribute() {},
    });
  campos.get("email").value = "teste@local.invalid";
  campos.get("senha").value = "SenhaTeste!";
  const chamadas = { entrar: 0, persistencias: [] };
  const ctx = {
    document: { getElementById: (id) => campos.get(id) },
    auth: {},
    setPersistence: async (a, p) => {
      chamadas.persistencias.push(p);
      await persistencia;
    },
    signInWithEmailAndPassword: async () => {
      chamadas.entrar++;
    },
    browserLocalPersistence: "local",
    browserSessionPersistence: "aba",
    resetarSenha: async () => ({ sucesso: true }),
    sessionStorage: { getItem: () => null, setItem() {} },
    window: { location: {} },
    Date,
    JSON,
    Math,
  };
  const s = ler("login.js").replace(
    /^import[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm,
    "",
  );
  vm.createContext(ctx);
  vm.runInContext(s, ctx);
  return { ctx, campos, handlers, chamadas };
}
{
  const p = adiar(),
    a = prepararLogin(p.promise);
  const primeira = a.ctx.fazerLogin(),
    segunda = a.ctx.fazerLogin();
  await estabilizar();
  assert.equal(a.chamadas.persistencias.length, 1);
  assert.equal(a.chamadas.entrar, 0);
  p.resolve();
  await Promise.all([primeira, segunda]);
  assert.equal(a.chamadas.entrar, 1);
  assert.deepEqual(a.chamadas.persistencias, ["local"]);
  assert.equal(a.ctx.window.location.href, "/index.html");
  const b = prepararLogin(Promise.resolve());
  b.campos.get("manterConectado").checked = false;
  await b.ctx.fazerLogin();
  assert.deepEqual(b.chamadas.persistencias, ["aba"]);
}
console.log(
  "OK SESSÃO: restauração antes de redirecionar, login único, preferência local/aba, troca de conta durante consulta, logout em outra aba, ausência de perfil sem sobrescrever cargos, falha de rede explícita, repetição segura e retorno do histórico do navegador.",
);
