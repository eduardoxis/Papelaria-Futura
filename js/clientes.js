// ============================================================
// clientes.js — Cadastro de Clientes (Pessoa Física / Jurídica)
// Cadastro único, usado em Promissórias (gestão) e Cotações
// (autocomplete de nome + CPF/CNPJ)
// ============================================================

import {
  collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase-config.js";

const COL_CLIENTES_CADASTRO = "clientes_cadastro";

const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

let _cacheClientes   = [];
let _cacheCarregada  = false;
let _clienteEditandoId = null;

// ============================================================
// Inicialização
// ============================================================
export function iniciarClientesCadastro(usuario, dadosUsuario) {
  carregarCacheClientes();

  document.getElementById("btnNovoClienteCadastro")?.addEventListener("click", () => abrirModalCliente());

  document.getElementById("filtroBuscaCadastro")?.addEventListener("input", (e) => {
    renderListaClientesCadastro(e.target.value);
  });

  ativarAutocompleteCotacao();
}

// ============================================================
// Firestore — CRUD
// ============================================================
async function carregarCacheClientes() {
  try {
    const snap = await getDocs(query(collection(db, COL_CLIENTES_CADASTRO), orderBy("nome")));
    _cacheClientes = [];
    snap.forEach(d => _cacheClientes.push({ id: d.id, ...d.data() }));
    _cacheCarregada = true;
  } catch (err) {
    console.error("Erro ao carregar clientes cadastrados:", err);
  }
}

async function salvarClienteCadastro(dados, id = null) {
  const payload = {
    ...dados,
    nomeBusca: (dados.nome || "").toLowerCase(),
    atualizadoEm: serverTimestamp()
  };
  if (id) {
    await updateDoc(doc(db, COL_CLIENTES_CADASTRO, id), payload);
  } else {
    payload.criadoEm = serverTimestamp();
    await addDoc(collection(db, COL_CLIENTES_CADASTRO), payload);
  }
  await carregarCacheClientes();
}

async function excluirClienteCadastro(id) {
  await deleteDoc(doc(db, COL_CLIENTES_CADASTRO, id));
  await carregarCacheClientes();
}

// ============================================================
// Lista (aba Cadastro)
// ============================================================
export function renderListaClientesCadastro(termoBusca = "") {
  const tbody = document.getElementById("tabelaClientesCadastro");
  const contagem = document.getElementById("contagemClientesCadastro");
  if (!tbody) return;

  if (!_cacheCarregada) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Carregando...</td></tr>`;
    carregarCacheClientes().then(() => renderListaClientesCadastro(termoBusca));
    return;
  }

  const termo = termoBusca.trim().toLowerCase();
  let lista = _cacheClientes;

  if (termo) {
    lista = lista.filter(c =>
      (c.nome || "").toLowerCase().includes(termo) ||
      (c.documento || "").toLowerCase().includes(termo) ||
      (c.telefone || "").toLowerCase().includes(termo) ||
      (c.celular || "").toLowerCase().includes(termo)
    );
  }

  if (contagem) {
    contagem.textContent = `${lista.length} cliente${lista.length === 1 ? "" : "s"}`;
  }

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">Nenhum cliente encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(c => `
    <tr>
      <td><strong>${escHtml(c.nome)}</strong>${c.apelido ? `<br><span style="font-size:var(--text-xs);color:var(--gray-500)">${escHtml(c.apelido)}</span>` : ""}</td>
      <td>${c.tipo === "juridica" ? "Jurídica" : "Física"}</td>
      <td>${escHtml(c.documento || "—")}</td>
      <td>${escHtml(c.telefone || c.celular || "—")}</td>
      <td>${c.cidade ? `${escHtml(c.cidade)}${c.estado ? " / " + escHtml(c.estado) : ""}` : "—"}</td>
      <td>${badgeAtivo(c.ativo !== false)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn-icon" data-acao="editar" data-id="${c.id}" title="Editar">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
          </button>
          <button class="btn-icon" data-acao="excluir" data-id="${c.id}" title="Excluir" style="color:var(--color-danger)">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll('[data-acao="editar"]').forEach(btn => {
    btn.addEventListener("click", () => abrirModalCliente(btn.dataset.id));
  });
  tbody.querySelectorAll('[data-acao="excluir"]').forEach(btn => {
    btn.addEventListener("click", () => confirmarExclusaoCliente(btn.dataset.id));
  });
}

function badgeAtivo(ativo) {
  return ativo
    ? `<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:9999px;font-size:0.75rem;font-weight:600;background:#D1FAE5;color:#065F46">Ativo</span>`
    : `<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:9999px;font-size:0.75rem;font-weight:600;background:var(--gray-100);color:var(--gray-500)">Inativo</span>`;
}

function confirmarExclusaoCliente(id) {
  const cliente = _cacheClientes.find(c => c.id === id);
  window.abrirModal(
    "Excluir cliente",
    `<p>Tem certeza que deseja excluir <strong>${escHtml(cliente?.nome || "")}</strong>? Essa ação não pode ser desfeita.</p>`,
    `
      <button class="btn-ghost" id="btnCancelarExclusaoCliente">Cancelar</button>
      <button class="btn-danger-solid" id="btnConfirmarExclusaoCliente">Excluir</button>
    `
  );
  document.getElementById("btnCancelarExclusaoCliente").addEventListener("click", window.fecharModal);
  document.getElementById("btnConfirmarExclusaoCliente").addEventListener("click", async () => {
    try {
      await excluirClienteCadastro(id);
      window.fecharModal();
      window.mostrarToast?.("Cliente excluído.", "success");
      renderListaClientesCadastro(document.getElementById("filtroBuscaCadastro")?.value || "");
    } catch (err) {
      console.error(err);
      window.mostrarToast?.("Erro ao excluir cliente.", "error");
    }
  });
}

// ============================================================
// Modal de cadastro / edição
// ============================================================
function abrirModalCliente(id = null) {
  _clienteEditandoId = id;
  const cliente = id ? _cacheClientes.find(c => c.id === id) : null;
  const tipo = cliente?.tipo || "fisica";

  const optionsEstado = ESTADOS_BR.map(uf =>
    `<option value="${uf}" ${cliente?.estado === uf ? "selected" : ""}>${uf}</option>`
  ).join("");

  const body = `
    <div class="cli-tipo-toggle" role="tablist">
      <button type="button" class="cli-tipo-btn ${tipo === "fisica" ? "cli-tipo-btn--active" : ""}" data-tipo="fisica" id="btnTipoFisica">Pessoa Física</button>
      <button type="button" class="cli-tipo-btn ${tipo === "juridica" ? "cli-tipo-btn--active" : ""}" data-tipo="juridica" id="btnTipoJuridica">Pessoa Jurídica</button>
    </div>
    <input type="hidden" id="cliTipo" value="${tipo}" autocomplete="off" />

    <div class="cli-form-grid" style="margin-top:var(--space-4)">
      <div class="field" style="grid-column:1 / -1">
        <label class="field-label" for="cliNome">Nome ${tipo === "juridica" ? "/ Razão Social" : ""} *</label>
        <input type="text" class="field-input--plain" id="cliNome" value="${escAttr(cliente?.nome)}" placeholder="Nome completo" required autocomplete="off" />
      </div>

      <div class="field" id="cliApelidoWrap" style="grid-column:1 / -1">
        <label class="field-label" for="cliApelido">${tipo === "juridica" ? "Nome Fantasia" : "Apelido"}</label>
        <input type="text" class="field-input--plain" id="cliApelido" value="${escAttr(cliente?.apelido)}" autocomplete="off" />
      </div>

      <!-- Campos Pessoa Física -->
      <div id="blocoFisica" class="cli-form-grid" style="grid-column:1 / -1;display:${tipo === "fisica" ? "grid" : "none"}">
        <div class="field">
          <label class="field-label" for="cliCpf">CPF</label>
          <input type="text" class="field-input--plain" id="cliCpf" value="${escAttr(cliente?.documento)}" placeholder="000.000.000-00" maxlength="14" autocomplete="off" />
        </div>
        <div class="field">
          <label class="field-label" for="cliRg">RG</label>
          <input type="text" class="field-input--plain" id="cliRg" value="${escAttr(cliente?.rg)}" autocomplete="off" />
        </div>
        <div class="field">
          <label class="field-label" for="cliNascimento">Nascimento</label>
          <input type="date" class="field-input--plain" id="cliNascimento" value="${escAttr(cliente?.nascimento)}" autocomplete="off" />
        </div>
      </div>

      <!-- Campos Pessoa Jurídica -->
      <div id="blocoJuridica" class="cli-form-grid" style="grid-column:1 / -1;display:${tipo === "juridica" ? "grid" : "none"}">
        <div class="field">
          <label class="field-label" for="cliCnpj">CNPJ</label>
          <input type="text" class="field-input--plain" id="cliCnpj" value="${escAttr(cliente?.documento)}" placeholder="00.000.000/0001-00" maxlength="18" autocomplete="off" />
        </div>
        <div class="field">
          <label class="field-label" for="cliIe">Inscrição Estadual</label>
          <input type="text" class="field-input--plain" id="cliIe" value="${escAttr(cliente?.inscricaoEstadual)}" autocomplete="off" />
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="cliEmail">E-mail</label>
        <input type="email" class="field-input--plain" id="cliEmail" value="${escAttr(cliente?.email)}" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="cliTelefone">Telefone</label>
        <input type="tel" class="field-input--plain" id="cliTelefone" value="${escAttr(cliente?.telefone)}" placeholder="(00) 0000-0000" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="cliCelular">Celular</label>
        <input type="tel" class="field-input--plain" id="cliCelular" value="${escAttr(cliente?.celular)}" placeholder="(00) 00000-0000" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="cliFax">Fax</label>
        <input type="tel" class="field-input--plain" id="cliFax" value="${escAttr(cliente?.fax)}" autocomplete="off" />
      </div>

      <div class="field">
        <label class="field-label" for="cliCep">CEP</label>
        <input type="text" class="field-input--plain" id="cliCep" value="${escAttr(cliente?.cep)}" placeholder="00000-000" maxlength="9" autocomplete="off" />
      </div>
      <div class="field" style="grid-column:span 2">
        <label class="field-label" for="cliEndereco">Endereço</label>
        <input type="text" class="field-input--plain" id="cliEndereco" value="${escAttr(cliente?.endereco)}" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="cliNumero">Número</label>
        <input type="text" class="field-input--plain" id="cliNumero" value="${escAttr(cliente?.numero)}" autocomplete="off" />
      </div>

      <div class="field">
        <label class="field-label" for="cliComplemento">Complemento</label>
        <input type="text" class="field-input--plain" id="cliComplemento" value="${escAttr(cliente?.complemento)}" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="cliBairro">Bairro</label>
        <input type="text" class="field-input--plain" id="cliBairro" value="${escAttr(cliente?.bairro)}" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="cliCidade">Cidade</label>
        <input type="text" class="field-input--plain" id="cliCidade" value="${escAttr(cliente?.cidade)}" autocomplete="off" />
      </div>
      <div class="field">
        <label class="field-label" for="cliEstado">Estado</label>
        <select class="field-input--plain" id="cliEstado" autocomplete="off">
          <option value="">UF</option>
          ${optionsEstado}
        </select>
      </div>

      <div class="field" style="grid-column:1 / -1">
        <label class="field-label" for="cliObservacoes">Observações</label>
        <textarea class="field-input--plain field-textarea" id="cliObservacoes" rows="2" autocomplete="off">${escHtml(cliente?.observacoes || "")}</textarea>
      </div>

      <div class="field" style="grid-column:1 / -1">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--text-sm);color:var(--gray-700)">
          <input type="checkbox" id="cliAtivo" ${cliente?.ativo !== false ? "checked" : ""} autocomplete="off" />
          Cliente ativo
        </label>
      </div>
    </div>
  `;

  const footer = `
    <button class="btn-ghost" id="btnCancelarCliente">Cancelar</button>
    <button class="btn-primary" id="btnSalvarCliente">${id ? "Salvar alterações" : "Cadastrar Cliente"}</button>
  `;

  window.abrirModal(id ? "Editar Cliente" : "Novo Cliente", body, footer, { tamanho: "lg" });

  // Toggle PF / PJ
  document.getElementById("btnTipoFisica").addEventListener("click", () => alternarTipoCliente("fisica"));
  document.getElementById("btnTipoJuridica").addEventListener("click", () => alternarTipoCliente("juridica"));

  // Máscaras
  document.getElementById("cliCpf")?.addEventListener("input", (e) => e.target.value = mascararCpf(e.target.value));
  document.getElementById("cliCnpj")?.addEventListener("input", (e) => e.target.value = mascararCnpj(e.target.value));
  document.getElementById("cliCep")?.addEventListener("input", (e) => e.target.value = mascararCep(e.target.value));
  document.getElementById("cliCep")?.addEventListener("blur", buscarEnderecoPorCep);

  document.getElementById("btnCancelarCliente").addEventListener("click", window.fecharModal);
  document.getElementById("btnSalvarCliente").addEventListener("click", handleSalvarCliente);
}

function alternarTipoCliente(tipo) {
  document.getElementById("cliTipo").value = tipo;
  document.getElementById("btnTipoFisica").classList.toggle("cli-tipo-btn--active", tipo === "fisica");
  document.getElementById("btnTipoJuridica").classList.toggle("cli-tipo-btn--active", tipo === "juridica");
  document.getElementById("blocoFisica").style.display   = tipo === "fisica"   ? "grid" : "none";
  document.getElementById("blocoJuridica").style.display  = tipo === "juridica" ? "grid" : "none";
  document.querySelector('label[for="cliApelido"]').textContent = tipo === "juridica" ? "Nome Fantasia" : "Apelido";
  document.querySelector('label[for="cliNome"]').textContent = `Nome ${tipo === "juridica" ? "/ Razão Social" : ""} *`;
}

async function handleSalvarCliente() {
  const tipo  = document.getElementById("cliTipo").value;
  const nome  = document.getElementById("cliNome").value.trim();

  if (!nome) {
    window.mostrarToast?.("Informe o nome do cliente.", "error");
    document.getElementById("cliNome").focus();
    return;
  }

  const documento = tipo === "fisica"
    ? document.getElementById("cliCpf").value.trim()
    : document.getElementById("cliCnpj").value.trim();

  const dados = {
    tipo,
    nome,
    documento,
    apelido:           document.getElementById("cliApelido").value.trim(),
    rg:                tipo === "fisica"   ? document.getElementById("cliRg").value.trim()         : "",
    nascimento:        tipo === "fisica"   ? document.getElementById("cliNascimento").value         : "",
    inscricaoEstadual: tipo === "juridica" ? document.getElementById("cliIe").value.trim()           : "",
    email:             document.getElementById("cliEmail").value.trim(),
    telefone:          document.getElementById("cliTelefone").value.trim(),
    celular:           document.getElementById("cliCelular").value.trim(),
    fax:               document.getElementById("cliFax").value.trim(),
    cep:               document.getElementById("cliCep").value.trim(),
    endereco:          document.getElementById("cliEndereco").value.trim(),
    numero:            document.getElementById("cliNumero").value.trim(),
    complemento:       document.getElementById("cliComplemento").value.trim(),
    bairro:            document.getElementById("cliBairro").value.trim(),
    cidade:            document.getElementById("cliCidade").value.trim(),
    estado:            document.getElementById("cliEstado").value,
    observacoes:       document.getElementById("cliObservacoes").value.trim(),
    ativo:             document.getElementById("cliAtivo").checked
  };

  const btn = document.getElementById("btnSalvarCliente");
  btn.disabled = true;
  btn.textContent = "Salvando...";

  try {
    await salvarClienteCadastro(dados, _clienteEditandoId);
    window.fecharModal();
    window.mostrarToast?.(_clienteEditandoId ? "Cliente atualizado." : "Cliente cadastrado.", "success");
    renderListaClientesCadastro(document.getElementById("filtroBuscaCadastro")?.value || "");
  } catch (err) {
    console.error(err);
    window.mostrarToast?.("Erro ao salvar cliente.", "error");
    btn.disabled = false;
    btn.textContent = _clienteEditandoId ? "Salvar alterações" : "Cadastrar Cliente";
  }
}

// ── Busca de endereço via CEP (ViaCEP) ────────────────────────
async function buscarEnderecoPorCep(e) {
  const cep = e.target.value.replace(/\D/g, "");
  if (cep.length !== 8) return;

  try {
    const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await resp.json();
    if (data.erro) return;

    if (document.getElementById("cliEndereco")) document.getElementById("cliEndereco").value    = data.logradouro || "";
    if (document.getElementById("cliBairro"))   document.getElementById("cliBairro").value      = data.bairro || "";
    if (document.getElementById("cliCidade"))   document.getElementById("cliCidade").value      = data.localidade || "";
    if (document.getElementById("cliEstado"))   document.getElementById("cliEstado").value      = data.uf || "";
    document.getElementById("cliNumero")?.focus();
  } catch (err) {
    console.error("Erro ao buscar CEP:", err);
  }
}

// ============================================================
// Autocomplete de cliente na tela de Cotação
// ============================================================
export async function buscarClientesPorNome(termo) {
  if (!_cacheCarregada) await carregarCacheClientes();
  const t = termo.trim().toLowerCase();
  if (!t) return [];
  return _cacheClientes
    .filter(c => (c.nome || "").toLowerCase().includes(t))
    .slice(0, 6);
}

function ativarAutocompleteCotacao() {
  const input = document.getElementById("cotCliente");
  const inputDoc = document.getElementById("cotCnpj");
  if (!input) return;

  const dropdown = document.createElement("div");
  dropdown.className = "cli-autocomplete-dropdown";
  dropdown.hidden = true;
  input.parentElement.style.position = "relative";
  input.parentElement.appendChild(dropdown);

  let timeoutBusca = null;

  input.addEventListener("input", () => {
    clearTimeout(timeoutBusca);
    const termo = input.value;
    timeoutBusca = setTimeout(async () => {
      if (termo.trim().length < 2) {
        dropdown.hidden = true;
        return;
      }
      const resultados = await buscarClientesPorNome(termo);
      if (!resultados.length) {
        dropdown.hidden = true;
        return;
      }
      dropdown.innerHTML = resultados.map(c => `
        <div class="cli-autocomplete-item" data-nome="${escAttr(c.nome)}" data-doc="${escAttr(c.documento)}">
          <strong>${escHtml(c.nome)}</strong>
          ${c.documento ? `<span>${escHtml(c.documento)}</span>` : ""}
        </div>
      `).join("");
      dropdown.hidden = false;

      dropdown.querySelectorAll(".cli-autocomplete-item").forEach(item => {
        item.addEventListener("click", () => {
          input.value = item.dataset.nome;
          if (inputDoc) inputDoc.value = item.dataset.doc || "";
          dropdown.hidden = true;
        });
      });
    }, 200);
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== input) dropdown.hidden = true;
  });
}

// ============================================================
// Máscaras e helpers
// ============================================================
function mascararCpf(valor) {
  let v = valor.replace(/\D/g, "").substring(0, 11);
  if (v.length > 9)  v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2})$/, "$1.$2.$3-$4");
  else if (v.length > 6)  v = v.replace(/^(\d{3})(\d{3})(\d{0,3})$/, "$1.$2.$3");
  else if (v.length > 3)  v = v.replace(/^(\d{3})(\d{0,3})$/, "$1.$2");
  return v;
}

function mascararCnpj(valor) {
  let v = valor.replace(/\D/g, "").substring(0, 14);
  if (v.length > 12) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})$/, "$1.$2.$3/$4-$5");
  else if (v.length > 8)  v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})$/, "$1.$2.$3/$4");
  else if (v.length > 5)  v = v.replace(/^(\d{2})(\d{3})(\d{0,3})$/, "$1.$2.$3");
  else if (v.length > 2)  v = v.replace(/^(\d{2})(\d{0,3})$/, "$1.$2");
  return v;
}

function mascararCep(valor) {
  let v = valor.replace(/\D/g, "").substring(0, 8);
  if (v.length > 5) v = v.replace(/^(\d{5})(\d{0,3})$/, "$1-$2");
  return v;
}

function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escAttr(str) {
  return str ? escHtml(str) : "";
}
