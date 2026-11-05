// Detalhes financeiros já carregados para apurar saldos: pagina apenas a tela,
// mantendo todos os dados para cálculos, exportação e impressão.
let iniciado = false;
export function iniciarPaginacaoTabelas() {
  if (iniciado) return;
  iniciado = true;
  const estados = new WeakMap();
  const exibicaoOriginal = new WeakMap();
  const estilo = document.createElement("style");
  estilo.textContent =
    "@media print{tbody[data-paginacao-local]>tr{display:table-row!important}[data-paginacao-local-controles]{display:none!important}}";
  document.head.append(estilo);
  let agendado = false;
  function atualizar() {
    agendado = false;
    document.querySelectorAll("table tbody").forEach((corpo) => {
      if (corpo.querySelector('input,select,textarea,[contenteditable="true"]'))
        return;
      const linhas = [...corpo.children].filter((el) => el.tagName === "TR");
      const antes = estados.get(corpo);
      if (
        antes &&
        antes.linhas.length === linhas.length &&
        linhas.every((r, i) => r === antes.linhas[i])
      )
        return;
      antes?.barra.remove();
      if (linhas.length <= 50) {
        linhas.forEach((l) => {
          if (exibicaoOriginal.has(l))
            l.style.display = exibicaoOriginal.get(l);
        });
        estados.set(corpo, { linhas, barra: { remove() {} } });
        return;
      }
      const barra = document.createElement("div");
      barra.dataset.paginacaoLocalControles = "";
      barra.style.cssText =
        "display:flex;gap:12px;align-items:center;margin:16px 0";
      const total = Math.ceil(linhas.length / 30);
      const estado = { linhas, barra, pagina: 0 };
      estados.set(corpo, estado);
      corpo.dataset.paginacaoLocal = "";
      const exibicoes = linhas.map((l) => {
        if (!exibicaoOriginal.has(l)) exibicaoOriginal.set(l, l.style.display);
        return exibicaoOriginal.get(l);
      });
      function render() {
        linhas.forEach((l, i) => {
          l.style.display =
            Math.floor(i / 30) === estado.pagina ? exibicoes[i] : "none";
        });
        barra.innerHTML = `<button type="button" class="btn-secondary" data-anterior ${estado.pagina ? "" : "disabled"}>Anterior</button><span>Página ${estado.pagina + 1} de ${total} · ${linhas.length} registros</span><button type="button" class="btn-secondary" data-proxima ${estado.pagina + 1 < total ? "" : "disabled"}>Próxima</button>`;
        barra.querySelector("[data-anterior]").onclick = () => {
          estado.pagina--;
          render();
        };
        barra.querySelector("[data-proxima]").onclick = () => {
          estado.pagina++;
          render();
        };
      }
      corpo.closest("table").parentElement.after(barra);
      render();
    });
  }
  const observador = new MutationObserver(() => {
    if (!agendado) {
      agendado = true;
      queueMicrotask(atualizar);
    }
  });
  observador.observe(document.body, { childList: true, subtree: true });
  atualizar();
}
