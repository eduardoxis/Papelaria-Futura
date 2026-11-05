import {
  getDocs,
  query,
  limit,
  startAfter,
  invalidarLeituras,
} from "./firestore-operacoes.js";

// Cursores, sem offset: voltar a uma página já aberta não faz nova leitura.
export function criarPaginador({ tamanho = 30 } = {}) {
  let paginas = [],
    indice = -1,
    consulta,
    aceitar = () => true,
    sequencia = 0;
  let carregando = null;
  async function buscar(cursor, token) {
    const itens = [];
    let mais = true,
      ultimo = cursor,
      lotes = 0;
    while (itens.length < tamanho && mais && lotes++ < 4) {
      const filtros = [limit(tamanho + 1)];
      if (ultimo) filtros.push(startAfter(ultimo));
      const s = await getDocs(query(consulta, ...filtros));
      if (token !== sequencia) return null;
      mais = s.size > tamanho;
      for (const d of s.docs.slice(0, tamanho)) {
        ultimo = d;
        const item = { ...d.data(), id: d.id };
        if (aceitar(item)) itens.push(item);
        if (itens.length === tamanho) {
          mais = mais || d !== s.docs.slice(0, tamanho).at(-1);
          break;
        }
      }
      if (!s.size) mais = false;
    }
    return { itens, cursor: ultimo, mais };
  }
  function estado() {
    return {
      itens: paginas[indice]?.itens || [],
      pagina: indice + 1,
      anterior: indice > 0,
      proxima: paginas[indice]?.mais || false,
    };
  }
  async function iniciar(q, filtro = () => true) {
    consulta = q;
    aceitar = filtro;
    paginas = [];
    indice = -1;
    const token = ++sequencia;
    const pagina = await buscar(null, token);
    if (pagina) {
      paginas = [pagina];
      indice = 0;
    }
    return estado();
  }
  async function mover(delta) {
    if (carregando) return carregando;
    if (delta < 0 && indice > 0) {
      indice--;
      return estado();
    }
    if (delta > 0 && paginas[indice]?.mais) {
      if (paginas[indice + 1]) {
        indice++;
        return estado();
      }
      const token = sequencia;
      carregando = buscar(paginas[indice].cursor, token)
        .then((p) => {
          if (p) {
            paginas.push(p);
            indice++;
          }
          return estado();
        })
        .finally(() => {
          carregando = null;
        });
      return carregando;
    }
    return estado();
  }
  return { iniciar, mover, estado };
}

export function montarPaginacao(alvo, estado, mudar) {
  if (!alvo) return;
  const id = alvo.id + "Paginador";
  let barra = document.getElementById(id);
  if (!barra) {
    barra = document.createElement("div");
    barra.id = id;
    barra.style.cssText =
      "display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:16px 0";
    const ancora = alvo.closest("table")?.parentElement || alvo;
    if (alvo.id === "modalBody") alvo.append(barra);
    else ancora.after(barra);
  }
  barra.innerHTML = `<button type="button" class="btn-secondary" data-pag="-1" ${estado.anterior ? "" : "disabled"}>Anterior</button><span role="status">Página ${estado.pagina || 1}${!estado.itens.length && estado.proxima ? " · Nenhum resultado neste trecho; continue a busca." : ""}</span><button type="button" class="btn-secondary" data-pag="1" ${estado.proxima ? "" : "disabled"}>Próxima</button><button type="button" class="btn-ghost" data-pag="0">Atualizar</button>`;
  barra.querySelectorAll("[data-pag]").forEach(
    (b) =>
      (b.onclick = async () => {
        barra.querySelectorAll("button").forEach((el) => {
          el.disabled = true;
        });
        try {
          if (b.dataset.pag === "0") invalidarLeituras();
          await mudar(Number(b.dataset.pag));
        } catch (e) {
          window.mostrarToast?.(e.message, "error");
          montarPaginacao(alvo, estado, mudar);
        }
      }),
  );
}
