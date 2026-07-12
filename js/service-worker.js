// ============================================================
// service-worker.js — Papelaria Futura (PWA)
// ============================================================
// Sobe a versão do cache sempre que alterar arquivos estáticos
// para forçar os usuários a receberem a versão nova.
const CACHE_VERSION = "pf-v3";
const CACHE_NAME = `papelaria-futura-${CACHE_VERSION}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./login.html",
  "./manifest.json",
  "./img/logo.png",
  "./img/favicon.png",
  "./img/icon-192_1.png",
  "./img/icon-512_1.png",
  "./css/main.css",
  "./css/index.css",
  "./css/login.css",
  "./css/mobile.css",
  "./css/cotacao.css",
  "./css/caixa.css",
  "./css/admin.css",
  "./css/comissao.css",
  "./css/produtos.css",
  "./css/promissoria.css",
  "./css/clientes.css",
  "./js/index.js",
  "./js/login.js",
  "./js/auth.js",
  "./js/firebase-config.js",
  "./js/database.js",
  "./js/cotacao.js",
  "./js/caixa.js",
  "./js/admin.js",
  "./js/comissao.js",
  "./js/produtos.js",
  "./js/promissoria.js",
  "./js/servicos.js",
  "./js/clientes.js",
  "./js/senhaCotacao.js",
  "./js/pdf.js"
];

// ── INSTALL — cacheia o "app shell" ────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── ACTIVATE — remove caches de versões antigas ────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes
          .filter((nome) => nome !== CACHE_NAME)
          .map((nome) => caches.delete(nome))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH — estratégia:
//    • Firebase / APIs externas / Google Fonts → sempre rede (dados dinâmicos)
//    • Arquivos estáticos do próprio site → cache primeiro, com atualização em segundo plano
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  const ehExterno = url.origin !== self.location.origin;
  const ehFirebase = /firestore|firebaseio|googleapis|gstatic\.com\/firebasejs|identitytoolkit/.test(url.href);

  if (ehFirebase) {
    // Dados do Firebase: nunca cachear, sempre buscar da rede
    event.respondWith(fetch(request).catch(() => new Response(null, { status: 503 })));
    return;
  }

  if (ehExterno) {
    // CDNs (fontes, jsPDF, xlsx, etc.) — cache primeiro, rede como reforço
    event.respondWith(
      caches.match(request).then((cached) => {
        const rede = fetch(request)
          .then((resposta) => {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, resposta.clone()));
            return resposta;
          })
          .catch(() => cached);
        return cached || rede;
      })
    );
    return;
  }

  // Arquivos do próprio site — cache primeiro, atualiza em segundo plano
  event.respondWith(
    caches.match(request).then((cached) => {
      const redeAtualizando = fetch(request)
        .then((resposta) => {
          if (resposta && resposta.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, resposta.clone()));
          }
          return resposta;
        })
        .catch(() => cached);
      return cached || redeAtualizando;
    })
  );
});
