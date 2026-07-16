// ============================================================
// pdf.js — Gerador de Cotação PDF — Papelaria Futura Centro
// Usa jsPDF + jsPDF-AutoTable (CDN no index.html)
// ============================================================

// ── Carrega uma imagem (caminho relativo) e converte para base64 ──
async function carregarImagemBase64(caminho) {
  const resp = await fetch(caminho);
  if (!resp.ok) throw new Error(`Falha ao carregar imagem: ${caminho}`);
  const blob = await resp.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function gerarPDF(cotacao) {
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
      verde      : [16, 163, 74],
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

    // ── Gradiente radial pra dar efeito "esfera" nos ícones ──
    function gradCircle(cx, cy, r, cEdge, cCenter) {
      const steps = 16;
      for (let i = steps; i >= 0; i--) {
        const t = i / steps;
        const rad = r * (i / steps);
        const col = [
          Math.round(cCenter[0] + (cEdge[0] - cCenter[0]) * t),
          Math.round(cCenter[1] + (cEdge[1] - cCenter[1]) * t),
          Math.round(cCenter[2] + (cEdge[2] - cCenter[2]) * t)
        ];
        fill(col);
        doc.circle(cx, cy, Math.max(rad, 0.01), "F");
      }
    }

    // ── Sombra suave sob o ícone (dá sensação de profundidade) ──
    function iconShadow(cx, cy, r) {
      doc.setGState(doc.GState({ opacity: 0.16 }));
      fill([0, 20, 60]);
      doc.circle(cx + 0.4, cy + 0.9, r * 0.96, "F");
      doc.setGState(doc.GState({ opacity: 1 }));
    }

    // ── Ícone pino localização (formato de gota, como no mapa) ──
    function drawPin(x, y, r) {
      iconShadow(x, y, r);
      const topCy = y - r * 0.18;
      // corpo da gota: círculo em cima + ponta triangular embaixo
      fill(C.azulClaro);
      doc.circle(x, topCy, r, "F");
      doc.triangle(
        x - r * 0.82, topCy + r * 0.42,
        x + r * 0.82, topCy + r * 0.42,
        x, y + r * 1.15,
        "F"
      );
      gradCircle(x, topCy, r, C.azulMedio, C.azulClaro);
      // furo branco central
      fill(C.branco);
      doc.circle(x, topCy, r * 0.42, "F");
    }

    // ── Ícone pessoa ───────────────────────────────────────
    function drawPerson(cx, cy, r) {
      iconShadow(cx, cy, r);
      gradCircle(cx, cy, r, C.azulMedio, C.azulClaro);
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
      iconShadow(cx, cy, r);
      gradCircle(cx, cy, r, C.azulMedio, C.azulClaro);

      // cesto do carrinho (trapézio preenchido)
      fill(C.branco);
      doc.lines(
        [
          [r*1.0, 0],
          [-r*0.18, r*0.5],
          [-r*0.64, 0]
        ],
        cx - r*0.5, cy - r*0.15,
        [1, 1], "F", true
      );
      // divisórias do cesto (detalhe)
      draw(C.azulClaro);
      doc.setLineWidth(0.35);
      doc.line(cx - r*0.18, cy - r*0.15, cx - r*0.24, cy + r*0.32);
      doc.line(cx + r*0.18, cy - r*0.15, cx + r*0.12, cy + r*0.32);
      // rodas
      fill(C.branco);
      doc.circle(cx - r*0.2, cy + r*0.62, r*0.15, "F");
      doc.circle(cx + r*0.28, cy + r*0.62, r*0.15, "F");
      // alça
      doc.setDrawColor(255,255,255);
      doc.setLineWidth(0.8);
      doc.line(cx - r*0.75, cy - r*0.55, cx - r*0.5, cy - r*0.15);
    }

    // ── Ícone check ────────────────────────────────────────
    function drawCheck(cx, cy, r) {
      iconShadow(cx, cy, r);
      gradCircle(cx, cy, r, [10, 130, 60], [34, 197, 110]);
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
    // 1. CABEÇALHO — imagem do banner Papelaria Futura
    // ══════════════════════════════════════════════════════
    const CAB_H = PW * (381 / 1126); // mantém a proporção original da imagem (≈71mm)

    try {
      const headerImg = await carregarImagemBase64("img/header-cotacao.jpg");
      doc.addImage(headerImg, "JPEG", 0, 0, PW, CAB_H);
    } catch (e) {
      console.error("Erro ao carregar imagem do cabeçalho:", e);
      // Fallback: gradiente azul simples caso a imagem não carregue
      gradRect(0, 0, PW, CAB_H, [8, 28, 95], [20, 70, 160]);
    }

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
    const DIV_X = PW/2 + 10;

    // Nome do cliente — ajusta tamanho/quebra para não sobrepor a área da data
    const nomeCliente = (cotacao.cliente || "—").toUpperCase();
    const maxNomeWidth = DIV_X - (MX + 20) - 3;

    doc.setFont("helvetica", "bold");
    let nomeFontSize = 9.5;
    doc.setFontSize(nomeFontSize);
    while (doc.getTextWidth(nomeCliente) > maxNomeWidth && nomeFontSize > 6.5) {
      nomeFontSize -= 0.5;
      doc.setFontSize(nomeFontSize);
    }

    let nomeLines = [nomeCliente];
    if (doc.getTextWidth(nomeCliente) > maxNomeWidth) {
      nomeLines = doc.splitTextToSize(nomeCliente, maxNomeWidth).slice(0, 2);
    }

    const nomeExtraH = nomeLines.length > 1 ? 5 : 0;
    const CARD_H = 26 + nomeExtraH;

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
    doc.setFontSize(nomeFontSize);
    rgb(C.pretoTexto);
    if (nomeLines.length > 1) {
      doc.text(nomeLines[0], MX + 20, Y + 12.5);
      doc.text(nomeLines[1], MX + 20, Y + 12.5 + nomeExtraH);
    } else {
      doc.text(nomeLines[0], MX + 20, Y + 14);
    }

    const cnpjY = Y + 20.5 + nomeExtraH;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    rgb(C.azulMedio);
    doc.text("CNPJ:", MX + 20, cnpjY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    rgb(C.cinzaTexto);
    doc.text(aplicarCNPJMask(cotacao.cnpj) || "—", MX + 31, cnpjY);

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
    doc.text("EMISSÃO", CX2 + 14, Y + 6.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    rgb(C.pretoTexto);
    doc.text(dataEmissao, CX2 + 14, Y + 12.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    rgb(C.azulMedio);
    doc.text("VALIDADE", CX2 + 14, Y + 18.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    rgb(C.pretoTexto);
    doc.text(validadeTexto, CX2 + 14, Y + 24);

    Y += CARD_H + 8;

    // ══════════════════════════════════════════════════════
    // 4. TABELA
    // ══════════════════════════════════════════════════════
    const itens = (cotacao.itens||[]).map((it, i) => [
      String(i+1),
      (it.descricao||"—").toUpperCase(),
      (it.marca||"-").toUpperCase(),
      (it.unidade||"-").toUpperCase(),
      fmtNum(it.quantidade),
      fmtMoeda(it.valorUnitario),
      fmtMoeda(it.valorTotal),
    ]);

    doc.autoTable({
      startY: Y,
      head: [["ITEM","DESCRIÇÃO / PRODUTO","MARCA","UNIDADE\nDE MEDIDA","QUANTIDADE","VALOR UNITÁRIO","VALOR TOTAL"]],
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
        minCellHeight: 14,
      },
      columnStyles: {
        0: { cellWidth: 14,  halign:"center", fontStyle:"bold" },
        1: { cellWidth: "auto" },
        2: { cellWidth: 24,  halign:"center" },
        3: { cellWidth: 22,  halign:"center" },
        4: { cellWidth: 22,  halign:"center" },
        5: { cellWidth: 30,  halign:"right"  },
        6: { cellWidth: 30,  halign:"right",  fontStyle:"bold" },
      },
      alternateRowStyles: { fillColor: [234, 241, 251] },
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
    // 6. ENTREGA (opcional — só aparece se algum campo foi preenchido)
    // ══════════════════════════════════════════════════════
    const entrega = cotacao.entrega || {};
    const temEntrega = entrega.cliente || entrega.local || entrega.horaSaida || entrega.horaVolta;
    if (temEntrega) {
      if (Y + 24 > 272) { doc.addPage(); Y = 16; }

      const linhasEntrega = [];
      if (entrega.cliente)   linhasEntrega.push(`CLIENTE: ${entrega.cliente}`);
      if (entrega.local)     linhasEntrega.push(`LOCAL: ${entrega.local}`);
      if (entrega.horaSaida) linhasEntrega.push(`SAÍDA: ${entrega.horaSaida}    VOLTA: ${entrega.horaVolta || "—"}`);
      else if (entrega.horaVolta) linhasEntrega.push(`VOLTA: ${entrega.horaVolta}`);

      const ENT_H = Math.max(20, 12 + linhasEntrega.length * 5);

      doc.setGState(doc.GState({ opacity: 0.05 }));
      fill([0, 45, 148]);
      doc.roundedRect(MX + 0.8, Y + 0.8, CW, ENT_H, 2.5, 2.5, "F");
      doc.setGState(doc.GState({ opacity: 1 }));

      fill(C.cinzaFundo);
      draw(C.cinzaLinha);
      doc.setLineWidth(0.35);
      doc.roundedRect(MX, Y, CW, ENT_H, 2.5, 2.5, "FD");

      fill(C.azulMedio);
      doc.roundedRect(MX, Y, 3, ENT_H, 2, 2, "F");
      fill(C.cinzaFundo);
      doc.rect(MX + 1.5, Y, 2, ENT_H, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      rgb(C.azulMedio);
      doc.text("ENTREGA", MX + 8, Y + 8);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      rgb(C.pretoTexto);
      doc.text(linhasEntrega, MX + 8, Y + 14.5);

      Y += ENT_H + 7;
    }

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
    doc.text("@futurapapelaria", PW/2, ROD_Y + 11, { align:"center" });

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

// ============================================================
// PDF — Comissão por Cotação Ganhada (painel do criador)
// Exporta exatamente a lista já filtrada (aba Todas/Pagas/Não Pagas
// + busca por cliente) recebida do admin.js.
// ============================================================
export function gerarPdfComissaoCriador(cotacoes, percentual, rotuloStatus = "Todas Ganhas") {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    const MX = 14;
    const pct = (Number(percentual) || 0) / 100;

    function fmtMoeda(v) {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
    }
    function fmtData(d) {
      if (!d) return "—";
      const dt = d?.toDate ? d.toDate() : (d instanceof Date ? d : new Date(d));
      return dt.toLocaleDateString("pt-BR");
    }

    let Y = 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Papelaria Futura — Comissão por Cotação Ganhada", MX, Y);

    Y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(`Filtro: ${rotuloStatus}`, MX, Y);
    Y += 5;
    doc.text(`Percentual de comissão: ${pct * 100}%`, MX, Y);
    Y += 5;
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, MX, Y);
    Y += 8;

    const valorTotal = cotacoes.reduce((s, c) => s + (Number(c.valorTotal) || 0), 0);
    const comissaoTotal = valorTotal * pct;

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Resumo", MX, Y);
    Y += 4;

    doc.autoTable({
      startY: Y,
      head: [["Qtd. Cotações", "Valor Total Aprovado", "Comissão Total"]],
      body: [[String(cotacoes.length), fmtMoeda(valorTotal), fmtMoeda(comissaoTotal)]],
      margin: { left: MX, right: MX },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [21, 82, 181] },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } }
    });
    Y = doc.lastAutoTable.finalY + 10;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Cotações", MX, Y);
    Y += 4;

    const body = cotacoes.map(c => {
      const comissao = (Number(c.valorTotal) || 0) * pct;
      return [
        c.cliente || "—",
        fmtData(c.dataCriacao),
        fmtMoeda(c.valorTotal || 0),
        c.pagoLoja ? "Paga" : "Pendente",
        fmtMoeda(comissao),
        c.comissaoCriadorPaga ? "Paga" : "Pendente"
      ];
    });

    doc.autoTable({
      startY: Y,
      head: [["Cliente", "Data", "Valor Cotação", "Cotação Paga (Loja)", "Comissão", "Pagamento Comissão"]],
      body,
      margin: { left: MX, right: MX },
      styles: { fontSize: 8 },
      headStyles: { fillColor: [21, 82, 181] },
      columnStyles: { 2: { halign: "right" }, 4: { halign: "right" } }
    });

    const sufixo = rotuloStatus.replace(/\s+/g, "_");
    doc.save(`Comissao_Cotacoes_${sufixo}_${new Date().toISOString().split("T")[0]}.pdf`);

    window.mostrarToast?.("PDF gerado com sucesso!", "success");
  } catch (err) {
    console.error("Erro ao gerar PDF de comissão por cotação ganhada:", err);
    window.mostrarToast?.("Erro ao gerar PDF. Tente novamente.", "error");
  }
}
export function gerarPdfFechamentoCaixa(relatorio, vendedor = null) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    const PW = 210;
    const MX = 14;

    function fmtMoeda(v) {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
    }
    function fmtData(d) {
      const dt = d?.toDate ? d.toDate() : (d instanceof Date ? d : new Date(d));
      return dt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    let Y = 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Papelaria Futura — Fechamento de Caixa", MX, Y);

    Y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(`Aberto em: ${fmtData(relatorio.abertoEm)}`, MX, Y);
    Y += 5;
    doc.text(`Fechamento gerado em: ${fmtData(relatorio.fechadoEm)}`, MX, Y);
    Y += 5;
    doc.text(`Responsável pelo fechamento: ${relatorio.operadorFechamento}`, MX, Y);
    Y += 10;

    doc.setTextColor(0, 0, 0);

    if (!vendedor) {
      // ── Relatório GERAL ─────────────────────────────────
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Resumo Geral", MX, Y);
      Y += 4;

      doc.autoTable({
        startY: Y,
        head: [["Total de vendas", "Valor total"]],
        body: [[String(relatorio.qtdVendasGeral), fmtMoeda(relatorio.totalGeral)]],
        margin: { left: MX, right: MX },
        styles: { fontSize: 9 },
        headStyles: { fillColor: [21, 82, 181] }
      });
      Y = doc.lastAutoTable.finalY + 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Por Forma de Pagamento", MX, Y);
      Y += 4;

      const formasBody = Object.entries(relatorio.porFormaPagamento).map(([forma, total]) => [forma, fmtMoeda(total)]);
      doc.autoTable({
        startY: Y,
        head: [["Forma de Pagamento", "Total"]],
        body: formasBody.length ? formasBody : [["—", "—"]],
        margin: { left: MX, right: MX },
        styles: { fontSize: 9 },
        headStyles: { fillColor: [21, 82, 181] },
        columnStyles: { 1: { halign: "right" } }
      });
      Y = doc.lastAutoTable.finalY + 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Por Vendedor", MX, Y);
      Y += 4;

      const vendedoresBody = relatorio.porVendedor.map(v => [v.nome, String(v.vendas.length), fmtMoeda(v.total)]);
      doc.autoTable({
        startY: Y,
        head: [["Vendedor", "Vendas", "Total"]],
        body: vendedoresBody.length ? vendedoresBody : [["—", "—", "—"]],
        margin: { left: MX, right: MX },
        styles: { fontSize: 9 },
        headStyles: { fillColor: [21, 82, 181] },
        columnStyles: { 2: { halign: "right" } }
      });

      doc.save(`Fechamento_Caixa_Geral_${new Date().toISOString().split("T")[0]}.pdf`);
    } else {
      // ── Relatório POR VENDEDOR ──────────────────────────
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(`Vendedor: ${vendedor.nome}`, MX, Y);
      Y += 6;

      doc.autoTable({
        startY: Y,
        head: [["Total de vendas", "Valor total"]],
        body: [[String(vendedor.vendas.length), fmtMoeda(vendedor.total)]],
        margin: { left: MX, right: MX },
        styles: { fontSize: 9 },
        headStyles: { fillColor: [21, 82, 181] }
      });
      Y = doc.lastAutoTable.finalY + 10;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Vendas", MX, Y);
      Y += 4;

      const vendasBody = vendedor.vendas.map(v => [
        fmtData(v.criadoEm), `#${v.numero ?? "—"}`, v.formaPagamento || "—", fmtMoeda(v.total || 0)
      ]);
      doc.autoTable({
        startY: Y,
        head: [["Data", "Nº", "Forma Pagto.", "Total"]],
        body: vendasBody.length ? vendasBody : [["—", "—", "—", "—"]],
        margin: { left: MX, right: MX },
        styles: { fontSize: 9 },
        headStyles: { fillColor: [21, 82, 181] },
        columnStyles: { 3: { halign: "right" } }
      });

      doc.save(`Fechamento_Caixa_${vendedor.nome.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`);
    }

    window.mostrarToast?.("PDF gerado com sucesso!", "success");
  } catch (err) {
    console.error("Erro ao gerar PDF de fechamento:", err);
    window.mostrarToast?.("Erro ao gerar PDF. Tente novamente.", "error");
  }
}
