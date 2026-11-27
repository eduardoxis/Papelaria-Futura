// Gera arquivos reais com as mesmas bibliotecas do navegador. Sem Firebase.
// Informe PF_TEST_JSPDF / PF_TEST_AUTOTABLE se as bibliotecas estiverem em outro local.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { gerarPDF } from "../js/pdf.js";
import { calcularTotaisOrcamento } from "../js/orcamento-totais.js";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const pasta = path.resolve(
  process.env.PF_PDF_OUTPUT ||
    path.join(raiz, "../orcamento-desconto-qa-testes"),
);
fs.mkdirSync(pasta, { recursive: true });
const contexto = {
  console,
  Uint8Array,
  ArrayBuffer,
  TextEncoder,
  TextDecoder,
  Blob,
  atob,
  btoa,
  setTimeout,
  clearTimeout,
  navigator: { userAgent: "Node.js" },
};
contexto.window = contexto;
contexto.self = contexto;
contexto.globalThis = contexto;
vm.createContext(contexto);
vm.runInContext(
  fs.readFileSync(
    process.env.PF_TEST_JSPDF || path.join(raiz, "../firebase-tests/pdf.js"),
    "utf8",
  ),
  contexto,
);
vm.runInContext(
  fs.readFileSync(
    process.env.PF_TEST_AUTOTABLE ||
      path.join(raiz, "../firebase-tests/table.js"),
    "utf8",
  ),
  contexto,
);
const falhas = [];
const documentos = [];
function JsPDF(...args) {
  const doc = new contexto.jspdf.jsPDF(...args);
  const textos = [],
    textoOriginal = doc.text;
  const tabelaOriginal = doc.autoTable;
  doc.autoTable = function (opcoes) {
    const larguras = Object.values(opcoes.columnStyles || {}).map(
      (c) => c.cellWidth,
    );
    if (larguras.length && larguras.every((v) => typeof v === "number")) {
      const margem = opcoes.margin || {};
      assert.ok(
        larguras.reduce((n, v) => n + v, 0) <=
          this.internal.pageSize.getWidth() -
            (margem.left || 0) -
            (margem.right || 0) +
            0.01,
        "As colunas da tabela devem caber entre as margens do PDF",
      );
    }
    return tabelaOriginal.call(this, opcoes);
  };
  doc.text = function (texto, ...posicao) {
    textos.push(...(Array.isArray(texto) ? texto : [texto]).map(String));
    return textoOriginal.call(this, texto, ...posicao);
  };
  documentos.push({ doc, textos });
  return doc;
}
globalThis.window = {
  jspdf: { jsPDF: JsPDF },
  mostrarToast: (mensagem) => falhas.push(mensagem),
};
globalThis.FileReader = class {
  readAsDataURL(blob) {
    blob
      .arrayBuffer()
      .then((bytes) => {
        this.result =
          "data:" +
          blob.type +
          ";base64," +
          Buffer.from(bytes).toString("base64");
        this.onloadend?.();
        this.onload?.();
      })
      .catch((erro) => this.onerror?.(erro));
  }
};
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (recurso) => {
  assert.ok(
    typeof recurso === "string" &&
      /^(\.\/)?img\/[a-zA-Z0-9_.-]+$/.test(recurso),
    "O gerador só deve acessar as imagens locais",
  );
  const bytes = fs.readFileSync(path.join(raiz, recurso));
  return new Response(bytes, {
    headers: {
      "Content-Type": recurso.endsWith(".jpg") ? "image/jpeg" : "image/png",
    },
  });
};
try {
  const resultados = [];
  for (const modelo of ["original", "fw3", "avenida"]) {
    for (const caso of ["zero", "real", "percentual", "longo"]) {
      const itens = Array.from(
        { length: caso === "longo" ? 55 : 2 },
        (_, i) => ({
          item: i + 1,
          descricao:
            "PRODUTO " +
            String(i + 1).padStart(3, "0") +
            " COM DESCRIÇÃO COMPLETA PARA CONFERÊNCIA",
          marca: "MARCA",
          unidade: "UN",
          quantidade: 2,
          valorUnitario: 25,
          valorTotal: 50,
          entrega: "IMEDIATA",
        }),
      );
      const desconto =
        caso === "real"
          ? { tipo: "real", valor: 12.34 }
          : caso === "zero"
            ? { tipo: "real", valor: 0 }
            : { tipo: "percentual", valor: 10 };
      const totais = calcularTotaisOrcamento(itens, desconto);
      const cotacao = {
        id: "teste-desconto",
        cliente: "CLIENTE PARA VERIFICAÇÃO DO ORÇAMENTO",
        cnpj: "01.064.836/0001-12",
        telefone: "(61) 99999-0000",
        email: "cliente@example.test",
        validade: "2026-12-31",
        observacoes:
          "Dados de teste para conferir os totais e as quebras de página.",
        funcionario: "OPERADOR DE TESTE",
        itens,
        ...totais,
      };
      const arquivo = await gerarPDF(cotacao, modelo, true);
      assert.ok(
        arquivo instanceof Blob,
        modelo + "/" + caso + ": geração deve retornar PDF",
      );
      const gerado = documentos.at(-1),
        textos = gerado.textos.join(" ").replace(/\s/g, "");
      const moeda = (valor) =>
        new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
          .format(valor / 100)
          .replace(/\s/g, "");
      assert.ok(
        textos.includes(moeda(totais.totalCentavos)),
        modelo + "/" + caso + ": total líquido deve aparecer",
      );
      if (totais.descontoCentavos > 0) {
        assert.match(textos, /DESCONTO/i);
        assert.match(textos, /SUBTOTAL/i);
        assert.ok(textos.includes(moeda(totais.descontoCentavos)));
        if (desconto.tipo === "percentual") assert.ok(textos.includes("10%"));
      } else
        assert.doesNotMatch(
          textos,
          /DESCONTO/i,
          "Sem desconto, o documento não deve mostrar a palavra desconto",
        );
      if (caso === "longo")
        assert.ok(gerado.doc.internal.getNumberOfPages() > 1);
      const nome = modelo + "-" + caso + ".pdf";
      fs.writeFileSync(
        path.join(pasta, nome),
        Buffer.from(await arquivo.arrayBuffer()),
      );
      resultados.push({
        arquivo: nome,
        modelo,
        caso,
        itens: itens.length,
        subtotalCentavos: totais.subtotalCentavos,
        descontoCentavos: totais.descontoCentavos,
        totalCentavos: totais.totalCentavos,
      });
    }
  }
  assert.deepEqual(
    falhas,
    [],
    "O gerador não deve emitir erro para nenhum modelo",
  );
  fs.writeFileSync(
    path.join(pasta, "esperado.json"),
    JSON.stringify(resultados, null, 2),
  );
  console.log(
    "OK PDF/GERAÇÃO: 12 PDFs reais, três modelos com R$, %, sem desconto e múltiplas páginas. " +
      pasta,
  );
} finally {
  globalThis.fetch = fetchOriginal;
}
