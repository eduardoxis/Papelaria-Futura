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
      azulEscuro : [10,  36, 114],
      azulMedio  : [21,  82, 181],
      azulClaro  : [41, 121, 255],
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

    // ── Ícone pino localização (SVG-like com shapes) ───────
    function drawPin(x, y, r) {
      fill(C.azulMedio);
      doc.circle(x, y, r, "F");
      fill(C.branco);
      doc.circle(x, y + r * 0.5, r * 0.35, "F");
    }

    // ── Ícone telefone (retângulo arredondado) ─────────────
    function drawPhone(x, y, w, h) {
      fill(C.azulMedio);
      doc.roundedRect(x, y, w, h, 1.5, 1.5, "F");
      fill(C.branco);
      doc.roundedRect(x+0.8, y+1.2, w-1.6, h-2.8, 1, 1, "F");
      fill(C.azulMedio);
      doc.rect(x+0.8, y+1.2, w-1.6, h-4.8, "F");
    }

    // ── Ícone pessoa (cabeça + corpo) ──────────────────────
    function drawPerson(cx, cy, r) {
      fill(C.azulMedio);
      doc.circle(cx, cy, r, "F");
      fill(C.branco);
      // cabeça
      doc.circle(cx, cy - r*0.22, r*0.33, "F");
      // corpo (arco)
      doc.ellipse(cx, cy + r*0.5, r*0.42, r*0.3, "F");
    }

    // ── Ícone calendário ───────────────────────────────────
    function drawCal(x, y, w, h) {
      fill(C.azulMedio);
      doc.roundedRect(x, y, w, h, 1, 1, "F");
      fill(C.branco);
      doc.rect(x+0.5, y+h*0.35, w-1, h*0.58, "F");
      fill(C.azulMedio);
      // grid linhas
      const cols = 3, rows = 2;
      const cw = (w-1)/cols, ch = (h*0.58-1)/rows;
      for (let r2=0; r2<rows; r2++) for (let c2=0; c2<cols; c2++) {
        fill(C.azulMedio);
        doc.roundedRect(x+0.5+c2*cw+0.5, y+h*0.35+1+r2*ch+0.5, cw-1, ch-1, 0.3, 0.3, "F");
      }
      // alinhas do topo
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
      // corpo carrinho
      fill(C.branco);
      doc.triangle(cx-r*0.55, cy-r*0.15, cx+r*0.55, cy-r*0.15, cx+r*0.4, cy+r*0.35, "F");
      doc.setLineWidth(0.3);
      // rodas
      doc.circle(cx-r*0.2, cy+r*0.52, r*0.14, "F");
      doc.circle(cx+r*0.3, cy+r*0.52, r*0.14, "F");
      // cabo
      doc.setDrawColor(255,255,255);
      doc.setLineWidth(0.7);
      doc.line(cx-r*0.7, cy-r*0.5, cx-r*0.55, cy-r*0.15);
    }

    // ── Ícone check (tick dentro círculo) ──────────────────
    function drawCheck(cx, cy, r) {
      fill(C.azulMedio);
      doc.circle(cx, cy, r, "F");
      doc.setDrawColor(255,255,255);
      doc.setLineWidth(0.9);
      doc.line(cx-r*0.4, cy, cx-r*0.05, cy+r*0.4);
      doc.line(cx-r*0.05, cy+r*0.4, cx+r*0.45, cy-r*0.3);
    }

    // ── Ícone texto/obs ────────────────────────────────────
    function drawDoc(x, y, w, h) {
      fill(C.azulMedio);
      doc.roundedRect(x, y, w, h, 1, 1, "F");
      fill(C.branco);
      const ly = [y+h*0.3, y+h*0.5, y+h*0.7];
      ly.forEach(ly2 => doc.rect(x+0.8*w*0.15, ly2, w*0.7, 0.6, "F"));
    }

    // ── Gradiente fundo azul (simula faixa) ────────────────
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

    // ══════════════════════════════════════════════════════
    // 1. CABEÇALHO
    // ══════════════════════════════════════════════════════
    const CAB_H = 46;
    gradRect(0, 0, PW, CAB_H, [8, 28, 95], [18, 65, 155]);

    // Linha divisória vertical central
    draw(C.branco);
    doc.setLineWidth(0.35);
    doc.setDrawColor(255,255,255);
    doc.setGState(doc.GState({ opacity: 0.3 }));
    doc.line(PW/2 - 8, 6, PW/2 - 8, CAB_H - 6);
    doc.setGState(doc.GState({ opacity: 1 }));

    // ── Logo: caixa F + texto empilhado ───────────────────
    const LX = MX, LY = 7, LW = 20, LH = 20;

    // Caixa branca arredondada
    fill(C.branco);
    doc.roundedRect(LX, LY, LW, LH, 3, 3, "F");
    // fundo interno azul claro
    fill([190, 215, 255]);
    doc.roundedRect(LX+1.5, LY+1.5, LW-3, LH-3, 2, 2, "F");
    // letra F
    doc.setFont("helvetica","bold");
    doc.setFontSize(14);
    rgb(C.azulEscuro);
    doc.text("F", LX + LW/2, LY + LH/2 + 2.8, { align:"center" });

    // 3 linhas empilhadas à direita da caixa F
    const TX = LX + LW + 4;
    const linhaH = LH / 3;

    // linha 1 — "Papelaria"
    doc.setFont("helvetica","normal");
    doc.setFontSize(7.5);
    doc.setTextColor(200, 220, 255);
    doc.text("Papelaria", TX, LY + linhaH * 0.85);

    // linha 2 — "Futura" (destaque)
    doc.setFont("helvetica","bold");
    doc.setFontSize(14);
    rgb(C.branco);
    doc.text("Futura", TX, LY + linhaH * 1.9 + 1);

    // linha 3 — "Centro"
    doc.setFont("helvetica","normal");
    doc.setFontSize(7);
    doc.setTextColor(200, 220, 255);
    doc.text("C E N T R O", TX, LY + LH - 0.5);

    // ── Dados contato direita ──────────────────────────────
    const DX = PW/2 - 2;

    // Endereço — pino
    drawPin(DX + 3.5, 13, 3);
    doc.setFont("helvetica","bold");
    doc.setFontSize(8);
    rgb(C.branco);
    doc.text("AV. DR. ÉZIO CARNEIRO QD.32 LT31/33", DX + 9, 12);
    doc.setFont("helvetica","normal");
    doc.setFontSize(7.5);
    doc.setTextColor(160, 195, 255);
    doc.text("SETOR AEROPORTO, LUZIÂNIA/GO", DX + 9, 16.5);

    // Telefone — ícone
    drawPhone(DX + 1, 20.5, 5, 7);
    doc.setFont("helvetica","bold");
    doc.setFontSize(13.5);
    rgb(C.branco);
    doc.text("(61) 99918-4452", DX + 9, 26.5);

    // CNPJ
    doc.setFont("helvetica","normal");
    doc.setFontSize(7.5);
    doc.setTextColor(160, 195, 255);
    doc.text("CNPJ: 01.064.836/0001-12", DX + 9, 33.5);

    let Y = CAB_H + 7;

    // ══════════════════════════════════════════════════════
    // 2. TÍTULO
    // ══════════════════════════════════════════════════════
    doc.setFont("helvetica","bold");
    doc.setFontSize(18);
    rgb(C.azulMedio);
    doc.text("Cotação", PW/2, Y + 1, { align:"center" });
    Y += 11;

    // ══════════════════════════════════════════════════════
    // 3. CARD CLIENTE / DATA
    // ══════════════════════════════════════════════════════
    const CARD_H = 24;
    fill(C.branco);
    draw(C.cinzaLinha);
    doc.setLineWidth(0.4);
    doc.roundedRect(MX, Y, CW, CARD_H, 2, 2, "FD");

    // divisória vertical
    const DIV_X = PW/2 + 8;
    draw(C.cinzaLinha);
    doc.setLineWidth(0.35);
    doc.line(DIV_X, Y+2, DIV_X, Y+CARD_H-2);

    // ícone pessoa
    drawPerson(MX + 9, Y + CARD_H/2, 6.5);

    // dados cliente
    doc.setFont("helvetica","bold");
    doc.setFontSize(7);
    rgb(C.azulMedio);
    doc.text("Cliente:", MX+18, Y+7);

    doc.setFont("helvetica","bold");
    doc.setFontSize(9.5);
    rgb(C.pretoTexto);
    const nomeCliente = (cotacao.cliente||"—").toUpperCase();
    doc.text(nomeCliente, MX+18, Y+13.5);

    doc.setFont("helvetica","bold");
    doc.setFontSize(7);
    rgb(C.azulMedio);
    doc.text("CNPJ:", MX+18, Y+20);
    doc.setFont("helvetica","normal");
    doc.setFontSize(7);
    rgb(C.cinzaTexto);
    doc.text(aplicarCNPJMask(cotacao.cnpj), MX+28, Y+20);

    // ícone calendário
    const CX2 = DIV_X + 10;
    drawCal(CX2, Y + CARD_H/2 - 6, 10, 10);

    // datas
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

    doc.setFont("helvetica","bold");
    doc.setFontSize(7);
    rgb(C.azulMedio);
    doc.text("Emissão:", CX2 + 13, Y+7);
    doc.setFont("helvetica","normal");
    doc.setFontSize(8.5);
    rgb(C.pretoTexto);
    doc.text(dataEmissao, CX2 + 13, Y+13);

    doc.setFont("helvetica","bold");
    doc.setFontSize(7);
    rgb(C.azulMedio);
    doc.text("Validade:", CX2 + 13, Y+18.5);
    doc.setFont("helvetica","normal");
    doc.setFontSize(8.5);
    rgb(C.pretoTexto);
    doc.text(validadeTexto, CX2 + 13, Y+23.5);

    Y += CARD_H + 7;

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
        cellPadding: { top:4.5, bottom:4.5, left:4, right:4 },
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
        minCellHeight: 10,
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

    Y = doc.lastAutoTable.finalY + 6;

    // ══════════════════════════════════════════════════════
    // 5. CARD TOTAL
    // ══════════════════════════════════════════════════════
    if (Y + 26 > 272) { doc.addPage(); Y = 16; }

    const TOT_H = 24;
    fill(C.branco);
    draw(C.cinzaLinha);
    doc.setLineWidth(0.4);
    doc.roundedRect(MX, Y, CW, TOT_H, 2, 2, "FD");

    const T3 = CW / 3;

    // divisórias
    draw(C.cinzaLinha);
    doc.setLineWidth(0.3);
    doc.line(MX + T3,     Y+3, MX + T3,     Y+TOT_H-3);
    doc.line(MX + T3*2,   Y+3, MX + T3*2,   Y+TOT_H-3);

    // ── seção 1 — carrinho + valor total ──
    drawCart(MX + 10, Y + TOT_H/2, 7.5);
    doc.setFont("helvetica","bold");
    doc.setFontSize(7.5);
    rgb(C.azulMedio);
    doc.text("VALOR TOTAL:", MX+21, Y+9);
    doc.setFont("helvetica","bold");
    doc.setFontSize(15);
    rgb(C.azulMedio);
    doc.text(fmtMoeda(cotacao.valorTotal), MX+21, Y+19.5);

    // ── seção 2 — check + validade ──
    const S2X = MX + T3 + 6;
    drawCheck(S2X + 6, Y + TOT_H/2, 5.5);
    doc.setFont("helvetica","bold");
    doc.setFontSize(7);
    rgb(C.azulMedio);
    doc.text("VALIDO ATÉ", S2X+15, Y+9.5);
    doc.setFont("helvetica","normal");
    doc.setFontSize(8.5);
    rgb(C.pretoTexto);
    doc.text(validadeTexto.toUpperCase(), S2X+15, Y+17);

    // ── seção 3 — pin + cidade/data ──
    const S3X = MX + T3*2 + 6;
    drawPin(S3X + 6, Y + TOT_H/2 - 1, 5.5);
    doc.setFont("helvetica","bold");
    doc.setFontSize(8);
    rgb(C.pretoTexto);
    doc.text("LUZIÂNIA/GO", S3X+15, Y+9.5);
    doc.setFont("helvetica","normal");
    doc.setFontSize(7.5);
    rgb(C.cinzaTexto);
    doc.text(`${dia} DE ${MESES[parseInt(mes)]} DE ${ano}`, S3X+15, Y+17);

    Y += TOT_H + 6;

    // ══════════════════════════════════════════════════════
    // 6. OBSERVAÇÕES
    // ══════════════════════════════════════════════════════
    if (cotacao.observacoes) {
      if (Y + 22 > 272) { doc.addPage(); Y = 16; }

      const linhasObs = doc.splitTextToSize((cotacao.observacoes||"").toUpperCase(), CW - 22);
      const OBS_H = Math.max(18, 10 + linhasObs.length * 4.5);

      fill(C.cinzaFundo);
      draw(C.cinzaLinha);
      doc.setLineWidth(0.4);
      doc.roundedRect(MX, Y, CW, OBS_H, 2, 2, "FD");

      drawDoc(MX+3, Y + OBS_H/2 - 6, 9, 12);

      doc.setFont("helvetica","bold");
      doc.setFontSize(7.5);
      rgb(C.azulMedio);
      doc.text("OBSERVAÇÕES", MX+16, Y+7);

      doc.setFont("helvetica","normal");
      doc.setFontSize(8.5);
      rgb(C.pretoTexto);
      doc.text(linhasObs, MX+16, Y+13);
      Y += OBS_H + 6;
    }

    // ══════════════════════════════════════════════════════
    // 7. RODAPÉ
    // ══════════════════════════════════════════════════════
    const ROD_H = 18;
    const ROD_Y = 297 - ROD_H;

    gradRect(0, ROD_Y, PW, ROD_H, [8, 28, 95], [18, 65, 155]);

    // divisórias verticais
    doc.setDrawColor(255,255,255);
    doc.setGState(doc.GState({ opacity: 0.3 }));
    doc.setLineWidth(0.3);
    doc.line(PW/3,     ROD_Y+3, PW/3,     ROD_Y+ROD_H-3);
    doc.line(PW/3*2,   ROD_Y+3, PW/3*2,   ROD_Y+ROD_H-3);
    doc.setGState(doc.GState({ opacity: 1 }));

    // slogan
    doc.setFont("helvetica","bolditalic");
    doc.setFontSize(10.5);
    rgb(C.branco);
    doc.text("Obrigado pela preferência!", PW/6, ROD_Y + 10.5, { align:"center" });

    // instagram
    doc.setFont("helvetica","normal");
    doc.setFontSize(7.5);
    doc.setTextColor(170, 205, 255);
    doc.text("@papelariafuturacentro", PW/2, ROD_Y + 10.5, { align:"center" });

    // whatsapp
    doc.text("(61) 99918-4452", PW/6*5, ROD_Y + 10.5, { align:"center" });

    // ── paginação ──
    const totalPags = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPags; p++) {
      doc.setPage(p);
      doc.setFont("helvetica","normal");
      doc.setFontSize(6);
      doc.setTextColor(130, 165, 220);
      doc.text(`Página ${p} de ${totalPags}`, PW - MX, ROD_Y + ROD_H - 2, { align:"right" });
    }

    // ── download ──
    doc.save(`Cotacao_${sanitize(cotacao.cliente)}_${new Date().toISOString().split("T")[0]}.pdf`);
    window.mostrarToast?.("PDF gerado com sucesso!", "success");

  } catch (err) {
    console.error("Erro ao gerar PDF:", err);
    window.mostrarToast?.("Erro ao gerar PDF. Tente novamente.", "error");
  }
}
