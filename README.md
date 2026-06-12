# 📄 Sistema de Cotações — Papelaria Futura Centro

Sistema completo de gerenciamento de cotações comerciais com autenticação Firebase, painel administrativo e geração de PDF profissional.

---

## 🗂 Estrutura do Projeto

```
/
├── index.html              ← Tela de login
├── dashboard.html          ← Painel principal (SPA)
├── setup.html              ← Setup do admin inicial (apagar após uso)
├── vercel.json             ← Configuração de deploy
├── firestore.rules         ← Regras de segurança do Firestore
│
├── css/
│   ├── main.css            ← Design tokens e reset global
│   ├── login.css           ← Estilos da tela de login
│   ├── dashboard.css       ← Layout do painel e componentes
│   ├── cotacao.css         ← Mini Excel e formulário
│   └── admin.css           ← Painel administrativo
│
└── js/
    ├── firebase-config.js  ← Inicialização do Firebase SDK v9+
    ├── auth.js             ← Login, logout, proteção de rotas
    ├── database.js         ← CRUD Firestore (cotações e usuários)
    ├── dashboard.js        ← Estatísticas e tabela de últimas
    ├── cotacao.js          ← Mini Excel + salvar/editar/excluir
    ├── pdf.js              ← Gerador de PDF profissional (jsPDF)
    └── admin.js            ← Gestão de usuários (somente admin)
```

---

## 🚀 Como configurar

### 1. Criar projeto no Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. Crie um novo projeto
3. Ative **Authentication → E-mail/Senha**
4. Ative **Firestore Database** (modo produção)
5. Copie as credenciais do projeto

### 2. Configurar `js/firebase-config.js`

Substitua os valores de exemplo pelas suas credenciais reais:

```js
const firebaseConfig = {
  apiKey:            "SUA_API_KEY",
  authDomain:        "SEU_PROJETO.firebaseapp.com",
  projectId:         "SEU_PROJETO",
  storageBucket:     "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId:             "SEU_APP_ID"
};
```

### 3. Aplicar regras do Firestore

Cole o conteúdo de `firestore.rules` em:
**Firebase Console → Firestore Database → Rules**

### 4. Criar o primeiro usuário admin

1. Suba o projeto na Vercel (ou use live-server localmente)
2. Acesse `/setup.html`
3. Preencha nome, e-mail e senha
4. Clique em **Criar Administrador**
5. ⚠️ **Delete `setup.html` imediatamente após!**

### 5. Deploy na Vercel

```bash
# Instalar Vercel CLI
npm i -g vercel

# Na pasta do projeto
vercel

# Seguir as instruções do terminal
# O vercel.json já está configurado para SPA routing
```

---

## 🔑 Estrutura de dados no Firestore

### Coleção `usuarios/{uid}`
```json
{
  "uid":          "firebase_uid",
  "nome":         "Nome do Usuário",
  "email":        "email@exemplo.com",
  "role":         "admin | user",
  "criadoEm":     "Timestamp",
  "ultimoAcesso": "Timestamp"
}
```

### Coleção `cotacoes/{cotacaoId}`
```json
{
  "cliente":     "Nome do Cliente",
  "cnpj":        "00.000.000/0001-00",
  "validade":    "2025-12-31",
  "observacoes": "Texto livre",
  "status":      "ativa | aprovada | recusada | expirada",
  "itens": [
    {
      "item":          1,
      "descricao":     "Produto",
      "marca":         "Marca",
      "quantidade":    10,
      "valorUnitario": 5.50,
      "valorTotal":    55.00
    }
  ],
  "valorTotal":  55.00,
  "criadoPor":   "firebase_uid",
  "dataCriacao": "Timestamp",
  "updatedAt":   "Timestamp"
}
```

---

## ✨ Funcionalidades

| Módulo | Funcionalidades |
|---|---|
| **Login** | E-mail/senha, toggle de senha, recuperação por e-mail |
| **Dashboard** | Cards de stats, últimas cotações, saudação dinâmica |
| **Cotações** | Listar, buscar, criar, editar, excluir |
| **Mini Excel** | Adicionar/remover linhas, cálculo automático em tempo real |
| **PDF** | Proposta profissional com cabeçalho, tabela, total, rodapé |
| **Admin** | Listar, criar, editar e excluir usuários (somente admin) |

---

## 📱 Responsividade

- ✅ Desktop (1200px+)
- ✅ Notebook (1024px)
- ✅ Tablet (768px) — sidebar colapsável
- ✅ Mobile (360px+) — tabelas com scroll horizontal

---

## 📦 Dependências externas (CDN)

| Biblioteca | Versão | Uso |
|---|---|---|
| Firebase SDK | 10.7.1 | Auth + Firestore |
| jsPDF | 2.5.1 | Geração de PDF |
| jsPDF-AutoTable | 3.8.2 | Tabela no PDF |
| Google Fonts | — | Inter + Plus Jakarta Sans |

---

## 🛡 Segurança

- Rotas protegidas: redirecionamento automático para login se não autenticado
- Regras do Firestore: usuários só leem/escrevem seus próprios dados
- Admin: verificação de role no Firestore a cada ação sensível
- Sem chaves de API expostas no código de produção (usar variáveis de ambiente Vercel se necessário)

---

## 🎨 Identidade Visual

- **Cores principais:** Azul `#2563EB`, Azul escuro `#0F2460`, Dourado `#D97706`
- **Tipografia:** Plus Jakarta Sans (display) + Inter (corpo)
- **Componentes:** cards com sombra suave, bordas arredondadas, botões com gradiente
