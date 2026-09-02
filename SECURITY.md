# Segurança e publicação

## Regras e índice do Firestore

Publique o conteúdo de `firestore.rules` na aba **Firestore Database > Regras**
do Firebase Console. O arquivo `firestore.indexes.json` contém o índice necessário
para o resumo mensal das cotações de cada vendedor.

## App Check

Ative o App Check no Firebase Console para o app web e configure um provedor
reCAPTCHA Enterprise. Essa etapa precisa ser concluída no Console porque a chave
do provedor pertence ao projeto Firebase; ela não deve ser inventada ou enviada
para o repositório sem a configuração correspondente.

## Chave da API e autenticação

Na Google Cloud Console, restrinja a chave web ao domínio de produção e aos
serviços Firebase usados pelo painel. Em Firebase Authentication, mantenha
provedores não utilizados desativados e defina uma política de senha adequada.

## Checagem local

Após instalar o Node.js, execute:

```powershell
node tests/security-rules-check.mjs
```

O teste verifica se regras abertas conhecidas para usuários, cotações, produtos e
entregas não foram reintroduzidas por engano.
