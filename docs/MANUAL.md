# Manual da Papelaria Futura

Este manual reúne as orientações de operação, publicação e recuperação do projeto.

- [Publicação](#publicacao)
- [Backup e recuperação](#backup)
- [Vendas e comissões](#comissoes)
- [Caixa e comprovantes](#caixa)
- [Ordens de serviço](#os)
- [Sessão e cadastro de colaboradores](#sessao)

<a id="publicacao"></a>
## Publicação

1. Gere um backup atual antes de atualizar o sistema.
2. No Firebase Console, selecione papelaria-futura → Firestore Database → Regras. Abra **firebase/firestore.rules** na pasta do projeto, copie o conteúdo completo e publique no editor.
3. Em Índices → Composto, mantenha os índices existentes e crie os que faltarem na tabela abaixo, com escopo Coleção. Aguarde a criação terminar.
4. Envie os arquivos ao GitHub com o comando abaixo e aguarde a publicação do site pelo processo já usado pelo projeto.
5. Recarregue o sistema. Configure os cargos dos funcionários e confira os dados reais da loja no ADM.

O arquivo firebase.json aponta para as regras e os índices dentro de firebase/. O vercel.json permanece na raiz para configurar as rotas do site. Publicar o GitHub não publica automaticamente as regras do Firestore.

Para fazer o commit e o push no CMD do Windows:

```bat
cd /d "C:\Users\Vendas-03\Documents\Codex\2026-11-04\quero-que-vc-nesse-projeto-vc\work\Papelaria-Futura-publicar" && git add -A && git commit -m "Organiza raiz e consolida documentacao do projeto" && git push origin HEAD
```

As regras também podem ser publicadas pela ferramenta Firebase, quando instalada: `firebase deploy --only firestore --project papelaria-futura`. A publicação manual pelo Console não exige npx.

### Índices do projeto

| Coleção | Campos na ordem |
|---|---|
| cotacoes | criadoPor Crescente; dataCriacao Crescente |
| cotacoes | criadoPor Crescente; dataCriacao Decrescente |
| cotacoes | criadoPor Crescente; valorTotal Crescente |
| cotacoes | criadoPor Crescente; status Crescente; proximoLembreteEm Crescente |
| cotacoes | status Crescente; proximoLembreteEm Crescente |
| pf_comissoes_vendas | vendedorId Crescente; status Crescente; dataVenda Crescente |
| pf_comissao_pagamentos | vendedorId Crescente; dataPagamento Decrescente |
| pf_caixa_fechamentos | operadorUid Crescente; fechadoEm Decrescente |
| pf_caixa_fechamentos | caixaNumero Crescente; fechadoEm Decrescente |
| pf_caixa_fechamentos | operadorUid Crescente; caixaNumero Crescente; fechadoEm Decrescente |
| pf_vendas | operadorUid Crescente; criadoEm Decrescente |
| pf_caixa_sessoes | status Crescente; fechadoEm Decrescente |
| pf_caixa_ajustes | fechamentoId Crescente; criadoEm Crescente |
| pf_caixa_movimentos | sessaoId Crescente; criadoEm Crescente |
| pf_os | ativo Crescente; posicaoFila Crescente |
| pf_os | responsavelId Crescente; ativo Crescente; posicaoFila Crescente |
| pf_os | responsavelId Crescente; dataEntrada Decrescente |
| pf_os_eventos | osId Crescente; revisao Decrescente |
| pf_os_painel | ativo Crescente; posicaoFila Crescente |
| pf_os | status Crescente; dataEntrada Decrescente |
| pf_os | responsavelId Crescente; status Crescente; dataEntrada Decrescente |
| pf_os | servicoId Crescente; dataEntrada Decrescente |
| pf_os | responsavelId Crescente; servicoId Crescente; dataEntrada Decrescente |
| pf_os | prioridade Crescente; dataEntrada Decrescente |
| pf_os | responsavelId Crescente; prioridade Crescente; dataEntrada Decrescente |

### Estrutura dos arquivos

- `js/`, `css/`, `img/` e `os/`: arquivos usados pelo site.
- `firebase/`: regras e índices do Firestore.
- `data/marcas-papelaria-futura.json`: catálogo de marcas para importação manual.
- `tools/restaurar-backup.mjs`: ferramenta de recuperação de documentos ausentes.
- `tests/`: verificações locais, separadas do site.
- `docs/MANUAL.md`: orientações consolidadas.

A página antiga setup.html foi retirada. O sistema já utiliza a Administração para cadastrar colaboradores.


<a id="backup"></a>
## Backup e recuperação

Em Administração → Backup, o administrador baixa um único JSON com os documentos completos. Não é o Excel resumido antigo. O arquivo contém dados pessoais e configurações de acesso: guarde fora do repositório, em local seguro, preferencialmente com outra cópia em outro dispositivo.

Inclui as 32 coleções usadas pelo projeto: cotações de todos os modelos (e itens), comissões e lançamentos, usuários/perfis, configurações, cadastro de clientes, vendas e itens, sessões de caixa, produtos, marcas, movimentos de estoque, custos, serviços, entregas, clientes/compras/pagamentos/histórico de promissórias e cartas de anuência. Inclui também configurações individuais, regras de base, comissões por venda, pagamentos e auditoria da área Vendas e Comissões. Inclui ordens de serviço, controle de numeração e posição na fila, histórico completo de alterações e a projeção do painel. Inclui também fechamentos de caixa, movimentos de dinheiro, ajustes auditáveis, identificação dos caixas e sessões por operador. Inclui lembretes de cotações e versões das cartas. As consultas às subcoleções incluem registros sem documento pai.

Preserva todos os campos, IDs, relacionamentos, datas com precisão de nanossegundos, listas, referências, valores e anexos incorporados nos documentos. Inclui as sugestões e a preferência de salvamento automático deste navegador. Não exporta tokens de sessão.

### Conferência

Confirme o arquivo nos downloads depois de gerar. O sistema só inicia o download após ler todas as áreas diretamente do servidor, sem usar cache offline. O JSON tem contagem por coleção/grupo e total de documentos. Uma coleção vazia é incluída com contagem zero. Gerar um backup depois de uma exclusão não recupera dados apagados anteriormente.

A coleta usa páginas de 500 registros sem limite total. Evite movimentações enquanto gera o backup: as leituras não são uma fotografia transacional do banco. Em caso de erro de rede ou permissão, corrija e gere novamente.

### Recuperação de documentos ausentes

O utilitário tools/restaurar-backup.mjs lê este formato. Por segurança, o padrão é uma simulação: informa documentos existentes e ausentes, sem gravar nada. Com --apply, somente recria os ausentes e preserva os documentos existentes; não apaga, não sobrescreve e não duplica IDs. Uma execução interrompida pode ser retomada. Não é uma reversão de alterações em documentos existentes.

Use um computador confiável com Node.js, firebase-admin instalado e credenciais administrativas do projeto configuradas no ambiente (Application Default Credentials). Não coloque chaves privadas no repositório ou no navegador. Este utilitário deve ser operado por quem administra o Firebase.

    node tools/restaurar-backup.mjs "CAMINHO_DO_BACKUP.json"
    node tools/restaurar-backup.mjs "CAMINHO_DO_BACKUP.json" --apply

Antes de aplicar, guarde uma cópia do banco atual e confira a simulação. O utilitário valida projeto, formato, caminhos, duplicidades e todos os valores antes de iniciar as gravações. As preferências locais ficam preservadas no JSON, mas não são aplicadas pelo utilitário de servidor.

### Limites

O navegador não pode exportar contas/senhas do Firebase Authentication. Os perfis de usuários do Firestore estão incluídos, mas não recriam contas de login. Arquivos externos, código, regras e índices são protegidos separadamente pelo repositório e pelas ferramentas administrativas do Firebase. Anexos incorporados aos documentos estão incluídos integralmente. As coleções criadas manualmente fora do código precisam ser adicionadas ao inventário js/backup.js.

### Verificação local

    node tests/backup-check.mjs

O teste cobre tipos e precisão, campos semelhantes a marcadores, anexos longos, comissões e registros sem pai, preferências, falhas de leitura, inventário das áreas e paginação de 1.001 registros. O teste não acessa nem altera o Firebase real.


<a id="comissoes"></a>
## Vendas e comissões

Nova opção em Administração → Vendas e Comissões. Usa as vendas reais do caixa (pf_vendas), os perfis de usuários existentes e o Firebase já configurado. Não depende de Cloud Functions nem de um novo serviço pago.

### Uso

O painel mostra faturamento, número de vendas, comissões geradas, pendentes e pagas e faturamento após comissões. O resultado não é chamado de lucro. Os filtros usam a data da venda; a consulta de pagamentos tem datas próprias. A pesquisa por nome também restringe os indicadores e exportações.

Os vendedores cadastrados aparecem mesmo sem vendas. Vendedores removidos que ainda tenham vendas continuam identificados por seu ID. Vendas sem ID de vendedor ficam como “Vendedor não identificado”. Não são atribuídas a outra pessoa.

Cada vendedor tem percentual individual de 0 a 100%, com até duas casas decimais. Cálculos são feitos em centavos e o percentual é armazenado em centésimos de ponto percentual. O total da venda é arredondado para centavos ao concluir. A base considera o total após descontos e estornos, com opção de excluir frete. O caixa atual não tem campo de frete e grava zero nesse campo.

A regra e o percentual são copiados para cada comissão: mudanças posteriores não alteram o histórico. A venda e a comissão são gravadas na mesma transação, usando o ID da venda como ID da comissão. Uma repetição da mesma gravação não cria outra comissão.

As vendas por dinheiro, cartão e Pix concluídas são consideradas pagas. Fiado e convênio ficam sem comissão elegível enquanto não houver confirmação do recebimento. Em Vendedor → Ver / ajustar, marque “Cliente já pagou” e informe o motivo. Também é possível cancelar, registrar devolução integral e informar estorno parcial acumulado. Venda e comissão são ajustadas juntas. Pagamentos de comissão já efetuados são preservados; eventuais excessos aparecem como valores a recuperar. Esse ajuste não repõe estoque nem efetua devolução de dinheiro ao cliente.

O percentual vigente na conclusão é preservado mesmo quando uma venda fiada é recebida depois. As alterações administrativas geram histórico com responsável, data e valores anteriores e novos. Pagamentos ficam registrados de forma imutável na consulta própria.

### Vendas antigas

As vendas existentes entram automaticamente nos indicadores de faturamento. Quando não possuem comissão histórica, ficam aguardando conferência. “Conferir vendas antigas” permite selecionar vendas elegíveis no período, conferir ou informar o percentual histórico e confirmar a geração. O percentual atual é só uma sugestão. Até 25 vendas podem ser conferidas por confirmação; cada gravação é idempotente e preserva comissões existentes. Em caso de interrupção, reabra a conferência: as já geradas não serão duplicadas.

As antigas planilhas de comissão e as comissões de cotações continuam separadas e não foram apagadas ou alteradas. Não são convertidas automaticamente em pagamentos desta nova área. Confira o que já foi pago antes de gerar comissões retroativas. Não é possível descobrir o percentual ou pagamento histórico que não existe mais no banco ou em outro backup.

### Pagamentos

Na linha do vendedor, clique em Pagar, ou selecione o vendedor no filtro e use Registrar pagamento. A lista busca pendentes de todos os períodos, em páginas de 50 registros. Selecione até 3 comissões por operação, confira o total, informe valor integral ou parcial em cada linha, data, PIX/dinheiro/transferência e observação opcional.

O limite de 3 mantém as verificações cruzadas dentro dos limites das regras do Firestore. É possível fazer outras operações para as comissões restantes. Pagamento, saldo e histórico são gravados juntos em transação. A mesma tentativa reutiliza um identificador, impedindo duplicidade em um reenvio. Tentativas concorrentes revalidam o saldo no servidor. As regras também rejeitam pagamento excessivo, adulteração de percentual histórico e alteração/exclusão dos pagamentos.

Cada lançamento de pagamento pertence a uma comissão e contém o lote, venda e vendedor, valor, saldos anterior e posterior, responsável, data informada e horário de registro. Uma operação com 3 comissões produz 3 lançamentos do mesmo lote, cuja soma é o total confirmado.

### Relatórios e desempenho

PDF e Excel contêm empresa, período, vendedor, totais, percentuais, valores gerados, pagos e pendentes, data de geração e detalhe com os percentuais históricos por venda. A tela inclui quatro gráficos e ranking por faturamento. O PDF é próprio para impressão e o Excel guarda valores numéricos com formatação em reais.

Os indicadores usam duas consultas em tempo real restritas ao período selecionado, somente enquanto a aba está aberta. Não carregam todas as vendas históricas na abertura: o padrão é o mês atual. Tabelas de vendedores e detalhes mostram 25 linhas por página. Histórico e pagamentos usam paginação no banco de 50 documentos. A consulta de pagamentos filtra também pelo vendedor no servidor. Seu total é explicitamente o dos registros carregados; use “Carregar mais” para consultar o restante.

As regras do Firestore são a validação no servidor, inclusive cálculos e saldos cruzados entre documentos. A interface não é a única proteção. Alterações feitas diretamente pelo Console/Admin SDK ignoram essas regras; faça ajustes pelo painel do sistema para manter a operação atômica e a auditoria. O painel recalcula os indicadores com a situação atual da venda, mas não há um serviço em segundo plano para processar mudanças manuais pelo console.

### Backup

As 5 novas coleções foram incluídas no backup completo: configurações dos vendedores, base de cálculo, comissões por venda, pagamentos e auditoria. O inventário agora contém 32 coleções do projeto, além das subcoleções. Veja [Backup e recuperação](#backup).

### Testes

- `node tests/vendas-comissoes-core-check.mjs`: cálculo monetário, percentuais, histórico, filtros, elegibilidade, pagamentos parciais e estornos.
- `node tests/backup-check.mjs`: inventário e dados completos do backup.
- `node tests/vendas-comissoes-firestore-check.mjs`: integra o módulo real de persistência com o emulador do Firestore em 127.0.0.1:8089, projeto demo-futura-test. Requer firebase e @firebase/rules-unit-testing instalados para teste e o emulador iniciado. A variável VC_TEST_DEPENDENCIES pode apontar para o package.json dessas dependências instaladas fora do repositório. Não usa credenciais do projeto de produção.

Foram verificados no emulador: regras compiladas, acesso de administrador/vendedor/anônimo, gravação atômica, preservação de percentuais históricos, repetição de operações, pagamentos parciais e concorrentes, excesso de pagamento e adulteração bloqueados, lote de 3 comissões, fiado, retroativas, cancelamentos após pagamentos e estornos parciais. A interface foi conferida no navegador com dados de teste, inclusive em 390px, e gerou arquivos PDF e Excel reais. A validação final com o site publicado depende da publicação das regras e índices e de uma conferência no seu projeto.


A integração atual com sessões, comprovantes A4/58/80 e fechamentos está descrita em [Caixa e comprovantes](#caixa). O pagamento das comissões permanece no ADM e não movimenta automaticamente a gaveta. O registro opcional da venda na planilha é atômico e dispensa senha somente para essa inclusão.


<a id="caixa"></a>
## Caixa e comprovantes

### O que foi implementado

O Caixa mantém o fluxo de passar vendas. Ao finalizar, continua permitindo selecionar o vendedor e uma planilha opcional. Adicionar a linha dessa venda à planilha não pede a senha; as demais proteções da planilha permanecem. Venda, registro na planilha, comissão e movimentação da sessão são confirmados na mesma transação, com proteção contra repetição.

O comprovante abre automaticamente após a venda, com impressão, download PDF e Nova venda. Há três formatos: **A4, 58 mm e 80 mm**. O padrão inicial é **A4**. O A4 segue o modelo azul e branco enviado; os térmicos adaptam os mesmos dados para a largura do papel. Usa a logo real do projeto. É um comprovante comercial não fiscal.

No ADM → Histórico de Caixas ficam os relatórios completos, os filtros por período, operador e caixa, o PDF, a impressão, a movimentação de dinheiro e os dados da loja. O operador vê suas próprias vendas; o administrador consulta todas. O novo cargo “Operador de caixa” pode ser atribuído no cadastro de usuários.

Comissões são calculadas com o percentual vigente na venda e permanecem congeladas no histórico. Seu pagamento continua na área Vendas e Comissões do ADM. Não há pagamento de comissão na tela do Caixa nem desconto automático da comissão no dinheiro da gaveta.

### Uso diário

Abra o caixa identificando-o e informando o troco inicial. Cada venda nova fica vinculada àquela sessão. A numeração inclui o caixa e um identificador único; números antigos permanecem preservados.

Dinheiro, PIX, débito, crédito, outras formas e fiado/convênio são separados. No pagamento misto, informe quanto cabe a cada forma; a soma deve fechar o valor da venda. Troco só se aplica ao dinheiro. Fiado/convênio é mostrado separadamente e não entra como dinheiro físico.

Ao fechar, o operador confere o dinheiro esperado e informa quanto contou. O sistema registra sobra, falta ou ausência de diferença. O relatório completo fica no ADM. A confirmação é protegida contra clique duplo e contra vendas/movimentos ocorridos depois de abrir a conferência: nesse caso, é necessário conferir novamente.

Saldo esperado em dinheiro = troco inicial + recebimentos em dinheiro + suprimentos − sangrias − devoluções efetivamente lançadas em dinheiro. PIX e cartões não entram nessa conta.

No ADM → Histórico de Caixas → Movimentação de dinheiro, o administrador seleciona uma sessão aberta e lança suprimento, sangria ou devolução com motivo. Uma devolução em dinheiro exige a venda cancelada/estornada vinculada e respeita o valor ainda devolvível. Cancelar a venda, por si só, não presume que dinheiro já foi entregue ao cliente.

O relatório mantém recebimentos brutos por forma de pagamento e mostra cancelamentos/estornos e devoluções separadamente. O total líquido e a comissão válida refletem os ajustes registrados até o fechamento. Alterações posteriores geram ajustes rastreáveis, preservando o fechamento original.

No Histórico de Vendas ou em ADM → Vendas Realizadas, é possível visualizar os itens, gerar o comprovante, baixar o PDF ou reimprimir. Essas ações usam os dados salvos e não criam outra venda, comissão ou linha na planilha.

Para imprimir, selecione A4, 58 mm ou 80 mm no comprovante e escolha a impressora instalada na janela do navegador. Configure o papel e a escala correspondentes no driver. O PDF também respeita o tamanho selecionado.

### Histórico, correções e caixas anteriores

Os novos fechamentos guardam um snapshot consolidado no Firestore, sem armazenar PDFs grandes no banco. O PDF pode ser regenerado a partir desse snapshot. Itens, preços, nomes e percentuais são preservados nas transações, mesmo se o cadastro mudar depois.

Fechamentos confirmados não aceitam edição comum nem exclusão pelas regras do aplicativo. O administrador pode registrar uma correção com motivo, usuário, data e valores anteriores/novos; ela aparece em Ajustes posteriores e não substitui o relatório original. Movimentações registradas também ficam disponíveis para auditoria, com paginação.

Se houver caixa antigo aberto, o administrador deverá concluir a transição informando contagem e motivo antes de registrar vendas no modelo novo. Os dados anteriores são preservados. O sistema não inventa vínculos entre vendas antigas e sessões sem esse relacionamento.

Em Fechamentos antigos, os relatórios utilizam somente os campos que o sistema anterior realmente armazenou. Dados históricos ausentes não podem ser reconstruídos automaticamente. A atualização não recupera documentos que já foram apagados antes dela.

Não foi configurada exclusão automática de fechamentos. A permanência depende da manutenção do projeto Firebase e de sua capacidade. O backup completo agora inclui **32 coleções principais**, além dos grupos de subcoleções, inclusive os novos fechamentos, movimentos, ajustes e controles de sessão. Veja [Backup e recuperação](#backup) para limites e recuperação.

### Validação realizada

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


<a id="os"></a>
## Ordens de serviço

### Implementação local

A nova seção foi integrada ao projeto existente. Menu, no desktop e no celular:

Dashboard → Orçamento Futura → Orçamentos FM3 → Orçamentos HTL → Nova Cotação → Caixa → Ordem de Serviço → Comissão → Entrega → demais opções na ordem anterior.

A referência analisada foi somente Gerenciar Fila do ZIP garragem-autocar-main (1).zip: js/modules/fila/management.js, js/modules/fila/tv.js, js/utils/queue.js e a persistência correspondente em api/queue.js e api/_queue.js. Foram adaptados o controle de revisão, a troca atômica de posições, o histórico antes/depois, a projeção de exibição e a rotação do painel. Não foram importados cadastros ou recursos da oficina.

Não foram alterados os cálculos nem o fluxo do Caixa e da Comissão. A Entrega recebeu apenas a lista de OS prontas e o vínculo de confirmação.

### Cadastro e uso

Clique em Nova Ordem de Serviço. Selecione um cliente existente, pesquisando pelo início do nome, ou informe o nome manualmente. O cadastro manual na OS não cria outro cadastro de cliente. Selecione um serviço ativo do cadastro existente e um funcionário autorizado.

Preencha descrição, previsão de conclusão e previsão de entrega em campos separados. Quantidade, material, dimensão, acabamento, prioridade e observações internas ficam na mesma OS. A entrada e o usuário criador são registrados automaticamente. O número sequencial é reservado pelo banco em transação, inclusive com cadastros simultâneos. Repetir a confirmação da mesma operação não cria outra OS.

O cadastro começa em Aguardando. Use as ações para seguir o fluxo:

Aguardando → Em produção → Pronto → Entregue.

Iniciar produção registra a data real de início; Marcar pronto registra a conclusão; Registrar entrega registra a entrega e o funcionário. Cancelamento exige administrador e motivo. Ordens entregues e canceladas permanecem no histórico e não voltam à fila por edição comum.

O administrador pode editar os dados enquanto a OS estiver ativa, trocar o responsável, alterar previsões e definir prioridade. A prioridade é uma indicação; a posição continua sob controle manual. Subir e Descer trocam a posição com a ordem vizinha na fila completa, mesmo quando há filtros na tela. A posição e a revisão ficam salvas no banco. Se outra pessoa alterar a mesma ordem durante a conferência, a operação é recusada para que os dados sejam revistos.

Cada funcionário com cargo Operador de OS consulta suas próprias ordens e atualiza o andamento delas. Apenas administradores cadastram, editam dados administrativos, reordenam e cancelam. As restrições também estão nas regras do Firestore.

### Prazos e histórico

Os indicadores não substituem o status. Até uma hora antes da previsão aparece Próximo do prazo. Após o horário, sem conclusão, aparece Atrasado. Quando concluído, o indicador compara a conclusão real com a previsão vigente naquele momento. A previsão original e todas as alterações ficam preservadas no histórico.

Não existe limpeza ou reinício da fila à meia-noite. Pendências de dias anteriores continuam ativas.

Histórico de OS consulta todas as ordens, incluindo entregues e canceladas, em páginas de até 40 resultados. Pesquisas por número, cliente, serviço ou responsável podem ser combinadas com status, funcionário, serviço, prioridade, atraso, entrada e previsão. A pesquisa alcança ordens antigas além da primeira página. Carregar mais acrescenta a próxima página sem perder os filtros.

As consultas usam os filtros seletivos disponíveis no Firestore e leem lotes de 40. Pesquisa textual livre e combinações adicionais são conferidas nesses lotes até completar a página ou chegar ao fim; em históricos grandes, podem exigir mais leituras. Trocar os filtros cancela a continuação da consulta anterior.

Detalhes mostra todos os dados da OS. Histórico de alterações lista criação, edições, trocas de responsável, mudanças de previsão, status e reordenações, com usuário, horário, motivo e valores anteriores/novos. As alterações são paginadas em grupos de 30. Os registros não aceitam edição ou exclusão comum.

### Painel independente

Use Abrir painel da fila ou acesse **/os/painel** no mesmo domínio do sistema.

O painel exige login autorizado. Administradores, operadores de OS e usuários com cargo **Painel de OS (somente exibição)** podem consultá-lo. Para uma TV, use uma conta existente ou cadastrada pelo administrador com esse cargo, sem conceder administração. Faça o login no mesmo navegador e abra o endereço do painel.

O painel utiliza uma projeção separada, atualizada na mesma transação da OS, com número, nome abreviado do cliente, serviço, funcionário, previsão, status e prioridade. Telefone, documentos, valores, descrição e observações internas não são enviados a essa página. Usuários somente de painel não podem ler a coleção privada das OS.

A fila é atualizada em tempo real. A paginação se adapta ao espaço disponível, preserva a ordem e alterna a cada 15 segundos. O botão Tela cheia usa o recurso do navegador. Não há corte intencional de nomes ou serviços. Em telas muito pequenas, o conteúdo continua disponível por rolagem.

Sem conexão, o painel informa que os dados podem estar desatualizados. Não apresenta os dados locais como confirmação de gravação no servidor. Se o acesso for revogado, a lista é retirada da tela.

### Integração com Entrega

OS em Pronto aparecem na seção Entrega para os usuários autorizados. A confirmação também pode ser feita na própria fila. Nos dois casos, a mesma operação:

- Registra a data e o funcionário.
- Atualiza a OS para Entregue.
- Retira a OS da fila ativa.
- Cria um único registro vinculado em pf_entregas, com ID reservado os_ID_DA_OS.
- Preserva o histórico.

Pronto não significa Entregue. Os registros de entrega vindos de OS são identificados na lista e não aceitam alteração ou exclusão pelo formulário antigo. As demais entregas mantêm o funcionamento anterior.

### Dados e backup

Coleções novas:

- pf_os: ordens completas, nomes preservados, previsões originais e vigentes, datas reais, posição e revisão.
- pf_os_controle: sequência e revisão da fila.
- pf_os_eventos: histórico imutável com snapshots anteriores e posteriores.
- pf_os_painel: projeção restrita para a página de exibição.

Clientes vêm de clientes_cadastro; tipos de serviço, de pf_servicos; funcionários, de usuarios. Não há cadastros paralelos nem migração destrutiva dos dados existentes.

As quatro novas coleções estão no backup completo. O inventário atual contém **32 coleções principais**, além dos grupos de subcoleções. Consulte [Backup e recuperação](#backup) para limites e restauração.

### Validação realizada

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


<a id="sessao"></a>
## Sessão e cadastro de colaboradores

As alterações são locais. O banco de produção e as contas reais não foram alterados nos testes.

### Corrigido

- O cadastro de um colaborador usa um acesso temporário separado. A conta do administrador permanece conectada, inclusive ao salvar o perfil e os cargos do novo funcionário.
- O acesso temporário é encerrado depois do cadastro e não é mantido no navegador.
- Uma falha ao salvar o perfil não aparece mais como cadastro concluído. O formulário permite repetir essa gravação usando a conta já criada, sem cadastrar outro login.
- Cliques ou Enter repetidos não iniciam várias tentativas de login simultâneas.
- A tela aguarda a restauração inicial da autenticação antes de decidir se precisa voltar ao login.
- Saída ou troca de conta em outra aba interrompe o uso da página com a identidade anterior.
- Uma falha de rede ao buscar o perfil exibe uma opção de tentar novamente; não transforma o administrador em “Usuário” silenciosamente.
- O perfil inicial é criado em transação, sem sobrescrever cargos que outra aba ou o administrador já tenham configurado.
- Falha ao sair é informada, em vez de apresentar uma saída bem-sucedida sem confirmação.
- Ao retornar por uma página preservada no histórico do navegador, o sistema recarrega a autenticação.
- A preferência “Manter conectado” continua sendo respeitada: conexão persistente quando marcada e sessão da aba quando desmarcada.

### Testes

tests/sessao-check.mjs cobre restauração inicial, troca de conta durante a leitura do perfil, saída em outra aba, falha de rede, criação concorrente do perfil, retorno pelo histórico, login repetido e as duas preferências de persistência.

tests/sessao-firebase-check.mjs utiliza o SDK real com emuladores locais de Authentication e Firestore: criação isolada, gravação do perfil com a conta administrativa, limpeza do acesso temporário, falha no cadastro, nova tentativa de gravação sem criar outro login, bloqueios de alteração de cargos e saída acompanhada.

Os testes não utilizam credenciais ou contas de produção. O teste de Firebase precisa das dependências firebase, firebase-tools e @firebase/rules-unit-testing, além do emulador Firestore. As verificações de regressão de OS, PDV, comissões e backup também devem permanecer aprovadas.
