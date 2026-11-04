# Backup completo e recuperação

Em Administração → Backup, o administrador baixa um único JSON com os documentos completos. Não é o Excel resumido antigo. O arquivo contém dados pessoais e configurações de acesso: guarde fora do repositório, em local seguro, preferencialmente com outra cópia em outro dispositivo.

Inclui as 28 coleções usadas pelo projeto: cotações de todos os modelos (e itens), comissões e lançamentos, usuários/perfis, configurações, cadastro de clientes, vendas e itens, sessões de caixa, produtos, marcas, movimentos de estoque, custos, serviços, entregas, clientes/compras/pagamentos/histórico de promissórias e cartas de anuência. Inclui também configurações individuais, regras de base, comissões por venda, pagamentos e auditoria da área Vendas e Comissões. Inclui também fechamentos de caixa, movimentos de dinheiro, ajustes auditáveis, identificação dos caixas e sessões por operador. Inclui lembretes de cotações e versões das cartas. As consultas às subcoleções incluem registros sem documento pai.

Preserva todos os campos, IDs, relacionamentos, datas com precisão de nanossegundos, listas, referências, valores e anexos incorporados nos documentos. Inclui as sugestões e a preferência de salvamento automático deste navegador. Não exporta tokens de sessão.

## Publicação

Publique também as regras do Firestore, pois o backup consulta grupos de subcoleções e o cadastro de clientes. As permissões adicionais de backup são exclusivas de administradores. Na pasta do repositório:

    npx firebase-tools login
    npx firebase-tools deploy --only firestore:rules --project papelaria-futura

Se npx não estiver disponível, copie o conteúdo completo de firestore.rules para Firebase Console → Firestore Database → Regras e clique em Publicar. O arquivo firebase.json incluído aponta para as regras. Sem essa publicação, o backup pode informar acesso negado e não gera arquivo parcial.

## Conferência

Confirme o arquivo nos downloads depois de gerar. O sistema só inicia o download após ler todas as áreas diretamente do servidor, sem usar cache offline. O JSON tem contagem por coleção/grupo e total de documentos. Uma coleção vazia é incluída com contagem zero. Gerar um backup depois de uma exclusão não recupera dados apagados anteriormente.

A coleta usa páginas de 500 registros sem limite total. Evite movimentações enquanto gera o backup: as leituras não são uma fotografia transacional do banco. Em caso de erro de rede ou permissão, corrija e gere novamente.

## Recuperação de documentos ausentes

O utilitário tools/restaurar-backup.mjs lê este formato. Por segurança, o padrão é uma simulação: informa documentos existentes e ausentes, sem gravar nada. Com --apply, somente recria os ausentes e preserva os documentos existentes; não apaga, não sobrescreve e não duplica IDs. Uma execução interrompida pode ser retomada. Não é uma reversão de alterações em documentos existentes.

Use um computador confiável com Node.js, firebase-admin instalado e credenciais administrativas do projeto configuradas no ambiente (Application Default Credentials). Não coloque chaves privadas no repositório ou no navegador. Este utilitário deve ser operado por quem administra o Firebase.

    node tools/restaurar-backup.mjs "CAMINHO_DO_BACKUP.json"
    node tools/restaurar-backup.mjs "CAMINHO_DO_BACKUP.json" --apply

Antes de aplicar, guarde uma cópia do banco atual e confira a simulação. O utilitário valida projeto, formato, caminhos, duplicidades e todos os valores antes de iniciar as gravações. As preferências locais ficam preservadas no JSON, mas não são aplicadas pelo utilitário de servidor.

## Limites

O navegador não pode exportar contas/senhas do Firebase Authentication. Os perfis de usuários do Firestore estão incluídos, mas não recriam contas de login. Arquivos externos, código, regras e índices são protegidos separadamente pelo repositório e pelas ferramentas administrativas do Firebase. Anexos incorporados aos documentos estão incluídos integralmente. As coleções criadas manualmente fora do código precisam ser adicionadas ao inventário js/backup.js.

## Verificação local

    node tests/backup-check.mjs

O teste cobre tipos e precisão, campos semelhantes a marcadores, anexos longos, comissões e registros sem pai, preferências, falhas de leitura, inventário das áreas e paginação de 1.001 registros. O teste não acessa nem altera o Firebase real.
