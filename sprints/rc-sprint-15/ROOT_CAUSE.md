# RC Sprint 15 - Root Cause

## Historico

Causa raiz: a consulta operacional aceitava status dinamico e periodo baseado em `lastMessageAt` ou
`createdAt`. Isso permitia resultado diferente da regra fisica esperada para historico encerrado.

Correcao: historico agora usa `status = FECHADA` e `closedAt IS NOT NULL`, com range aplicado em
`closedAt`.

## Dashboard e Relatorios

Causa raiz: Dashboard, Relatorios e Exportacao tinham pontos de agregacao separados. Essa duplicidade
permitia semanticas divergentes para conversas, leads e filtros.

Correcao: `OperationsMetricsService` centraliza snapshot, graficos e semantica de KPIs.

## Lead Fantasma

Causa raiz: leads eram contados por status/criacao sem excluir explicitamente leads vinculados a conversas
ja encerradas.

Correcao: `leadsAtivos` considera apenas `NEW`, `QUEUED` ou `ASSIGNED` quando a conversa vinculada nao esta
encerrada com `closedAt`.

## Departamento Teste

Causa raiz: residuos manuais de homologacao podiam permanecer ativos e reaparecer nas superficies
operacionais.

Correcao: consultas operacionais usam departamentos ativos e a rotina `cleanup:operations` detecta/remedia
departamento experimental exato `Teste` sem apagar historico valido.
