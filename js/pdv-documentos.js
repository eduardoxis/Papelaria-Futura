import {
  FORMAS_PDV,
  FORMAS_NOMES,
  dadosComprovante,
  dinheiroEsperado,
} from "./pdv-core.js";
const azul = [7, 66, 116],
  claro = [218, 237, 250];
export const reais = (c) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    (c || 0) / 100,
  );
export const horario = (t) => {
  const d = t?.toDate ? t.toDate() : new Date(t || Date.now());
  return d.toLocaleString("pt-BR");
};
export const escapeHtml = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
export function comprovanteDaVenda(v) {
  return (
    v.comprovante ||
    dadosComprovante(
      v,
      { nome: "Papelaria Futura", logo: "./img/logo.png" },
      v.criadoEm,
    )
  );
}
const percentuais = (v) =>
  Object.keys(v.percentuais || {})
    .map((p) => (Number(p) / 100).toLocaleString("pt-BR") + "%")
    .join(" / ") || "Não registrada";
export function linhasVendedores(f) {
  return Object.values(f.vendedores || {})
    .sort((a, b) => b.liquido - a.liquido)
    .map((v) => [
      v.nome,
      v.vendas,
      v.itens,
      reais(v.bruto),
      reais(v.descontos),
      reais(v.baseComissao),
      percentuais(v),
      reais(v.comissaoGerada),
      reais(v.canceladas + v.estornos),
      reais(v.comissaoValida),
    ]);
}
function logoUrl() {
  return new URL("./img/logo.png", location.href).href;
}
export const ESTILO_DOCUMENTOS = `*{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#111827;margin:0;background:#fff}.papel{max-width:210mm;margin:auto;padding:10mm;color:#111827}.doc-logo{width:28mm;height:28mm;object-fit:contain}.doc-cabecalho{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #07599c;padding-bottom:15px;gap:16px}.doc-marca{display:flex;align-items:center;gap:16px;color:#074274}.doc-marca span{display:block;letter-spacing:3px;font-size:18px}.doc-marca strong{font-size:36px}.doc-contatos{font-size:12px;line-height:1.6;max-width:42%;overflow-wrap:anywhere}.doc-titulo{color:#074274;text-align:center;font-size:22px;padding:20px 0;border-bottom:1px solid #7dacca;margin:0 0 20px}.doc-metadados{display:grid;grid-template-columns:1fr 1fr;gap:10px 30px;margin:20px 0;overflow-wrap:anywhere}.doc-tabela{width:100%;border-collapse:collapse;margin:16px 0;table-layout:fixed}.doc-tabela th{background:#07599c;color:white;padding:10px 6px;text-align:left;font-size:12px}.doc-tabela td{border-bottom:1px solid #b6c9dc;padding:8px 5px;font-size:12px;overflow-wrap:anywhere;vertical-align:top}.doc-tabela td.numero{text-align:right}.doc-tabela thead{display:table-header-group}.doc-tabela tr{break-inside:avoid}.doc-totais{width:58%;margin:24px 0 24px auto}.doc-linha{display:flex;justify-content:space-between;border-bottom:1px solid #b6c9dc;padding:7px 0;gap:12px;break-inside:avoid}.doc-total{background:#cce8fa;color:#073b69;font-size:21px;font-weight:bold;padding:12px;border-radius:7px;margin:6px -6px}.doc-agradecimento{border-top:2px solid #07599c;text-align:center;color:#074274;font-size:20px;font-weight:bold;font-style:italic;margin-top:36px;padding-top:20px}.doc-rodape{color:#6b7280;text-align:center;font-size:11px;margin:20px 0}.doc-grade{display:grid;grid-template-columns:1fr 1fr;gap:16px}.doc-painel{border:1px solid #7ca7ca;border-radius:8px;overflow:hidden;break-inside:avoid;margin-bottom:16px}.doc-painel h3{color:#074274;background:#daedfa;margin:0;padding:10px;font-size:16px}.doc-painel>div{padding:10px}.doc-conferido{text-align:center;padding:24px!important;font-size:24px;color:#0c5a25;background:#edfaf1}.doc-divergencia{color:#9a3412;background:#fff4e6}.doc-id{font-size:10px;overflow-wrap:anywhere}.doc-painel .doc-tabela{margin:0}.doc-painel .doc-tabela td{font-size:10px}@media print{body{margin:0}.papel{padding:0;max-width:none}button{display:none}img{print-color-adjust:exact}th,.doc-total,.doc-painel h3{print-color-adjust:exact;-webkit-print-color-adjust:exact}}`;
function marca(e) {
  return `<header class="doc-cabecalho"><div class="doc-marca"><img class="doc-logo" src="${logoUrl()}" alt="Logo Papelaria Futura"><div><span>PAPELARIA</span><strong>FUTURA</strong></div></div><div class="doc-contatos">${[e.endereco, e.telefone, e.cnpj ? "CNPJ: " + e.cnpj : ""].filter(Boolean).map(escapeHtml).join("<br>")}</div></header>`;
}
const linha = (a, b, destaque = false) =>
  `<div class="doc-linha ${destaque ? "doc-total" : ""}"><strong>${escapeHtml(a)}</strong><span>${escapeHtml(b)}</span></div>`;
export function htmlComprovante(c, formato = "a4") {
  if (formato !== "a4") return htmlComprovanteTermico(c, formato);
  return `<article class="papel comprovante-pdv">${marca(c.empresa || {})}<h1 class="doc-titulo">COMPROVANTE DE VENDA - NÃO FISCAL</h1><div class="doc-metadados"><div><b>Nº da venda:</b> ${escapeHtml(c.numero)}<br><b>Data / horário:</b> ${escapeHtml(horario(c.emitidoEm))}</div><div><b>Vendedor:</b> ${escapeHtml(c.vendedor)}${c.operador && c.operador !== c.vendedor ? "<br><b>Operador:</b> " + escapeHtml(c.operador) : ""}${c.cliente ? "<br><b>Cliente:</b> " + escapeHtml(c.cliente) : ""}</div></div><p class="doc-id">Identificador único: ${escapeHtml(c.vendaId)}</p><table class="doc-tabela"><colgroup><col style="width:12%"><col style="width:34%"><col style="width:8%"><col style="width:16%"><col style="width:14%"><col style="width:16%"></colgroup><thead><tr><th>Código</th><th>Produto</th><th>Qtd.</th><th>Unitário</th><th>Desconto</th><th>Total</th></tr></thead><tbody>${c.itens.map((i) => `<tr><td>${escapeHtml(i.codigo)}</td><td>${escapeHtml(i.nome)}</td><td>${i.qtd.toLocaleString("pt-BR")}</td><td class="numero">${reais(i.unitarioCentavos)}</td><td class="numero">${reais(i.descontoCentavos)}</td><td class="numero">${reais(i.totalCentavos)}</td></tr>`).join("")}</tbody></table><div class="doc-totais">${linha("Subtotal", reais(c.subtotalCentavos))}${linha("Descontos", reais(c.descontoCentavos))}${linha("Acréscimos", reais(c.acrescimoCentavos))}${linha("Total da venda", reais(c.totalCentavos), true)}${FORMAS_PDV.filter(
    (f) => c.pagamentos[f] > 0,
  )
    .map((f) => linha(FORMAS_NOMES[f], reais(c.pagamentos[f])))
    .join(
      "",
    )}${linha(c.pagamentos.fiado ? "Valor a receber" : "Valor recebido", reais(c.recebidoCentavos))}${c.trocoCentavos > 0 ? linha("Troco", reais(c.trocoCentavos)) : ""}</div>${c.observacao ? "<p>" + escapeHtml(c.observacao) + "</p>" : ""}<div class="doc-agradecimento">${escapeHtml(c.empresa?.agradecimento || "Obrigado pela preferência! Papelaria Futura - Volte sempre!")}</div><div class="doc-rodape">Documento comercial não fiscal. Emissão: ${escapeHtml(horario(c.emitidoEm))}</div></article>`;
}
function htmlComprovanteTermico(c, formato) {
  const item = (i) =>
    '<section style="break-inside:avoid;border-bottom:1px dashed #9ca3af;padding:8px 0"><strong style="display:block">' +
    escapeHtml(i.nome) +
    "</strong><small>Código: " +
    escapeHtml(i.codigo) +
    "</small>" +
    linha(
      i.qtd.toLocaleString("pt-BR") + " x " + reais(i.unitarioCentavos),
      reais(i.totalCentavos),
    ) +
    (i.descontoCentavos
      ? linha("Desconto no item", reais(i.descontoCentavos))
      : "") +
    "</section>";
  return (
    '<article class="papel cupom-termico" style="width:' +
    formato +
    'mm;padding:3mm;font-size:10px"><header style="text-align:center"><img src="' +
    logoUrl() +
    '" alt="Logo Papelaria Futura" style="width:18mm;height:19mm"><h2 style="font-size:15px;color:#074274">PAPELARIA FUTURA</h2>' +
    [c.empresa?.endereco, c.empresa?.telefone, c.empresa?.cnpj]
      .filter(Boolean)
      .map((v) => "<p>" + escapeHtml(v) + "</p>")
      .join("") +
    '<h3 style="font-size:11px">COMPROVANTE DE VENDA - NÃO FISCAL</h3></header><p style="overflow-wrap:anywhere">Venda: ' +
    escapeHtml(c.numero) +
    "<br>ID: " +
    escapeHtml(c.vendaId) +
    "<br>" +
    escapeHtml(horario(c.emitidoEm)) +
    "<br>Vendedor: " +
    escapeHtml(c.vendedor) +
    (c.operador && c.operador !== c.vendedor
      ? "<br>Operador: " + escapeHtml(c.operador)
      : "") +
    (c.cliente ? "<br>Cliente: " + escapeHtml(c.cliente) : "") +
    "</p>" +
    c.itens.map(item).join("") +
    linha("Subtotal", reais(c.subtotalCentavos)) +
    linha("Descontos", reais(c.descontoCentavos)) +
    linha("Acréscimos", reais(c.acrescimoCentavos)) +
    linha("TOTAL", reais(c.totalCentavos), true) +
    FORMAS_PDV.filter((f) => c.pagamentos[f] > 0)
      .map((f) => linha(FORMAS_NOMES[f], reais(c.pagamentos[f])))
      .join("") +
    linha(
      c.pagamentos.fiado ? "A receber" : "Recebido",
      reais(c.recebidoCentavos),
    ) +
    (c.trocoCentavos ? linha("Troco", reais(c.trocoCentavos)) : "") +
    '<p style="text-align:center;font-weight:bold;color:#074274">' +
    escapeHtml(
      c.empresa?.agradecimento ||
        "Obrigado pela preferência! Papelaria Futura - Volte sempre!",
    ) +
    '</p><p style="text-align:center;font-size:8px">Documento comercial não fiscal</p></article>'
  );
}
function painel(t, linhas) {
  return `<section class="doc-painel"><h3>${t}</h3><div>${linhas.map(([a, b]) => linha(a, b)).join("")}</div></section>`;
}
export function secoesFechamento(f) {
  const r = f.resumo;
  return {
    informacoes: [
      ["Abertura", horario(f.abertoEm)],
      ["Fechamento", f.fechadoEm ? horario(f.fechadoEm) : "Em conferência"],
      ["Saldo inicial", reais(f.inicialCentavos)],
    ],
    sessao: [
      ["Quantidade de vendas", String(r.vendas)],
      ["Produtos vendidos", String(r.itens)],
      ["Total bruto", reais(r.bruto)],
      ["Descontos", reais(r.descontos)],
      ["Acréscimos", reais(r.acrescimos || 0)],
      ["Total líquido", reais(r.liquido)],
      ["Cancelamentos", reais(r.canceladas)],
      ["Devoluções / estornos", reais(r.estornos)],
    ],
    recebimentos: FORMAS_PDV.map((p) => [FORMAS_NOMES[p], reais(r[p])]),
    movimentos: [
      ["Vendas recebidas em dinheiro", reais(r.dinheiro)],
      ["Suprimentos", reais(r.suprimentos)],
      ["Sangrias", reais(r.sangrias)],
      ["Devoluções em dinheiro", reais(r.devolucoesDinheiro)],
      [
        "Saldo esperado em dinheiro",
        reais(f.esperadoCentavos ?? dinheiroEsperado(f)),
      ],
      [
        "Valor contado",
        f.contadoCentavos == null ? "Não informado" : reais(f.contadoCentavos),
      ],
      [
        "Diferença",
        f.diferencaCentavos == null
          ? "Em conferência"
          : reais(f.diferencaCentavos),
      ],
    ],
    totais: [
      ["Total de vendas", String(r.vendas)],
      ["Total de produtos", String(r.itens)],
      ["Total líquido", reais(r.liquido)],
      ["Comissões geradas", reais(r.comissaoGerada)],
      ["Comissões válidas", reais(r.comissaoValida)],
      [
        "Recebimentos brutos",
        reais(
          FORMAS_PDV.filter((p) => p !== "fiado").reduce((s, p) => s + r[p], 0),
        ),
      ],
    ],
  };
}
export function htmlFechamento(f) {
  const s = secoesFechamento(f);
  return `<article class="papel">${marca(f.empresa || {})}<h1 class="doc-titulo">RELATÓRIO DE FECHAMENTO DE CAIXA</h1><div class="doc-metadados"><div><b>Nº fechamento:</b> ${escapeHtml(f.numero || f.id)}<br><b>Emissão:</b> ${horario(f.fechadoEm)}</div><div><b>Operador:</b> ${escapeHtml(f.operadorNome || f.operadorAberturaNome)}<br><b>Caixa:</b> ${escapeHtml(f.caixaNumero)}</div></div><div class="doc-grade">${painel("INFORMAÇÕES DO CAIXA", s.informacoes)}${painel("RESUMO DA SESSÃO", s.sessao)}${painel("RECEBIMENTOS POR FORMA DE PAGAMENTO", s.recebimentos)}${painel("MOVIMENTAÇÕES DO CAIXA", s.movimentos)}</div><section class="doc-painel"><h3>DESEMPENHO DOS VENDEDORES</h3><div style="overflow:auto"><table class="doc-tabela"><thead><tr>${["Vendedor", "Vendas", "Itens", "Bruto", "Desc.", "Base", "Comissão %", "Gerada", "Cancel./Est.", "Válida"].map((t) => "<th>" + t + "</th>").join("")}</tr></thead><tbody>${linhasVendedores(
    f,
  )
    .map(
      (l) =>
        "<tr>" +
        l.map((c) => "<td>" + escapeHtml(c) + "</td>").join("") +
        "</tr>",
    )
    .join(
      "",
    )}<tr><td><b>TOTAL</b></td><td>${f.resumo.vendas}</td><td>${f.resumo.itens}</td><td>${reais(f.resumo.bruto)}</td><td>${reais(f.resumo.descontos)}</td><td>${reais(f.resumo.baseComissao)}</td><td>—</td><td>${reais(f.resumo.comissaoGerada)}</td><td>${reais(f.resumo.canceladas + f.resumo.estornos)}</td><td>${reais(f.resumo.comissaoValida)}</td></tr></tbody></table></div></section><div class="doc-grade">${painel("TOTAIS CONSOLIDADOS", s.totais)}<section class="doc-painel"><div class="doc-conferido ${f.diferencaCentavos ? "doc-divergencia" : ""}"><strong>${f.contadoCentavos == null ? "Em conferência" : f.diferencaCentavos === 0 ? "Caixa conferido" : f.situacao || "Caixa com diferença"}</strong><p style="font-size:14px">${f.contadoCentavos == null ? "Informe o valor contado para concluir." : "Diferença de dinheiro: " + reais(f.diferencaCentavos)}</p></div></section></div><p class="doc-rodape">Papelaria Futura • Documento não fiscal • Emissão: ${horario(f.fechadoEm)}. Comissões geradas não são retiradas automaticamente da gaveta.</p></article>`;
}
export function imprimirHtml(html, formato = "a4") {
  const janela = window.open("", "_blank");
  if (!janela) throw Error("Permita abrir a janela de impressão.");
  const termico =
    formato !== "a4"
      ? `.papel{width:${formato}mm;padding:3mm}.doc-cabecalho,.doc-marca{display:block;text-align:center}.doc-logo{width:18mm;height:18mm}.doc-marca span{font-size:12px}.doc-marca strong{font-size:22px}.doc-contatos{max-width:100%}.doc-titulo{font-size:13px;padding:10px 0}.doc-metadados{display:block;font-size:10px}.doc-tabela{table-layout:auto}.doc-tabela th,.doc-tabela td{font-size:8px;padding:4px 1px}.doc-tabela col{width:auto!important}.doc-totais{width:100%;font-size:10px}.doc-total{font-size:14px}.doc-agradecimento{font-size:12px}.doc-id,.doc-rodape{font-size:8px}`
      : "";
  janela.document.write(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Papelaria Futura</title><style>${ESTILO_DOCUMENTOS}${termico}.cupom-termico .doc-total{font-size:14px}.cupom-termico .doc-linha{gap:5px;padding:5px 0}@media print{.cupom-termico{width:100%!important;padding:0!important}}@page{size:${formato === "a4" ? "A4" : formato + "mm 297mm"};margin:${formato === "a4" ? "12mm" : "2mm"}}</style></head><body>${html}<script>window.addEventListener('load',()=>{window.focus();window.print();});</script></body></html>`,
  );
  janela.document.close();
}
async function imagemLogo() {
  const r = await fetch("./img/logo.png");
  if (!r.ok) throw Error("A logo da loja não pôde ser carregada.");
  const b = await r.blob();
  return new Promise((ok, erro) => {
    const f = new FileReader();
    f.onload = () => ok(f.result);
    f.onerror = erro;
    f.readAsDataURL(b);
  });
}
function cabecalho(doc, logo, titulo, empresa) {
  doc.addImage(logo, "PNG", 12, 12, 24, 25);
  doc.setTextColor(...azul);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("PAPELARIA", 41, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("FUTURA", 41, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(25);
  const contatos = [
    empresa?.endereco,
    empresa?.telefone,
    empresa?.cnpj ? "CNPJ: " + empresa.cnpj : "",
  ].filter(Boolean);
  doc.text(doc.splitTextToSize(contatos.join("\n"), 82), 114, 17);
  doc.setDrawColor(...azul);
  doc.line(12, 43, 198, 43);
  doc.setTextColor(...azul);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(titulo, 105, 54, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(25);
}
function rodapes(doc, emissao) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text("Papelaria Futura - Emissão: " + horario(emissao), 12, 289);
    doc.text(`${i} / ${n}`, 198, 289, { align: "right" });
  }
}
export async function pdfComprovante(c, formato = "a4", baixar = true) {
  const { jsPDF } = window.jspdf;
  const logo = await imagemLogo();
  if (formato !== "a4") return pdfTermico(c, logo, formato, baixar);
  const doc = new jsPDF({ format: "a4" });
  cabecalho(doc, logo, "COMPROVANTE DE VENDA - NÃO FISCAL", c.empresa);
  doc.setFontSize(9);
  const esquerda = doc.splitTextToSize(
    "Nº da venda: " + c.numero + "\nData / horário: " + horario(c.emitidoEm),
    88,
  );
  const direita = doc.splitTextToSize(
    "Vendedor: " +
      c.vendedor +
      "\nOperador: " +
      (c.operador || c.vendedor) +
      "\nCliente: " +
      (c.cliente || "Não informado"),
    88,
  );
  doc.text(esquerda, 12, 66);
  doc.text(direita, 110, 66);
  const idY = Math.max(
    86,
    66 + Math.max(esquerda.length, direita.length) * 3.8 + 3,
  );
  doc.setFontSize(7);
  doc.text(
    doc.splitTextToSize("Identificador único: " + c.vendaId, 186),
    12,
    idY,
  );
  doc.autoTable({
    startY: idY + 8,
    margin: { left: 12, right: 12, top: 22, bottom: 18 },
    head: [["Código", "Produto", "Qtd.", "Unitário", "Desconto", "Total"]],
    body: c.itens.map((i) => [
      i.codigo,
      i.nome,
      i.qtd.toLocaleString("pt-BR"),
      reais(i.unitarioCentavos),
      reais(i.descontoCentavos),
      reais(i.totalCentavos),
    ]),
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: azul },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 65 },
      2: { cellWidth: 13 },
      3: { cellWidth: 29, halign: "right" },
      4: { cellWidth: 28, halign: "right" },
      5: { cellWidth: 29, halign: "right" },
    },
    rowPageBreak: "avoid",
    didDrawPage: (d) => {
      if (d.pageNumber > 1) {
        doc.setFontSize(9);
        doc.setTextColor(...azul);
        doc.text(
          "Papelaria Futura - Comprovante de venda (continuação)",
          12,
          13,
        );
      }
    },
  });
  let y = doc.lastAutoTable.finalY + 10;
  const linhas = [
    ["Subtotal", reais(c.subtotalCentavos)],
    ["Descontos", reais(c.descontoCentavos)],
    ["Acréscimos", reais(c.acrescimoCentavos)],
    ["TOTAL DA VENDA", reais(c.totalCentavos)],
    ...FORMAS_PDV.filter((f) => c.pagamentos[f] > 0).map((f) => [
      FORMAS_NOMES[f],
      reais(c.pagamentos[f]),
    ]),
    [
      c.pagamentos.fiado ? "Valor a receber" : "Valor recebido",
      reais(c.recebidoCentavos),
    ],
    ...(c.trocoCentavos > 0 ? [["Troco", reais(c.trocoCentavos)]] : []),
  ];
  const blocoH = linhas.length * 8 + 35;
  if (y + blocoH > 277) {
    doc.addPage();
    y = 20;
  }
  doc.autoTable({
    startY: y,
    margin: { left: 95, right: 12, bottom: 20 },
    body: linhas,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" } },
    didParseCell: (d) => {
      if (d.row.index === 3) {
        d.cell.styles.fillColor = claro;
        d.cell.styles.textColor = azul;
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fontSize = 12;
      }
    },
  });
  y = doc.lastAutoTable.finalY + 12;
  if (y > 254) {
    doc.addPage();
    y = 24;
  }
  doc.setTextColor(...azul);
  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(12);
  doc.text(
    doc.splitTextToSize(
      c.empresa?.agradecimento ||
        "Obrigado pela preferência! Papelaria Futura - Volte sempre!",
      180,
    ),
    105,
    y,
    { align: "center" },
  );
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(90);
  doc.text("Documento comercial não fiscal", 105, y + 17, { align: "center" });
  rodapes(doc, c.emitidoEm);
  if (baixar) doc.save("Comprovante_" + c.vendaId + ".pdf");
  return doc;
}
function pdfTermico(c, logo, formato, baixar, altura = 297) {
  const largura = Number(formato),
    doc = new window.jspdf.jsPDF({ format: [largura, altura], unit: "mm" }),
    m = 3,
    w = largura - m * 2;
  let y = 5;
  const texto = (t, tamanho = 8, estilo = "normal") => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tamanho);
    const linhas = doc.splitTextToSize(String(t), w);
    for (const l of linhas) {
      if (y > altura - 11) {
        doc.addPage([largura, altura]);
        y = 7;
      }
      doc.text(l, m, y);
      y += tamanho * 0.45;
    }
    y += 2;
  };
  doc.addImage(logo, "PNG", largura / 2 - 9, y, 18, 19);
  y += 24;
  texto("PAPELARIA FUTURA", 11, "bold");
  for (const t of [c.empresa?.endereco, c.empresa?.telefone, c.empresa?.cnpj])
    if (t) texto(t);
  texto("COMPROVANTE DE VENDA - NÃO FISCAL", 8, "bold");
  texto("Venda: " + c.numero + " / ID: " + c.vendaId);
  texto(horario(c.emitidoEm));
  texto("Vendedor: " + c.vendedor);
  if (c.operador && c.operador !== c.vendedor) texto("Operador: " + c.operador);
  if (c.cliente) texto("Cliente: " + c.cliente);
  for (const i of c.itens) {
    doc.setFontSize(8);
    const linhasItem = [
      i.qtd.toLocaleString("pt-BR") + "x " + i.nome,
      "Código: " + i.codigo,
      reais(i.unitarioCentavos) + " cada | Desc.: " + reais(i.descontoCentavos),
      "Total: " + reais(i.totalCentavos),
    ];
    const alturaItem = linhasItem.reduce(
      (s, t) => s + doc.splitTextToSize(t, w).length * 3.6 + 2,
      0,
    );
    if (alturaItem < altura - 20 && y + alturaItem > altura - 11) {
      doc.addPage([largura, altura]);
      y = 7;
    }
    texto(i.qtd.toLocaleString("pt-BR") + "x " + i.nome, 8, "bold");
    texto("Código: " + i.codigo);
    texto(
      reais(i.unitarioCentavos) + " cada | Desc.: " + reais(i.descontoCentavos),
    );
    texto("Total: " + reais(i.totalCentavos));
  }
  for (const [a, b] of [
    ["Subtotal", c.subtotalCentavos],
    ["Descontos", c.descontoCentavos],
    ["Acréscimos", c.acrescimoCentavos],
    ["TOTAL", c.totalCentavos],
  ])
    texto(
      a + ": " + reais(b),
      a === "TOTAL" ? 11 : 8,
      a === "TOTAL" ? "bold" : "normal",
    );
  for (const f of FORMAS_PDV)
    if (c.pagamentos[f]) texto(FORMAS_NOMES[f] + ": " + reais(c.pagamentos[f]));
  texto("Valor recebido: " + reais(c.recebidoCentavos));
  if (c.trocoCentavos > 0) texto("Troco: " + reais(c.trocoCentavos));
  texto(c.empresa?.agradecimento || "Obrigado pela preferência! Volte sempre!");
  texto("Documento não fiscal", 7);
  if (altura === 297 && doc.getNumberOfPages() === 1 && y + 18 < 297)
    return pdfTermico(c, logo, formato, baixar, Math.max(90, y + 18));
  if (baixar) doc.save("Comprovante_" + c.vendaId + "_" + formato + "mm.pdf");
  return doc;
}
export async function pdfFechamento(f, baixar = true) {
  const doc = new window.jspdf.jsPDF({ format: "a4" }),
    logo = await imagemLogo();
  doc.addImage(logo, "PNG", 12, 10, 24, 25);
  doc.setTextColor(...azul);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("PAPELARIA", 40, 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("FUTURA", 40, 30);
  doc.setLineWidth(0.3);
  doc.setDrawColor(...azul);
  doc.line(97, 10, 97, 36);
  doc.setFontSize(13);
  doc.text("RELATÓRIO DE", 148, 18, { align: "center" });
  doc.setFillColor(...azul);
  doc.roundedRect(103, 22, 95, 12, 2, 2, "F");
  doc.setTextColor(255);
  doc.setFontSize(12);
  doc.text("FECHAMENTO DE CAIXA", 150.5, 30, { align: "center" });
  doc.setDrawColor(...azul);
  doc.line(12, 41, 198, 41);
  doc.setTextColor(25);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const metadados = doc.splitTextToSize(
    "Nº fechamento: " +
      (f.numero || f.id) +
      " | Emissão: " +
      horario(f.fechadoEm) +
      "\nOperador: " +
      f.operadorNome +
      " | Caixa: " +
      f.caixaNumero,
    186,
  );
  doc.text(metadados, 12, 49);
  const s = secoesFechamento(f);
  function painelPdf(t, linhas, x, y, w) {
    const altura = 12 + linhas.length * 4.7;
    doc.setDrawColor(122, 167, 202);
    doc.roundedRect(x, y, w, altura, 2, 2);
    doc.setFillColor(...claro);
    doc.roundedRect(x, y, w, 10, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...azul);
    doc.text(t, x + 3, y + 6);
    doc.setTextColor(20);
    doc.setFontSize(8);
    linhas.forEach(([a, b], i) => {
      doc.setFont("helvetica", "normal");
      const label = doc.splitTextToSize(a, w * 0.6);
      doc.text(label[0], x + 3, y + 15 + i * 4.7);
      doc.text(String(b), x + w - 3, y + 15 + i * 4.7, { align: "right" });
    });
    return y + altura;
  }
  let y = 49 + metadados.length * 4 + 8;
  const fim1 = Math.max(
    painelPdf("INFORMAÇÕES DO CAIXA", s.informacoes, 12, y, 90),
    painelPdf("RESUMO DA SESSÃO", s.sessao, 108, y, 90),
  );
  y = fim1 + 6;
  const fim2 = Math.max(
    painelPdf("RECEBIMENTOS (BRUTOS)", s.recebimentos, 12, y, 90),
    painelPdf("MOVIMENTAÇÕES DO CAIXA", s.movimentos, 108, y, 90),
  );
  y = fim2 + 9;
  if (y + 40 > 274) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...azul);
  doc.text("DESEMPENHO DOS VENDEDORES", 12, y);
  doc.autoTable({
    startY: y + 5,
    margin: { left: 12, right: 12, top: 20, bottom: 18 },
    head: [
      [
        "Vendedor",
        "Vendas",
        "Itens",
        "Bruto",
        "Desc.",
        "Base",
        "%",
        "Gerada",
        "Canc./Est.",
        "Válida",
      ],
    ],
    body: linhasVendedores(f),
    foot: [
      [
        "TOTAL",
        f.resumo.vendas,
        f.resumo.itens,
        reais(f.resumo.bruto),
        reais(f.resumo.descontos),
        reais(f.resumo.baseComissao),
        "—",
        reais(f.resumo.comissaoGerada),
        reais(f.resumo.canceladas + f.resumo.estornos),
        reais(f.resumo.comissaoValida),
      ],
    ],
    showFoot: "lastPage",
    styles: { fontSize: 7, cellPadding: 1.6, overflow: "linebreak" },
    headStyles: { fillColor: azul },
    footStyles: { fillColor: claro, textColor: azul },
    columnStyles: { 0: { cellWidth: 31 } },
    rowPageBreak: "avoid",
  });
  y = doc.lastAutoTable.finalY + 9;
  if (y + 60 > 279) {
    doc.addPage();
    y = 20;
  }
  painelPdf("TOTAIS CONSOLIDADOS", s.totais, 12, y, 100);
  doc.setFillColor(
    ...(f.diferencaCentavos ? [255, 243, 227] : [235, 249, 239]),
  );
  doc.roundedRect(118, y, 80, 60, 3, 3, "F");
  doc.setTextColor(...(f.diferencaCentavos ? [150, 55, 10] : [13, 85, 35]));
  doc.setDrawColor(...(f.diferencaCentavos ? [150, 55, 10] : [13, 85, 35]));
  doc.setLineWidth(0.7);
  doc.circle(158, y + 9, 5);
  if (!f.diferencaCentavos) {
    doc.line(155.5, y + 9, 157.5, y + 11);
    doc.line(157.5, y + 11, 161, y + 6);
  } else {
    doc.setFontSize(11);
    doc.text("!", 158, y + 11, { align: "center" });
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(
    f.diferencaCentavos ? "Caixa com diferença" : "Caixa conferido",
    158,
    y + 22,
    { align: "center" },
  );
  doc.setFontSize(10);
  doc.text(
    (f.situacao || "Sem diferença") + ": " + reais(f.diferencaCentavos),
    158,
    y + 36,
    { align: "center" },
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(
    doc.splitTextToSize(
      "O saldo esperado considera somente o dinheiro físico da gaveta. Comissões geradas não são retiradas automaticamente.",
      72,
    ),
    122,
    y + 47,
  );
  rodapes(doc, f.fechadoEm);
  if (baixar) doc.save("Fechamento_" + f.sessaoId + ".pdf");
  return doc;
}

export function htmlFechamentoLegado(s) {
  const r = s.resumo || {},
    linhas = [
      ["Identificador", s.id],
      ["Abertura", s.abertoEm ? horario(s.abertoEm) : "Não registrada"],
      ["Fechamento", s.fechadoEm ? horario(s.fechadoEm) : "Não registrado"],
      [
        "Operador",
        s.operadorFechamentoNome || s.operadorAberturaNome || "Não registrado",
      ],
      ...(s.valorAbertura != null
        ? [["Valor inicial", reais(Math.round(s.valorAbertura * 100))]]
        : []),
      ...(r.totalGeral != null
        ? [["Total vendido", reais(Math.round(r.totalGeral * 100))]]
        : []),
      ...(r.qtdVendasGeral != null
        ? [["Quantidade de vendas", String(r.qtdVendasGeral)]]
        : []),
      ...(s.conferenciaLegada
        ? [
            [
              "Dinheiro contado na transição",
              reais(s.conferenciaLegada.contadoCentavos),
            ],
            ["Motivo", s.conferenciaLegada.motivo],
          ]
        : []),
    ];
  return (
    '<article class="papel">' +
    marca({}) +
    '<h1 class="doc-titulo">FECHAMENTO DE CAIXA - LEGADO</h1><p>Dados preservados do sistema anterior. Informações não armazenadas originalmente não foram estimadas.</p>' +
    linhas.map(([a, b]) => linha(a, b)).join("") +
    "<h3>Formas de pagamento registradas</h3>" +
    Object.entries(r.porFormaPagamento || {})
      .map(([a, b]) => linha(a, reais(Math.round(Number(b) * 100))))
      .join("") +
    "<h3>Vendedores registrados</h3>" +
    (r.porVendedor || [])
      .map((v) =>
        linha(
          v.nome || v.uid,
          reais(Math.round(Number(v.total || 0) * 100)) +
            " / " +
            (v.qtdVendas ?? "Não registrado") +
            " vendas",
        ),
      )
      .join("") +
    "</article>"
  );
}
export async function pdfFechamentoLegado(s, baixar = true) {
  const doc = new window.jspdf.jsPDF({ format: "a4" }),
    logo = await imagemLogo();
  cabecalho(doc, logo, "FECHAMENTO DE CAIXA - LEGADO", {});
  const r = s.resumo || {};
  doc.setFontSize(9);
  doc.text(
    "Dados preservados. Campos não registrados no sistema anterior não foram estimados.",
    12,
    66,
  );
  const linhas = [
    ["Identificador", s.id],
    ["Abertura", s.abertoEm ? horario(s.abertoEm) : "Não registrada"],
    ["Fechamento", s.fechadoEm ? horario(s.fechadoEm) : "Não registrado"],
    [
      "Operador",
      s.operadorFechamentoNome || s.operadorAberturaNome || "Não registrado",
    ],
    ...(s.valorAbertura != null
      ? [["Valor inicial", reais(Math.round(s.valorAbertura * 100))]]
      : []),
    ...(r.totalGeral != null
      ? [["Total vendido", reais(Math.round(r.totalGeral * 100))]]
      : []),
    ...(r.qtdVendasGeral != null
      ? [["Quantidade de vendas", String(r.qtdVendasGeral)]]
      : []),
  ];
  if(s.conferenciaLegada)linhas.push(['Dinheiro contado na transição',reais(s.conferenciaLegada.contadoCentavos)],['Motivo',s.conferenciaLegada.motivo]);
  doc.autoTable({
    startY: 75,
    head: [["Informação", "Registro original"]],
    body: linhas,
    styles: { fontSize: 9 },
    headStyles: { fillColor: azul },
  });
  if (Object.keys(r.porFormaPagamento || {}).length)
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 10,
      head: [["Forma de pagamento", "Valor registrado"]],
      body: Object.entries(r.porFormaPagamento).map(([a, b]) => [
        a,
        reais(Math.round(Number(b) * 100)),
      ]),
      headStyles: { fillColor: azul },
    });
  if (r.porVendedor?.length)
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 10,
      head: [["Vendedor", "Vendas", "Total registrado"]],
      body: r.porVendedor.map((v) => [
        v.nome || v.uid,
        v.qtdVendas ?? "Não registrado",
        reais(Math.round(Number(v.total || 0) * 100)),
      ]),
      headStyles: { fillColor: azul },
    });
  rodapes(doc, s.fechadoEm || new Date());
  if (baixar) doc.save("Fechamento_legado_" + s.id + ".pdf");
  return doc;
}
