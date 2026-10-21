# Campos Adicionais — correção P1 de autorização (06/10/2026)

## Objetivo e causa raiz

O contrato anterior vinculava a leitura do contato/conversa à entrega de Campos Adicionais. Em
especial, o serializador de Conversas sempre incluía `customFields`, `customFieldValues` e
`variableKey`, e eventos realtime podiam transportar o objeto completo produzido segundo as
permissões do ator. Como o mesmo evento é distribuído a sockets diferentes, a permissão do ator não
protegia o destinatário. Também havia serialização independente no histórico operacional e listas
nativas divergentes entre runtime, frontend, preflight e migração.

## Contrato adotado

- `contacts.read` e `conversations.read` não autorizam Campos Adicionais.
- Somente `contacts.additional_fields.read` autoriza definições, chaves técnicas e valores. O
  `tenant_admin` continua autorizado pela regra especial da D-009, mesmo quando a lista materializada
  de permissões não contém a chave específica.
- `projectContactAdditionalFields` é a projeção central: verifica permissão, tenant da entidade,
  tenant da definição e descarta definições arquivadas. Sem autorização, as propriedades sensíveis
  não são emitidas.
- Contatos, Conversas e histórico/relatórios operacionais usam a mesma projeção. Agrupamento de
  dashboard por campo adicional é bloqueado antes da consulta sem a permissão específica.
- Operações de definição que devolvem a definição criada/editada exigem, além da permissão de
  escrita original, `contacts.additional_fields.read`.
- `contact.updated`, `conversation.created` e `conversation.updated` usam payload comum mínimo com
  identificadores e metadados não sensíveis. O cliente invalida/refaz a consulta; o endpoint revalida
  a permissão por usuário.

## Catálogo nativo e migração

A fonte canônica de runtime é `backend/src/crm/contact-custom-field-catalog.ts`. Ela inclui os nomes
e chaves atuais e legados, inclusive WhatsApp, Perfil e Etiqueta. Backend e frontend a reutilizam.
A migração mantém a representação SQL necessária ao preflight, delimitada por marcadores; teste de
paridade compara integralmente essa representação com a fonte canônica. O wrapper de migração lê os
mesmos blocos SQL, evitando uma terceira lista manual.

Não há evidência local/Git de aplicação da migração em ambiente persistente conhecido: ela não está
em `origin/main`, e os relatórios anteriores registram uso somente descartável. Por isso a migração
original continua sendo corrigida, sem alteração silenciosa de checksum aplicado. Essa conclusão não
abrange ambientes externos desconhecidos e nenhum ambiente corrente ou produção foi consultado.

## Evidência descartável da migração

Foi usado PostgreSQL 16 em contêiner efêmero, publicado apenas em `127.0.0.1:55435` e removido ao
final.

- Banco vazio: 70 migrações aplicadas, incluindo a alvo, com pós-validação aprovada.
- Banco sintético antes da migração: 8 definições e 3 valores, com colisões Unicode, chave nativa,
  chave técnica, campo ativo/arquivado e duas tenants.
- O preflight abortou com relatório anonimizado. Tipos encontrados: `native_key`,
  `normalized_name` e `variable_key`; quantidades por colisão incluíram definições ativas/arquivadas
  e valores afetados. Nenhum nome, valor, tenant real ou chave em claro foi emitido.
- Estado após a falha: `8|3|false|false|false` para definições, valores, histórico da migração,
  coluna `variableKey` e índice único. Logo, o bloqueio ocorreu antes de DDL.
- Correção sintética e explícita: cinco labels foram renomeadas deterministicamente; nenhuma
  definição ou valor foi excluído, mesclado ou restaurado.
- Nova tentativa: preflight `NOT_APPLIED` aprovado; migração concluída; estado final
  `8|3|true|true|0` para definições, valores, coluna, índice e colisões por
  `(tenantId, variableKey)`.

Alternativas seguras relatadas: renomear explicitamente após decisão funcional; manter o bloqueio e
decidir separadamente se um arquivado deve ser restaurado. A política mínima permanece **bloquear**
ativos e arquivados; não há exclusão física nem liberação automática de chave.

## Verificações

- Testes backend focados de autorização, Contatos, Conversas, realtime, histórico operacional,
  catálogo/preflight e foto de perfil: 81 aprovados.
- Regressão de criação/edição, isolamento por tenant, arquivados, HTML e mecanismo central de
  mensagens: 37 aprovados.
- Testes frontend de variáveis e consumidores realtime: 34 aprovados.
- `tsc --noEmit`: aprovado.
- Build backend: aprovado.
- Build frontend/SSR/Nitro: aprovado; permanecem apenas avisos preexistentes de tamanho de chunks e
  imports dinâmicos ineficazes.

## Backup, limitações e retorno

Backup anterior às alterações preservado em
`C:/dev/Trixus/backups/campos-adicionais-p1-20261006-before`, com hashes dos arquivos críticos.

Limitações: os ensaios usaram somente dados sintéticos e PostgreSQL descartável; não houve cópia
sanitizada de backup disponível. Testes com mocks demonstram o contrato dos serializadores, não
substituem homologação multiusuário em infraestrutura real isolada. O relatório local não prova o
estado de ambientes externos desconhecidos.

Retorno de código: reverter o commit desta correção. Retorno de banco: a migração não deve ser
revertida automaticamente em ambiente persistente, pois remover `variableKey` perde identidade
técnica; exigir backup, inventário de uso e migração inversa revisada. Antes de qualquer aplicação,
executar o preflight somente leitura; se houver colisão ou checksum divergente, manter o bloqueio e
não alterar schema/histórico.
