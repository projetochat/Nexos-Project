# Evolution API

## Versao fixa

O Compose local usa `evoapicloud/evolution-api:v2.3.7`.

Nao usar `latest`. A linha `2.4.0-rc*` foi descartada para homologacao porque e pre-release e introduz ativacao/licenciamento obrigatorio antes dos endpoints de negocio. A linha `v2.3.x` permanece a trilha estavel aplicavel ao ambiente atual.

Motivos da atualizacao de `v2.3.1` para `v2.3.7`:

- `v2.3.3`: correcoes de Baileys e tratamento de `remoteJid` alternativo.
- `v2.3.5`: correcoes em migracao PostgreSQL/Kafka e compatibilidade de schema.
- `v2.3.6`: cache PN/LID, mensagens recebidas e Baileys `7.0.0-rc.6`.
- `v2.3.7`: fixes adicionais para eventos de mensagem, `@lid`, filtros por `remoteJidAlt` e Baileys `7.0.0-rc.9`.

## Backup e rollback

Backup fisico antes do upgrade:

```powershell
backups/evolution-before-0804.dump
```

Rollback de imagem:

```powershell
# voltar docker-compose.yml para evoapicloud/evolution-api:v2.3.1
docker compose pull evolution-api
docker compose up -d evolution-api
```

Rollback de banco Evolution, se a migracao de `v2.3.7` precisar ser revertida:

```powershell
docker compose stop evolution-api
docker exec nexos-evolution-postgres dropdb -U evolution evolution_db
docker exec nexos-evolution-postgres createdb -U evolution evolution_db
docker cp backups/evolution-before-0804.dump nexos-evolution-postgres:/tmp/evolution-before-0804.dump
docker exec nexos-evolution-postgres pg_restore -U evolution -d evolution_db /tmp/evolution-before-0804.dump
docker compose up -d evolution-api
```

## Evidencia 2026-08-03

- Container `nexos-evolution-api`: `evoapicloud/evolution-api:v2.3.7`.
- Health raiz Evolution: `version=2.3.7`.
- Instancia aberta: `26293569-whatsapp-nata-cffd5f5c`.
- Webhook da instancia aberta: `enabled=true`, URL `http://host.docker.internal:3001/api/webhooks/evolution`, eventos `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `SEND_MESSAGE_UPDATE`, `QRCODE_UPDATED`, `CONNECTION_UPDATE`.
- Nexos `nexos_0802`: uma `messaging_connections` conectada apontando para `26293569-whatsapp-nata-cffd5f5c`, owner normalizado `+556292728679`.
- Dados de homologacao preservados: 2 usuarios, 2 memberships, 1 contato ativo, 2 conversas, 5 mensagens, 5 outbox events.

## Webhook connectivity/auth recovery

Contrato fisico Evolution -> Nexos:

```text
URL: http://host.docker.internal:3001/api/webhooks/evolution
Header: jwt_key
Valor: EVOLUTION_WEBHOOK_SECRET normalizado no backend
Evento minimo: MESSAGES_UPSERT
```

O backend normaliza `EVOLUTION_WEBHOOK_SECRET` removendo espacos externos e aspas externas pareadas. Logs
mostram apenas `EVOLUTION_WEBHOOK_SECRET configured=true/false`; o valor nunca deve aparecer.

Auditoria sanitizada e reconfiguracao da instancia:

```powershell
$env:EVOLUTION_INSTANCE_NAME="nome-da-instancia"
bun run --cwd backend audit:evolution-webhook -- --ensure
```

Saida esperada:

```json
{
  "secretBackendConfigured": true,
  "secretEvolutionConfigured": true,
  "secretMatch": true,
  "headerJwtKeyPresent": true
}
```

Smoke de conectividade a partir do container Evolution:

```powershell
bun run --cwd backend audit:evolution-webhook -- --container-health --instance=nome-da-instancia
```

O health deve retornar `ok=true`. Qualquer `ECONNREFUSED` em
`http://host.docker.internal:3001/api/health` indica backend inacessivel para a Evolution e bloqueia inbound
fisico.

## Instancias antigas

Instancias Evolution antigas em `close` foram chamadas via `DELETE /instance/delete/:name` depois do backup. A chamada retornou sem erro e os logs posteriores marcaram as instancias como `REMOVED`. Caso alguma listagem cacheada ainda mostre registros fechados, nao forcar limpeza por volume ou Redis.

- `4c45fa1d-whatsapp-nata-ce12a419`
- `46a0c5ba-teste`
- `46a0c5ba-nata`
- `4039fdf3-nata-2670ef92`

Nao remover volumes, nao truncar tabelas da Evolution e nao executar `FLUSHALL`. Se a Evolution voltar a exibir estes registros, a limpeza deve ser feita com ferramenta suportada pela propria Evolution ou apos novo backup e plano explicito de SQL no schema `evolution_api`.

## Diagnostico inbound

Antes e depois do upgrade, logs reais mostraram falhas de decriptacao Signal/Baileys antes do webhook:

- `No session record`
- `No session found to decrypt message`
- `failed to decrypt message`
- JIDs `@lid` acompanhados de `senderPn`/`participantPn`

Nao registrar buffers, chaves ou material de sessao em docs, commits ou tickets. A camada Nexos so deve alterar traducao de payload quando houver `MESSAGES_UPSERT` valido chegando ao webhook. Se payload valido vier com `remoteJid @lid` e `senderPn @s.whatsapp.net`, usar a identidade PN; nunca tratar LID como telefone.
