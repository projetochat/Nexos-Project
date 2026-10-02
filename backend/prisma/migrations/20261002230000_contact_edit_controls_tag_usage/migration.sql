-- Atribuir/remover etiquetas passa a ser uma ação de edição do contato.
-- A linha do catálogo legado é preservada para compatibilidade de código,
-- mas nenhum perfil continua com o grant independente. Restaurar os grants
-- anteriores exige o pg_dump pré-migration criado pelo fluxo de release.
DELETE FROM "role_permissions"
WHERE "permissionId" = 'chat.tags.use';
