# Onboarding e Configuração Inicial — 05/10/2026

## Objetivo e decisões preservadas

Esta entrega implementa o assistente obrigatório de configuração inicial do Trixus Chat em oito etapas: Boas-vindas, Instância, Departamentos, Perfis e Acessos, Atendentes, Mensagens Rápidas, Etiquetas e Conclusão.

O estado pertence à tenant. Somente tenants criadas depois da ativação recebem um registro pendente; a ausência desse registro identifica tenants anteriores, que continuam liberadas e não recebem alterações automáticas. Somente o Perfil Administrador da tenant pode operar o assistente e uma sessão de impersonação não pode concluí-lo. A D-009 permanece como fonte das permissões: o assistente usa os mesmos perfis, catálogo de permissões, escopos e serviços do cadastro oficial.

## Mapeamento comprovado antes da alteração

| Área | Contrato e fluxo reutilizados | Evidência principal |
| --- | --- | --- |
| Instâncias | listagem, criação Evolution, QR, consulta de status, logout e remoção; isolamento por `tenantId` e permissões de instância existentes | `backend/src/messaging/messaging-connections.controller.ts`, `backend/src/messaging/messaging-connections.service.ts`, `src/lib/trixus-api.ts`, `src/routes/instancias.tsx` |
| Departamentos | CRUD oficial, validação de nome, cor, ícone e vínculos com instâncias | `backend/src/departments/departments.controller.ts`, `src/routes/departamentos.tsx` |
| Perfis e acessos | CRUD oficial, catálogo de permissões, limites de concessão do editor e escopos de instância/departamento | `backend/src/roles/roles.controller.ts`, `src/routes/perfis.tsx` |
| Atendentes | CRUD oficial, vínculo ao perfil, departamentos, ativação/desativação e proteção da conta global prevista na D-004 | `backend/src/users/users.controller.ts`, `src/routes/atendentes.tsx` |
| Mensagens rápidas | CRUD oficial, normalização de atalho, arquivamento e escopo por departamento | `backend/src/quick-replies/quick-replies.controller.ts`, `src/routes/mensagens-rapidas.tsx` |
| Etiquetas | CRUD oficial, nome normalizado, cor e vínculos existentes; descrição acrescentada ao mesmo cadastro | `backend/src/crm/tags.controller.ts`, `src/routes/etiquetas.tsx` |

O assistente não possui tabelas paralelas para esses cadastros. Ele coordena os contratos já existentes e persiste somente o próprio estado de progresso.

## Contrato de estado

`tenant_onboarding_states` possui uma linha por tenant nova, com estado `PENDING` ou `COMPLETED`, etapa atual, maior etapa concluída, versão otimista e datas. O progresso é monotônico e atualizado sob bloqueio da linha da tenant. A versão impede que dois administradores sobrescrevam uma atualização válida.

O servidor impede saltos e valida, ao avançar, os requisitos das etapas obrigatórias:

1. instância Evolution conectada e não arquivada;
2. ao menos um departamento ativo;
3. Perfil Administrador da tenant;
4. administrador global e vínculo com a tenant ativos.

Mensagens rápidas e etiquetas são revisões sem quantidade mínima. Para concluir, o servidor exige que as etapas 1 a 7 tenham sido percorridas, que a etapa atual seja a 8 e que todos os requisitos obrigatórios ainda sejam verdadeiros. Atualização de página, logout e fechamento do navegador não concluem o fluxo.

## Acesso e retomada

- Tenant anterior ou onboarding concluído: fluxo normal.
- Tenant pendente, usuário comum: apenas leitura do status e bootstrap da sessão; a interface mostra a mensagem de configuração pendente e permite sair.
- Tenant pendente, Administrador: somente status/progresso/conclusão e os endpoints oficiais necessários às oito etapas.
- Impersonação: pode consultar o estado, mas não operar nem concluir o assistente.
- Realtime: novas conexões e sessões já estabelecidas são revalidadas e bloqueadas enquanto a tenant estiver pendente.

## Idempotência e recuperação da instância

A criação Evolution do assistente envia uma chave estável. O backend deriva uma referência externa determinística com tenant e chave, serializa a operação pelo estado de onboarding e reconcilia a existência no provedor antes e depois de falhas ambíguas. Conflitos de unicidade são relidos fora da transação abortada e nunca removem a instância potencialmente compartilhada pela requisição vencedora.

Falha transitória oferece nova tentativa no mesmo registro. Quando o provedor informa que a instância não existe, o assistente interrompe a consulta repetida e oferece remoção confirmada do registro órfão, preservando o histórico de conversas, antes da recriação.

As sugestões de departamentos, perfis, mensagens rápidas e etiquetas são acionadas pelo administrador e consultam primeiro o catálogo existente. A migration acrescenta uma unicidade parcial para atalhos globais ativos e aborta antes de qualquer DDL se encontrar duplicatas existentes, sem apagar nem consolidar dados automaticamente.

## Impacto para tenants existentes

Não há backfill. Tenants existentes permanecem sem linha em `tenant_onboarding_states`, são tratadas como `not_required` e não têm cadastros, permissões ou progresso modificados. A criação de tenant passa a gravar o estado pendente na mesma transação que cria a tenant e seus perfis iniciais.

## Implantação segura

1. Fazer backup verificável da aplicação e do banco do ambiente alvo.
2. Em banco descartável derivado apenas de estrutura/dados sanitizados, aplicar a migration e validar o preflight de atalhos globais.
3. Se o preflight acusar duplicatas, revisar os registros manualmente; não remover dados automaticamente.
4. Aplicar a migration antes de iniciar a nova versão do backend, pois o guard consulta a tabela de onboarding.
5. Validar uma tenant anterior (deve permanecer liberada) e uma tenant criada depois da ativação (deve iniciar pendente).
6. Validar a integração Evolution/QR em ambiente isolado, inclusive expiração, timeout, desconexão e repetição.

## Retorno

O retorno de código consiste em restaurar os arquivos pelo backup desta entrega. Como a migration é aditiva, o retorno mais seguro é manter a tabela e a coluna sem uso enquanto a versão anterior é restaurada. Remover tabela, enum, coluna ou índice exige uma migration de retorno separada, backup validado e análise de dados gravados depois da ativação; não executar `DROP` manual em produção.

Antes das alterações foi preservada a cópia `C:/dev/preservacao-20260921/fechamento/20261005-onboarding-wizard-before`, acompanhada de manifesto SHA-256. A evidência posterior deve ser preservada ao lado dessa cópia após a rodada final de verificações.

## Limites da validação local

Nenhuma migration, seed, reset, verificação geral ou E2E foi executado contra os bancos correntes. Nenhum serviço Evolution/WhatsApp real foi acessado. A migration precisa ser aplicada e testada em PostgreSQL descartável e o QR precisa de homologação isolada antes de produção.

## Verificações executadas

- TypeScript frontend: `tsc --noEmit` aprovado.
- Build backend: aprovado.
- Build frontend client, SSR e Nitro: aprovado; permaneceram apenas avisos preexistentes de plugin e tamanho de chunks.
- ESLint focado nos arquivos da entrega: aprovado sem erros ou avisos.
- Backend focado: 6 arquivos e 93 testes aprovados, cobrindo estado, acesso HTTP, realtime, idempotência da instância, migration estática e criação de tenant.
- Frontend focado: 7 arquivos e 26 testes aprovados, cobrindo o boundary, instâncias, perfis e atendentes.
- `git diff --check`: sem erro de whitespace; somente avisos de conversão LF/CRLF do checkout.

Essas verificações são evidência de compilação e comportamento isolado, não certificação de integração com PostgreSQL, Redis, Evolution ou WhatsApp reais.
