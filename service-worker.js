// ============================================================
// service-worker.js — Papelaria Futura (PWA)
// ============================================================
// Sobe a versão do cache sempre que alterar arquivos estáticos
// para forçar os usuários a receberem a versão nova.
const CACHE_VERSION = "pf-cache-modulos-locais-v9";
const CACHE_NAME = `papelaria-futura-${CACHE_VERSION}`;

const APP_SHELL = [
  "./css/loading.css", "./js/loading.js",
  "./css/animations.css", "./js/utils/intro.js", "./assets/images/logo-intro.webp",
  './js/operacoes-banco.js', './js/leituras-cache.js', './js/paginacao.js', './js/tabelas-paginadas.js',
  "./js/firebase-limites.js",
  "./js/os-core.js", "./js/os-db.js", "./js/os-ui.js", "./js/os-painel.js", "./css/os.css", "./os/painel.html",
  "./",
  "./index.html",
  "./login.html",
  "./manifest.json",
  "./img/logo.png",
  "./img/lembrete-equipe-orcamentos-v3.png",
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
  "./js/backup.js",
  "./js/pdv-core.js",
  "./js/pdv-db.js",
  "./js/pdv-ui.js",
  "./js/pdv-documentos.js",
  "./css/pdv.css",
  "./js/vendas-comissoes.js",
  "./js/vendas-comissoes-core.js",
  "./js/vendas-comissoes-db.js",
  "./css/vendas-comissoes.css",
  "./js/comissao.js",
  "./js/comissao-ordem.js",
  "./js/servicos.js",
  "./js/entrega.js",
  "./js/clientes.js",
  "./js/senhaCotacao.js",
  "./js/pdf.js"
];

// ── INSTALL — cacheia o "app shell" ────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE — remove caches de versões antigas ────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes
          .filter((nome) => nome.startsWith("papelaria-futura-") && nome !== CACHE_NAME)
          .map((nome) => caches.delete(nome))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH — estratégia:
//    • Firebase / APIs externas / Google Fonts → sempre rede (dados dinâmicos)
//    • Arquivos do próprio site → rede primeiro, cache quando a rede falha
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!/^https?:$/.test(url.protocol) || url.hostname === 'ext-cdn.cuponomia.com.br') return;

  const ehExterno = url.origin !== self.location.origin;
  const ehFirebase = ehExterno && /firestore|firebaseio|googleapis|gstatic\.com\/firebasejs|identitytoolkit/.test(url.href);

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
            const copiaParaCache = resposta.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, copiaParaCache))
              .catch((err) => console.warn("Falha ao atualizar cache:", err));
            return resposta;
          })
          .catch(() => cached || new Response("Recurso indisponível", { status: 503, statusText: "Offline" }));
        return cached || rede;
      })
    );
    return;
  }

  // Arquivos do próprio site — REDE PRIMEIRO, cache só como fallback
  // offline. Assim qualquer atualização que a gente suba aparece na
  // hora, sem depender de trocar o CACHE_VERSION toda vez.
  event.respondWith(
    fetch(request)
      .then(async (resposta) => {
        if (resposta.status >= 500) {
          const copia = await caches.match(request, { cacheName: CACHE_NAME });
          return copia || resposta;
        }
        if (resposta && resposta.status === 200) {
          const copiaParaCache = resposta.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, copiaParaCache))
            .catch((err) => console.warn("Falha ao atualizar cache:", err));
        }
        return resposta;
      })
      .catch(() => caches.match(request, { cacheName: CACHE_NAME }).then((cached) =>
        cached || new Response("Recurso indisponível", { status: 503, statusText: "Offline" })
      ))
  );
});


















