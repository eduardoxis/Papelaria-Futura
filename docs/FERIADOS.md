# Calendário da Loja

## Ativação

O calendário integra Gestão de Escalas, autenticação Firebase e o Firestore já utilizado pelo sistema. A API exige administrador ou gestor de escalas. As decisões e atualizações são feitas pelo servidor; o navegador não pode escrever diretamente nas coleções.

1. Configure `FIREBASE_SERVICE_ACCOUNT_JSON` na Vercel conforme [ESCALAS.md](ESCALAS.md).
2. Configure também `CRON_SECRET` com um segredo aleatório de pelo menos 32 caracteres, somente no servidor.
3. Publique as regras e os índices de `firebase/` e faça um novo deploy da Vercel.
4. Entre como gestor em Gestão de Escalas → Calendário da Loja. A carga inicial é automática, sem botão de importação.

O agendamento em `vercel.json` executa diariamente às 09:00 UTC (06:00 de Brasília), atualizando o ano atual e o seguinte. Seu funcionamento depende da ativação dos Cron Jobs nesse projeto da Vercel. Sem configuração do agendador, a primeira carga e a atualização manual autorizada continuam disponíveis. O endpoint cron exige `Authorization: Bearer <CRON_SECRET>`.

Não foram cadastradas credenciais nem feitas alterações no Firebase de produção nesta entrega. Os testes utilizam o serviço real com banco em memória.

## Uso

O calendário abre no mês atual e permite navegar entre meses e anos. Cada feriado da loja começa aguardando decisão. Clique no dia e escolha horário normal, especial ou fechamento. Segunda a sexta: 08:00–18:30; sábado: 08:00–16:00. Domingo não tem horário habitual e exige informar os horários. O horário habitual também pode ser alterado na configuração existente.

Cada escolha vale para uma data específica da instalação da Futura. O documento de Natal de 2026 não decide o Natal de 2027. Dias comuns também podem receber horários especiais, preservando sua classificação oficial. A gravação apresenta uma prévia e exige confirmação. Conflitos de revisão retornam HTTP 409.

Fechar uma data retira sua necessidade de cobertura e impede a geração automática de trabalho nela. Abrir usa o período escolhido e confere a cobertura exata, incluindo os intervalos. Aguardando decisão permite rascunho, mas bloqueia a publicação da semana afetada. Autorizações coletivas, condições municipais e aplicabilidade do feriado ao comércio são verificadas separadamente.

Uma mudança em data com escala publicada mostra os colaboradores e turnos atingidos. A publicação original permanece disponível; a nova decisão marca a necessidade de revisar e republicar a escala. Atualizações oficiais preservam as escolhas e registram avisos quando datas ou fundamentos mudam. A revisão deve alcançar todas as datas envolvidas.

## Compensação em dobro

A decisão da data oferece pagamento 2× ou banco 2:1; o cartão individual pode ajustar a opção. O cálculo usa minutos líquidos de trabalho. Exemplo: cinco horas de abertura com intervalo individual de quinze minutos produzem 4h45 trabalhadas e 9h30 equivalentes para aquele colaborador. A cobertura da loja continua abrangendo as cinco horas completas, exigindo outro colaborador durante o intervalo quando houver cobertura mínima.

A jornada contratual conserva os minutos reais. A equivalência é uma previsão, sem lançar salários, ponto ou créditos no banco automaticamente. O banco 2:1 implementa a política solicitada pela Futura e exige cláusula válida cadastrada no instrumento aplicável. A [Lei 605, art. 9º](https://www2.camara.leg.br/legin/fed/lei/1940-1949/lei-605-5-janeiro-1949-367115-normaatualizada-pl.html) prevê remuneração em dobro do trabalho em feriado, ressalvando outro dia de folga; não estabelece uma autorização universal para banco em dobro.

## Fontes oficiais e consulta executada

A carga real de 2026 está em [data/feriados-inicial-2026.json](../data/feriados-inicial-2026.json). Foram consolidados 33 eventos, incluindo feriados e datas administrativas. As evidências guardam URL, órgão, ato, dispositivo, hash, verificação e trecho. A data de assinatura do ato é separada da data de publicação; quando esta não pôde ser identificada, permanece vazia.

- União: [Portaria MGI 11.460/2025 no DOU](https://www.in.gov.br/en/web/dou/-/portaria-mgi-n-11.460-de-29-de-dezembro-de-2025-678388627), [Lei 662](https://www.planalto.gov.br/ccivil_03/leis/l0662.htm), [Lei 6.802](https://www.planalto.gov.br/ccivil_03/leis/l6802.htm) e [Lei 14.759](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm). Nove datas fixas foram confirmadas nas leis. A consulta dinâmica do Sigepe permanece pendente; Paixão de Cristo ainda exige conferir a base religiosa aplicável ao município/comércio.
- Goiás: [API pública efetivamente consultada da Casa Civil, Lei 20.756](https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/100979), busca de decretos e documentos do Diário Oficial. As datas restritas à administração pública são informativas. Um ato de expediente em dias de jogos não teve datas extraídas com segurança; uma edição do Diário ultrapassou o limite de 8 MB. Essas pendências aparecem no status.
- Luziânia: [Decreto 005 de 12/01/2026 e anexos](https://www.luziania.go.gov.br/decreto-no-005-de-12-de-janeiro-de-2026/). O anexo lido traz Folia de Rua em 22/05, Dia do Evangélico em 30/11 e aniversário em 13/12. A versão anterior trazia Folia em 15/05 e permanece no histórico. Não foi presumida transferência do aniversário para 14/12. As leis instituidoras para aplicação ao comércio dessas datas ainda não foram confirmadas e ficam sinalizadas.

O calendário administrativo municipal não foi promovido automaticamente a autorização legal para comércio. O Dia do Evangélico aparece e permite salvar 08:00–13:00; a publicação de trabalho nessa data depende também da confirmação da base aplicável e dos instrumentos exigidos.

## API, armazenamento e desempenho

Todas as respostas financeiras/de pessoal são privadas e sem cache HTTP. Endpoints autenticados:

- `GET /api/feriados?ano=2026` ou `?inicio=2026-11-01&fim=2026-12-31`; filtros opcionais `tipo` e `abrangencia`.
- `GET /api/feriados/status?ano=2026`.
- `POST /api/feriados/sincronizar`, corpo `{"ano":2026}`, somente gestor.
- `POST /api/feriados?acao=simular_decisao` e `?acao=decisao`, usados pela interface com revisão e confirmação de impacto.

Os leitores acessam HTTPS de uma lista de portais oficiais, conferem redirecionamentos, limites e formatos e fazem extração de HTML/PDF. Falhas não apagam dados confirmados. Mudanças relevantes geram versões históricas, escolhas ficam separadas e PDFs não são gravados no Firestore. Anos futuros começam com datas recorrentes já comprovadas em lei e status pendente para os demais atos anuais; não recebem as escolhas do ano anterior.

A interface reutiliza dados anuais por cinco minutos. As listagens consultam dados consolidados no Firestore; não baixam PDFs a cada troca de mês. Sincronizações simultâneas do mesmo ano na mesma instância são unificadas. O agendamento evita depender de consultas diárias feitas pelo operador. Os novos dados integram o backup completo existente.

Na primeira abertura, a base oficial já consultada e embarcada é gravada automaticamente no Firestore, sem esperar os portais externos. Para anos futuros, as fontes anuais não consultadas permanecem pendentes até a atualização diária ou o botão Atualizar agora. A escala lê o calendário em sua própria transação; falhar a API específica do calendário não impede abrir as demais abas.

O leitor de PDF é carregado somente ao processar documentos durante uma atualização. O pacote de publicação inclui explicitamente seu worker e as dependências nativas. Se o leitor falhar, a atualização registra a fonte pendente e preserva os dados anteriores, sem derrubar as APIs. Essa inclusão segue a [configuração de arquivos das funções da Vercel](https://vercel.com/docs/project-configuration/vercel-json).

## Verificação local

`npm run test:feriados` executa 18 testes de extração de documentos oficiais, persistência, autorização, concorrência, revisão, falhas de fonte, ano novo, domingos, cobertura e compensação. Em ambiente com restrição a subprocessos: `node --test --test-isolation=none tests/escalas-*.test.mjs tests/feriados.test.mjs`.

O cenário Chrome executado em `tests/escalas-interface.mjs` salva 30/11/2026 das 08:00 às 13:00, recarrega a página, confere o texto persistido e gera a semana com cobertura de 300 minutos. Também verifica larguras de 390 e 1440 px, além dos fluxos de edição/publicação da escala. O serviço utiliza banco em memória, sem acessar produção.

`node tests/feriados-inicializacao-check.mjs` simula o leitor PDF indisponível em um processo novo: ambas as APIs devem iniciar e responder JSON, e a primeira carga do calendário deve funcionar. O teste Chrome também simula HTTP 500 no calendário, verifica que a escala abre e testa a recuperação pelo botão Tentar novamente.

Para repetir somente a consulta externa: `node tools/consultar-feriados.mjs 2026`. Esse comando atualiza o arquivo de evidências inicial e depende da disponibilidade dos portais oficiais; não altera o Firestore.
