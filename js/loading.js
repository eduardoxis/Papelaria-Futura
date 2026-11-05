const TEMPO_MINIMO = 300;
const ativos = new WeakMap();

export function showLoading(container, texto = "Carregando") {
  let estado = ativos.get(container);
  if (!estado) {
    const loader = document.createElement("div");
    loader.className = "pf-loader";
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-live", "polite");
    loader.innerHTML = `
      <div class="pf-stage" aria-hidden="true">
        <div class="pf-line"></div>
        <div class="pf-pencil">
          <svg viewBox="0 0 18 72" aria-hidden="true">
            <rect x="1" y="0" width="16" height="9" rx="3" fill="#f87171"/>
            <rect x="1" y="9" width="16" height="5" fill="#94a3b8"/>
            <rect x="1" y="14" width="16" height="36" fill="#facc15"/>
            <rect x="9" y="14" width="8" height="36" fill="#eab308"/>
            <path d="M1 50h16L9 72z" fill="#fde7c3"/>
            <path d="M6 63h6L9 72z" fill="#1e293b"/>
          </svg>
        </div>
      </div>
      <span class="pf-text"><span></span><i aria-hidden="true">.</i><i aria-hidden="true">.</i><i aria-hidden="true">.</i></span>`;
    container.append(loader);
    estado = { loader, inicio: performance.now() };
    ativos.set(container, estado);
  }
  estado.loader.querySelector(".pf-text > span").textContent = texto;
  container.setAttribute("aria-busy", "true");
  estado.consulta = Symbol();
  return estado.consulta;
}

export async function hideLoading(container, consulta) {
  const estado = ativos.get(container);
  if (!estado || (consulta && estado.consulta !== consulta)) return false;

  const consultaAtual = estado.consulta;
  const espera = TEMPO_MINIMO - (performance.now() - estado.inicio);
  if (espera > 0) await new Promise(resolve => setTimeout(resolve, Math.ceil(espera)));
  if (ativos.get(container) !== estado || estado.consulta !== consultaAtual) return false;

  estado.loader.remove();
  container.removeAttribute("aria-busy");
  ativos.delete(container);
  return true;
}

export function startListLoading(lista, texto) {
  const container = lista.parentElement;
  lista.hidden = true;
  const consulta = showLoading(container, texto);
  return async () => {
    if (await hideLoading(container, consulta)) lista.hidden = false;
  };
}
