# Gestão de Escalas

## Ativação no ambiente publicado

A seção usa a autenticação atual, a função Node da Vercel em `/api/escalas` e o Firestore `papelaria-futura`. O navegador envia o token Firebase. O servidor verifica a sessão, consulta o papel do usuário novamente e executa as validações e as gravações em transação.

1. No projeto da Vercel, cadastre a variável **FIREBASE_SERVICE_ACCOUNT_JSON**, contendo o JSON de uma conta de serviço do projeto `papelaria-futura`. Use uma variável de servidor. Mantenha a chave fora do repositório, de arquivos públicos e do navegador. A conta precisa de acesso ao Firestore e à verificação de usuários do Firebase Authentication.
2. Publique as regras e os índices de `firebase/`. Com Node e npm disponíveis, execute na raiz do repositório `npx firebase-tools login` e depois `npx firebase-tools deploy --only firestore:rules,firestore:indexes --project papelaria-futura`. Aguarde a construção dos índices antes de consultar versões.
3. Faça o deploy da Vercel. Ela instala a dependência fixada pelo `package-lock.json` e disponibiliza a API. O `package.json` não exige um build de frontend.
4. Entre com um administrador. Se outro responsável vai gerir as escalas, atribua **Gestor de escalas** em Administração → Usuários.
5. Abra Gestão de Escalas. A primeira configuração e os cadastros são criados conforme o gestor salva os formulários. As coleções existentes são preservadas.

A chave pode ser gerada no Firebase Console em Configurações do projeto → Contas de serviço. Cadastre seu conteúdo diretamente na variável de ambiente da Vercel e faça um novo deploy.

Os comandos `npx` exigem Node.js e npm disponíveis no terminal. Como alternativa, publique o conteúdo de `firebase/firestore.rules` pela aba Regras do Firestore e crie o índice composto de `pf_escalas_versoes`, com `semana` crescente e `criadoEm` decrescente. A ordenação final do identificador acompanha o sentido decrescente definido no arquivo de índices.

A instalação local foi verificada com banco de teste. A chave de serviço, o deploy dos índices e a publicação no ambiente de produção dependem da configuração dessa instalação. Enquanto faltar a variável, a seção apresenta uma mensagem de configuração pendente.

## Dados reais para publicar a primeira semana

- Equipe completa, nomes e vínculos com os usuários que consultarão a própria escala.
- Contratos com vigências, categoria profissional, carga semanal em horas e minutos, limite diário, funções habilitadas, modelo preferido e disponibilidade obrigatória. Identifique quem pode abrir e fechar.
- Férias e afastamentos vigentes. Cadastre restrições obrigatórias separadamente das preferências negociáveis, com data e faixa de horário quando necessário.
- Modelos de turno, inclusive sábado e modelos com almoços alternados. Uma nova vigência com o mesmo nome substitui o modelo para as datas seguintes e preserva o anterior.
- Cobertura mínima por função e faixa de horário para cada dia aberto. Marque as posições indispensáveis e confirme a configuração completa.
- No Calendário da Loja, confira as fontes já carregadas e decida o funcionamento de cada feriado. Cadastre horários especiais também em dias comuns. Pendências de aplicabilidade ao comércio permanecem identificadas; o calendário administrativo de um órgão não autoriza sozinho o trabalho na loja. Veja [calendário e ativação da atualização automática](FERIADOS.md).
- Para a semana de 14 a 20/12/2026, informe o histórico de 07 a 13/12 e a situação conhecida da segunda-feira 14/12. O motor aponta os dias específicos que faltam por pessoa. A data de admissão limita o histórico exigido.
- CCT/ACT realmente aplicável à categoria e à loja, se for necessária alguma exceção. Informe documento HTTPS, sindicatos, cláusula, abrangência, vigência e confirmação. Feriados exigem CCT, regra municipal, datas autorizadas, condições e registro do atendimento delas no cartão.
- Critério confirmado para a semana que atravessa a mudança de etapa de 16/12. Use Regras e vigências → Registrar critério, com pessoa, semana, minutos máximos, motivo e fonte. O sistema exige esse registro quando a semana atravessa tetos ou limites contratuais diferentes.

## Uso da semana

Gerar escala grava um rascunho. Pode gerar de uma a quatro semanas, uma por vez, preservando cartões fixados. Se uma geração de várias semanas for interrompida, as semanas já concluídas permanecem salvas e auditadas.

A geração prioriza restrições obrigatórias e a redução das lacunas. Entre opções equivalentes, considera os sábados das 12 semanas anteriores, preferências, modelo padrão e carga já planejada. É uma busca heurística. Uma pendência remanescente pede revisão dos modelos ou da equipe e não demonstra, por si só, impossibilidade matemática de solução.

Arraste uma pessoa para um dia ou use Adicionar. Arraste um cartão para mover. Uma folga não fixada no destino pode ser substituída e a origem passa a folga. Copiar é uma ação separada. O formulário oferece as mesmas operações por clique/toque e permite mudar a data. Mudanças de função durante o turno têm horário próprio e entram na validação exata da cobertura.

Antes da gravação, a prévia calculada no servidor mostra a jornada resultante e as pendências de cobertura, incluindo origem e destino. Rascunhos aceitam pendências. Desfazer abre outra prévia e gera uma nova gravação auditada. Atualizar ou mudar de semana reinicia o desfazer local.

Publicar recalcula com os cadastros mais recentes e bloqueia violações obrigatórias. Uma semana publicada continua com sua última publicação disponível enquanto o gestor prepara outro rascunho. Uma nova publicação cria outro snapshot. Toda alteração posterior à primeira publicação exige motivo.

O botão Imprimir usa a última versão publicada. Versões salvas permite visualizar e imprimir publicações anteriores. A impressão é A4 em paisagem. O navegador também pode salvar essa impressão em PDF. A impressão compartilhada apresenta afastamentos apenas como indisponibilidade.

O colaborador acessa a mesma seção e recebe somente seus cartões publicados, mediante o vínculo de usuário no cadastro da equipe.

## Critérios e fontes

Os cálculos usam minutos inteiros, datas civis e o fuso America/Sao_Paulo. O funcionamento da loja, a carga contratual e o teto vigente são dados separados. A escala não produz lançamentos financeiros, salariais ou de ponto.

As etapas cadastradas são 42h em 16/12/2026 e 40h em 16/12/2027. Contratos mais curtos continuam limitando a programação. A Futura adota internamente o regime 5×2 em 15/12/2026. Semanas parciais e eventos exibem diferença a conferir, sem cálculo automático de débito ou rateio.

As referências incluem a EC 141/2026, arts. 1º a 4º, 6º, 7º e 10, a CLT, arts. 66, 67, 71 e 611-A III, e a Lei 10.101/2000, arts. 6º e 6º-A. Cada alerta carrega a regra, a vigência e a fonte. [EC 141/2026](https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc141.htm), [CLT](https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm), [Lei 10.101/2000](https://www.planalto.gov.br/ccivil_03/leis/l10101.htm).

Na consulta de 20/11/2026, o dispositivo I da cautelar nas ADIs 8041/8042 permitia 8h24 em uma hipótese específica da transição. A implementação mantém a política interna solicitada, mais restritiva, de exigir instrumento coletivo cadastrado para ultrapassar 8h. A referência judicial aparece como informação no catálogo. A compensação mensal excepcional permanece desativada. [Decisão do STF](https://portal.stf.jus.br/processos/downloadPeca.asp?ext=.pdf&id=15392248509).

O responsável deve manter as fontes e instrumentos aplicáveis atualizados. A conferência humana de categoria, sindicatos e condições é registrada expressamente no cadastro.

## Persistência, controle de acesso e capacidade

As coleções são `pf_escala_config`, `pf_escala_pessoas`, `pf_escala_historico`, `pf_escalas`, `pf_escalas_versoes`, `pf_escalas_publicadas`, `pf_escala_publicacoes`, `pf_escala_auditoria` e `pf_escala_controle`. O calendário acrescenta `pf_feriados_anos`, `pf_feriados_versoes`, `pf_calendario_decisoes` e `pf_calendario_avisos`. Todas entram no backup existente.

As escritas diretas do navegador nessas coleções são bloqueadas. A API valida o token revogado/desativado e o papel atual. O colaborador consulta uma projeção própria pelo servidor. Somente gestores leem dados completos. A API e o service worker impedem cache das respostas autenticadas.

Cada semana e cadastro tem revisão para controle de concorrência. Uma revisão desatualizada recebe HTTP 409 e precisa ser recarregada. Publicações, revisões e auditorias são documentos separados, com snapshots e antes/depois. A confirmação de publicação participa da mesma transação que lê os contratos, configuração e contexto de descanso.

O contexto consulta as semanas anteriores para rodízio e os dias próximos para descanso. A publicação de uma semana posterior volta a conferir sua fronteira com a anterior. A falta de histórico anterior obrigatório bloqueia publicação. A falta de turno posterior conhecido gera aviso e será conferida quando o período seguinte for publicado.

Usuários têm paginação de 20 registros e versões de 10 por cursor. A equipe tem paginação visual de 20 e é carregada integralmente pelo servidor para os cálculos, com limite operacional explícito de 200 pessoas por instalação. O servidor recusa snapshots acima de 850 KB e solicitações acima de 700 KB. Essa verificação evita gravação parcial de documentos grandes.

## Verificações executadas

Execute `npm run test:escalas`. No Windows com restrição à criação de processos de teste, use `node --test --test-isolation=none tests/escalas-*.test.mjs` com Node 24.

| Caso solicitado                          | Resultado local                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Sábado 08–12 / 13–16 e quatro dias de 8h | 7h líquidas no sábado, 39h na semana e 1h a programar para 40h                                     |
| Cinco jornadas de 8h24 sem instrumento   | Cinco violações diárias, total semanal de 42h                                                      |
| Contrato de 36h na mudança de etapa      | Limite permanece 36h                                                                               |
| Sexto dia e troca de um dia pelo sábado  | Sexto dia identificado; troca recalcula cobertura                                                  |
| Lacuna de dez minutos entre almoços      | Identificada exatamente das 12h10 às 12h20                                                         |
| 4h, 4h01, 6h e 6h01                      | Intervalos avaliados nos limites exatos                                                            |
| 11h e 10h59 de descanso                  | 11h aceita; 10h59 bloqueada                                                                        |
| Férias, admissão, feriado e implantação  | Sem débito fictício; dados desconhecidos continuam pendentes                                       |
| Sábado feriado com CCT vencida           | Trabalho bloqueado sem autorização válida                                                          |
| Virada da semana                         | Janela de descanso contínua verificada através da fronteira                                        |
| Edições simultâneas e dupla publicação   | Uma revisão aceita; gravação desatualizada recebe 409                                              |
| Publicação e acesso do colaborador       | Snapshot preservado; consulta individual retorna somente os próprios cartões                       |
| Interface no Chrome                      | Arrastar, prévia, salvar, reabrir, copiar, desfazer, publicar, impressão A4 e telas de 390/1280 px |

O teste de interface usa o Chrome isolado e a implementação real do serviço com Firestore substituído por um banco em memória. Execute no PowerShell `$env:PF_TEST_ESCALAS='1'; node tests/leituras-interface-check.mjs`. O teste não conecta ao Firebase de produção.

Também foram executados os testes existentes de backup, service worker, núcleo do PDV e núcleo de OS. O teste estático geral `security-rules-check.mjs` apresenta uma falha preexistente por rejeitar a leitura autenticada de cotações, já permitida e documentada no HEAD anterior. As regras de cotações foram preservadas. A proteção da nova seção tem verificações próprias nos testes de escalas.
