# Campaigns

## Escopo

Campanhas operacionais usam somente a Nexos API, Prisma e BullMQ. A rota `/campanhas` nao usa Supabase, MVP store, mocks locais, progresso artificial ou destinatarios hardcoded.

## Modelo

- `Campaign`: cabecalho, mensagem, audiencia, conexao Evolution, status e contadores.
- `CampaignRecipient`: snapshot imutavel por contato apos start/schedule.
- `ContactMessagingPreference`: preferencia por canal, incluindo opt-out de marketing WhatsApp.
- `Message`: pode referenciar `campaignId` e `campaignRecipientId`.

## Status

- `DRAFT`: editavel.
- `SCHEDULED`: agendada, snapshot ja criado.
- `QUEUED`: liberada para preparacao.
- `RUNNING`: recipients em processamento.
- `PAUSED`: disparo pausado.
- `CANCELLING`: cancelamento solicitado.
- `COMPLETED`: todos os recipients elegiveis finalizados.
- `FAILED`: campanha sem sucesso operacional.
- `CANCELLED`: recipients pendentes cancelados.
- `ARCHIVED`: removida da operacao padrao.

## Audiencia

Audiencias suportadas:

- Todos os contatos ativos.
- Contatos por tags com modo `ANY` ou `ALL`.
- Contatos vinculados a customers.
- Lista explicita de contatos.

O preview e dry-run: nao cria campanha, recipients, messages, outbox events ou jobs.

## Opt-out

Contatos com `ContactMessagingPreference.channel = WHATSAPP` e `marketingAllowed = false` sao excluidos do preview e rechecados imediatamente antes do dispatch. O endpoint operacional e:

```text
PATCH /api/contacts/:id/marketing-preference
```

## Dispatch

O start/schedule exige confirmacao explicita e Redis saudavel. O fluxo cria snapshot transacional, registra outbox de campanha e enfileira BullMQ:

- `campaign.prepare`
- `campaign.recipient.send`
- `campaign.finalize`
- `campaign.cancel`

O envio real reaproveita o pipeline oficial de mensagens outbound via outbox `messaging.outbound.requested`.

## RBAC

Permissoes:

- `campaigns.read`
- `campaigns.create`
- `campaigns.update`
- `campaigns.schedule`
- `campaigns.start`
- `campaigns.pause`
- `campaigns.cancel`
- `campaigns.duplicate`
- `campaigns.recipients.read`
- `campaigns.manage`

Tenant admin recebe todas. Supervisor pode operar leitura, criacao, edicao, agendamento, duplicacao e leitura de recipients. Agent tem apenas leitura.

## Operacao

Verificar saude:

```bash
curl http://localhost:3001/api/health
```

O health inclui `campaignQueue`, `campaignWorker` e `campaignScheduler`.

Verificar conectividade a partir do container Evolution:

```bash
docker exec nexos-evolution-api sh -lc "wget -S -O - http://host.docker.internal:3001/api/health"
```

O backend deve escutar em `0.0.0.0` para que `host.docker.internal` funcione. O bootstrap usa `BACKEND_HOST`, depois `HOST`, e por padrao `0.0.0.0`.

Smoke Redis:

```bash
bun run verify
```

O `verify` executa build, testes backend, guards anti-legado e smoke de fila.

## Gates

Para declarar uma campanha fisica aprovada, validar com uma conexao Evolution real e numero controlado:

- preview sem efeitos colaterais;
- start imediato cria recipients e messages reais;
- schedule dispara no horario esperado;
- pause/resume/cancel preservam estado;
- opt-out nao recebe mensagem;
- duplicacao nao duplica recipients nem outbox;
- Inbox recebe atualizacao sem F5;
- zero mocks, zero Supabase e zero progresso artificial em `/campanhas`.

## PRC-05

Contrato aprovado para readiness automatizado:

- audiencia por contatos, tags, customers e todos;
- preview dry-run sem criar recipients, messages, outbox events ou jobs;
- agendamento com snapshot e reconciliacao do scheduler;
- cancelamento por job `campaign.cancel`;
- retry BullMQ com backoff exponencial e jobs falhos retidos;
- limites de plano por `maxCampaignRecipients`;
- logs operacionais com `campaign.worker.config` e `campaign.job.failed`;
- health com `campaignQueue`, `campaignWorker` e `campaignScheduler`.
