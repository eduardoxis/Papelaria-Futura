// ============================================================
// pdf.js — Gerador de Cotação PDF — Papelaria Futura Centro
// Usa jsPDF + jsPDF-AutoTable (CDN no dashboard.html)
// ============================================================

export function gerarPDF(cotacao) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    const PW = 210;
    const MX = 14;
    const CW = PW - MX * 2;

    // ── Cores ──────────────────────────────────────────────
    const C = {
      azulEscuro : [0,  18,  80],
      azulMedio  : [0,  45, 148],
      azulClaro  : [0,  56, 184],
      azulTH     : [21,  82, 181],
      branco     : [255, 255, 255],
      cinzaLinha : [220, 228, 240],
      cinzaFundo : [247, 249, 252],
      cinzaTexto : [100, 116, 139],
      pretoTexto : [30,  30,  30],
    };

    // ── Helpers ────────────────────────────────────────────
    const rgb  = (c) => doc.setTextColor(c[0], c[1], c[2]);
    const fill = (c) => doc.setFillColor(c[0], c[1], c[2]);
    const draw = (c) => doc.setDrawColor(c[0], c[1], c[2]);

    function fmtMoeda(v) {
      return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(Number(v)||0);
    }
    function fmtNum(v) {
      const n = Number(v)||0;
      return n % 1 === 0 ? String(n) : n.toFixed(2).replace(".",",");
    }
    function sanitize(s) {
      return (s||"cotacao").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]/g,"_").substring(0,30);
    }
    function dataHoje() {
      return new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});
    }
    function aplicarCNPJMask(v) {
      const d = (v||"").replace(/\D/g,"").substring(0,14);
      if (d.length === 14)
        return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,"$1.$2.$3/$4-$5");
      return v || "";
    }

    // ── Gradiente fundo azul ────────────────────────────────
    function gradRect(x, y, w, h, c1, c2) {
      for (let i = 0; i <= h; i++) {
        const t = i / h;
        doc.setFillColor(
          Math.round(c1[0] + (c2[0]-c1[0])*t),
          Math.round(c1[1] + (c2[1]-c1[1])*t),
          Math.round(c1[2] + (c2[2]-c1[2])*t)
        );
        doc.rect(x, y+i, w, 1.1, "F");
      }
    }

    // ── Ícone pino localização ─────────────────────────────
    function drawPin(x, y, r) {
      fill(C.azulMedio);
      doc.circle(x, y, r, "F");
      fill(C.branco);
      doc.circle(x, y + r * 0.5, r * 0.35, "F");
    }

    // ── Ícone telefone ─────────────────────────────────────
    function drawPhone(x, y, w, h) {
      fill(C.azulMedio);
      doc.roundedRect(x, y, w, h, 1.5, 1.5, "F");
      fill(C.branco);
      doc.roundedRect(x+0.8, y+1.2, w-1.6, h-2.8, 1, 1, "F");
      fill(C.azulMedio);
      doc.rect(x+0.8, y+1.2, w-1.6, h-4.8, "F");
    }

    // ── Ícone pessoa ───────────────────────────────────────
    function drawPerson(cx, cy, r) {
      fill(C.azulMedio);
      doc.circle(cx, cy, r, "F");
      fill(C.branco);
      doc.circle(cx, cy - r*0.22, r*0.33, "F");
      doc.ellipse(cx, cy + r*0.5, r*0.42, r*0.3, "F");
    }

    // ── Ícone calendário ───────────────────────────────────
    function drawCal(x, y, w, h) {
      fill(C.azulMedio);
      doc.roundedRect(x, y, w, h, 1, 1, "F");
      fill(C.branco);
      doc.rect(x+0.5, y+h*0.35, w-1, h*0.58, "F");
      const cols = 3, rows = 2;
      const cw = (w-1)/cols, ch = (h*0.58-1)/rows;
      for (let r2=0; r2<rows; r2++) for (let c2=0; c2<cols; c2++) {
        fill(C.azulMedio);
        doc.roundedRect(x+0.5+c2*cw+0.5, y+h*0.35+1+r2*ch+0.5, cw-1, ch-1, 0.3, 0.3, "F");
      }
      fill(C.branco);
      doc.rect(x+w*0.3, y-0.5, 0.8, 2, "F");
      doc.rect(x+w*0.7-0.4, y-0.5, 0.8, 2, "F");
    }

    // ── Ícone carrinho ─────────────────────────────────────
    function drawCart(cx, cy, r) {
      fill(C.azulMedio);
      doc.circle(cx, cy, r, "F");
      draw(C.branco);
      doc.setLineWidth(0.7);
      fill(C.branco);
      doc.triangle(cx-r*0.55, cy-r*0.15, cx+r*0.55, cy-r*0.15, cx+r*0.4, cy+r*0.35, "F");
      doc.setLineWidth(0.3);
      doc.circle(cx-r*0.2, cy+r*0.52, r*0.14, "F");
      doc.circle(cx+r*0.3, cy+r*0.52, r*0.14, "F");
      doc.setDrawColor(255,255,255);
      doc.setLineWidth(0.7);
      doc.line(cx-r*0.7, cy-r*0.5, cx-r*0.55, cy-r*0.15);
    }

    // ── Ícone check ────────────────────────────────────────
    function drawCheck(cx, cy, r) {
      fill(C.azulMedio);
      doc.circle(cx, cy, r, "F");
      doc.setDrawColor(255,255,255);
      doc.setLineWidth(0.9);
      doc.line(cx-r*0.4, cy, cx-r*0.05, cy+r*0.4);
      doc.line(cx-r*0.05, cy+r*0.4, cx+r*0.45, cy-r*0.3);
    }

    // ── Ícone documento/obs ────────────────────────────────
    function drawDoc(x, y, w, h) {
      fill(C.azulMedio);
      doc.roundedRect(x, y, w, h, 1, 1, "F");
      fill(C.branco);
      const ly = [y+h*0.3, y+h*0.5, y+h*0.7];
      ly.forEach(ly2 => doc.rect(x+0.8*w*0.15, ly2, w*0.7, 0.6, "F"));
    }

    // ══════════════════════════════════════════════════════
    // 1. CABEÇALHO — faixa azul com cantos superiores arredondados
    // ══════════════════════════════════════════════════════
    const CAB_H = 52;

    // Gradiente principal
    gradRect(0, 0, PW, CAB_H, [8, 28, 95], [20, 70, 160]);

    // Cantos superiores arredondados (sobrepõe bordas com branco externo)
    // Não necessário no PDF em si, mas mantemos visual limpo

    // Linha divisória vertical central (semitransparente)
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.4);
    doc.setGState(doc.GState({ opacity: 0.25 }));
    doc.line(PW/2 - 5, 7, PW/2 - 5, CAB_H - 7);
    doc.setGState(doc.GState({ opacity: 1 }));

    // ── Logo: caixa F (igual à imagem de referência) ──────
    const LX = MX, LY = 8, LW = 24, LH = 28;

    // Caixa branca arredondada (sem halo)
    fill(C.branco);
    doc.roundedRect(LX, LY, LW, LH, 3, 3, "F");

    // Fundo interno azul royal sólido
    fill([20, 60, 180]);
    doc.roundedRect(LX + 1.5, LY + 1.5, LW - 3, LH - 3, 2, 2, "F");

    // Letra F branca grande
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    rgb(C.branco);
    doc.text("F", LX + LW / 2, LY + LH / 2 + 4, { align: "center" });

    // Textos do nome à direita do logo
    const TX = LX + LW + 4;

    // "PAPELARIA" pequeno, espaçado, acima
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(200, 220, 255);
    doc.setCharSpace(1.5);
    doc.text("PAPELARIA", TX, LY + 7);
    doc.setCharSpace(0);

    // "Futura" grande e bold
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    rgb(C.branco);
    doc.text("Futura", TX, LY + 17);

    // "CENTRO" pequeno, espaçado, abaixo
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(200, 220, 255);
    doc.setCharSpace(2);
    doc.text("C E N T R O", TX, LY + 23);
    doc.setCharSpace(0);

    // ── Dados contato à direita ────────────────────────────
    const DX = PW/2;

    // Endereço
    drawPin(DX + 4, 12, 3.2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    rgb(C.branco);
    doc.text("AV. DR. ÉZIO CARNEIRO QD.32", DX + 10, 10.5);
    doc.text("LT31/33", DX + 10, 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(160, 195, 255);
    doc.text("SETOR AEROPORTO, LUZIÂNIA/GO", DX + 10, 19.5);

    // Telefone
    drawPhone(DX + 1.5, 24, 5, 7.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    rgb(C.branco);
    doc.text("(61) 99918-4452", DX + 10, 30);

    // CNPJ
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(160, 195, 255);
    doc.text("CNPJ: 01.064.836/0001-12", DX + 10, 40);

    // Faixa decorativa inferior no cabeçalho
    doc.setGState(doc.GState({ opacity: 0.15 }));
    fill(C.branco);
    doc.rect(0, CAB_H - 3, PW, 3, "F");
    doc.setGState(doc.GState({ opacity: 1 }));

    let Y = CAB_H + 8;

    // ══════════════════════════════════════════════════════
    // 2. TÍTULO "Cotação"
    // ══════════════════════════════════════════════════════
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    rgb(C.azulMedio);
    doc.text("Cotação", PW/2, Y + 1, { align:"center" });

    // Linha decorativa sob o título
    const tituloW = 28;
    fill(C.azulMedio);
    doc.setGState(doc.GState({ opacity: 0.18 }));
    doc.rect(PW/2 - tituloW/2, Y + 3.5, tituloW, 0.8, "F");
    doc.setGState(doc.GState({ opacity: 1 }));

    Y += 13;

    // ══════════════════════════════════════════════════════
    // 3. CARD CLIENTE / DATA
    // ══════════════════════════════════════════════════════
    const CARD_H = 26;

    // Sombra suave (retângulo ligeiramente deslocado)
    doc.setGState(doc.GState({ opacity: 0.06 }));
    fill([0, 45, 148]);
    doc.roundedRect(MX + 0.8, Y + 0.8, CW, CARD_H, 2.5, 2.5, "F");
    doc.setGState(doc.GState({ opacity: 1 }));

    // Card branco
    fill(C.branco);
    draw(C.cinzaLinha);
    doc.setLineWidth(0.35);
    doc.roundedRect(MX, Y, CW, CARD_H, 2.5, 2.5, "FD");

    // Divisória vertical
    const DIV_X = PW/2 + 10;
    draw(C.cinzaLinha);
    doc.setLineWidth(0.3);
    doc.line(DIV_X, Y + 3, DIV_X, Y + CARD_H - 3);

    // Ícone pessoa
    drawPerson(MX + 10, Y + CARD_H/2, 7);

    // Dados cliente
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    rgb(C.azulMedio);
    doc.text("CLIENTE", MX + 20, Y + 7);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    rgb(C.pretoTexto);
    const nomeCliente = (cotacao.cliente || "—").toUpperCase();
    doc.text(nomeCliente, MX + 20, Y + 14);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    rgb(C.azulMedio);
    doc.text("CNPJ:", MX + 20, Y + 20.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    rgb(C.cinzaTexto);
    doc.text(aplicarCNPJMask(cotacao.cnpj) || "—", MX + 31, Y + 20.5);

    // Ícone calendário (lado direito)
    const CX2 = DIV_X + 10;
    drawCal(CX2, Y + CARD_H/2 - 6.5, 11, 11);

    // Datas
    const dataEmissao = dataHoje();
    const [dia, mes, ano] = dataEmissao.split("/");
    const MESES = ["","JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO",
                   "JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];

    let validadeTexto = "30 dias";
    if (cotacao.validade) {
      const hoje = new Date();
      const valid = new Date(cotacao.validade + "T12:00:00");
      const diff = Math.ceil((valid - hoje) / 86400000);
      validadeTexto = diff > 0 ? `${diff} dias` : valid.toLocaleDateString("pt-BR");
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    rgb(C.azulMedio);
    doc.text("EMISSÃO", CX2 + 14, Y + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    rgb(C.pretoTexto);
    doc.text(dataEmissao, CX2 + 14, Y + 14);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    rgb(C.azulMedio);
    doc.text("VALIDADE", CX2 + 14, Y + 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    rgb(C.pretoTexto);
    doc.text(validadeTexto, CX2 + 14, Y + 26);

    Y += CARD_H + 8;

    // ══════════════════════════════════════════════════════
    // 4. TABELA
    // ══════════════════════════════════════════════════════
    const itens = (cotacao.itens||[]).map((it, i) => [
      String(i+1),
      (it.descricao||"—").toUpperCase(),
      (it.marca||"-").toUpperCase(),
      fmtNum(it.quantidade),
      fmtMoeda(it.valorUnitario),
      fmtMoeda(it.valorTotal),
    ]);

    doc.autoTable({
      startY: Y,
      head: [["ITEM","DESCRIÇÃO / PRODUTO","MARCA","QUANTIDADE","VALOR UNITÁRIO","VALOR TOTAL"]],
      body: itens,
      margin: { left: MX, right: MX },
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        cellPadding: { top:5, bottom:5, left:4, right:4 },
        textColor: C.pretoTexto,
        lineColor: C.cinzaLinha,
        lineWidth: 0.25,
        valign: "middle",
      },
      headStyles: {
        fillColor: C.azulTH,
        textColor: C.branco,
        fontStyle: "bold",
        fontSize: 7.5,
        halign: "center",
        minCellHeight: 11,
      },
      columnStyles: {
        0: { cellWidth: 14,  halign:"center", fontStyle:"bold" },
        1: { cellWidth: "auto" },
        2: { cellWidth: 28,  halign:"center" },
        3: { cellWidth: 24,  halign:"center" },
        4: { cellWidth: 32,  halign:"right"  },
        5: { cellWidth: 32,  halign:"right",  fontStyle:"bold" },
      },
      alternateRowStyles: { fillColor: C.cinzaFundo },
      bodyStyles: { fillColor: [255,255,255] },
      tableLineColor: C.cinzaLinha,
      tableLineWidth: 0.3,
    });

    Y = doc.lastAutoTable.finalY + 7;

    // ══════════════════════════════════════════════════════
    // 5. CARD VALOR TOTAL
    // ══════════════════════════════════════════════════════
    if (Y + 28 > 272) { doc.addPage(); Y = 16; }

    const TOT_H = 26;

    // Sombra suave
    doc.setGState(doc.GState({ opacity: 0.06 }));
    fill([0, 45, 148]);
    doc.roundedRect(MX + 0.8, Y + 0.8, CW, TOT_H, 2.5, 2.5, "F");
    doc.setGState(doc.GState({ opacity: 1 }));

    fill(C.branco);
    draw(C.cinzaLinha);
    doc.setLineWidth(0.35);
    doc.roundedRect(MX, Y, CW, TOT_H, 2.5, 2.5, "FD");

    const T3 = CW / 3;

    // Divisórias
    draw(C.cinzaLinha);
    doc.setLineWidth(0.3);
    doc.line(MX + T3,   Y + 4, MX + T3,   Y + TOT_H - 4);
    doc.line(MX + T3*2, Y + 4, MX + T3*2, Y + TOT_H - 4);

    // Seção 1 — valor total
    drawCart(MX + 11, Y + TOT_H/2, 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    rgb(C.azulMedio);
    doc.text("VALOR TOTAL:", MX + 23, Y + 9);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    rgb(C.azulMedio);
    doc.text(fmtMoeda(cotacao.valorTotal), MX + 23, Y + 20);

    // Seção 2 — validade
    const S2X = MX + T3 + 5;
    drawCheck(S2X + 7, Y + TOT_H/2, 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    rgb(C.azulMedio);
    doc.text("VÁLIDO ATÉ", S2X + 16, Y + 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    rgb(C.pretoTexto);
    doc.text(validadeTexto.toUpperCase(), S2X + 16, Y + 18);

    // Seção 3 — localização/data
    const S3X = MX + T3*2 + 5;
    drawPin(S3X + 7, Y + TOT_H/2 - 1, 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    rgb(C.pretoTexto);
    doc.text("LUZIÂNIA/GO", S3X + 16, Y + 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    rgb(C.cinzaTexto);
    doc.text(`${dia} DE ${MESES[parseInt(mes)]} DE ${ano}`, S3X + 16, Y + 18);

    Y += TOT_H + 7;

    // ══════════════════════════════════════════════════════
    // 6. OBSERVAÇÕES
    // ══════════════════════════════════════════════════════
    if (cotacao.observacoes) {
      if (Y + 24 > 272) { doc.addPage(); Y = 16; }

      const linhasObs = doc.splitTextToSize((cotacao.observacoes||"").toUpperCase(), CW - 24);
      const OBS_H = Math.max(20, 12 + linhasObs.length * 5);

      // Sombra
      doc.setGState(doc.GState({ opacity: 0.05 }));
      fill([0, 45, 148]);
      doc.roundedRect(MX + 0.8, Y + 0.8, CW, OBS_H, 2.5, 2.5, "F");
      doc.setGState(doc.GState({ opacity: 1 }));

      fill(C.cinzaFundo);
      draw(C.cinzaLinha);
      doc.setLineWidth(0.35);
      doc.roundedRect(MX, Y, CW, OBS_H, 2.5, 2.5, "FD");

      // Acento azul esquerdo
      fill(C.azulMedio);
      doc.roundedRect(MX, Y, 3, OBS_H, 2, 2, "F");
      fill(C.cinzaFundo);
      doc.rect(MX + 1.5, Y, 2, OBS_H, "F");

      drawDoc(MX + 5, Y + OBS_H/2 - 6, 9, 12);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      rgb(C.azulMedio);
      doc.text("OBSERVAÇÕES", MX + 17, Y + 8);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      rgb(C.pretoTexto);
      doc.text(linhasObs, MX + 17, Y + 14.5);

      Y += OBS_H + 7;
    }

    // ══════════════════════════════════════════════════════
    // 7. ELABORADO POR
    // ══════════════════════════════════════════════════════
    if (Y + 12 > 272) { doc.addPage(); Y = 16; }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    rgb(C.cinzaTexto);
    doc.text("Elaborado por:", MX, Y + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    rgb(C.pretoTexto);
    doc.text((cotacao.funcionario || "—").toUpperCase(), MX + 28, Y + 5);

    draw(C.cinzaLinha);
    doc.setLineWidth(0.3);
    doc.line(MX, Y + 7.5, MX + CW, Y + 7.5);

    Y += 13;

    // ══════════════════════════════════════════════════════
    // 8. RODAPÉ
    // ══════════════════════════════════════════════════════
    const ROD_H = 18;
    const ROD_Y = 297 - ROD_H;

    gradRect(0, ROD_Y, PW, ROD_H, [8, 28, 95], [20, 70, 160]);

    // Linha decorativa topo do rodapé
    doc.setGState(doc.GState({ opacity: 0.3 }));
    fill(C.branco);
    doc.rect(0, ROD_Y, PW, 0.8, "F");
    doc.setGState(doc.GState({ opacity: 1 }));

    // Divisórias verticais no rodapé
    doc.setDrawColor(255, 255, 255);
    doc.setGState(doc.GState({ opacity: 0.2 }));
    doc.setLineWidth(0.3);
    doc.line(PW/3,   ROD_Y + 3, PW/3,   ROD_Y + ROD_H - 3);
    doc.line(PW/3*2, ROD_Y + 3, PW/3*2, ROD_Y + ROD_H - 3);
    doc.setGState(doc.GState({ opacity: 1 }));

    // Slogan
    doc.setFont("helvetica", "bolditalic");
    doc.setFontSize(10);
    rgb(C.branco);
    doc.text("Obrigado pela preferência!", PW/6, ROD_Y + 11, { align:"center" });

    // Instagram
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(170, 205, 255);
    doc.text("@papelariafuturacentro", PW/2, ROD_Y + 11, { align:"center" });

    // WhatsApp
    doc.text("(61) 99918-4452", PW/6*5, ROD_Y + 11, { align:"center" });

    // Paginação
    const totalPags = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPags; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(130, 165, 220);
      doc.text(`Página ${p} de ${totalPags}`, PW - MX, ROD_Y + ROD_H - 2, { align:"right" });
    }

    // Download
    doc.save(`Cotacao_${sanitize(cotacao.cliente)}_${new Date().toISOString().split("T")[0]}.pdf`);
    window.mostrarToast?.("PDF gerado com sucesso!", "success");

  } catch (err) {
    console.error("Erro ao gerar PDF:", err);
    window.mostrarToast?.("Erro ao gerar PDF. Tente novamente.", "error");
  }
}
