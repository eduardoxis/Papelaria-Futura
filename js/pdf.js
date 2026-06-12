// ============================================================
// pdf.js — Gerador de Cotação PDF — Papelaria Futura Centro
// ============================================================
// Usa jsPDF + jsPDF-AutoTable (carregados via CDN no dashboard.html)
// ============================================================

export function gerarPDF(cotacao) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    const PW  = 210; // largura A4
    const MX  = 14;  // margem lateral
    const CW  = PW - MX * 2; // largura útil
    let   Y   = 0;

    // ----------------------------------------------------------------
    // Cores e fontes
    // ----------------------------------------------------------------
    const AZUL_ESCURO  = [15,  36,  96];
    const AZUL_MEDIO   = [30,  79, 216];
    const AZUL_CLARO   = [219, 234, 254];
    const AZUL_CABEC   = [37,  99, 235];
    const BRANCO       = [255, 255, 255];
    const CINZA_CLARO  = [248, 250, 252];
    const CINZA_BORDA  = [226, 232, 240];
    const CINZA_TEXTO  = [100, 116, 139];
    const PRETO        = [15,  23,  42];
    const VERDE        = [5,   150, 105];
    const DOURADO      = [217, 119, 6];

    // ================================================================
    // 1. CABEÇALHO
    // ================================================================
    // Fundo gradiente simulado com retângulos sobrepostos
    for (let i = 0; i <= 40; i++) {
      const ratio = i / 40;
      const r = Math.round(AZUL_ESCURO[0] + (AZUL_MEDIO[0] - AZUL_ESCURO[0]) * ratio);
      const g = Math.round(AZUL_ESCURO[1] + (AZUL_MEDIO[1] - AZUL_ESCURO[1]) * ratio);
      const b = Math.round(AZUL_ESCURO[2] + (AZUL_MEDIO[2] - AZUL_ESCURO[2]) * ratio);
      doc.setFillColor(r, g, b);
      doc.rect(0, i * (46 / 40), PW, (46 / 40) + 0.5, "F");
    }

    // Linha decorativa dourada no topo
    doc.setFillColor(...DOURADO);
    doc.rect(0, 0, PW, 2, "F");

    // Ícone de documento (símbolo simples)
    doc.setFillColor(...BRANCO);
    doc.roundedRect(MX, 7, 22, 28, 3, 3, "F");
    doc.setFillColor(...AZUL_CLARO);
    doc.rect(MX + 4, 14, 14, 1.5, "F");
    doc.rect(MX + 4, 18, 14, 1.5, "F");
    doc.rect(MX + 4, 22, 9,  1.5, "F");
    // Orelha do documento
    doc.setFillColor(219, 234, 254);
    doc.triangle(MX + 16, 7, MX + 22, 7, MX + 22, 13, "F");
    doc.setFillColor(...BRANCO);
    doc.triangle(MX + 17, 8, MX + 21, 8, MX + 21, 12, "F");

    // Nome da empresa
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...BRANCO);
    doc.text("PAPELARIA FUTURA CENTRO", MX + 28, 17);

    // Dados de contato
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(180, 210, 255);
    doc.text("📍 Rua Exemplo, 123 — Centro — Cidade/UF", MX + 28, 23);
    doc.text("📞 (61) 9 9999-9999   |   📧 contato@papelariafutura.com.br", MX + 28, 28);
    doc.text("CNPJ: 00.000.000/0001-00", MX + 28, 33);

    // Linha separadora direita com badge "COTAÇÃO"
    doc.setFillColor(...DOURADO);
    doc.roundedRect(PW - MX - 36, 8, 36, 14, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRANCO);
    doc.text("COTAÇÃO", PW - MX - 18, 17, { align: "center" });

    Y = 50;

    // ================================================================
    // 2. TÍTULO E NÚMERO
    // ================================================================
    doc.setFillColor(...CINZA_CLARO);
    doc.roundedRect(MX, Y, CW, 14, 2, 2, "F");
    doc.setDrawColor(...CINZA_BORDA);
    doc.setLineWidth(0.3);
    doc.roundedRect(MX, Y, CW, 14, 2, 2, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...AZUL_MEDIO);
    doc.text("PROPOSTA COMERCIAL", PW / 2, Y + 9, { align: "center" });

    // Data de emissão (lado direito)
    const dataEmissao = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit", month: "long", year: "numeric"
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...CINZA_TEXTO);
    doc.text(`Emitido em: ${dataEmissao}`, PW - MX - 2, Y + 9, { align: "right" });

    Y += 20;

    // ================================================================
    // 3. CARDS DE INFORMAÇÕES DO CLIENTE (2 colunas)
    // ================================================================
    const cardW = (CW - 5) / 2;

    // Card esquerdo — Cliente
    doc.setFillColor(...BRANCO);
    doc.setDrawColor(...CINZA_BORDA);
    doc.setLineWidth(0.3);
    doc.roundedRect(MX, Y, cardW, 28, 2, 2, "FD");
    // borda azul topo
    doc.setFillColor(...AZUL_CABEC);
    doc.roundedRect(MX, Y, cardW, 6, 2, 2, "F");
    doc.rect(MX, Y + 4, cardW, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRANCO);
    doc.text("CLIENTE", MX + 4, Y + 4.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...PRETO);
    doc.text(truncar(cotacao.cliente || "—", 35), MX + 4, Y + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...CINZA_TEXTO);
    doc.text(`CNPJ/CPF: ${cotacao.cnpj || "Não informado"}`, MX + 4, Y + 21);

    // Card direito — Datas
    const cx2 = MX + cardW + 5;
    doc.setFillColor(...BRANCO);
    doc.roundedRect(cx2, Y, cardW, 28, 2, 2, "FD");
    doc.setFillColor(...DOURADO);
    doc.roundedRect(cx2, Y, cardW, 6, 2, 2, "F");
    doc.rect(cx2, Y + 4, cardW, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRANCO);
    doc.text("DATAS", cx2 + 4, Y + 4.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...CINZA_TEXTO);
    doc.text(`Emissão:`, cx2 + 4, Y + 14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRETO);
    doc.text(dataEmissao, cx2 + 22, Y + 14);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...CINZA_TEXTO);
    doc.text(`Válida até:`, cx2 + 4, Y + 21);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRETO);
    const validadeFormatada = cotacao.validade
      ? new Date(cotacao.validade + "T12:00:00").toLocaleDateString("pt-BR")
      : "Não informado";
    doc.text(validadeFormatada, cx2 + 24, Y + 21);

    Y += 34;

    // ================================================================
    // 4. TABELA DE PRODUTOS
    // ================================================================
    const itens = cotacao.itens || [];

    const colunas = [
      { header: "#",              dataKey: "item"          },
      { header: "Descrição / Produto", dataKey: "descricao"    },
      { header: "Marca",          dataKey: "marca"         },
      { header: "Qtd.",           dataKey: "quantidade"    },
      { header: "Valor Unit.",    dataKey: "valorUnitario" },
      { header: "Valor Total",    dataKey: "valorTotal"    },
    ];

    const linhas = itens.map((i, idx) => ({
      item:          String(idx + 1),
      descricao:     i.descricao    || "—",
      marca:         i.marca        || "—",
      quantidade:    formatarNumero(i.quantidade),
      valorUnitario: formatarMoedaPDF(i.valorUnitario),
      valorTotal:    formatarMoedaPDF(i.valorTotal),
    }));

    doc.autoTable({
      startY: Y,
      columns: colunas,
      body: linhas,
      margin: { left: MX, right: MX },
      styles: {
        fontSize: 9,
        cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
        textColor: PRETO,
        lineColor: CINZA_BORDA,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: AZUL_CABEC,
        textColor: BRANCO,
        fontStyle: "bold",
        fontSize: 8.5,
        halign: "left",
      },
      columnStyles: {
        item:          { cellWidth: 12,  halign: "center", fontStyle: "bold" },
        descricao:     { cellWidth: "auto" },
        marca:         { cellWidth: 28 },
        quantidade:    { cellWidth: 16,  halign: "center" },
        valorUnitario: { cellWidth: 32,  halign: "right" },
        valorTotal:    { cellWidth: 32,  halign: "right", fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: CINZA_CLARO },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.dataKey === "valorTotal") {
          data.cell.styles.textColor = AZUL_MEDIO;
        }
      },
      tableLineColor: CINZA_BORDA,
      tableLineWidth: 0.3,
    });

    Y = doc.lastAutoTable.finalY + 6;

    // ================================================================
    // 5. RESUMO FINANCEIRO
    // ================================================================
    // Verificar se precisa de nova página
    if (Y + 45 > 270) {
      doc.addPage();
      Y = 20;
    }

    // Subtotal e total (fundo azul escuro, destaque)
    const totalW = 90;
    const totalX = PW - MX - totalW;

    doc.setFillColor(...AZUL_ESCURO);
    doc.roundedRect(totalX, Y, totalW, 22, 3, 3, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(180, 210, 255);
    doc.text("VALOR TOTAL DA COTAÇÃO", totalX + totalW / 2, Y + 8, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...BRANCO);
    doc.text(
      formatarMoedaPDF(cotacao.valorTotal),
      totalX + totalW / 2,
      Y + 18,
      { align: "center" }
    );

    // Linha de validade ao lado
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...CINZA_TEXTO);
    doc.text(`Proposta válida até: ${validadeFormatada}`, MX, Y + 8);
    const cidade = "Brasília/DF";
    doc.text(`${cidade}, ${dataEmissao}`, MX, Y + 15);

    Y += 30;

    // ================================================================
    // 6. OBSERVAÇÕES
    // ================================================================
    if (cotacao.observacoes) {
      if (Y + 25 > 270) { doc.addPage(); Y = 20; }

      doc.setFillColor(...CINZA_CLARO);
      doc.setDrawColor(...CINZA_BORDA);
      doc.setLineWidth(0.3);
      doc.roundedRect(MX, Y, CW, 4, 1, 1, "F");

      // barra lateral colorida
      doc.setFillColor(...AZUL_MEDIO);
      doc.rect(MX, Y, 3, 4 + (cotacao.observacoes.length > 80 ? 10 : 4), "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...AZUL_MEDIO);
      doc.text("OBSERVAÇÕES", MX + 6, Y + 2.8);

      Y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...CINZA_TEXTO);
      const linhasObs = doc.splitTextToSize(cotacao.observacoes, CW - 6);
      doc.text(linhasObs, MX + 6, Y);
      Y += linhasObs.length * 4 + 4;
    }

    // ================================================================
    // 7. ASSINATURA (linha para assinar)
    // ================================================================
    if (Y + 30 > 270) { doc.addPage(); Y = 20; }
    Y += 6;

    const assinW = (CW - 10) / 2;
    // Empresa
    doc.setDrawColor(...CINZA_BORDA);
    doc.setLineWidth(0.4);
    doc.line(MX, Y + 16, MX + assinW, Y + 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...CINZA_TEXTO);
    doc.text("Papelaria Futura Centro", MX + assinW / 2, Y + 21, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("Responsável / Carimbo", MX + assinW / 2, Y + 25.5, { align: "center" });

    // Cliente
    const ax2 = MX + assinW + 10;
    doc.line(ax2, Y + 16, ax2 + assinW, Y + 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...CINZA_TEXTO);
    doc.text(truncar(cotacao.cliente || "Cliente", 30), ax2 + assinW / 2, Y + 21, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("Aprovação / Data", ax2 + assinW / 2, Y + 25.5, { align: "center" });

    Y += 34;

    // ================================================================
    // 8. RODAPÉ
    // ================================================================
    const altRod = 22;
    const yRod   = 297 - altRod;

    // Fundo azul rodapé
    for (let i = 0; i <= altRod; i++) {
      const ratio = i / altRod;
      const r = Math.round(AZUL_ESCURO[0] + (AZUL_MEDIO[0] - AZUL_ESCURO[0]) * ratio * 0.5);
      const g = Math.round(AZUL_ESCURO[1] + (AZUL_MEDIO[1] - AZUL_ESCURO[1]) * ratio * 0.5);
      const b = Math.round(AZUL_ESCURO[2] + (AZUL_MEDIO[2] - AZUL_ESCURO[2]) * ratio * 0.5);
      doc.setFillColor(r, g, b);
      doc.rect(0, yRod + i, PW, 1.2, "F");
    }

    // Linha dourada no topo do rodapé
    doc.setFillColor(...DOURADO);
    doc.rect(0, yRod, PW, 1.2, "F");

    // Slogan
    doc.setFont("helvetica", "bolditalic");
    doc.setFontSize(9);
    doc.setTextColor(...BRANCO);
    doc.text(
      '"A qualidade que você precisa, o atendimento que você merece!"',
      PW / 2,
      yRod + 8,
      { align: "center" }
    );

    // Contatos rodapé
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(180, 210, 255);
    doc.text(
      "📸 @papelariafuturacentro   |   📱 (61) 9 9999-9999   |   🌐 papelariafutura.com.br",
      PW / 2,
      yRod + 15,
      { align: "center" }
    );

    // Numeração de páginas
    const totalPags = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPags; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(180, 210, 255);
      doc.text(`Página ${p} de ${totalPags}`, PW - MX, yRod + 19, { align: "right" });
    }

    // ----------------------------------------------------------------
    // Download
    // ----------------------------------------------------------------
    const nomeArquivo = `Cotacao_${sanitizarNome(cotacao.cliente)}_${dataISO()}.pdf`;
    doc.save(nomeArquivo);
    window.mostrarToast?.("PDF gerado com sucesso!", "success");

  } catch (err) {
    console.error("Erro ao gerar PDF:", err);
    window.mostrarToast?.("Erro ao gerar PDF. Tente novamente.", "error");
  }
}

// ================================================================
// UTILITÁRIOS
// ================================================================
function formatarMoedaPDF(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style:    "currency",
    currency: "BRL"
  }).format(Number(valor) || 0);
}

function formatarNumero(valor) {
  const n = Number(valor) || 0;
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(".", ",");
}

function truncar(str, max) {
  if (!str) return "—";
  return str.length > max ? str.substring(0, max - 1) + "…" : str;
}

function sanitizarNome(nome) {
  return (nome || "cotacao")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .substring(0, 30);
}

function dataISO() {
  return new Date().toISOString().split("T")[0];
}
