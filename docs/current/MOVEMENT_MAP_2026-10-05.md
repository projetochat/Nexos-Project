# Mapa de movimentacao documental — proposta de 2026-10-05

> Mapa aprovado apenas como proposta tecnica. Nenhuma origem abaixo foi movida nesta etapa. A segunda etapa depende de decisao humana, atualizacao de consumidores e verificacao de links.

## Estrutura proposta

```text
docs/
  README.md                 indice raiz e aviso de autoridade
  current/                  auditorias e referencias comprovadas
  architecture/             arquitetura, dados, componentes e design
  operations/               deploy, producao, recuperacao e runbooks
  decisions/                decisoes aprovadas e datadas
  modules/                  contratos funcionais por modulo
  archive/                  baselines, planos e relatorios historicos
sprints/
  README.md                 indice historico
  archive/                  arvore historica dos ciclos encerrados
```

Nao foi acrescentado `docs/contracts` nesta etapa. Embora contratos tenham necessidades proprias, os scripts atuais dependem de caminhos fixos. Uma pasta adicional so se justifica junto da alteracao e teste desses consumidores.

## Mapa origem para destino

| Origem | Destino proposto | Condicao antes de mover | Risco |
| --- | --- | --- | --- |
| `docs/01-*.md` a `docs/10-*.md` | `docs/archive/legacy-index/` | Preservar stubs/redirecionamentos nos caminhos atuais ou atualizar todas as referencias | Medio ao mover; alto ao remover |
| `docs/ARCHITECTURE.md`, `DATABASE.md`, `COMPONENTS.md`, `CODING_GUIDELINES.md`, `Guia_UX_UI_Trixus.docx` | `docs/architecture/` | Reconciliar com codigo e decisoes de outubro; validar guia visual | Medio/alto |
| `docs/DEPLOY.md`, `VPS-DEPLOY.md`, `OPERATIONS.md`, `PRODUCTION-AUTOMATION.md`, `DEVOPS-HANDOFF-20261002.md` | `docs/operations/` | Revisar dados operacionais; atualizar scripts/links; nao tocar VPS | Alto |
| `docs/AUTHENTICATION.md`, `BUSINESS_RULES.md` e decisoes extraidas de documentos recentes | `docs/decisions/` somente para decisoes confirmadas | Nao copiar propostas ou decisoes alegadas sem confirmacao | Alto |
| `docs/API.md`, `AUTOMATIONS.md`, `CAMPAIGNS.md`, `EVOLUTION*.md`, `GROUP_CONVERSATIONS.md`, `IMPERSONATION.md`, `INBOX_DOMAIN.md`, `MESSAGE*.md`, `MESSAGING.md`, `PLANS_AND_SUBSCRIPTIONS.md`, `PLATFORM_ADMIN.md`, `REALTIME.md`, `STORAGE.md`, `TENANT_LIFECYCLE.md`, `TICKETING.md`, `USER_FLOW.md` | `docs/modules/` | Corrigir divergencias e atualizar verificadores de contrato no mesmo commit | Alto |
| `docs/AUDITORIA_INTEGRAL_2026-09-15.md`, `SPRINT_08_04_REWORK_II_REPORT.md`, `PRODUCTION-READINESS-20260922.md` | `docs/archive/reports/` | Inserir aviso historico e manter referencias | Medio |
| `docs/ROADMAP.md`, `PLANO-IMPORTACAO-HISTORICO.md` | `docs/archive/plans/` | Reconciliar pendencias com a fonte central | Medio |
| `docs/CHANGELOG.md` | `docs/archive/CHANGELOG.md` ou ledger em `docs/current/` | Decidir se sera somente historico ou mantido continuamente | Medio |
| Quatro documentos de correcoes de 2026-10-05 | `docs/archive/corrections/2026-10-05/` ate incorporacao nos canonicos | Confirmar decisoes e consolidar alteracoes funcionais | Alto |
| `docs/DEVOPS-HANDOFF-20261002.md` | `docs/operations/handoffs/` | Validar estado remoto e redigir informacoes operacionais | Alto |
| `sprints/<ciclo>/...` | `sprints/archive/<ciclo>/...` | Atualizar 30 links locais e preservar a arvore | Medio ao mover; alto ao remover |

## Consumidores que bloqueiam a movimentacao imediata

- `scripts/check-prc04-ticket-storage-contract.mjs`
- `scripts/check-prc05-campaign-automation-queue-contract.mjs`
- `scripts/check-prc06-platform-admin-final-contract.mjs`
- `scripts/check-prc07-reports-operations-contract.mjs`
- `scripts/production/README.md`

Esses consumidores usam caminhos atuais. Qualquer movimentacao futura precisa alterar consumidores e documentos no mesmo commit e executar apenas as verificacoes seguras correspondentes.

## Mapa inverso para retorno

Na segunda etapa, gerar uma tabela destino para origem antes de mover. O retorno deve ser feito por commit de reversao ou por restauracao seletiva do backup; nunca por limpeza ampla da arvore de trabalho.
