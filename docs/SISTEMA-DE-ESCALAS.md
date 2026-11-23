# Separação do sistema de escalas

A Gestão de Escalas foi extraída para um aplicativo independente, na pasta irmã `Futura-Escalas`, com login, calendário, APIs, testes e instruções de publicação próprios.

Este sistema de vendas não carrega mais os módulos nem possui página, menu, APIs ou agendamento de feriados/escalas. As dependências de servidor exclusivas da área também foram removidas do pacote.

Nenhuma coleção do Firebase foi excluída. O novo aplicativo usa inicialmente as mesmas contas e os dados existentes do projeto papelaria-futura. As regras de acesso e o índice de versões foram preservados por serem compartilhados. O cadastro administrativo pode continuar atribuindo o cargo gestor_escalas às contas do aplicativo externo.

O inventário do backup completo mantém as coleções históricas. Elas não são consultadas na navegação comum; apenas na exportação explicitamente solicitada. O novo aplicativo também possui seu próprio backup, restrito a escalas e calendário.

Os projetos têm publicação separada. Envie as alterações deste repositório normalmente; publique a pasta Futura-Escalas em um novo repositório/projeto Vercel. Publicar o sistema de vendas não publica o novo aplicativo automaticamente.
