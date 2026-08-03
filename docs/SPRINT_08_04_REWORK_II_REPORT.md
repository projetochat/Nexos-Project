# Sprint 08.04 Rework II Report

Data: 2026-08-03

Branch: `sprint/08.04-operational-data-inbound-closure`

Status formal: `NOT READY FOR SPRINT 09`

## Resultado

Dropdowns reais, outbound real, admin e agente de homologacao permanecem aprovados. A connection local do
Nexos aponta para a instancia Evolution conectada `26293569-whatsapp-nata-cffd5f5c`. O inbound real segue
bloqueado porque a Evolution/Baileys falhou ao decriptar mensagens antes de emitir `MESSAGES_UPSERT` para o
webhook Nexos.

## Evidencias fisicas

- Backup Evolution: `backups/evolution-before-0804.dump`, 19608617 bytes.
- Evolution antes: `evoapicloud/evolution-api:v2.3.1`.
- Evolution depois: `evoapicloud/evolution-api:v2.3.7`.
- Health Evolution depois: `version=2.3.7`, WhatsApp Web `2.3000.1044347899`.
- Instancia aberta: `26293569-whatsapp-nata-cffd5f5c`, state `open`.
- Instancia antiga `26293569-homologacao-nata-018f43a5`: `404` em `connectionState` e webhook.
- Webhook da instancia aberta: enabled, URL do backend local, eventos esperados.
- Nexos `nexos_0802`: 2 usuarios, 2 memberships, 1 contato ativo, 2 conversas, 5 mensagens, 5 outbox events.
- Login `admin@nexo.app` e `atendente@nexo.app` no tenant `homologacao`: aprovado via API.
- Regressao `PATCH /api/conversations/:id/status`: aprovada em E2E focado.
- Verificacao completa em `nexos_0801`: aprovada.
- Instancias antigas fechadas: chamadas via delete e marcadas como `REMOVED` em logs.
- Logs `v2.3.7` ainda mostram `No session record`, `Invalid PreKey ID` e `No session found to decrypt message`; inbound segue bloqueado antes do webhook.

## Metricas M106-M184

| ID | Status | Evidencia |
| --- | --- | --- |
| M106 | PASS | Branch correta confirmada. |
| M107 | PASS | HEAD inicial `3a80a58`. |
| M108 | WARN | Worktree tinha alteracao pre-existente em `public/favicon.ico`. |
| M109 | PASS | `docker compose ps` inventariado. |
| M110 | PASS | Volumes Docker inventariados. |
| M111 | PASS | `nexos-evolution-api` inspecionado. |
| M112 | PASS | Redis Nexos separado de Redis Evolution. |
| M113 | PASS | Backup Evolution criado antes do upgrade. |
| M114 | PASS | Backup copiado para `backups/evolution-before-0804.dump`. |
| M115 | PASS | Backup nao vazio validado. |
| M116 | PASS | Compose auditado para imagem Evolution. |
| M117 | PASS | `.env` auditado sem documentar segredos. |
| M118 | PASS | Logs `v2.3.1` coletados e sanitizados. |
| M119 | FAIL | Logs mostram falha de decrypt antes do webhook. |
| M120 | PASS | Instancia nova identificada. |
| M121 | PASS | Instancia antiga retornou `404`. |
| M122 | PASS | Instancia nova `open`. |
| M123 | PASS | Webhook da instancia nova encontrado. |
| M124 | PASS | Eventos webhook esperados presentes. |
| M125 | PASS | URL webhook aponta para backend local. |
| M126 | PASS | Pesquisa de versoes feita em fonte oficial. |
| M127 | PASS | `2.4.0-rc*` rejeitado por pre-release/licenca. |
| M128 | PASS | `v2.3.7` selecionado como tag fixa estavel. |
| M129 | PASS | Manifest Docker `v2.3.7` validado. |
| M130 | PASS | Compose atualizado para `v2.3.7`. |
| M131 | PASS | `docker compose pull evolution-api` aprovado. |
| M132 | PASS | `docker compose up -d evolution-api` aprovado. |
| M133 | PASS | Container recriado sem tocar volumes. |
| M134 | PASS | Evolution `v2.3.7` iniciou. |
| M135 | PASS | Migrations Evolution aplicadas com sucesso. |
| M136 | PASS | Health raiz retorna `version=2.3.7`. |
| M137 | PASS | Connection state da instancia nova retorna `open`. |
| M138 | PASS | Nexos lista uma connection operacional. |
| M139 | PASS | Connection local aponta para a instancia nova. |
| M140 | PASS | Reconcile por endpoint retornou `existsInProvider=true`. |
| M141 | PASS | Owner externo persistido. |
| M142 | PASS | Owner phone normalizado persistido. |
| M143 | PASS | Admin homologacao login API aprovado. |
| M144 | PASS | Agente homologacao login API aprovado. |
| M145 | PASS | Contato homologacao preservado. |
| M146 | PASS | Conversas homologacao preservadas. |
| M147 | PASS | Mensagens homologacao preservadas. |
| M148 | PASS | Outbox homologacao preservado. |
| M149 | PASS | Instancias antigas chamadas via delete e marcadas `REMOVED` em logs. |
| M150 | PASS | Nenhum volume removido. |
| M151 | PASS | Nenhum Redis flush executado. |
| M152 | PASS | Nenhum reset de `nexos_0802` executado. |
| M153 | PASS | Dropdowns continuam fonte `GET /api/messaging/connections`. |
| M154 | PASS | Somente connection Evolution conectada aparece na API. |
| M155 | PASS | Contrato webhook `jwt_key` mantido. |
| M156 | PASS | Backend health OK. |
| M157 | PASS | Evolution container consegue apontar webhook para host local. |
| M158 | FAIL | Nenhum `MESSAGES_UPSERT` valido inbound observado. |
| M159 | FAIL | Nenhum POST inbound 2xx fisico ao backend observado. |
| M160 | FAIL | Nenhuma Message inbound fisica nova persistida. |
| M161 | FAIL | Nenhuma Conversation inbound fisica comprovada. |
| M162 | FAIL | Nenhum F5 frontend com inbound real comprovado. |
| M163 | BLOCKED | Alteracao PN/LID no translator aguardando payload valido. |
| M164 | PASS | Regra PN/LID documentada. |
| M165 | PASS | Material criptografico nao documentado. |
| M166 | PASS | Bug report de `PATCH /status` investigado. |
| M167 | PASS | Regressao E2E adicionada para mensagem de sistema. |
| M168 | PASS | Regressao focada aprovada. |
| M169 | PASS | `docs/EVOLUTION.md` criado. |
| M170 | PASS | Rollback de imagem documentado. |
| M171 | PASS | Rollback de banco Evolution documentado. |
| M172 | PASS | `docs/DEPLOY.md` atualizado. |
| M173 | PASS | `docs/README.md` atualizado. |
| M174 | PASS | `docs/CHANGELOG.md` atualizado. |
| M175 | PASS | `docs/ROADMAP.md` atualizado. |
| M176 | PASS | Report REWORK II criado. |
| M177 | PASS | Fonte Docker fixa, sem `latest`. |
| M178 | PASS | Fontes oficiais usadas para decisao de versao. |
| M179 | PASS | Limpeza cirurgica por API executada sem volume/Redis flush. |
| M180 | BLOCKED | Usuario ainda deve remover sessoes antigas nos dispositivos conectados do WhatsApp. |
| M181 | BLOCKED | Teste inbound fisico depende de nova mensagem real apos upgrade. |
| M182 | BLOCKED | Reconnect fisico completo depende de interacao WhatsApp. |
| M183 | BLOCKED | Exactly-once fisico inbound segue nao comprovado. |
| M184 | FAIL | Gate Sprint 09 permanece bloqueado. |
