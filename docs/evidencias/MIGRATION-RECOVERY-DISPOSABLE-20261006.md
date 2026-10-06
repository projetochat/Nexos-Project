# Evidencia descartavel — migracao de identidade

Data: 06/10/2026. Escopo: PostgreSQL 16 local, sem volume persistente, porta
exclusiva `127.0.0.1:55436`. Nenhum banco corrente, VPS ou producao foi
consultado. Todos os nomes e valores de negocio abaixo sao sinteticos.

## Artefatos exatos

| Artefato | SHA-256 dos bytes executados |
| --- | --- |
| `20261005210000_contact_custom_field_identity/migration.sql` | `6ead95d4c8a68bf662ca67cc8d2c97b1b1dde04581f5a5d42051d9067ef318fb` |
| artefato original concluido do candidato `b4d85f7` | `9ff6347fc38618491c8465bc91440381de81e8d2f06bc15d1f32cfd5c8850fef` |
| `20261006030000_reconcile_contact_custom_field_identity/migration.sql` | `bde512d7624acd765e0ac723b94d8bcce22995e37bd64e0d8e107a679136c4c7` |
| dump custom da fixture com `variableKey` utilizada | `d3a751f64b5a939c5185994843cfbcabff930876c8f22aad203e25054fd37dc7` |

Os tres hashes de migration tambem constam no manifesto versionado. O hash do
dump documenta este ensaio; uma nova execucao de `pg_dump` pode produzir bytes
diferentes e deve registrar o proprio SHA-256 antes do restore.

## Ambiente reproduzivel

O servidor foi criado sem volume persistente:

```sh
docker run --rm -d --name trixus-migration-recovery-20261006 \
  --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER=trixus_test \
  -e POSTGRES_PASSWORD=ci-only-password \
  -e POSTGRES_DB=trixus_recovery \
  -p 127.0.0.1:55436:5432 postgres:16-alpine
```

Todas as URLs usadas apontaram explicitamente para essa porta e para bancos
com prefixo `trixus_`. A cadeia completa foi aplicada pelo wrapper:

```sh
DATABASE_URL='postgresql://trixus_test:ci-only-password@127.0.0.1:55436/trixus_recovery?schema=public' \
  bun run --cwd backend prisma:migrate:deploy
```

Resultado: 71 migrations e pos-validacao aprovada.

## Receita exata dos estados ensaiados

Os comandos abaixo sao a receita sanitizada executada no container acima. Cada
cenario parte de um clone descartavel da base valida; `SCENARIO` e sempre um
nome explicito com prefixo `trixus_`. O shell nunca aponta para outra porta.

```sh
docker exec trixus-migration-recovery-20261006 createdb \
  -U trixus_test -T trixus_recovery SCENARIO
export DATABASE_URL="postgresql://trixus_test:ci-only-password@127.0.0.1:55436/SCENARIO?schema=public"
bun run --cwd backend prisma:migrate:deploy --preflight-only
```

Checksum concluido divergente:

```sh
docker exec trixus-migration-recovery-20261006 psql -U trixus_test -d trixus_checksum_bad \
  -v ON_ERROR_STOP=1 -c "UPDATE \"_prisma_migrations\" SET checksum = repeat('0', 64) WHERE migration_name = '20261005210000_contact_custom_field_identity'"
DATABASE_URL="postgresql://trixus_test:ci-only-password@127.0.0.1:55436/trixus_checksum_bad?schema=public" \
  bun run --cwd backend prisma:migrate:deploy --preflight-only
```

Historico incompleto com falha transacional real e o ramo condicionado de
`resolve --rolled-back`. O clone foi levado ao schema imediatamente anterior,
recebeu duas labels sintéticas colidentes e o Prisma direto foi usado **somente
como instrumento deste teste destrutivo descartavel** para produzir a falha:

```sh
docker exec trixus-migration-recovery-20261006 createdb -U trixus_test \
  -T trixus_recovery trixus_real_incomplete
docker exec trixus-migration-recovery-20261006 psql -U trixus_test \
  -d trixus_real_incomplete -v ON_ERROR_STOP=1 -c \
  "DELETE FROM \"_prisma_migrations\" WHERE migration_name IN ('20261005210000_contact_custom_field_identity','20261006030000_reconcile_contact_custom_field_identity'); ALTER TABLE \"contact_custom_fields\" DROP COLUMN \"variableKey\"; INSERT INTO public.tenants VALUES ('tenant-rollback','Tenant Rollback','tenant-rollback',now(),now(),NULL,NULL,'ACTIVE','America/Sao_Paulo','pt-BR',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL); INSERT INTO \"contact_custom_fields\" (id,\"tenantId\",label,\"normalizedName\",type,required,mask,note,options,position,\"archivedAt\",\"createdAt\",\"updatedAt\",tab_name,group_name) VALUES ('field-a','tenant-rollback','Plano do Cliente','pre-a','TEXT',false,NULL,NULL,'{}',0,NULL,now(),now(),'Dados Adicionais',''),('field-b','tenant-rollback','  Plano   do Cliente  ','pre-b','TEXT',false,NULL,NULL,'{}',1,now(),now(),now(),'Dados Adicionais','')"
docker run --rm \
  -e DATABASE_URL='postgresql://trixus_test:ci-only-password@host.docker.internal:55436/trixus_real_incomplete?schema=public' \
  --entrypoint node trixus-local-review/migrate:migration-pipeline \
  /app/backend/node_modules/prisma/build/index.js migrate deploy \
  --schema /app/backend/prisma/schema.prisma
```

O PostgreSQL registrou `CONTACT_CUSTOM_FIELD_NORMALIZED_NAME_COLLISION` dentro
do bloco iniciado por `BEGIN`. Depois da falha: havia exatamente uma linha
incompleta criada pelo Prisma; `variableKey` e o indice permaneciam ausentes;
as duas linhas e os dois `normalizedName` anteriores permaneciam inalterados.
Assim, o catalogo e as contagens comprovaram rollback integral. O campo
`logs` da linha ficou nulo porque a tentativa do Prisma de atualiza-lo ocorreu
na transacao ja abortada; por isso a causa foi preservada no log do PostgreSQL.

Depois de remover somente a colisao sintetica, o wrapper respondeu
`INCOMPLETE`. O `resolve` condicionado e a reaplicacao foram:

```sh
docker exec trixus-migration-recovery-20261006 psql -U trixus_test \
  -d trixus_real_incomplete -v ON_ERROR_STOP=1 \
  -c "DELETE FROM \"contact_custom_fields\" WHERE id='field-b'"
docker run --rm \
  -e DATABASE_URL='postgresql://trixus_test:ci-only-password@host.docker.internal:55436/trixus_real_incomplete?schema=public' \
  trixus-local-review/migrate:migration-pipeline \
  bun run prisma:migrate:deploy --preflight-only
docker run --rm \
  -e DATABASE_URL='postgresql://trixus_test:ci-only-password@host.docker.internal:55436/trixus_real_incomplete?schema=public' \
  --entrypoint node trixus-local-review/migrate:migration-pipeline \
  /app/backend/node_modules/prisma/build/index.js migrate resolve --rolled-back \
  20261005210000_contact_custom_field_identity --schema /app/backend/prisma/schema.prisma
docker run --rm \
  -e DATABASE_URL='postgresql://trixus_test:ci-only-password@host.docker.internal:55436/trixus_real_incomplete?schema=public' \
  trixus-local-review/migrate:migration-pipeline bun run prisma:migrate:deploy
```

O estado final continha uma linha rollback e uma linha concluida para a alvo,
coluna `text` `NOT NULL`, indice presente e pos-validacao aprovada.

Estrutura parcial e indice homonimo na tabela errada foram produzidos em clones
separados:

```sh
docker exec trixus-migration-recovery-20261006 psql -U trixus_test -d trixus_partial \
  -v ON_ERROR_STOP=1 -c "DELETE FROM \"_prisma_migrations\" WHERE migration_name = '20261006030000_reconcile_contact_custom_field_identity'; DROP INDEX \"contact_custom_fields_tenantId_variableKey_key\"; UPDATE \"_prisma_migrations\" SET finished_at = NULL, rolled_back_at = now() WHERE migration_name = '20261005210000_contact_custom_field_identity'"
docker exec trixus-migration-recovery-20261006 psql -U trixus_test -d trixus_wrong_table \
  -v ON_ERROR_STOP=1 -c "DELETE FROM \"_prisma_migrations\" WHERE migration_name = '20261006030000_reconcile_contact_custom_field_identity'; ALTER TABLE \"contact_custom_fields\" DROP COLUMN \"variableKey\"; CREATE TABLE synthetic_index_holder (\"tenantId\" text, \"variableKey\" text); CREATE UNIQUE INDEX \"contact_custom_fields_tenantId_variableKey_key\" ON synthetic_index_holder (\"tenantId\", \"variableKey\")"
```

O historico legado exato foi fabricado sem alterar estrutura nem checksum
automaticamente; o modo comum bloqueou antes do modo revisado:

```sh
docker exec trixus-migration-recovery-20261006 psql -U trixus_test -d trixus_legacy \
  -v ON_ERROR_STOP=1 -c "DELETE FROM \"_prisma_migrations\" WHERE migration_name = '20261006030000_reconcile_contact_custom_field_identity'; UPDATE \"_prisma_migrations\" SET checksum = '9ff6347fc38618491c8465bc91440381de81e8d2f06bc15d1f32cfd5c8850fef' WHERE migration_name = '20261005210000_contact_custom_field_identity'"
DATABASE_URL="postgresql://trixus_test:ci-only-password@127.0.0.1:55436/trixus_legacy?schema=public" \
  bun run --cwd backend prisma:migrate:deploy --preflight-only
DATABASE_URL="postgresql://trixus_test:ci-only-password@127.0.0.1:55436/trixus_legacy?schema=public" \
  bun run --cwd backend prisma:migrate:deploy --apply-reviewed-reconciliation
```

Para o restore, a fixture sintetica foi gravada em `trixus_variable_used` com
os `INSERT` abaixo, capturados por `pg_dump --data-only --inserts` no schema
desta revisao:

```sql
INSERT INTO public.tenants VALUES ('tenant-variable', 'Tenant Variable', 'tenant-variable', '2026-10-06 06:17:14.155', '2026-10-06 06:17:14.157', NULL, NULL, 'ACTIVE', 'America/Sao_Paulo', 'pt-BR', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.contacts VALUES ('contact-variable', 'tenant-variable', NULL, NULL, 'Contato Sintético', '+5511999990000', '5511999990000', NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-06 06:17:14.158', '2026-10-06 06:17:14.158', NULL, NULL, '{}');
INSERT INTO public.contact_custom_fields VALUES ('field-variable', 'tenant-variable', 'Plano do Cliente', 'plano do cliente', 'TEXT', false, NULL, NULL, '{}', 0, NULL, '2026-10-06 06:17:14.162', '2026-10-06 06:17:14.163', 'Dados Adicionais', '', 'plano_cliente');
INSERT INTO public.contact_custom_field_values VALUES ('value-variable', 'tenant-variable', 'contact-variable', 'field-variable', 'Plano Ouro', '2026-10-06 06:17:14.164', '2026-10-06 06:17:14.164');
INSERT INTO public.quick_replies VALUES ('reply-variable', 'tenant-variable', 'Plano', '/plano', '/plano', 'Seu plano é {{plano_cliente}}.', NULL, NULL, NULL, '2026-10-06 06:17:14.166', '2026-10-06 06:17:14.166', false, NULL, NULL, NULL, NULL, NULL, 0);
```

A sequencia verificavel de backup foi:

```sh
docker exec trixus-migration-recovery-20261006 pg_dump -U trixus_test \
  -d trixus_variable_used -Fc -f /tmp/trixus_variable_used.dump
docker exec trixus-migration-recovery-20261006 sha256sum /tmp/trixus_variable_used.dump
docker exec trixus-migration-recovery-20261006 createdb -U trixus_test \
  -T template0 trixus_variable_restore
docker exec trixus-migration-recovery-20261006 pg_restore -U trixus_test \
  -d trixus_variable_restore --exit-on-error /tmp/trixus_variable_used.dump
DATABASE_URL="postgresql://trixus_test:ci-only-password@127.0.0.1:55436/trixus_variable_restore?schema=public" \
  bun run --cwd backend prisma:migrate:deploy --preflight-only
```

Os bancos de cenario foram descartados com o container. A receita exige que o
revisor confira o nome e a porta antes de cada comando; nao e apropriada para
um banco persistente.

## Matriz observada

| Cenario | Preparacao descartavel | Resultado seguro |
| --- | --- | --- |
| checksum atual correto | cadeia completa pelo wrapper | `COMPLETED_VALID` |
| checksum concluido alterado | somente a copia em `_prisma_migrations` recebeu 64 zeros | `COMPLETED_CHECKSUM_MISMATCH` |
| indice homonimo em tabela errada | alvo removido; indice com mesmo nome criado em tabela sintetica | `PARTIAL_STATE`, `INDEX_WRONG_TABLE` |
| estrutura parcial | indice removido, coluna mantida, historico marcado rollback | `PARTIAL_STATE`, `INDEX_MISSING` |
| historico incompleto e transacao revertida | coluna/indice ausentes e linha sem `finished_at`/`rolled_back_at` | `INCOMPLETE` |
| `resolve --rolled-back` condicionado | estado anterior comprovado; resolve executado; wrapper reaplicado | `ROLLED_BACK` antes e `COMPLETED_VALID` depois |
| drift Unicode arquivado | campo arquivado `Šifra`, chave SQL antiga `ifra` | `APPLICATION_KEY_ALGORITHM_MISMATCH` e `APPLICATION_UNEXPECTED_KEY` |
| restore integral | `pg_dump -Fc`, SHA-256, banco `template0`, `pg_restore --exit-on-error` | `COMPLETED_VALID` |
| checksum antigo exato | alvo preservado com hash `9ff...`, forward ainda ausente | preflight comum bloqueou |
| reconciliacao revisada | `--apply-reviewed-reconciliation` com todos os demais hashes validos | forward aplicada; `COMPLETED_RECONCILED` |
| checksum antigo apos forward | consulta das duas linhas de historico | `9ff...` permaneceu intacto; forward `bde...` concluida |
| historico extra incompleto | checksum legado exato, forward pendente e linha desconhecida sem conclusao | `UNKNOWN_MIGRATION_HISTORY` antes do Prisma |
| historico extra rollback | checksum legado exato, forward pendente e linha desconhecida marcada rollback | `UNKNOWN_MIGRATION_HISTORY` antes do Prisma |

## Uso posterior de `variableKey`

A fixture `trixus_variable_used` criou:

- uma definicao ativa com `variableKey=plano_cliente`;
- um valor adicional relacionado ao campo;
- uma resposta rapida contendo `{{plano_cliente}}`.

Antes do dump, as contagens foram `1|1` para template e valor. O dump recebeu o
hash registrado acima, foi restaurado em `trixus_variable_restore` com
`--exit-on-error` e passou novamente pelo wrapper. A consulta final retornou:

```text
plano_cliente|1|1
```

Isso prova que a recuperacao integral preserva a identidade ja usada. Remover a
coluna ou voltar apenas o commit destruiria o contrato do template mesmo que o
PostgreSQL aceitasse a alteracao fisica.

## Encerramento do recurso

Depois de copiar somente estas evidencias nao sensiveis, o container e removido
explicitamente com:

```sh
docker stop trixus-migration-recovery-20261006
```

Como foi iniciado com `--rm` e `--tmpfs`, nao resta volume de dados.
