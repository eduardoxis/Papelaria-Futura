# Vendas e Comissões

Nova opção em Administração → Vendas e Comissões. Usa as vendas reais do caixa (pf_vendas), os perfis de usuários existentes e o Firebase já configurado. Não depende de Cloud Functions nem de um novo serviço pago.

## Publicação sem npx

Faça a atualização em um horário sem vendas: o novo caixa e as novas regras precisam entrar juntos. Não foi alterado o banco de produção durante o desenvolvimento.

1. Na pasta do repositório, execute `notepad firestore.rules`. Copie o conteúdo completo. No painel Firebase do projeto **papelaria-futura**, abra Firestore Database → Regras, substitua pelas regras copiadas e publique. As regras existentes estão preservadas, com validações adicionais para o novo controle.
2. Em Firestore Database → Índices → Índices compostos, crie os dois índices abaixo, com escopo **Coleção**, mantendo os índices que já existem:

| Coleção | Campos, nesta ordem |
| --- | --- |
| pf_comissoes_vendas | vendedorId: crescente; status: crescente; dataVenda: crescente |
| pf_comissao_pagamentos | vendedorId: crescente; dataPagamento: decrescente |

Aguarde os dois ficarem ativados. Os mesmos índices estão registrados em firestore.indexes.json para quem usa a ferramenta de publicação do Firebase.

3. Envie o código pelo Git. No CMD:

```bat
cd /d "C:\Users\Vendas-03\Documents\Codex\2026-11-04\quero-que-vc-nesse-projeto-vc\work\Papelaria-Futura-publicar" && git add js css index.html service-worker.js firestore.rules firestore.indexes.json firebase.json BACKUP.md VENDAS_COMISSOES.md tests tools && git commit -m "Adiciona controle administrativo de vendas e comissoes por vendedor" && git push origin HEAD
```

4. Espere a publicação do site terminar. Atualize o site e abra a nova opção no ADM. Configure os percentuais dos vendedores antes das próximas vendas. Sem configuração, o percentual é **0%**.
5. Faça uma venda pequena de conferência e confirme vendedor, valor e comissão. Gere um novo backup completo depois da conferência.

Se uma consulta informar que falta um índice, confira os campos e direções acima. Não apague índices existentes.

## Uso

O painel mostra faturamento, número de vendas, comissões geradas, pendentes e pagas e faturamento após comissões. O resultado não é chamado de lucro. Os filtros usam a data da venda; a consulta de pagamentos tem datas próprias. A pesquisa por nome também restringe os indicadores e exportações.

Os vendedores cadastrados aparecem mesmo sem vendas. Vendedores removidos que ainda tenham vendas continuam identificados por seu ID. Vendas sem ID de vendedor ficam como “Vendedor não identificado”. Não são atribuídas a outra pessoa.

Cada vendedor tem percentual individual de 0 a 100%, com até duas casas decimais. Cálculos são feitos em centavos e o percentual é armazenado em centésimos de ponto percentual. O total da venda é arredondado para centavos ao concluir. A base considera o total após descontos e estornos, com opção de excluir frete. O caixa atual não tem campo de frete e grava zero nesse campo.

A regra e o percentual são copiados para cada comissão: mudanças posteriores não alteram o histórico. A venda e a comissão são gravadas na mesma transação, usando o ID da venda como ID da comissão. Uma repetição da mesma gravação não cria outra comissão.

As vendas por dinheiro, cartão e Pix concluídas são consideradas pagas. Fiado e convênio ficam sem comissão elegível enquanto não houver confirmação do recebimento. Em Vendedor → Ver / ajustar, marque “Cliente já pagou” e informe o motivo. Também é possível cancelar, registrar devolução integral e informar estorno parcial acumulado. Venda e comissão são ajustadas juntas. Pagamentos de comissão já efetuados são preservados; eventuais excessos aparecem como valores a recuperar. Esse ajuste não repõe estoque nem efetua devolução de dinheiro ao cliente.

O percentual vigente na conclusão é preservado mesmo quando uma venda fiada é recebida depois. As alterações administrativas geram histórico com responsável, data e valores anteriores e novos. Pagamentos ficam registrados de forma imutável na consulta própria.

## Vendas antigas

As vendas existentes entram automaticamente nos indicadores de faturamento. Quando não possuem comissão histórica, ficam aguardando conferência. “Conferir vendas antigas” permite selecionar vendas elegíveis no período, conferir ou informar o percentual histórico e confirmar a geração. O percentual atual é só uma sugestão. Até 25 vendas podem ser conferidas por confirmação; cada gravação é idempotente e preserva comissões existentes. Em caso de interrupção, reabra a conferência: as já geradas não serão duplicadas.

As antigas planilhas de comissão e as comissões de cotações continuam separadas e não foram apagadas ou alteradas. Não são convertidas automaticamente em pagamentos desta nova área. Confira o que já foi pago antes de gerar comissões retroativas. Não é possível descobrir o percentual ou pagamento histórico que não existe mais no banco ou em outro backup.

## Pagamentos

Na linha do vendedor, clique em Pagar, ou selecione o vendedor no filtro e use Registrar pagamento. A lista busca pendentes de todos os períodos, em páginas de 50 registros. Selecione até 3 comissões por operação, confira o total, informe valor integral ou parcial em cada linha, data, PIX/dinheiro/transferência e observação opcional.

O limite de 3 mantém as verificações cruzadas dentro dos limites das regras do Firestore. É possível fazer outras operações para as comissões restantes. Pagamento, saldo e histórico são gravados juntos em transação. A mesma tentativa reutiliza um identificador, impedindo duplicidade em um reenvio. Tentativas concorrentes revalidam o saldo no servidor. As regras também rejeitam pagamento excessivo, adulteração de percentual histórico e alteração/exclusão dos pagamentos.

Cada lançamento de pagamento pertence a uma comissão e contém o lote, venda e vendedor, valor, saldos anterior e posterior, responsável, data informada e horário de registro. Uma operação com 3 comissões produz 3 lançamentos do mesmo lote, cuja soma é o total confirmado.

## Relatórios e desempenho

PDF e Excel contêm empresa, período, vendedor, totais, percentuais, valores gerados, pagos e pendentes, data de geração e detalhe com os percentuais históricos por venda. A tela inclui quatro gráficos e ranking por faturamento. O PDF é próprio para impressão e o Excel guarda valores numéricos com formatação em reais.

Os indicadores usam duas consultas em tempo real restritas ao período selecionado, somente enquanto a aba está aberta. Não carregam todas as vendas históricas na abertura: o padrão é o mês atual. Tabelas de vendedores e detalhes mostram 25 linhas por página. Histórico e pagamentos usam paginação no banco de 50 documentos. A consulta de pagamentos filtra também pelo vendedor no servidor. Seu total é explicitamente o dos registros carregados; use “Carregar mais” para consultar o restante.

As regras do Firestore são a validação no servidor, inclusive cálculos e saldos cruzados entre documentos. A interface não é a única proteção. Alterações feitas diretamente pelo Console/Admin SDK ignoram essas regras; faça ajustes pelo painel do sistema para manter a operação atômica e a auditoria. O painel recalcula os indicadores com a situação atual da venda, mas não há um serviço em segundo plano para processar mudanças manuais pelo console.

## Backup

As 5 novas coleções foram incluídas no backup completo: configurações dos vendedores, base de cálculo, comissões por venda, pagamentos e auditoria. O inventário agora contém 32 coleções do projeto, além das subcoleções. Veja BACKUP.md.

## Testes

- `node tests/vendas-comissoes-core-check.mjs`: cálculo monetário, percentuais, histórico, filtros, elegibilidade, pagamentos parciais e estornos.
- `node tests/backup-check.mjs`: inventário e dados completos do backup.
- `node tests/vendas-comissoes-firestore-check.mjs`: integra o módulo real de persistência com o emulador do Firestore em 127.0.0.1:8089, projeto demo-futura-test. Requer firebase e @firebase/rules-unit-testing instalados para teste e o emulador iniciado. A variável VC_TEST_DEPENDENCIES pode apontar para o package.json dessas dependências instaladas fora do repositório. Não usa credenciais do projeto de produção.

Foram verificados no emulador: regras compiladas, acesso de administrador/vendedor/anônimo, gravação atômica, preservação de percentuais históricos, repetição de operações, pagamentos parciais e concorrentes, excesso de pagamento e adulteração bloqueados, lote de 3 comissões, fiado, retroativas, cancelamentos após pagamentos e estornos parciais. A interface foi conferida no navegador com dados de teste, inclusive em 390px, e gerou arquivos PDF e Excel reais. A validação final com o site publicado depende da publicação das regras e índices e de uma conferência no seu projeto.


A integração atual com sessões, comprovantes A4/58/80 e fechamentos está descrita em PDV_FECHAMENTOS.md. O pagamento das comissões permanece no ADM e não movimenta automaticamente a gaveta. O registro opcional da venda na planilha é atômico e dispensa senha somente para essa inclusão.
