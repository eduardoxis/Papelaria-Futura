import assert from "node:assert/strict";
import {
  configuracaoInicial,
  diasSemana,
  somarDias,
} from "../js/escalas-core.js";
const copiar = (v) => (v === undefined ? undefined : structuredClone(v));
class Documento {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split("/").at(-1);
  }
}
class Consulta {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.filtros = [];
    this.ordens = [];
    this.limite = Infinity;
  }
  where(...f) {
    const q = this.clone();
    q.filtros.push(f);
    return q;
  }
  orderBy(...f) {
    const q = this.clone();
    q.ordens.push(f);
    return q;
  }
  limit(n) {
    const q = this.clone();
    q.limite = n;
    return q;
  }
  startAfter(cursor) {
    const q = this.clone();
    q.cursor = cursor;
    return q;
  }
  clone() {
    const q = new Consulta(this.db, this.path);
    Object.assign(q, this);
    q.filtros = [...this.filtros];
    q.ordens = [...this.ordens];
    return q;
  }
}
function snap(path, valor) {
  return {
    id: path.split("/").at(-1),
    exists: valor !== undefined,
    data: () => copiar(valor),
  };
}
export class BancoMemoria {
  constructor(registros = {}) {
    this.registros = new Map(Object.entries(copiar(registros)));
    this.fila = Promise.resolve();
  }
  doc(path) {
    return new Documento(this, path);
  }
  collection(path) {
    return new Consulta(this, path);
  }
  runTransaction(fn) {
    const resultado = this.fila.then(async () => {
      const escritas = [];
      const tx = {
        get: async (ref) => {
          assert.equal(
            escritas.length,
            0,
            "Firestore exige todas as leituras antes das escritas",
          );
          if (ref instanceof Documento)
            return snap(ref.path, this.registros.get(ref.path));
          let lista = [...this.registros]
            .filter(
              ([path]) =>
                path.split("/").length === 2 && path.startsWith(ref.path + "/"),
            )
            .map(([path, valor]) => snap(path, valor));
          const valor = (doc, campo) =>
            campo === "__name__" ? doc.id : doc.data()[campo];
          for (const [campo, operador, alvo] of ref.filtros)
            lista = lista.filter((d) =>
              operador === "=="
                ? valor(d, campo) === alvo
                : operador === "in"
                  ? alvo.includes(valor(d, campo))
                  : operador === ">="
                    ? valor(d, campo) >= alvo
                    : valor(d, campo) <= alvo,
            );
          const comparar = (a, b) => {
            for (const [campo, direcao] of ref.ordens) {
              const x = valor(a, campo),
                y = valor(b, campo);
              if (x !== y)
                return (x < y ? -1 : 1) * (direcao === "desc" ? -1 : 1);
            }
            return 0;
          };
          lista.sort(comparar);
          if (ref.cursor) {
            if (typeof ref.cursor === "string")
              lista = lista.filter((d) => d.id > ref.cursor);
            else lista = lista.filter((d) => comparar(d, ref.cursor) > 0);
          }
          return { docs: lista.slice(0, ref.limite) };
        },
        set: (ref, valor) => escritas.push({ ref, valor: copiar(valor) }),
        create: (ref, valor) =>
          escritas.push({ ref, valor: copiar(valor), criar: true }),
      };
      const r = await fn(tx);
      escritas.forEach((w) =>
        assert.ok(
          !w.criar || !this.registros.has(w.ref.path),
          "Tentativa de duplicar documento",
        ),
      );
      escritas.forEach((w) => this.registros.set(w.ref.path, w.valor));
      return r;
    });
    this.fila = resultado.catch(() => {});
    return resultado;
  }
}
const semana = "2027-01-04";
export function fixtures() {
  const config = configuracaoInicial();
  config.calendarioConferidoAte = "2028-12-31";
  config.coberturaConfirmada = true;
  config.funcionamento = config.funcionamento.map((f) => ({
    ...f,
    saida: "12:00",
  }));
  config.cobertura = config.funcionamento.map((f) => ({
    ...f,
    funcao: "caixa",
    quantidade: 1,
    indispensavel: true,
    inicio: "2026-01-01",
    fim: null,
  }));
  const pessoa = (id) => ({
    id,
    nome: id,
    uid: id,
    revisao: 1,
    contratos: [
      {
        inicio: "2026-01-01",
        fim: null,
        semanais: 1200,
        limiteDiario: 480,
        principal: "caixa",
        funcoes: ["caixa"],
        categoria: "comercio",
        podeAbrir: true,
        podeFechar: true,
        disponibilidade: [1, 2, 3, 4, 5, 6].map((dia) => ({
          dia,
          entrada: "08:00",
          saida: "18:30",
        })),
      },
    ],
    eventos: [],
  });
  const pessoas = [pessoa("ana"), pessoa("bia")];
  const turnos = pessoas.flatMap((p) =>
    diasSemana(semana).map((data, i) => ({
      id: p.id + "_" + data,
      pessoaId: p.id,
      data,
      tipo: (p.id === "ana" ? i < 5 : i === 5) ? "trabalho" : "folga",
      funcao: "caixa",
      entrada: "08:00",
      almoco: "",
      retorno: "",
      saida: "12:00",
      fixado: false,
    })),
  );
  const registros = {
    "usuarios/gestor": { nome: "Gestor", roles: ["gestor_escalas"] },
    "usuarios/ana": { nome: "Ana", roles: ["user"] },
    "usuarios/bia": { nome: "Bia", roles: ["user"] },
    "pf_escala_config/loja": config,
  };
  pessoas.forEach((p) => {
    registros["pf_escala_pessoas/" + p.id] = p;
    diasSemana(somarDias(semana, -7)).forEach((data) => {
      const id = p.id + "_" + data;
      registros["pf_escala_historico/" + id] = {
        id,
        pessoaId: p.id,
        data,
        tipo: "folga",
        fixado: true,
        revisao: 1,
      };
    });
  });
  return { db: new BancoMemoria(registros), turnos, config, pessoas };
}
