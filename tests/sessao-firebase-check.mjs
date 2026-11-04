import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
const require = createRequire(
  path.resolve(process.env.VC_TEST_DEPENDENCIES || "package.json"),
);
const appSdk = pathToFileURL(require.resolve("firebase/app")).href,
  authSdk = pathToFileURL(require.resolve("firebase/auth")).href,
  dbSdk = pathToFileURL(require.resolve("firebase/firestore")).href;
const { createApp } = require("firebase-tools/lib/emulator/auth/server");
const servidorApp = await createApp("demo-futura-test");
const servidor = await new Promise((resolve) => {
  const s = servidorApp.listen(9099, "127.0.0.1", () => resolve(s));
});
const { initializeTestEnvironment, assertFails, assertSucceeds } = await import(
  pathToFileURL(require.resolve("@firebase/rules-unit-testing")).href
);
const env = await initializeTestEnvironment({
  projectId: "demo-futura-test",
  firestore: {
    host: "127.0.0.1",
    port: 8089,
    rules: fs.readFileSync(
      new URL("../firebase/firestore.rules", import.meta.url),
      "utf8",
    ),
  },
});
const url = (s) =>
  "data:text/javascript;base64," + Buffer.from(s).toString("base64");
const cfg = url(
  "import{initializeApp}from'" +
    appSdk +
    "';import{getAuth,connectAuthEmulator}from'" +
    authSdk +
    "';import{getFirestore,connectFirestoreEmulator}from'" +
    dbSdk +
    "';const app=initializeApp({apiKey:'fake-api-key',projectId:'demo-futura-test',authDomain:'demo-futura-test.firebaseapp.com'},'sessao-teste');export const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});export const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8089);export default app;",
);
const authAdaptado = url(
  "export * from'" +
    authSdk +
    "';import*as sdk from'" +
    authSdk +
    "';export function getAuth(app){const a=sdk.getAuth(app);if(app.name.startsWith('cadastro-'))sdk.connectAuthEmulator(a,'http://127.0.0.1:9099',{disableWarnings:true});return a;}",
);
const fonte = fs
  .readFileSync(new URL("../js/auth.js", import.meta.url), "utf8")
  .replaceAll(
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js",
    authAdaptado,
  )
  .replaceAll(
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js",
    dbSdk,
  )
  .replaceAll(
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js",
    appSdk,
  )
  .replaceAll("./firebase-config.js", cfg);
const api = await import(url(fonte));
const config = await import(cfg);
const sdkAuth = await import(authSdk);
const { doc, setDoc, getDoc, terminate, setLogLevel } = await import(dbSdk);
setLogLevel("silent");
const { getApps, deleteApp } = await import(appSdk);
const pausinha = () => new Promise((r) => setTimeout(r, 10));
async function esperar(fn) {
  for (let i = 0; i < 300; i++) {
    if (fn()) return;
    await pausinha();
  }
  throw Error("Tempo excedido na conferência de autenticação");
}
const trocas = [];
let limparGuard = null;
const localizacoes = [];
globalThis.window = new EventTarget();
window.location = {
  replace: (p) => localizacoes.push(p),
  reload: () => localizacoes.push("reload"),
};
globalThis.document = {
  body: {
    style: {},
    append: () => assert.fail("Acesso válido não deve mostrar erro"),
  },
};
try {
  await env.clearFirestore();
  const admin = (
    await sdkAuth.createUserWithEmailAndPassword(
      config.auth,
      "admin@teste.invalid",
      "SenhaTeste123!",
    )
  ).user;
  await env.withSecurityRulesDisabled((c) =>
    setDoc(doc(c.firestore(), "usuarios", admin.uid), {
      uid: admin.uid,
      nome: "Administrador de teste",
      roles: ["admin"],
    }),
  );
  const off = sdkAuth.onAuthStateChanged(config.auth, (u) =>
    trocas.push(u?.uid || null),
  );
  await esperar(() => trocas.length > 0);
  let inicializacoes = 0;
  limparGuard = api.protegerRota((u, p) => {
    assert.equal(u.uid, admin.uid);
    assert.ok(p.roles.includes("admin"));
    inicializacoes++;
  });
  await esperar(() => inicializacoes === 1);
  const colaborador = await api.criarContaUsuario(
    "colaborador@teste.invalid",
    "SenhaTeste123!",
  );
  assert.notEqual(colaborador.uid, admin.uid);
  assert.equal(config.auth.currentUser.uid, admin.uid);
  assert.ok(trocas.every((uid) => uid === admin.uid));
  assert.ok(!getApps().some((a) => a.name.startsWith("cadastro-")));
  await setDoc(doc(config.db, "usuarios", colaborador.uid), {
    uid: colaborador.uid,
    nome: "Colaborador",
    roles: ["operador_os"],
  });
  assert.equal(
    (await getDoc(doc(config.db, "usuarios", colaborador.uid))).data().nome,
    "Colaborador",
  );
  await assert.rejects(() =>
    api.criarContaUsuario("email-invalido", "SenhaTeste123!"),
  );
  assert.equal(config.auth.currentUser.uid, admin.uid);
  assert.ok(!getApps().some((a) => a.name.startsWith("cadastro-")));
  const adminFonte = fs.readFileSync(
      new URL("../js/admin.js", import.meta.url),
      "utf8",
    ),
    inicio = adminFonte.indexOf("async function criarNovoUsuario()"),
    fim = adminFonte.indexOf(
      "\n// ================================================================",
      inicio,
    );
  const campos = {
    novoNome: { value: "Outro colaborador" },
    novoEmail: { value: "outro@teste.invalid" },
    novaSenha: { value: "SenhaTeste123!" },
    erroNovoUsuario: { style: {} },
    btnConfirmarNovoUsuario: { disabled: false, dataset: {}, textContent: "" },
  };
  let contas = 0,
    gravacoes = 0,
    sucessos = 0;
  const contexto = {
    document: {
      getElementById: (id) => campos[id],
      querySelectorAll: () => [{ value: "operador_os" }],
    },
    window: {
      fecharModal() {},
      mostrarToast() {
        sucessos++;
      },
    },
    criarContaUsuario: async (...args) => {
      contas++;
      return api.criarContaUsuario(...args);
    },
    salvarUsuario: async (uid, d) => {
      gravacoes++;
      if (gravacoes === 1) return { sucesso: false };
      await setDoc(
        doc(config.db, "usuarios", uid),
        JSON.parse(JSON.stringify(d)),
      );
      return { sucesso: true };
    },
    carregarUsuarios() {},
    traduzirErro: () => "",
    Error,
    Object,
    Array,
  };
  vm.createContext(contexto);
  vm.runInContext(adminFonte.slice(inicio, fim), contexto);
  await contexto.criarNovoUsuario();
  assert.equal(sucessos, 0);
  assert.equal(campos.btnConfirmarNovoUsuario.disabled, false);
  assert.ok(campos.btnConfirmarNovoUsuario.dataset.uidCriado);
  await contexto.criarNovoUsuario();
  assert.equal(contas, 1);
  assert.equal(gravacoes, 2);
  assert.equal(sucessos, 1);
  assert.equal(config.auth.currentUser.uid, admin.uid);
  assert.equal(
    (
      await getDoc(
        doc(
          config.db,
          "usuarios",
          campos.btnConfirmarNovoUsuario.dataset.uidCriado,
        ),
      )
    ).data().nome,
    "Outro colaborador",
  );
  assert.equal(inicializacoes, 1);
  const novoDb = env.authenticatedContext("novo").firestore();
  await assertFails(
    setDoc(doc(novoDb, "usuarios", "novo"), { roles: ["user"], role: "admin" }),
  );
  await assertFails(
    setDoc(doc(novoDb, "usuarios", "novo"), { roles: ["admin"] }),
  );
  await assertSucceeds(
    setDoc(doc(novoDb, "usuarios", "novo"), {
      uid: "novo",
      roles: ["user"],
      role: "user",
    }),
  );
  await assertFails(
    setDoc(doc(novoDb, "usuarios", "outro"), { roles: ["admin"] }),
  );
  await api.logoutUsuario();
  await esperar(() => localizacoes.length > 0);
  assert.equal(config.auth.currentUser, null);
  assert.deepEqual(localizacoes, ["/login.html"]);
  off();
  console.log(
    "OK SESSÃO/FIREBASE: SDK real com emuladores locais; cadastro isolado preserva administrador, perfil gravado com permissão correta, falha sem troca de conta, limpeza de acesso temporário, repetição de gravação sem criar outro login, inicialização única e logout acompanhado.",
  );
} finally {
  limparGuard?.();
  await terminate(config.db);
  await deleteApp(config.default);
  await env.cleanup();
  await new Promise((r) => servidor.close(r));
  delete globalThis.window;
  delete globalThis.document;
}
