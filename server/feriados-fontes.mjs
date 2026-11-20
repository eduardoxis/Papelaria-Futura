import { createHash } from "node:crypto";
import { load } from "cheerio";
import { PDFParse } from "pdf-parse";
import { dataValida } from "../js/escalas-core.js";
import { normalizar, consolidarEventos } from "../js/calendario-core.js";

export const FONTES_INICIAIS = {
  uniao: [
    "https://www.planalto.gov.br/ccivil_03/leis/l0662.htm",
    "https://www.planalto.gov.br/ccivil_03/leis/l6802.htm",
    "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm",
  ],
  mgi2026:
    "https://www.in.gov.br/en/web/dou/-/portaria-mgi-n-11.460-de-29-de-dezembro-de-2025-678388627",
  municipio2026: [
    "https://www.luziania.go.gov.br/decreto-no-005-de-12-de-janeiro-de-2026/",
    "https://www.luziania.go.gov.br/wp-content/uploads/2026/01/DECRETO-No-005-DE-12-DE-JANEIRO-DE-2026-ANEXO.pdf",
    "https://www.luziania.go.gov.br/wp-content/uploads/2025/12/DECRETO-No-427-DE-30-DE-DEZEMBRO-DE-2025-1.pdf",
  ],
  goiasLei:
    "https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/100979",
  goiasBusca: "https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes",
};
const MESES = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const rxMes = MESES.join("|");
const agora = () => new Date().toISOString();
export const hashConteudo = (conteudo) =>
  createHash("sha256").update(conteudo).digest("hex");
export function urlOficial(url) {
  const u = new URL(url);
  return (
    u.protocol === "https:" &&
    !u.username &&
    !u.password &&
    (!u.port || u.port === "443") &&
    [
      "planalto.gov.br",
      "in.gov.br",
      "legis.sigepe.gov.br",
      "legisla.casacivil.go.gov.br",
      "diariooficial.abc.go.gov.br",
      "luziania.go.gov.br",
    ].some((host) => u.hostname === host || u.hostname === "www." + host)
  );
}
export async function baixarOficial(url) {
  if (!urlOficial(url))
    throw Error("Documento fora dos portais oficiais permitidos.");
  let destino = url;
  for (let salto = 0; salto < 4; salto++) {
    const resposta = await fetch(destino, {
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
      headers: {
        Accept: "text/html,application/pdf,application/json;q=0.9",
        "User-Agent": "PapelariaFutura-Calendario/1.0",
      },
    });
    if (resposta.status >= 300 && resposta.status < 400) {
      const local = resposta.headers.get("location");
      if (!local) throw Error("Redirecionamento oficial sem destino.");
      destino = new URL(local, destino).href;
      if (!urlOficial(destino))
        throw Error("Redirecionamento para um domínio não autorizado.");
      continue;
    }
    if (!resposta.ok) throw Error(`Portal retornou HTTP ${resposta.status}.`);
    const limite = 8 * 1024 * 1024;
    if (Number(resposta.headers.get("content-length") || 0) > limite)
      throw Error("Documento oficial excede 8 MB.");
    const leitor = resposta.body.getReader(),
      partes = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await leitor.read();
        if (done) break;
        total += value.length;
        if (total > limite) throw Error("Documento oficial excede 8 MB.");
        partes.push(value);
      }
    } finally {
      await leitor.cancel().catch(() => {});
    }
    return {
      url: destino,
      bytes: Buffer.concat(partes),
      tipo: resposta.headers.get("content-type") || "",
      verificadoEm: agora(),
    };
  }
  throw Error("Muitos redirecionamentos no portal oficial.");
}
function decodificar(doc) {
  const inicial = doc.bytes.subarray(0, 3000).toString("ascii");
  const declaracao = /charset=/i.test(doc.tipo) ? doc.tipo : inicial;
  const latin = /charset\s*=\s*["']?(?:iso-8859-1|windows-1252)/i.test(
    declaracao,
  );
  return new TextDecoder(latin ? "windows-1252" : "utf-8").decode(doc.bytes);
}
export async function lerDocumento(doc) {
  if (
    doc.tipo.includes("pdf") ||
    doc.bytes.subarray(0, 5).toString() === "%PDF-"
  ) {
    const leitor = new PDFParse({ data: new Uint8Array(doc.bytes) });
    try {
      const resultado = await leitor.getText();
      return {
        ...doc,
        texto: resultado.text,
        hash: hashConteudo(doc.bytes),
        paginas: resultado.total || resultado.pages?.length || 1,
      };
    } finally {
      await leitor.destroy();
    }
  }
  const html = decodificar(doc),
    $ = load(html);
  $("script,style,nav,footer,header,strike,s,del").remove();
  $("br").replaceWith("\n");
  $("p,li,tr,h1,h2,h3").each((_, el) => $(el).append("\n"));
  const principal = $(".texto-dou").length
    ? $(".texto-dou")
    : $("#content-core").length
      ? $("#content-core")
      : $("body");
  return {
    ...doc,
    html,
    texto: principal
      .text()
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " "),
    hash: hashConteudo(doc.bytes),
    paginas: 1,
  };
}
function dataExtenso(texto, ano) {
  const rx = new RegExp(
    `(\\d{1,2})[º°o]?\\s*(?:de\\s+)?(${rxMes})(?:\\s*(?:de|/)\\s*(\\d{4}))?`,
    "gi",
  );
  return [...normalizar(texto).matchAll(rx)]
    .map((m) => ({
      data: `${m[3] || ano}-${String(MESES.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`,
      indice: m.index,
      texto: m[0],
    }))
    .filter((v) => dataValida(v.data) && v.data.startsWith(String(ano)));
}
function fonte(
  doc,
  orgao,
  ato,
  artigo = "Anexo / texto oficial",
  publicadoEm = null,
) {
  return {
    url: doc.url,
    orgao,
    ato,
    artigo,
    publicadoEm,
    dataAto: dataDoAto(doc),
    ultimaVerificacao: doc.verificadoEm,
    hash: doc.hash,
    trecho: doc.texto.slice(0, 1200),
  };
}
export function dataDoAto(doc) {
  const norm = normalizar(doc.texto);
  const assinatura = norm.match(
    new RegExp(`aos\\s+(\\d{1,2})\\b.{0,65}?(${rxMes})\\s+de\\s+(\\d{4})`),
  );
  if (assinatura)
    return `${assinatura[3]}-${String(MESES.indexOf(assinatura[2]) + 1).padStart(2, "0")}-${assinatura[1].padStart(2, "0")}`;
  const cabecalho = norm
    .slice(0, 1500)
    .match(
      new RegExp(
        `(?:decreto|portaria|lei)[\\s\\S]{0,80}?de\\s+(\\d{1,2})\\s+de\\s+(${rxMes})\\s+de\\s+(\\d{4})`,
      ),
    );
  return cabecalho
    ? `${cabecalho[3]}-${String(MESES.indexOf(cabecalho[2]) + 1).padStart(2, "0")}-${cabecalho[1].padStart(2, "0")}`
    : null;
}
function criarEvento(data, nome, natureza, abrangencia, base, opcoes = {}) {
  const nomeOficial = nome
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[;,.]$/, "");
  return {
    data,
    nome: nomeOficial.replace(/evangélico/gi, "Evangélico"),
    nomeOficial,
    natureza,
    abrangencia,
    localidade:
      abrangencia === "nacional"
        ? "Brasil"
        : abrangencia === "estadual"
          ? "Goiás"
          : "Luziânia–GO",
    publico: "administracao_publica",
    aplicabilidade: natureza === "feriado" ? "pendente" : "nao_aplicavel",
    periodo: { diaInteiro: true, inicio: null, fim: null },
    fontes: [base],
    ultimaVerificacao: base.ultimaVerificacao,
    vigente: true,
    ...opcoes,
  };
}
export function extrairAnexoMunicipal(doc, ano) {
  if (
    !/M[EÊ]S\s+DIA\s+MOTIVO\s+NATUREZA/i.test(doc.texto) ||
    (!new RegExp(
      "calend[aá]rio[\\s\\S]{0,80}" + ano + "|janeiro de " + ano,
      "i",
    ).test(doc.texto) &&
      !doc.url.includes(String(ano)))
  )
    throw Error("Anexo municipal não reconhecido para o ano solicitado.");
  const linhas = doc.texto
    .slice(doc.texto.search(/M[EÊ]S\s+DIA\s+MOTIVO\s+NATUREZA/i))
    .split(/\n/);
  let mes = null;
  const eventos = [];
  for (const original of linhas) {
    let linha = original.trim(),
      norm = normalizar(linha);
    const mesLinha = MESES.findIndex(
      (m) => norm === m || norm.startsWith(m + " "),
    );
    if (mesLinha >= 0) {
      mes = mesLinha + 1;
      linha = linha.replace(/^\S+\s*/, "");
    }
    if (!linha || !mes) continue;
    const m = linha.match(
      /^(\d{1,2})[°º]?\s*\([^)]*\)\s*(.+?)\s+(Feri(?:ad|and)o|Ponto Facultativo|Suspens[aã]o de expediente)\s*(Nacional|Estadual|Municipal)?\s*(.*)$/i,
    );
    if (!m) continue;
    const data = `${ano}-${String(mes).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (!dataValida(data))
      throw Error("Data inválida extraída do anexo municipal.");
    const natureza = /^Feri/i.test(m[3])
      ? "feriado"
      : /Ponto/i.test(m[3])
        ? "ponto_facultativo"
        : "suspensao";
    const abrangencia = normalizar(m[4] || "municipal");
    eventos.push(
      criarEvento(
        data,
        m[2],
        natureza,
        abrangencia,
        fonte(
          doc,
          "Prefeitura de Luziânia",
          "Anexo do calendário " + ano,
          "Anexo I, página 1",
        ),
      ),
    );
  }
  if (eventos.length < 5)
    throw Error(
      "Extração incompleta do anexo municipal. Último calendário será preservado.",
    );
  return eventos;
}
export function extrairPortariaMgi(doc, ano) {
  const trecho = doc.texto
    .split(/Art\.\s*1[ºo°]?/i)[1]
    ?.split(/Art\.\s*2[ºo°]?/i)[0];
  if (!trecho || !new RegExp("ano de\\s+" + ano).test(normalizar(trecho)))
    throw Error("Portaria MGI do ano solicitado não identificada.");
  const linhas = trecho.split(/\n|(?=\b[IVXLCDM]+\s*[-–])/);
  const ato =
    doc.texto.match(
      /PORTARIA\s+MGI\s+N[º°o]?\s*([\d.]+)[\s,]+DE[^\n]+/i,
    )?.[0] || "Portaria MGI de feriados " + ano;
  const eventos = [];
  for (const linha of linhas) {
    const natureza = /(?:feriado nacional)/i.test(linha)
      ? "feriado"
      : /ponto\s+facultativo/i.test(linha)
        ? "ponto_facultativo"
        : null;
    if (!natureza) continue;
    const data = dataExtenso(linha, ano)[0]?.data;
    if (!data) continue;
    const nome =
      linha.match(
        /(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*,\s*(.*?)\s*\(/i,
      )?.[1] || "Ponto facultativo";
    const evento = criarEvento(
      data,
      nome,
      natureza,
      "nacional",
      fonte(
        doc,
        "MGI / Diário Oficial da União",
        ato,
        "Art. 1º, " + linha.trim().split(/\s/)[0],
      ),
    );
    const parcial = linha.match(
      /(até|após|a partir d[ae]s?)\s*(?:as|às)?\s*(\d{1,2})(?:[h:]([0-5]\d))?\s*(?:horas|h)?/i,
    );
    if (parcial) {
      const h = parcial[2].padStart(2, "0") + ":" + (parcial[3] || "00");
      evento.periodo = {
        diaInteiro: false,
        inicio: /até/i.test(parcial[1]) ? "00:00" : h,
        fim: /até/i.test(parcial[1]) ? h : "23:59",
      };
    }
    eventos.push(evento);
  }
  if (eventos.length < 8) throw Error("Lista anual MGI incompleta.");
  return eventos;
}
export function extrairLeiFederal(doc, ano, nomes = []) {
  if (!/(feriado|feriados)\s+naciona/i.test(doc.texto))
    throw Error("Lei federal instituidora não reconhecida.");
  const principal =
    doc.texto.match(
      /Art\.\s*1[º°o]?[\s\S]*?(?=Art\.\s*2[º°o]?|\n\s*Bras[ií]lia)/i,
    )?.[0] || "";
  const datas = dataExtenso(principal, ano);
  if (!datas.length) throw Error("Nenhuma data identificada na lei federal.");
  const numero =
    doc.texto.match(/LEI\s+N[º°o]?\s*([\d.]+)/i)?.[1] ||
    doc.url.split("/").at(-1);
  return datas.map(({ data }) => {
    const anual = nomes.find(
      (e) =>
        e.data.slice(5) === data.slice(5) &&
        e.natureza === "feriado" &&
        e.abrangencia === "nacional",
    );
    const nome =
      anual?.nomeOficial ||
      principal.match(/consagrad[oa]\s+(?:a[oà]?\s+)?(.+?)(?:[.;]|$)/i)?.[1] ||
      `Feriado nacional — Lei ${numero}`;
    return criarEvento(
      data,
      nome,
      "feriado",
      "nacional",
      fonte(doc, "Presidência da República", "Lei " + numero, "Art. 1º"),
      { publico: "geral", aplicabilidade: "confirmada", recorrente: true },
    );
  });
}
function linksDaPagina(doc, predicado) {
  const $ = load(doc.html || doc.texto),
    links = [];
  $("a[href]").each((_, el) => {
    try {
      const url = new URL($(el).attr("href"), doc.url).href;
      if (urlOficial(url) && predicado(url, $(el).text())) links.push(url);
    } catch {}
  });
  return [...new Set(links)];
}
async function consultar(esfera, ano, leitor) {
  const documentos = [],
    falhas = [];
  const prazo = Date.now() + 30000;
  const obter = async (url) => {
    if (Date.now() > prazo) {
      falhas.push({
        url,
        erro: "Tempo de consulta da esfera esgotado; dados anteriores preservados.",
      });
      return null;
    }
    try {
      const doc = await lerDocumento(await leitor(url));
      documentos.push({
        url: doc.url,
        hash: doc.hash,
        ultimaVerificacao: doc.verificadoEm,
      });
      return doc;
    } catch (erro) {
      falhas.push({ url, erro: erro.message });
      return null;
    }
  };
  let eventos = [],
    anual = false;
  if (esfera === "uniao") {
    const buscaUrl = `https://www.in.gov.br/consulta/-/buscar/dou?q=${encodeURIComponent("MGI feriados " + ano)}`;
    const [busca, sigepe] = await Promise.all([
      obter(buscaUrl),
      obter("https://legis.sigepe.gov.br/"),
    ]);
    const candidatos = busca
      ? linksDaPagina(
          busca,
          (url, titulo) =>
            url.includes("/-/") &&
            /portaria.*mgi/i.test(titulo + " " + url) &&
            /feriad|calend|dezembro/i.test(titulo + " " + url),
        )
      : [];
    if (ano === 2026) candidatos.unshift(FONTES_INICIAIS.mgi2026);
    for (const url of [...new Set(candidatos)].slice(0, 6)) {
      const doc = await obter(url);
      if (!doc) continue;
      try {
        eventos.push(...extrairPortariaMgi(doc, ano));
        anual = true;
      } catch (erro) {
        falhas.push({ url, erro: erro.message });
      }
    }
    const leis = await Promise.all(FONTES_INICIAIS.uniao.map(obter));
    for (const doc of leis.filter(Boolean))
      try {
        eventos.push(...extrairLeiFederal(doc, ano, eventos));
      } catch (erro) {
        falhas.push({ url: doc.url, erro: erro.message });
      }
    if (sigepe && !/feriados.*\d{4}/i.test(sigepe.texto))
      falhas.push({
        url: sigepe.url,
        erro: "Portal Sigepe depende de consulta dinâmica; ato anual está sendo conferido no DOU.",
      });
  } else if (esfera === "luziania") {
    const busca = await obter(
      `https://www.luziania.go.gov.br/?s=${encodeURIComponent("feriados " + ano)}`,
    );
    const paginas = busca
      ? linksDaPagina(
          busca,
          (url, titulo) =>
            !/uploads|search|\/tag\//i.test(url) &&
            /decreto|feriad|calend/i.test(titulo + " " + url),
        ).slice(0, 10)
      : [];
    if (ano === 2026) paginas.unshift(FONTES_INICIAIS.municipio2026[0]);
    const conteudos = await Promise.all(
      [...new Set(paginas)].slice(0, 8).map(obter),
    );
    const pdfs = conteudos
      .filter(Boolean)
      .flatMap((doc) =>
        linksDaPagina(doc, (url) => /\.pdf(?:\?|$)/i.test(url)),
      );
    if (ano === 2026) pdfs.push(...FONTES_INICIAIS.municipio2026.slice(1));
    const tabelas = [];
    for (const url of [...new Set(pdfs)].slice(0, 14)) {
      const doc = await obter(url);
      if (!doc) continue;
      if (!/M[EÊ]S\s+DIA\s+MOTIVO\s+NATUREZA/i.test(doc.texto)) {
        if (/anexo/i.test(url))
          falhas.push({
            url,
            erro: "Formato do anexo não reconhecido. A versão anterior será mantida.",
          });
        continue;
      }
      try {
        const extraidos = extrairAnexoMunicipal(doc, ano);
        const dataAto = dataDoAto(doc);
        if (!dataAto)
          throw Error(
            "Data de assinatura do anexo não identificada; a ordem de versões precisa de revisão.",
          );
        tabelas.push({ dataAto, eventos: extraidos, url });
      } catch (erro) {
        falhas.push({ url, erro: erro.message });
      }
    }
    tabelas.sort((a, b) => a.dataAto.localeCompare(b.dataAto));
    eventos = tabelas.at(-1)?.eventos || [];
    anual = eventos.length > 0;
    for (const evento of eventos)
      evento.historicoOficial = tabelas.flatMap((t) =>
        t.eventos
          .filter(
            (e) =>
              e.nomeOficial === evento.nomeOficial && e.data !== evento.data,
          )
          .map((e) => ({ data: e.data, fontes: e.fontes, atoEm: t.dataAto })),
      );
    // Procura a norma instituidora, sem promover um calendário administrativo a lei geral.
    const municipais = eventos.filter((e) => e.abrangencia === "municipal");
    for (const ev of municipais) {
      const buscaLei = await obter(
        `https://www.luziania.go.gov.br/?s=${encodeURIComponent(ev.nome + " lei")}`,
      );
      const leis = buscaLei
        ? linksDaPagina(
            buscaLei,
            (url, titulo) =>
              /lei[-_]|lei\s+(?:n|municipal)/i.test(url + " " + titulo) &&
              !/decreto|\/tag\//i.test(url),
          ).slice(0, 2)
        : [];
      for (const url of leis) {
        const pagina = await obter(url);
        if (!pagina) continue;
        const anexos = linksDaPagina(pagina, (url) =>
          /\.pdf(?:\?|$)/i.test(url),
        ).slice(0, 2);
        const conteudo = anexos.length ? await obter(anexos[0]) : pagina;
        if (
          conteudo &&
          normalizar(conteudo.texto).includes(
            normalizar(ev.nomeOficial).replace(/^dia do /, ""),
          ) &&
          /fica.*feriado|institui.*feriado|feriado.*municipal/i.test(
            conteudo.texto,
          ) &&
          !/somente.*reparti|exclusiv.*servidor/i.test(conteudo.texto)
        ) {
          ev.aplicabilidade = "confirmada";
          ev.publico = "geral";
          ev.fontes.push(
            fonte(
              conteudo,
              "Prefeitura de Luziânia",
              "Lei municipal instituidora",
              "Texto legal",
            ),
          );
        }
      }
    }
  } else {
    const [base, busca] = await Promise.all([
      obter(FONTES_INICIAIS.goiasLei),
      obter(`${FONTES_INICIAIS.goiasBusca}?ano=${ano}&categoria_legislacao=52`),
    ]);
    let lei = null;
    try {
      lei = base ? JSON.parse(decodificar(base)) : null;
    } catch {}
    if (lei?.conteudo_sem_formatacao) {
      const artigo =
        lei.conteudo_sem_formatacao
          .split("Art. 269.")[1]
          ?.split("Art. 270.")[0] || "";
      const estaduais =
        artigo.split("II - estaduais:")[1]?.split("§ 1º")[0] || "";
      for (const item of estaduais.split(/(?=[a-z]\)\s*\d)/i)) {
        if (/revogada/i.test(item)) continue;
        const data = dataExtenso(item, ano)[0]?.data;
        const nome = item.match(/,\s*(.+?)(?:;|$)/)?.[1];
        if (data && nome)
          eventos.push(
            criarEvento(
              data,
              nome,
              "feriado",
              "estadual",
              fonte(
                { ...base, texto: artigo },
                "Casa Civil de Goiás",
                "Lei estadual " + lei.numero,
                "Art. 269 II",
              ),
              {
                publico: "administracao_publica",
                aplicabilidade: "nao_aplicavel",
              },
            ),
          );
      }
    }
    let lista = [];
    try {
      const j = busca ? JSON.parse(decodificar(busca)) : null;
      lista = j?.resultados || [];
      if (j && j.total_resultados > lista.length)
        falhas.push({
          url: busca.url,
          erro: "Busca estadual paginada; existem publicações adicionais a conferir.",
        });
    } catch {}
    const atos = await Promise.all(
      lista.slice(0, 20).map(async (item) => {
        const doc = await obter(`${FONTES_INICIAIS.goiasBusca}/${item.id}`);
        if (!doc) return null;
        try {
          return { doc, json: JSON.parse(decodificar(doc)), resumo: item };
        } catch {
          return null;
        }
      }),
    );
    for (const item of atos.filter(Boolean)) {
      const texto =
        item.json.conteudo_sem_formatacao ||
        load(item.json.conteudo || "").text();
      const artigos =
        texto
          .split(/DECRETA\s*:/i)[1]
          ?.split(/Art\.\s*\d+[º°]?\s+(?:Este Decreto|Fica revogad)/i)[0] || "";
      const datas = dataExtenso(
        artigos.replace(/,\s*v[eé]spera do feriado[^.]*\./gi, "."),
        ano,
      );
      if (!datas.length) {
        falhas.push({
          url: item.doc.url,
          erro: "Ato estadual sem datas extraídas com segurança; revisão necessária.",
        });
        continue;
      }
      const transferencia = /transfere|transferido/i.test(
        item.json.ementa + " " + artigos,
      );
      const nome = item.json.ementa.replace(/\.$/, "");
      const tipo = /ponto facultativo/i.test(artigos)
        ? "ponto_facultativo"
        : /suspens|expediente/i.test(artigos)
          ? "suspensao"
          : "feriado";
      const baseFonte = fonte(
        { ...item.doc, texto },
        "Casa Civil de Goiás",
        "Decreto " + item.json.numero,
        "Artigos do ato",
      );
      baseFonte.dataAto = item.json.data_legislacao || baseFonte.dataAto;
      if (
        transferencia &&
        /funda[cç][aã]o da Cidade de Goi[aá]s/i.test(artigos)
      ) {
        const anterior = eventos.find((e) =>
          /funda[cç][aã]o da cidade/i.test(e.nome),
        );
        if (anterior) {
          anterior.data = datas[0].data;
          anterior.fontes.push(baseFonte);
          continue;
        }
      }
      if (transferencia && /Dia do Servidor P[uú]blico/i.test(artigos)) {
        const anterior = eventos.find((e) =>
          /consagrado ao servidor/i.test(e.nome),
        );
        if (anterior) {
          anterior.data = datas[0].data;
          anterior.fontes.push(baseFonte);
          continue;
        }
      }
      for (const { data } of datas)
        eventos.push(
          criarEvento(data, nome, tipo, "estadual", baseFonte, {
            publico: "administracao_publica",
            aplicabilidade: "nao_aplicavel",
          }),
        );
      const diario = item.resumo.diarios?.[0]?.link_download;
      if (diario) {
        const doc = await obter(diario);
        if (doc) baseFonte.diarioOficial = diario;
      }
    }
    anual = !!lei && !!busca;
  }
  eventos = consolidarEventos(eventos);
  const pendentes = eventos.filter((e) => e.aplicabilidade === "pendente");
  return {
    eventos,
    documentos,
    status: {
      esfera,
      ultimaConsulta: agora(),
      ultimoSucesso: eventos.length ? agora() : null,
      cobertura:
        anual && !falhas.length && !pendentes.length
          ? "completa"
          : eventos.length
            ? "parcial"
            : "aguardando_publicacao",
      fontes: documentos,
      pendencias: falhas,
      aplicabilidadesPendentes: pendentes.map((e) => ({
        data: e.data,
        nome: e.nome,
      })),
      calendarioAnualEncontrado: anual,
    },
  };
}
export function qualificarEsferas(esferas) {
  const consolidados = consolidarEventos(
    Object.values(esferas).flatMap((e) => e.eventos || []),
  );
  for (const valor of Object.values(esferas)) {
    valor.status.aplicabilidadesPendentes =
      valor.status.aplicabilidadesPendentes.filter(
        (p) =>
          !consolidados.some(
            (e) =>
              e.data === p.data &&
              normalizar(e.nome) === normalizar(p.nome) &&
              e.aplicabilidade === "confirmada",
          ),
      );
  }
  return esferas;
}
export async function consultarFontesOficiais(
  ano,
  { leitor = baixarOficial } = {},
) {
  const resultado = await Promise.allSettled(
    ["uniao", "goias", "luziania"].map((esfera) =>
      consultar(esfera, ano, leitor),
    ),
  );
  return qualificarEsferas(
    Object.fromEntries(
      resultado.map((r, i) => [
        ["uniao", "goias", "luziania"][i],
        r.status === "fulfilled"
          ? r.value
          : {
              eventos: [],
              documentos: [],
              status: {
                esfera: ["uniao", "goias", "luziania"][i],
                ultimaConsulta: agora(),
                ultimoSucesso: null,
                cobertura: "aguardando_publicacao",
                fontes: [],
                pendencias: [{ erro: r.reason.message }],
                aplicabilidadesPendentes: [],
                calendarioAnualEncontrado: false,
              },
            },
      ]),
    ),
  );
}
