// Verificação isolada do cache e da política de fontes no Chrome.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const repo = fileURLToPath(new URL("../", import.meta.url));
const pasta = fileURLToPath(
  new URL("../../recursos-ui/" + Date.now() + "/", import.meta.url),
);
fs.mkdirSync(pasta, { recursive: true });
const chrome =
  process.env.CHROME_BIN ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const politica = JSON.parse(
  fs.readFileSync(path.join(repo, "vercel.json"), "utf8"),
)
  .headers.flatMap((h) => h.headers)
  .find((h) => h.key === "Content-Security-Policy").value;
const fonte = fs
  .readFileSync(process.env.PF_TEST_FONT || "C:/Windows/Fonts/arial.ttf")
  .toString("base64");
let falhar = false;
const servidor = http.createServer((req, res) => {
  const p = new URL(req.url, "http://localhost").pathname;
  res.setHeader("Content-Security-Policy", politica);
  if (p === "/estado") {
    falhar = true;
    return res.end("ok");
  }
  if (p === "/service-worker.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.setHeader("Cache-Control", "no-cache");
    return res.end(fs.readFileSync(path.join(repo, "service-worker.js")));
  }
  if (p === "/recurso-verificacao.css") {
    res.setHeader("Content-Type", "text/css");
    if (falhar) {
      res.statusCode = 503;
      return res.end("falha");
    }
    return res.end("body{color:rgb(1,2,3)}");
  }
  if (p === "/verificar.html") {
    res.setHeader("Content-Type", "text/html");
    return res.end(
      '<!doctype html><html><head><title>Verificação de recursos</title></head><body><p>Fonte incorporada e cache</p><script>window.violacoes=[];addEventListener("securitypolicyviolation",e=>window.violacoes.push(e.violatedDirective));</script></body></html>',
    );
  }
  const a = path.resolve(repo, p === "/" ? "index.html" : "." + p);
  if (a.startsWith(repo) && fs.existsSync(a) && fs.statSync(a).isFile()) {
    if (p.endsWith(".js")) res.setHeader("Content-Type", "text/javascript");
    if (p.endsWith(".css")) res.setHeader("Content-Type", "text/css");
    if (p.endsWith(".html")) res.setHeader("Content-Type", "text/html");
    return res.end(fs.readFileSync(a));
  }
  res.statusCode = 404;
  res.end("ausente");
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const processo = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    "--user-data-dir=" + pasta,
    "about:blank",
  ],
  { windowsHide: true, stdio: "ignore" },
);
let ws;
const pendentes = new Map();
let id = 0;
function comando(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id;
    pendentes.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}
try {
  const portaArquivo = path.join(pasta, "DevToolsActivePort");
  for (let i = 0; i < 200 && !fs.existsSync(portaArquivo); i++) await pausa(50);
  const porta = fs.readFileSync(portaArquivo, "utf8").split("\n")[0];
  const abas = await (
    await fetch("http://127.0.0.1:" + porta + "/json")
  ).json();
  ws = new WebSocket(abas.find((t) => t.type === "page").webSocketDebuggerUrl);
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pendentes.get(m.id);
      pendentes.delete(m.id);
      m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
    }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const avaliar = async (expression) => {
    const r = await comando("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw Error(
        r.exceptionDetails.text +
          ": " +
          r.exceptionDetails.exception?.description,
      );
    return r.result.value;
  };
  await comando("Page.navigate", {
    url: "http://127.0.0.1:" + servidor.address().port + "/verificar.html",
  });
  for (let i = 0; i < 100; i++) {
    if (await avaliar("Array.isArray(window.violacoes)")) break;
    await pausa(50);
  }
  const r = await avaliar(
    "(async()=>{const f=new FontFace('Verificacao', 'url(data:font/ttf;base64," +
      fonte +
      ")');await f.load();document.fonts.add(f);await navigator.serviceWorker.register('/service-worker.js');await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Service worker nao instalou')),15000))]);if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));const a=await fetch('/recurso-verificacao.css');const original=await a.text();await new Promise(r=>setTimeout(r,200));await fetch('/estado');const b=await fetch('/recurso-verificacao.css');return {fonte:f.status,violacoes:window.violacoes,status:b.status,original,recuperado:await b.text()};})()",
  );
  assert.equal(r.fonte, "loaded");
  assert.equal(r.violacoes.length, 0);
  assert.equal(r.status, 200);
  assert.equal(r.original, r.recuperado);
  console.log(
    "OK CHROME: fonte data: permitida pela CSP real, service worker instalado e recurso preservado durante HTTP 503.",
  );
} finally {
  if (ws?.readyState === 1) {
    await Promise.race([comando("Browser.close").catch(() => {}), pausa(1000)]);
    ws.close();
  }
  processo.kill();
  servidor.close();
}
