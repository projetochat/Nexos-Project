# PRC-01 - System Wide Audit

Data: 2026-08-16
Projeto: Nexos Project
Escopo: auditoria pos-Messaging Core para organizar o proximo ciclo de sprints rumo a producao.

## 1. Resultado Executivo

A mensageria chegou ao melhor ponto do projeto ate agora: dentro dos testes fisicos informados pelo Product Owner, o core de chat atende os requisitos definidos para homologacao funcional.

Porem, o sistema como um todo ainda nao pode ser declarado aprovado para producao. O produto esta em um estado hibrido: varios dominios ja foram migrados para Nexos API/NestJS/Prisma, enquanto algumas rotas e documentos ainda carregam legado MVP, mock store, Supabase residual, documentacao antiga e gates fisicos pendentes.

Status oficial desta auditoria:

```text
MESSAGING CORE FUNCTIONALLY APPROVED BY PHYSICAL TESTS
SYSTEM-WIDE PRODUCTION READINESS INCOMPLETE
NEW SPRINT CYCLE REQUIRED
```

## 2. Evidencias Coletadas

### 2.1 Validacao Automatizada

Comando executado:

```powershell
bun run verify
```

Resultado:

```text
FAIL
```

Motivo:

```text
frontend:lint-baseline falhou
```

Regressoes apontadas:

- novo arquivo lintado com mensagens: `backend/src/conversations/conversations.controller.ts`
- novo arquivo lintado com mensagens: `backend/src/messaging/messaging-inbound.service.ts`
- novo arquivo lintado com mensagens: `backend/src/messaging/messaging-outbound.service.ts`
- novo arquivo lintado com mensagens: `backend/src/roles/roles.controller.ts`
- `src/routes/inbox.index.tsx`: `react-hooks/exhaustive-deps`, 1 atual contra 0 no baseline

Impacto: o projeto nao possui baseline automatizada verde neste momento. Antes de novo deploy ou sprint grande, esse gate deve voltar a PASS.

### 2.2 Worktree

O worktree esta sujo com muitas alteracoes rastreadas e arquivos novos, majoritariamente ligados ao ciclo de mensageria, migrations, docs, media e rotas de Inbox/perfis/contatos.

Impacto: antes de abrir uma nova sprint, e necessario congelar uma baseline: revisar, validar, documentar e commitar o estado aprovado da mensageria.

### 2.3 Legado Detectado

Busca por uso de mock/store encontrou runtime legado em:

- `src/routes/empresas.tsx`
- `src/routes/atendimento.clientes.tsx`
- `src/routes/atendimento.historico.tsx`
- `src/routes/atendimento.favoritos.tsx`
- `src/lib/api/index.ts`
- tipos residuais em `src/routes/atendentes.tsx`

Impacto: existem superficies que ainda nao devem ser consideradas parte do produto operacional aprovado.

## 3. Matriz De Modulos

| Modulo | Status | Evidencia | Risco | Acao Recomendada |
| --- | --- | --- | --- | --- |
| Mensageria / Inbox | Completo para homologacao funcional | Testes fisicos do PO aprovados apos reworks; backend tem specs extensas de messaging/realtime/queue | `verify` ainda falha no lint baseline; precisa congelar baseline | Sprint curta de fechamento: lint, docs finais, commit, checklist de deploy |
| Auth / Sessao / RBAC | Parcialmente pronto | Backend Auth/Roles/Permissions reais; bloqueio de secrets placeholder ja existe | Tokens em `localStorage`; segredos/envs precisam padronizacao de producao | Hardening de producao, envs fortes, revisar permissoes por perfil |
| Usuarios / Departamentos / Perfis | Funcional, precisa validacao fisica ampla | Rotas migradas para `organizationApi` e backend modules `users`, `departments`, `roles` | Falha atual em `roles.controller.ts` no lint baseline | Validar CRUD, permissoes e matriz admin/agente/supervisor |
| CRM: Clientes / Contatos / Etiquetas | Funcional, precisa homologacao final | `clientes.tsx` e `contatos.tsx` usam `crmApi`; etiquetas ja foram migradas | Regras de duplicidade, vinculo cliente-contato e filtros precisam testes fisicos | Sprint CRM de regressao fisica e edge cases |
| Empresas tenant/admin | Parcial e bifurcado | `/admin/empresas` e platform API foram aprovados na Sprint 13; `/empresas` ainda usa mock store | Duas superficies com nomes parecidos podem confundir o produto | Decidir: remover `/empresas`, redirecionar, ou migrar para API real |
| Atendimento legado `/atendimento/*` | Incompleto / legado | `atendimento.clientes`, `historico`, `favoritos` usam mock; `perfil` tem dados estaticos | Pode induzir uso de telas que nao refletem banco real | Remover, redirecionar para Inbox/rotas novas, ou migrar como sprint propria |
| Chamados / Tickets | Implementado tecnicamente, pendente de gate fisico completo | Backend `tickets`, storage local/R2 boundary, rota `/chamados` usa `ticketApi` | Storage local nao e deploy final; anexos precisam prova com R2 ou storage escolhido | Sprint Tickets: upload/download/permissoes/storage/producao |
| Campanhas | Parcialmente pronto | `campaignApi`, backend `campaigns`, BullMQ e guard anti-legado existentes | Precisa teste real de audiencia, envio, fila, cancelamento e limites de plano | Sprint Campanhas: matriz fisica com Redis/Evolution e falhas |
| Automacoes / Chatbot / Filas | Parcial | Rotas usam APIs novas em parte; docs indicam migracao na Sprint 14 | Execucao real de regras/bot ainda precisa prova de ponta a ponta | Sprint Automacoes: definir motor, gatilhos, logs e rollback |
| Operacoes: dashboard, historico, relatorios, filas | Parcialmente pronto | `operationsApi`, backend `operations`, RC Sprint 15 menciona implementacao | Gate fisico do RC Sprint 15 ficou reaberto; export Excel/PDF nativo pendente | Sprint Operacoes: homologar filtros, relatorios, export e fila real |
| Admin Platform / Planos / Assinaturas / Financeiro / Auditoria | Forte, mas com pendencias | Sprint 13 registra READY e muitos PASS; platform API tem specs | Banner de impersonation foi marcado como pendente em relatorio anterior; precisa revalidar apos alteracoes | Sprint Platform final: impersonation UX, planos, limites, faturamento manual |
| Instancias / Evolution | Funcional em homologacao local | Evolution v2.3.7, webhook, QR, lifecycle e conexao real usados no MRC | Deploy publico exige dominio, TLS, webhook publico, secrets e backup | Sprint Deploy: ambiente online e hardening Evolution |
| Realtime / Notificacoes | Funcional na mensageria | Socket.io, Redis adapter e testes de realtime existem | Precisa stress multiusuario e reconexao em ambiente online | Teste de carga leve e matriz navegador/admin/agente |
| Infra / Deploy / Storage | Incompleto para producao | `docker-compose.yml` local existe; `docs/DEPLOY.md` mistura legado Supabase e passos atuais | Nao ha playbook final unico de producao; storage local nao e ideal | Criar deploy guide definitivo e ambiente staging |
| Documentacao | Fragmentada / desatualizada | `docs/DEPLOY.md`, `docs/README.md`, `docs/AUTHENTICATION.md` ainda citam Supabase/MVP/demo em trechos antigos | Operacao pode seguir comando errado | Sprint Docs/Operations: fonte unica de comandos e variaveis |

## 4. Diagnostico Por Prioridade

### P0 - Antes De Qualquer Deploy De Teste Online

1. Restaurar `bun run verify` para PASS.
2. Congelar baseline da mensageria aprovada: migrations, docs, env examples e commit.
3. Atualizar comandos operacionais oficiais e remover ambiguidade entre docs antigas e estado atual.
4. Definir ambiente staging: banco, Redis, Evolution, frontend, backend, storage e webhook publico.

### P1 - Antes De Declarar Produto Aprovado

1. Remover ou migrar rotas legadas `/atendimento/*` e `/empresas`.
2. Homologar CRM completo: clientes, contatos, etiquetas, vinculos, permissao por perfil.
3. Homologar tickets com anexos reais e storage final.
4. Homologar campanhas e automacoes com filas e falhas controladas.
5. Revalidar admin/platform apos as alteracoes recentes.

### P2 - Hardening De Producao

1. Tokens HttpOnly ou estrategia equivalente para reduzir risco de `localStorage`.
2. Secrets fortes e `.env.example` separado por local/staging/producao.
3. CI/CD minimo com `verify`, backend tests, build frontend e migration status.
4. Backup/rollback documentado para Postgres, Redis relevante e Evolution.
5. Observabilidade: logs sanitizados, health checks e alerta basico.

## 5. Proposta De Novo Ciclo De Sprints

### PRC-01 - Baseline & Audit Closure

Objetivo: fechar esta auditoria como baseline oficial.

Entregas:

- corrigir lint baseline;
- rodar `bun run verify` ate PASS;
- atualizar documento final de mensageria;
- registrar estado aprovado;
- limpar/commitar worktree.

Gate:

```text
VERIFY PASS
MESSAGING BASELINE FROZEN
READY FOR MODULE HARDENING
```

### PRC-02 - Legacy Surface Cleanup

Objetivo: eliminar telas operacionais falsas ou ambigua.

Escopo:

- `/atendimento/clientes`
- `/atendimento/historico`
- `/atendimento/favoritos`
- `/atendimento/perfil`
- `/empresas`
- `src/lib/api/index.ts`

Decisao esperada por tela: remover, redirecionar ou migrar para Nexos API.

### PRC-03 - CRM Production Readiness

Objetivo: deixar clientes, contatos, etiquetas e vinculos aprovados fisicamente.

Escopo:

- CRUD completo;
- duplicidade;
- vinculo/desvinculo;
- permissao por perfil;
- filtros e busca;
- impacto no Inbox.

### PRC-04 - Tickets & Storage

Objetivo: aprovar chamados com anexos em storage final.

Escopo:

- abrir chamado;
- comentario interno;
- troca de status/prioridade/departamento;
- upload/download/preview;
- permissao;
- storage local vs R2 definido para deploy.

### PRC-05 - Campaigns, Automations & Queue

Objetivo: aprovar disparos, automacoes e filas com Redis/BullMQ.

Escopo:

- audiencia;
- preview;
- agendamento;
- cancelamento;
- retry;
- limites de plano;
- logs operacionais.

### PRC-06 - Platform Admin Final

Objetivo: revalidar o control plane SaaS antes de producao.

Escopo:

- tenants;
- planos;
- assinaturas;
- financeiro manual;
- auditoria;
- impersonation com banner visivel;
- limites por plano.

### PRC-07 - Reports & Operations

Objetivo: aprovar dashboards, historico, relatorios e export.

Escopo:

- indicadores;
- filtros;
- consistencia com mensagens reais;
- CSV/XLSX/PDF;
- filas e SLA.

### DEPLOY-01 - Staging Online

Objetivo: colocar ambiente online para testes controlados.

Escopo:

- backend e frontend publicados;
- Postgres e Redis provisionados;
- Evolution publica com webhook TLS;
- storage definido;
- secrets fortes;
- smoke de login, health, inbox, outbound e inbound.

## 6. Gate Final Desta Auditoria

```text
PRC-01 SYSTEM AUDIT COMPLETE
MESSAGING CORE: FUNCTIONALLY APPROVED BY USER PHYSICAL TESTS
SYSTEM-WIDE STATUS: NOT READY FOR PRODUCTION
NEXT ACTION: BASELINE FREEZE + VERIFY GREEN
```
