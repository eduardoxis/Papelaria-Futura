import fs from "node:fs";
const url = (s) =>
  "data:text/javascript;base64," + Buffer.from(s).toString("base64");
const ler = (n) =>
  fs.readFileSync(new URL("../js/" + n, import.meta.url), "utf8");
export function fachadaFirebaseTeste(sdk, authSdk, config) {
  return url(
    ler("operacoes-banco.js")
      .replaceAll(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js",
        sdk,
      )
      .replaceAll(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js",
        authSdk,
      )
      .replaceAll("./firebase-config.js", config)
      .replaceAll("./leituras-cache.js", url(ler("leituras-cache.js")))
      .replaceAll("./firebase-limites.js", url(ler("firebase-limites.js"))),
  );
}
