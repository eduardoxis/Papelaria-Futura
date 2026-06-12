// ============================================================
// pdf.js — Gerador de Cotação PDF — Papelaria Futura Centro
// ============================================================
// Usa jsPDF + jsPDF-AutoTable (carregados via CDN no dashboard.html)
// Layout idêntico ao comprovante impresso da loja.
// ============================================================

export function gerarPDF(cotacao) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    const PW = 210;
    const MX = 12;
    const CW = PW - MX * 2;
    let   Y  = 0;

    // ----------------------------------------------------------------
    // Cores
    // ----------------------------------------------------------------
    const AZUL_ESCURO  = [10,  36, 114];   // #0A2472
    const AZUL_MEDIO   = [25,  85, 200];   // #1955C8
    const AZUL_HEADER  = [13,  71, 161];   // cabeçalho fundo
    const AZUL_TH      = [21,  82, 181];   // thead tabela
    const AZUL_TEXTO   = [21,  82, 181];   // texto azul destaque
    const CINZA_CLARO  = [248, 250, 252];
    const CINZA_LINHA  = [226, 232, 240];
    const BRANCO       = [255, 255, 255];
    const PRETO_TEXTO  = [20,  20,  20];
    const CINZA_TEXTO  = [100, 116, 139];
    const AZUL_TOTAL   = [13,  71, 161];   // fundo do card total

    // ================================================================
    // 1. CABEÇALHO AZUL ESCURO
    // ================================================================
    const ALT_CABEC = 48;

    // Fundo gradiente azul
    for (let i = 0; i <= ALT_CABEC; i++) {
      const t = i / ALT_CABEC;
      const r = Math.round(AZUL_ESCURO[0] + (AZUL_HEADER[0] - AZUL_ESCURO[0]) * t);
      const g = Math.round(AZUL_ESCURO[1] + (AZUL_HEADER[1] - AZUL_ESCURO[1]) * t);
      const b = Math.round(AZUL_ESCURO[2] + (AZUL_HEADER[2] - AZUL_ESCURO[2]) * t);
      doc.setFillColor(r, g, b);
      doc.rect(0, i, PW, 1.3, "F");
    }

    // ---- LOGO "F" (caixa branca arredondada com letra F) ----
    const logoX = MX;
    const logoY = 6;
    const logoW = 28;
    const logoH = 28;

    // Borda exterior branca arredondada
    doc.setFillColor(...BRANCO);
    doc.roundedRect(logoX, logoY, logoW, logoH, 5, 5, "F");

    // Fundo interno levemente azul
    doc.setFillColor(200, 220, 255);
    doc.roundedRect(logoX + 2, logoY + 2, logoW - 4, logoH - 4, 3, 3, "F");

    // Letra F azul
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...AZUL_ESCURO);
    doc.text("F", logoX + logoW / 2, logoY + logoH / 2 + 3, { align: "center" });

    // ---- NOME DA EMPRESA ----
    const txtX = logoX + logoW + 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(180, 210, 255);
    doc.text("PAPELARIA", txtX, logoY + 6);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...BRANCO);
    doc.text("Futura", txtX, logoY + 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(180, 210, 255);
    doc.text("C E N T R O", txtX, logoY + 22);

    // Linha separadora vertical
    doc.setDrawColor(...BRANCO);
    doc.setLineWidth(0.4);
    doc.line(PW / 2 - 10, 8, PW / 2 - 10, 42);

    // ---- ENDEREÇO / CONTATO (lado direito) ----
    const rdX = PW / 2 - 4;

    // Ícone pino de localização (círculo azul)
    doc.setFillColor(...AZUL_MEDIO);
    doc.circle(rdX + 2.5, 12, 2.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(...BRANCO);
    doc.text("📍", rdX + 0.5, 12.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...BRANCO);
    doc.text("AV. DR. ÉZIO CARNEIRO QD.32 LT31/33", rdX + 7, 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(180, 210, 255);
    doc.text("SETOR AEROPORTO, LUZIÂNIA/GO", rdX + 7, 15.5);

    // Ícone telefone
    doc.setFillColor(...AZUL_MEDIO);
    doc.circle(rdX + 2.5, 23, 2.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...BRANCO);
    doc.text("(61) 99918-4452", rdX + 7, 25.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(180, 210, 255);
    doc.text("CNPJ: 01.064.836/0001-12", rdX + 7, 33);

    Y = ALT_CABEC + 6;

    // ================================================================
    // 2. TÍTULO "Cotação"
    // ================================================================
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...AZUL_TEXTO);
    doc.text("Cotação", PW / 2, Y + 6, { align: "center" });

    Y += 14;

    // ================================================================
    // 3. CARD CLIENTE + DATA  (retângulo com borda cinza)
    // ================================================================
    const cardH = 22;
    doc.setFillColor(...BRANCO);
    doc.setDrawColor(...CINZA_LINHA);
    doc.setLineWidth(0.5);
    doc.roundedRect(MX, Y, CW, cardH, 2, 2, "FD");

    // Linha divisória vertical no meio do card
    doc.setDrawColor(...CINZA_LINHA);
    doc.setLineWidth(0.4);
    doc.line(PW / 2 + 10, Y, PW / 2 + 10, Y + cardH);

    // Ícone pessoa (círculo azul)
    doc.setFillColor(...AZUL_TOTAL);
    doc.circle(MX + 8, Y + cardH / 2, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRANCO);
    doc.text("👤", MX + 5, Y + cardH / 2 + 1.5);

    // Dados cliente
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...AZUL_TEXTO);
    doc.text("Cliente:", MX + 17, Y + 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...PRETO_TEXTO);
    doc.text((cotacao.cliente || "—").toUpperCase(), MX + 17, Y + 13.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...AZUL_TEXTO);
    doc.text("CNPJ:", MX + 17, Y + 19);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...CINZA_TEXTO);
    doc.text(cotacao.cnpj || "", MX + 28, Y + 19);

    // Ícone calendário (círculo azul)
    const cx2 = PW / 2 + 16;
    doc.setFillColor(...AZUL_TOTAL);
    doc.circle(cx2 + 6, Y + cardH / 2, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRANCO);
    doc.text("📅", cx2 + 3, Y + cardH / 2 + 1.5);

    // Emissão e validade
    const dataEmissao = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric"
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...AZUL_TEXTO);
    doc.text("Emissão:", cx2 + 15, Y + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...PRETO_TEXTO);
    doc.text(dataEmissao, cx2 + 15, Y + 13);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...AZUL_TEXTO);
    doc.text("Validade:", cx2 + 15, Y + 18);

    // Calcular dias de validade baseado na data
    let validadeTexto = "30 dias";
    if (cotacao.validade) {
      const hoje = new Date();
      const valid = new Date(cotacao.validade + "T12:00:00");
      const diff = Math.ceil((valid - hoje) / (1000 * 60 * 60 * 24));
      if (diff > 0) validadeTexto = `${diff} dias`;
      else validadeTexto = valid.toLocaleDateString("pt-BR");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...PRETO_TEXTO);
    doc.text(validadeTexto, cx2 + 15, Y + 23.5);

    Y += cardH + 8;

    // ================================================================
    // 4. TABELA DE PRODUTOS
    // ================================================================
    const itens = cotacao.itens || [];

    const linhas = itens.map((item, idx) => ({
      item:          String(idx + 1),
      descricao:     (item.descricao || "—").toUpperCase(),
      marca:         (item.marca     || "-").toUpperCase(),
      quantidade:    formatarNumero(item.quantidade),
      valorUnitario: formatarMoedaPDF(item.valorUnitario),
      valorTotal:    formatarMoedaPDF(item.valorTotal),
    }));

    doc.autoTable({
      startY: Y,
      columns: [
        { header: "ITEM",            dataKey: "item"          },
        { header: "DESCRIÇÃO / PRODUTO", dataKey: "descricao" },
        { header: "MARCA",           dataKey: "marca"         },
        { header: "QUANTIDADE",      dataKey: "quantidade"    },
        { header: "VALOR UNITÁRIO",  dataKey: "valorUnitario" },
        { header: "VALOR TOTAL",     dataKey: "valorTotal"    },
      ],
      body: linhas,
      margin: { left: MX, right: MX },
      styles: {
        fontSize: 9,
        cellPadding: { top: 5, bottom: 5, left: 5, right: 5 },
        textColor: PRETO_TEXTO,
        lineColor: CINZA_LINHA,
        lineWidth: 0.25,
        font: "helvetica",
      },
      headStyles: {
        fillColor: AZUL_TH,
        textColor: BRANCO,
        fontStyle: "bold",
        fontSize: 8,
        halign: "left",
        minCellHeight: 10,
      },
      columnStyles: {
        item:          { cellWidth: 14, halign: "center", fontStyle: "bold" },
        descricao:     { cellWidth: "auto" },
        marca:         { cellWidth: 28,  halign: "center" },
        quantidade:    { cellWidth: 24,  halign: "center" },
        valorUnitario: { cellWidth: 32,  halign: "right" },
        valorTotal:    { cellWidth: 32,  halign: "right", fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: CINZA_CLARO },
      bodyStyles: { fillColor: BRANCO },
      tableLineColor: CINZA_LINHA,
      tableLineWidth: 0.3,
    });

    Y = doc.lastAutoTable.finalY + 6;

    // ================================================================
    // 5. CARD VALOR TOTAL + VALIDADE + CIDADE
    // ================================================================
    if (Y + 28 > 270) { doc.addPage(); Y = 20; }

    const totCardH = 22;
    doc.setFillColor(...BRANCO);
    doc.setDrawColor(...CINZA_LINHA);
    doc.setLineWidth(0.5);
    doc.roundedRect(MX, Y, CW, totCardH, 2, 2, "FD");

    // Secção esquerda — carrinho + VALOR TOTAL
    doc.setFillColor(...AZUL_TOTAL);
    doc.circle(MX + 8, Y + totCardH / 2, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRANCO);
    doc.text("🛒", MX + 4.5, Y + totCardH / 2 + 2);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...AZUL_TEXTO);
    doc.text("VALOR TOTAL:", MX + 18, Y + 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...AZUL_TEXTO);
    doc.text(formatarMoedaPDF(cotacao.valorTotal), MX + 18, Y + 18);

    // Divisórias verticais
    const terco = CW / 3;
    doc.setDrawColor(...CINZA_LINHA);
    doc.setLineWidth(0.4);
    doc.line(MX + terco, Y + 2, MX + terco, Y + totCardH - 2);
    doc.line(MX + terco * 2, Y + 2, MX + terco * 2, Y + totCardH - 2);

    // Seção central — ✅ VALIDO ATÉ
    const c2X = MX + terco + 6;
    doc.setFillColor(...AZUL_TOTAL);
    doc.circle(c2X + 5, Y + totCardH / 2, 5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRANCO);
    doc.text("✓", c2X + 2.5, Y + totCardH / 2 + 1.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...AZUL_TEXTO);
    doc.text("VALIDO ATÉ", c2X + 13, Y + 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...PRETO_TEXTO);
    doc.text(validadeTexto.toUpperCase(), c2X + 13, Y + 16);

    // Seção direita — 📍 CIDADE/DATA
    const c3X = MX + terco * 2 + 6;
    doc.setFillColor(...AZUL_TOTAL);
    doc.circle(c3X + 5, Y + totCardH / 2, 5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRANCO);
    doc.text("📍", c3X + 2.5, Y + totCardH / 2 + 1.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...PRETO_TEXTO);
    doc.text("LUZIÂNIA/GO", c3X + 13, Y + 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...CINZA_TEXTO);

    const [dia, mes, ano] = dataEmissao.split("/");
    const mesesPT = [
      "", "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
      "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"
    ];
    doc.text(`${dia} DE ${mesesPT[parseInt(mes)]} DE ${ano}`, c3X + 13, Y + 16);

    Y += totCardH + 6;

    // ================================================================
    // 6. OBSERVAÇÕES
    // ================================================================
    if (cotacao.observacoes) {
      if (Y + 20 > 270) { doc.addPage(); Y = 20; }

      doc.setFillColor(...CINZA_CLARO);
      doc.setDrawColor(...CINZA_LINHA);
      doc.setLineWidth(0.4);
      const obsH = 8 + doc.splitTextToSize(cotacao.observacoes, CW - 20).length * 4;
      doc.roundedRect(MX, Y, CW, obsH, 2, 2, "FD");

      // Ícone
      doc.setFillColor(...AZUL_TOTAL);
      doc.circle(MX + 7, Y + obsH / 2, 5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...BRANCO);
      doc.text("≡", MX + 4.5, Y + obsH / 2 + 1.5);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...AZUL_TEXTO);
      doc.text("OBSERVAÇÕES", MX + 15, Y + 6);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...PRETO_TEXTO);
      const linhasObs = doc.splitTextToSize(cotacao.observacoes.toUpperCase(), CW - 20);
      doc.text(linhasObs, MX + 15, Y + 12);
      Y += obsH + 6;
    }

    // ================================================================
    // 7. RODAPÉ AZUL — "Obrigado pela preferência!"
    // ================================================================
    const altRod = 18;
    const yRod   = 297 - altRod;

    for (let i = 0; i <= altRod; i++) {
      const t = i / altRod;
      const r = Math.round(AZUL_ESCURO[0] + (AZUL_HEADER[0] - AZUL_ESCURO[0]) * t);
      const g = Math.round(AZUL_ESCURO[1] + (AZUL_HEADER[1] - AZUL_ESCURO[1]) * t);
      const b = Math.round(AZUL_ESCURO[2] + (AZUL_HEADER[2] - AZUL_ESCURO[2]) * t);
      doc.setFillColor(r, g, b);
      doc.rect(0, yRod + i, PW, 1.2, "F");
    }

    // Slogan cursivo central
    doc.setFont("helvetica", "bolditalic");
    doc.setFontSize(11);
    doc.setTextColor(...BRANCO);
    doc.text("Obrigado pela preferência!", PW / 2 - 20, yRod + 8, { align: "center" });

    // Divisores verticais
    doc.setDrawColor(100, 140, 220);
    doc.setLineWidth(0.3);
    doc.line(PW / 3, yRod + 3, PW / 3, yRod + altRod - 3);
    doc.line((PW / 3) * 2, yRod + 3, (PW / 3) * 2, yRod + altRod - 3);

    // Instagram
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(180, 210, 255);
    doc.text("@papelariafuturacentro", PW / 6, yRod + 11, { align: "center" });

    // WhatsApp
    doc.text("(61) 99918-4452", (PW / 6) * 5, yRod + 11, { align: "center" });

    // Numeração de páginas
    const totalPags = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPags; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(150, 180, 230);
      doc.text(`Página ${p} de ${totalPags}`, PW - MX, yRod + altRod - 2, { align: "right" });
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
    style: "currency", currency: "BRL"
  }).format(Number(valor) || 0);
}

function formatarNumero(valor) {
  const n = Number(valor) || 0;
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(".", ",");
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
