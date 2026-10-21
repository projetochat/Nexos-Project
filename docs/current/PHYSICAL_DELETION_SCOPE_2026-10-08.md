# Exclusão física — escopo verificado em 08/10/2026

## Implementado neste ciclo

- **Chamados:** preview dinâmico inclui comentários, histórico e anexos; a confirmação é revalidada por snapshot; registros dependentes e chamado são removidos em transação tenant-scoped.
- **Arquivos de anexos:** a remoção do storage acontece somente após o commit. Uma ocorrência durável no outbox preserva os dados mínimos de auditoria e permite repetição idempotente em caso de falha ou processamento interrompido.
- **Automações:** preview, revalidação e exclusão física tenant-scoped existem no backend. A tela funcional continua deliberadamente indisponível (`MODULE_AVAILABLE = false`), portanto este trabalho não declara o módulo entregue.

## Não implementado — D-007

- **Fluxo de bot:** permanece tela introdutória/indisponível; não existe entidade funcional que possa receber exclusão física.
- **Agente de IA:** permanece tela introdutória; não existe entidade funcional que possa receber exclusão física.

Esses dois itens continuam no backlog separado definido pela D-007. Não foram criadas entidades artificiais nem habilitadas funcionalidades incompletas para aparentar atendimento ao requisito.

## Evidência de verificação

- Testes unitários isolados, somente com mocks: preview, escopo do tenant, revalidação do snapshot, ordem transação/commit/storage, falha recuperável e retomada de lease do worker.
- Teste de contrato do frontend: uso de `DeletionConfirmDialog` em Chamados e manutenção explícita do bloqueio do módulo de Automações.
- Nenhum banco real, migração, seed, reset, integração externa ou recurso de VPS foi usado.

## Recuperação

Os arquivos anteriores ao ciclo estão preservados em `.task-backups/20261008-physical-delete-automations-tickets`.
