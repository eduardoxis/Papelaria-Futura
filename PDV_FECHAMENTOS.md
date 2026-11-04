# Caixa, comprovantes e fechamentos — Papelaria Futura

## O que foi implementado

O Caixa mantém o fluxo de passar vendas. Ao finalizar, continua permitindo selecionar o vendedor e uma planilha opcional. Adicionar a linha dessa venda à planilha não pede a senha; as demais proteções da planilha permanecem. Venda, registro na planilha, comissão e movimentação da sessão são confirmados na mesma transação, com proteção contra repetição.

O comprovante abre automaticamente após a venda, com impressão, download PDF e Nova venda. Há três formatos: **A4, 58 mm e 80 mm**. O padrão inicial é **A4**. O A4 segue o modelo azul e branco enviado; os térmicos adaptam os mesmos dados para a largura do papel. Usa a logo real do projeto. É um comprovante comercial não fiscal.

No ADM → Histórico de Caixas ficam os relatórios completos, os filtros por período, operador e caixa, o PDF, a impressão, a movimentação de dinheiro e os dados da loja. O operador vê suas próprias vendas; o administrador consulta todas. O novo cargo “Operador de caixa” pode ser atribuído no cadastro de usuários.

Comissões são calculadas com o percentual vigente na venda e permanecem congeladas no histórico. Seu pagamento continua na área Vendas e Comissões do ADM. Não há pagamento de comissão na tela do Caixa nem desconto automático da comissão no dinheiro da gaveta.

## Publicar sem npx

Os arquivos já foram alterados na pasta local do repositório. Esta atualização não foi enviada ao GitHub nem ao Firebase de produção durante o desenvolvimento.

1. Escolha um horário sem vendas e faça um backup completo atual.
2. No Firebase Console, selecione **papelaria-futura → Firestore Database → Regras**. Abra o arquivo local **firestore.rules**, copie seu conteúdo completo para o editor e clique em **Publicar**. Preserve uma cópia das regras anteriores.
3. Em **Firestore Database → Índices → Composto → Criar índice**, crie os índices abaixo que ainda não existirem. Use escopo **Coleção**. Aguarde todos ficarem prontos. Não exclua os índices anteriores.
4. Envie os arquivos ao GitHub com o comando do final deste guia e aguarde a publicação do site pelo processo já usado no projeto.
5. Recarregue o sistema. No ADM → Histórico de Caixas → Dados da loja / impressão, informe endereço, telefone e CNPJ reais, se disponíveis. Deixe o formato padrão em A4. A configuração vale para novos comprovantes; os antigos preservam seus dados.
6. Confira as permissões dos operadores e os percentuais dos vendedores. Faça uma venda de conferência, verifique a planilha escolhida, o comprovante, a comissão e o fechamento. Gere um novo backup depois da conferência.

Não é necessário instalar Node.js ou executar npx para publicar as regras manualmente. Se surgir uma mensagem de índice ausente, o link dessa mensagem também abre o formulário do índice necessário no Firebase.

### Índices novos desta atualização

| Coleção | Campos, na ordem |
|---|---|
| pf_caixa_fechamentos | operadorUid Crescente; fechadoEm Decrescente |
| pf_caixa_fechamentos | caixaNumero Crescente; fechadoEm Decrescente |
| pf_caixa_fechamentos | operadorUid Crescente; caixaNumero Crescente; fechadoEm Decrescente |
| pf_vendas | operadorUid Crescente; criadoEm Decrescente |
| pf_caixa_sessoes | status Crescente; fechadoEm Decrescente |
| pf_caixa_ajustes | fechamentoId Crescente; criadoEm Crescente |
| pf_caixa_movimentos | sessaoId Crescente; criadoEm Crescente |

O arquivo firestore.indexes.json contém também os índices anteriores das cotações e de Vendas e Comissões. Se essa área ainda não foi publicada, mantenha/crie também: pf_comissoes_vendas (vendedorId Crescente, status Crescente, dataVenda Crescente) e pf_comissao_pagamentos (vendedorId Crescente, dataPagamento Decrescente).

### Comando para o Prompt de Comando do Windows

Cole a linha inteira abaixo no CMD, sem juntar outros comandos ao caminho. Ela envia apenas os arquivos do projeto, não os dados do banco:

```bat
cd /d "C:\Users\Vendas-03\Documents\Codex\2026-11-04\quero-que-vc-nesse-projeto-vc\work\Papelaria-Futura-publicar" && git add js css index.html service-worker.js firestore.rules firestore.indexes.json BACKUP.md VENDAS_COMISSOES.md PDV_FECHAMENTOS.md tests && git commit -m "Integra caixa comprovantes A4 58 80 e historico de fechamentos" && git push origin HEAD
```

O push não publica as regras do Firebase. É necessário executar também o passo manual das regras e índices acima.

## Uso diário

Abra o caixa identificando-o e informando o troco inicial. Cada venda nova fica vinculada àquela sessão. A numeração inclui o caixa e um identificador único; números antigos permanecem preservados.

Dinheiro, PIX, débito, crédito, outras formas e fiado/convênio são separados. No pagamento misto, informe quanto cabe a cada forma; a soma deve fechar o valor da venda. Troco só se aplica ao dinheiro. Fiado/convênio é mostrado separadamente e não entra como dinheiro físico.

Ao fechar, o operador confere o dinheiro esperado e informa quanto contou. O sistema registra sobra, falta ou ausência de diferença. O relatório completo fica no ADM. A confirmação é protegida contra clique duplo e contra vendas/movimentos ocorridos depois de abrir a conferência: nesse caso, é necessário conferir novamente.

Saldo esperado em dinheiro = troco inicial + recebimentos em dinheiro + suprimentos − sangrias − devoluções efetivamente lançadas em dinheiro. PIX e cartões não entram nessa conta.

No ADM → Histórico de Caixas → Movimentação de dinheiro, o administrador seleciona uma sessão aberta e lança suprimento, sangria ou devolução com motivo. Uma devolução em dinheiro exige a venda cancelada/estornada vinculada e respeita o valor ainda devolvível. Cancelar a venda, por si só, não presume que dinheiro já foi entregue ao cliente.

O relatório mantém recebimentos brutos por forma de pagamento e mostra cancelamentos/estornos e devoluções separadamente. O total líquido e a comissão válida refletem os ajustes registrados até o fechamento. Alterações posteriores geram ajustes rastreáveis, preservando o fechamento original.

No Histórico de Vendas ou em ADM → Vendas Realizadas, é possível visualizar os itens, gerar o comprovante, baixar o PDF ou reimprimir. Essas ações usam os dados salvos e não criam outra venda, comissão ou linha na planilha.

Para imprimir, selecione A4, 58 mm ou 80 mm no comprovante e escolha a impressora instalada na janela do navegador. Configure o papel e a escala correspondentes no driver. O PDF também respeita o tamanho selecionado.

## Histórico, correções e caixas anteriores

Os novos fechamentos guardam um snapshot consolidado no Firestore, sem armazenar PDFs grandes no banco. O PDF pode ser regenerado a partir desse snapshot. Itens, preços, nomes e percentuais são preservados nas transações, mesmo se o cadastro mudar depois.

Fechamentos confirmados não aceitam edição comum nem exclusão pelas regras do aplicativo. O administrador pode registrar uma correção com motivo, usuário, data e valores anteriores/novos; ela aparece em Ajustes posteriores e não substitui o relatório original. Movimentações registradas também ficam disponíveis para auditoria, com paginação.

Se houver caixa antigo aberto, o administrador deverá concluir a transição informando contagem e motivo antes de registrar vendas no modelo novo. Os dados anteriores são preservados. O sistema não inventa vínculos entre vendas antigas e sessões sem esse relacionamento.

Em Fechamentos antigos, os relatórios utilizam somente os campos que o sistema anterior realmente armazenou. Dados históricos ausentes não podem ser reconstruídos automaticamente. A atualização não recupera documentos que já foram apagados antes dela.

Não foi configurada exclusão automática de fechamentos. A permanência depende da manutenção do projeto Firebase e de sua capacidade. O backup completo agora inclui **32 coleções principais**, além dos grupos de subcoleções, inclusive os novos fechamentos, movimentos, ajustes e controles de sessão. Veja BACKUP.md para limites e recuperação.

## Validação realizada

Testes executados com o código real de persistência e regras no emulador Firestore, separado do banco de produção:

- Vendas com um/múltiplos itens; descontos e arredondamentos em centavos.
- Dinheiro com troco, PIX, débito, crédito e pagamentos mistos.
- Vendedor e planilha protegida sem senha para registrar a venda, sem duplicação.
- Percentuais históricos, cancelamentos, estornos e devoluções com limite.
- Diferentes vendedores e caixas; suprimentos, sangrias, sobra e falta.
- Venda concorrente à conferência; confirmação dupla do mesmo fechamento.
- Snapshot imutável, ajustes posteriores, correções administrativas e sessões antigas.
- Acesso negado para usuários sem permissão, inclusive anônimo.
- Regressão do pagamento de comissões e do backup completo.
- Interface do Caixa, comprovante automático, histórico de vendas e Histórico de Caixas.
- PDFs A4, 58 mm e 80 mm, fechamento atual e antigo, além de cupom com 80 itens e nomes longos. PDFs renderizados e conferidos visualmente.

Não foi enviada impressão a uma impressora física. Os formatos e os arquivos PDF foram conferidos localmente; o resultado físico depende da configuração da impressora e do papel.

Testes no repositório: tests/pdv-core-check.mjs, tests/pdv-firestore-check.mjs, tests/vendas-comissoes-core-check.mjs, tests/vendas-comissoes-firestore-check.mjs e tests/backup-check.mjs. Os testes de Firestore precisam de Java, emulador e dependências Firebase/rules-unit-testing. Não os aponte para produção.

