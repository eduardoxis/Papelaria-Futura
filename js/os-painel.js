import { temCargo, protegerRota } from "./auth.js";
import { observarFilaOs } from "./os-db.js";
import { STATUS_OS, prazoOs, milisOs, erroConsultaOs } from "./os-core.js";
const $ = (id) => document.getElementById(id),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let itens = [],
  pagina = 0,
  paginas = [[]],
  desligar = null,
  conexaoServidor = false;
function card(o) {
  const prazo = prazoOs(o);
  const previsao = Number.isFinite(milisOs(o.previsaoConclusao))
    ? new Date(milisOs(o.previsaoConclusao)).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  return (
    '<article class="os-painel-card"><div><span>Ordem de serviço</span><b>' +
    esc(o.numero) +
    "</b></div><div><span>Cliente</span>" +
    esc(o.cliente) +
    '</div><div class="os-painel-servico"><span>Serviço</span><b>' +
    esc(o.servico) +
    "</b></div><div><span>Quem está fazendo</span>" +
    esc(o.responsavel) +
    "</div><div><span>Conclusão prevista</span>" +
    esc(previsao) +
    "</div><div><span>Status</span><b>" +
    esc(STATUS_OS[o.status]) +
    '</b><small class="os-pill ' +
    prazo.classe +
    '">' +
    esc(prazo.texto) +
    "</small></div></article>"
  );
}
function render(recalcular = false) {
  const lista = $("osPainelLista");
  if (recalcular) {
    lista.innerHTML = itens.map(card).join("");
    const disponivel = Math.max(
      200,
      innerHeight - lista.getBoundingClientRect().top - 90,
    );
    paginas = [[]];
    let altura = 0;
    [...lista.children].forEach((el, i) => {
      const h = el.getBoundingClientRect().height + 14;
      if (altura + h > disponivel && paginas.at(-1).length) {
        paginas.push([]);
        altura = 0;
      }
      paginas.at(-1).push(itens[i]);
      altura += h;
    });
  }
  pagina = Math.min(pagina, paginas.length - 1);
  lista.innerHTML = itens.length
    ? paginas[pagina].map(card).join("")
    : '<p class="os-painel-login">Nenhum serviço ativo na fila no momento.</p>';
  $("osPainelPagina").textContent =
    "Página " + (pagina + 1) + " de " + paginas.length;
}
const rotacao = setInterval(() => {
  pagina = (pagina + 1) % paginas.length;
  render();
}, 15000);
const relogio = setInterval(() => {
  $("osRelogio").textContent = new Date().toLocaleString("pt-BR");
}, 1000);
const prazos = setInterval(() => render(), 30000);
window.addEventListener("resize", () => render(true));
window.addEventListener("offline", () => {
  $("osPainelConexao").textContent =
    "Sem conexão. As informações exibidas podem estar desatualizadas.";
});
$("osTelaCheia").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    $("osPainelConexao").textContent =
      "Use a opção de tela cheia do navegador.";
  }
};
document.addEventListener("fullscreenchange", () => {
  $("osTelaCheia").textContent = document.fullscreenElement
    ? "Sair da tela cheia"
    : "Tela cheia";
  render(true);
});
async function iniciar(usuario, perfil) {
  if (!["admin", "operador_os", "painel_os"].some((c) => temCargo(perfil, c))) {
    $("osPainelConexao").textContent =
      "Seu usuário não tem permissão para consultar o painel de serviços.";
    return;
  }
  desligar = observarFilaOs(
    { painel: true },
    (dados, meta) => {
      itens = dados;
      conexaoServidor = !meta.fromCache;
      $("osPainelConexao").textContent = conexaoServidor
        ? "Atualizado em tempo real · Nomes de clientes abreviados"
        : "Sem confirmação do servidor. As informações podem estar desatualizadas.";
      render(true);
    },
    (erro) => {
      itens = [];
      render(true);
      $("osPainelConexao").textContent = erroConsultaOs(erro).mensagem;
    },
  );
}
protegerRota(iniciar);
window.addEventListener(
  "pagehide",
  () => {
    desligar?.();
    clearInterval(rotacao);
    clearInterval(relogio);
    clearInterval(prazos);
  },
  { once: true },
);
