# Ordem de Serviço — Papelaria Futura

## Implementação local

A nova seção foi integrada ao projeto existente. Menu, no desktop e no celular:

Dashboard → Orçamento Futura → Orçamentos FM3 → Orçamentos HTL → Nova Cotação → Caixa → Ordem de Serviço → Comissão → Entrega → demais opções na ordem anterior.

A referência analisada foi somente Gerenciar Fila do ZIP garragem-autocar-main (1).zip: js/modules/fila/management.js, js/modules/fila/tv.js, js/utils/queue.js e a persistência correspondente em api/queue.js e api/_queue.js. Foram adaptados o controle de revisão, a troca atômica de posições, o histórico antes/depois, a projeção de exibição e a rotação do painel. Não foram importados cadastros ou recursos da oficina.

Não foram alterados os cálculos nem o fluxo do Caixa e da Comissão. A Entrega recebeu apenas a lista de OS prontas e o vínculo de confirmação.

## Publicação sem npx

As mudanças estão na pasta local do repositório. Não foram enviadas ao GitHub nem publicadas no Firebase de produção.

1. Em um horário sem operação, gere e guarde um backup atual.
2. Abra Firebase Console → projeto papelaria-futura → Firestore Database → Regras. Copie o conteúdo completo do arquivo local **firestore.rules** para o editor e clique em Publicar.
3. Em Firestore Database → Índices → Composto, crie os índices novos abaixo, usando escopo Coleção. Preserve os índices anteriores. Aguarde o término da criação.
4. Faça o commit e o push com o comando abaixo. Aguarde a publicação do site pelo processo já usado pelo projeto.
5. Recarregue o sistema. Em Administração → Usuários, atribua **Operador de OS** aos funcionários que podem receber serviços. Administradores já têm acesso completo.
6. Confira os tipos em Serviços Personalizados. Cadastre os tipos que sua loja utiliza, ou edite/ative/desative os existentes. Não é criada uma segunda lista de serviços.
7. Abra Ordem de Serviço e faça uma conferência do cadastro, fila, painel e entrega.

### Índices novos

Crescente = ASCENDING; Decrescente = DESCENDING.

| Coleção | Campos, na ordem |
|---|---|
| pf_os | ativo Crescente; posicaoFila Crescente |
| pf_os | responsavelId Crescente; ativo Crescente; posicaoFila Crescente |
| pf_os | responsavelId Crescente; dataEntrada Decrescente |
| pf_os | status Crescente; dataEntrada Decrescente |
| pf_os | responsavelId Crescente; status Crescente; dataEntrada Decrescente |
| pf_os | servicoId Crescente; dataEntrada Decrescente |
| pf_os | responsavelId Crescente; servicoId Crescente; dataEntrada Decrescente |
| pf_os | prioridade Crescente; dataEntrada Decrescente |
| pf_os | responsavelId Crescente; prioridade Crescente; dataEntrada Decrescente |
| pf_os_eventos | osId Crescente; revisao Decrescente |
| pf_os_painel | ativo Crescente; posicaoFila Crescente |

O arquivo firestore.indexes.json contém a definição completa, incluindo os índices anteriores. Se aparecer uma mensagem de índice ausente, o link da mensagem abre o formulário correspondente no Firebase Console.

### Comando para o CMD do Windows

Cole a linha inteira no Prompt de Comando:

```bat
cd /d "C:\Users\Vendas-03\Documents\Codex\2026-11-04\quero-que-vc-nesse-projeto-vc\work\Papelaria-Futura-publicar" && git add js css os index.html service-worker.js vercel.json firestore.rules firestore.indexes.json BACKUP.md VENDAS_COMISSOES.md PDV_FECHAMENTOS.md ORDEM_SERVICO.md tests && git commit -m "Implementa ordens de servico fila em tempo real e integracao com entrega" && git push origin HEAD
```

O push não publica as regras e os índices do Firestore. Execute também os passos do Firebase acima. Não é necessário executar npx para publicá-los manualmente.

## Cadastro e uso

Clique em Nova Ordem de Serviço. Selecione um cliente existente, pesquisando pelo início do nome, ou informe o nome manualmente. O cadastro manual na OS não cria outro cadastro de cliente. Selecione um serviço ativo do cadastro existente e um funcionário autorizado.

Preencha descrição, previsão de conclusão e previsão de entrega em campos separados. Quantidade, material, dimensão, acabamento, prioridade e observações internas ficam na mesma OS. A entrada e o usuário criador são registrados automaticamente. O número sequencial é reservado pelo banco em transação, inclusive com cadastros simultâneos. Repetir a confirmação da mesma operação não cria outra OS.

O cadastro começa em Aguardando. Use as ações para seguir o fluxo:

Aguardando → Em produção → Pronto → Entregue.

Iniciar produção registra a data real de início; Marcar pronto registra a conclusão; Registrar entrega registra a entrega e o funcionário. Cancelamento exige administrador e motivo. Ordens entregues e canceladas permanecem no histórico e não voltam à fila por edição comum.

O administrador pode editar os dados enquanto a OS estiver ativa, trocar o responsável, alterar previsões e definir prioridade. A prioridade é uma indicação; a posição continua sob controle manual. Subir e Descer trocam a posição com a ordem vizinha na fila completa, mesmo quando há filtros na tela. A posição e a revisão ficam salvas no banco. Se outra pessoa alterar a mesma ordem durante a conferência, a operação é recusada para que os dados sejam revistos.

Cada funcionário com cargo Operador de OS consulta suas próprias ordens e atualiza o andamento delas. Apenas administradores cadastram, editam dados administrativos, reordenam e cancelam. As restrições também estão nas regras do Firestore.

## Prazos e histórico

Os indicadores não substituem o status. Até uma hora antes da previsão aparece Próximo do prazo. Após o horário, sem conclusão, aparece Atrasado. Quando concluído, o indicador compara a conclusão real com a previsão vigente naquele momento. A previsão original e todas as alterações ficam preservadas no histórico.

Não existe limpeza ou reinício da fila à meia-noite. Pendências de dias anteriores continuam ativas.

Histórico de OS consulta todas as ordens, incluindo entregues e canceladas, em páginas de até 40 resultados. Pesquisas por número, cliente, serviço ou responsável podem ser combinadas com status, funcionário, serviço, prioridade, atraso, entrada e previsão. A pesquisa alcança ordens antigas além da primeira página. Carregar mais acrescenta a próxima página sem perder os filtros.

As consultas usam os filtros seletivos disponíveis no Firestore e leem lotes de 40. Pesquisa textual livre e combinações adicionais são conferidas nesses lotes até completar a página ou chegar ao fim; em históricos grandes, podem exigir mais leituras. Trocar os filtros cancela a continuação da consulta anterior.

Detalhes mostra todos os dados da OS. Histórico de alterações lista criação, edições, trocas de responsável, mudanças de previsão, status e reordenações, com usuário, horário, motivo e valores anteriores/novos. As alterações são paginadas em grupos de 30. Os registros não aceitam edição ou exclusão comum.

## Painel independente

Use Abrir painel da fila ou acesse **/os/painel** no mesmo domínio do sistema.

O painel exige login autorizado. Administradores, operadores de OS e usuários com cargo **Painel de OS (somente exibição)** podem consultá-lo. Para uma TV, use uma conta existente ou cadastrada pelo administrador com esse cargo, sem conceder administração. Faça o login no mesmo navegador e abra o endereço do painel.

O painel utiliza uma projeção separada, atualizada na mesma transação da OS, com número, nome abreviado do cliente, serviço, funcionário, previsão, status e prioridade. Telefone, documentos, valores, descrição e observações internas não são enviados a essa página. Usuários somente de painel não podem ler a coleção privada das OS.

A fila é atualizada em tempo real. A paginação se adapta ao espaço disponível, preserva a ordem e alterna a cada 15 segundos. O botão Tela cheia usa o recurso do navegador. Não há corte intencional de nomes ou serviços. Em telas muito pequenas, o conteúdo continua disponível por rolagem.

Sem conexão, o painel informa que os dados podem estar desatualizados. Não apresenta os dados locais como confirmação de gravação no servidor. Se o acesso for revogado, a lista é retirada da tela.

## Integração com Entrega

OS em Pronto aparecem na seção Entrega para os usuários autorizados. A confirmação também pode ser feita na própria fila. Nos dois casos, a mesma operação:

- Registra a data e o funcionário.
- Atualiza a OS para Entregue.
- Retira a OS da fila ativa.
- Cria um único registro vinculado em pf_entregas, com ID reservado os_ID_DA_OS.
- Preserva o histórico.

Pronto não significa Entregue. Os registros de entrega vindos de OS são identificados na lista e não aceitam alteração ou exclusão pelo formulário antigo. As demais entregas mantêm o funcionamento anterior.

## Dados e backup

Coleções novas:

- pf_os: ordens completas, nomes preservados, previsões originais e vigentes, datas reais, posição e revisão.
- pf_os_controle: sequência e revisão da fila.
- pf_os_eventos: histórico imutável com snapshots anteriores e posteriores.
- pf_os_painel: projeção restrita para a página de exibição.

Clientes vêm de clientes_cadastro; tipos de serviço, de pf_servicos; funcionários, de usuarios. Não há cadastros paralelos nem migração destrutiva dos dados existentes.

As quatro novas coleções estão no backup completo. O inventário atual contém **32 coleções principais**, além dos grupos de subcoleções. Consulte BACKUP.md para limites e restauração.

## Validação realizada

Testes em emulador Firestore isolado, sem acessar o banco de produção:

1. Cadastro de OS e confirmação repetida sem duplicação.
2. Seleção do cliente e preservação do nome/telefone.
3. Serviço ativo existente e recusa de inativo.
4. Funcionário existente e autorizado.
5. Previsões separadas e datas inválidas.
6. Troca de responsável com registro anterior/novo.
7. Alteração da previsão preservando a original.
8. Início da produção e horário real.
9. Conclusão como Pronto e horário real.
10. Entrega única vinculada e retirada da fila.
11. Reordenação, inclusive alterações concorrentes.
12. Recebimento da atualização por listener em tempo real.
13. Página independente com projeção sem dados privados.
14. Paginação do painel, rotação e tela cheia no navegador.
15. Prazo normal, próximo, atrasado e conclusão com/sem atraso.
16. Pendências após a virada do dia.
17. Histórico com 46 ordens, páginas e pesquisa de registro fora da primeira página.
18. Bloqueios para outros funcionários, usuário comum, usuário de painel e anônimo.
19. Numeração sequencial concorrente e bloqueios contra adulteração.
20. Ordem do menu e uso em desktop/celular.

A interface foi conferida com cadastro, filtros, andamento, entrega, reordenação, histórico e painel. Os dados de teste existiram somente no emulador local. Não são inseridos automaticamente no sistema publicado.

Arquivos de teste: tests/os-core-check.mjs e tests/os-firestore-check.mjs. Também foram executadas as verificações de regressão de PDV, comissões e backup. Os testes de banco precisam do emulador Java e das dependências firebase e @firebase/rules-unit-testing; não devem ser apontados para produção.

