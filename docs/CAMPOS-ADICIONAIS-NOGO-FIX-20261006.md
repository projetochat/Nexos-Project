# Campos Adicionais — correção dos bloqueadores NO-GO

Data: 06/10/2026
Candidato preservado: `60f1b952c27389496a28a3a57c806e958f202a14`

## Escopo e causa raiz

Foram corrigidos exclusivamente os dois bloqueadores de Campos Adicionais.

1. A migração adicionava `variableKey` antes de testar colisões Unicode e não possuía transação explícita. Uma falha preservava DDL parcial e impedia repetição. O preflight dentro do arquivo também não impediria, sozinho, um registro falho em `_prisma_migrations`, porque o Prisma inicia o registro antes de executar a SQL.
2. A regressão de `customFields` era uma fixture incompleta. O serializador exige que o valor e sua definição possuam o mesmo `tenantId` do contato. Objetos reais do Prisma possuem os dois campos obrigatórios, mas a fixture usava `unknown` e omitia ambos, sendo corretamente removida pelo filtro de isolamento.

Não há evidência local/Git de aplicação da migração em ambiente persistente conhecido. Ela entrou no commit `576a87f`, não está em `origin/main`, a documentação anterior declara ausência de aplicação em banco corrente e a auditoria executou-a somente em recursos descartáveis. Por isso a migração original foi corrigida. Essa conclusão não equivale a consultar ambientes externos desconhecidos.

## Estratégia da migração

- O comando suportado `prisma:migrate:deploy` agora executa preflight somente leitura antes de chamar o Prisma.
- Estado parcial anterior (coluna, índice ou registro incompleto da migração) é bloqueado; não é mascarado com `IF NOT EXISTS`.
- Colisões de nome NFKC, chave técnica, chave nativa e chave vazia abortam antes de DDL e antes de alteração em `_prisma_migrations`.
- O relatório usa tenant e chave com hash SHA-256 salgado e informa apenas tipo, quantidades e alternativas seguras.
- A SQL repete o preflight e envolve coluna, normalização, backfill, `NOT NULL` e índice em `BEGIN`/`COMMIT`.
- Nenhum campo é renomeado, mesclado, restaurado ou excluído automaticamente.

## Relatório sintético de colisões

O ensaio continha duas tenants, campos ativos e arquivados e três valores. A tenant e as chaves abaixo foram pseudonimizadas com salt efêmero não preservado.

| Tenant anonimizada    | Chave técnica             | Tipo                     | Definições | Ativas | Arquivadas | Valores afetados | Alternativas seguras                                                                            |
| --------------------- | ------------------------- | ------------------------ | ---------: | -----: | ---------: | ---------------: | ----------------------------------------------------------------------------------------------- |
| `tenant-78f23ca8e569` | `sha256:44c9fa6a47169380` | chave nativa             |          1 |      1 |          0 |                0 | Renomear explicitamente o campo adicional.                                                      |
| `tenant-78f23ca8e569` | `sha256:b1b36d6c9827bf0f` | nome Unicode equivalente |          2 |      2 |          0 |                2 | Escolher explicitamente qual definição será renomeada.                                          |
| `tenant-78f23ca8e569` | `sha256:35343423e20bcde2` | nome ativo/arquivado     |          2 |      1 |          1 |                0 | Decidir entre renomear ou criar fluxo explícito de restauração; manter bloqueado até a decisão. |
| `tenant-78f23ca8e569` | `sha256:b1b36d6c9827bf0f` | chave técnica duplicada  |          2 |      2 |          0 |                2 | Renomear explicitamente uma definição.                                                          |
| `tenant-78f23ca8e569` | `sha256:77422f7b2f6518b9` | chave técnica duplicada  |          2 |      1 |          1 |                1 | Renomear explicitamente ou decidir restauração.                                                 |
| `tenant-78f23ca8e569` | `sha256:51629ad736bc083d` | chave técnica duplicada  |          2 |      1 |          1 |                0 | Renomear explicitamente ou decidir restauração.                                                 |

## Evidências PostgreSQL descartáveis

Recursos: PostgreSQL 16 preservado pela auditoria, exposto somente em `127.0.0.1:55434`; bancos novos `trixus_fields_fix_empty_1006`, `trixus_fields_fix_collision_1006` e `trixus_fields_fix_direct_1006`. O PostgreSQL corrente em `5432` não foi usado.

A fixture sanitizada e reproduzível está em
`docs/evidencias/CAMPOS-ADICIONAIS-FIXTURE-DESCARTAVEL-20261006.md`. Ela usa somente UUIDs,
nomes, telefones e valores sintéticos e deve ser aplicada exclusivamente a um banco descartável
posicionado imediatamente antes da migração alvo.

- Cadeia desde banco vazio: 70/70 migrações aplicadas; segunda execução informou ausência de pendências.
- Colisão ASCII `A` versus fullwidth `Ａ`: preflight saiu com código 1.
- Estado antes/depois da falha controlada: 8 definições, 3 valores, 0 registro da migração, 0 coluna `variableKey` e 0 índice técnico.
- Execução direta da SQL com a mesma colisão: erro deliberado dentro da transação; permaneceram 2 definições, 0 coluna, 0 índice e 0 registro da migração.
- Após renomear explicitamente somente as fixtures conflitantes: migração aplicada com sucesso.
- Estado final representativo: 8 definições, 3 valores, 1 migração concluída, 0 chave nula, 0 duplicidade dentro de tenant, 0 chave nativa e 2 campos arquivados preservados.
- Isolamento: 0 vínculos valor/campo/contato com tenant divergente; a chave `a` existe uma vez em cada tenant, comprovando unicidade por tenant, não global.
- Concorrência PostgreSQL real: duas conexões tentaram inserir simultaneamente a identidade `concorrente` na mesma tenant. Uma transação confirmou; a outra recebeu a constraint `contact_custom_fields_tenantId_normalizedName_key`. Não houve duas identidades aceitas.

## Regressão `customFields`

- O filtro de produção por tenant foi preservado.
- A fixture autorizada agora contém `tenantId` no valor e na definição do campo, como ocorre no payload real do Prisma.
- Foram acrescentados cenários com tenant A e B, autorização granular, administrador e valores/definições estrangeiros.
- Usuários sem permissão continuam recebendo `customFields: {}` e `customFieldValues: []`.
- Usuários autorizados recebem somente valores da própria tenant.
- Cadastro e edição convertem tanto a pré-validação quanto uma corrida `P2002` para o mesmo contrato de conflito do formulário.
- O resolvedor central foi exercitado com `{{plano}}` adicional em Saudação, Ausência com mídia, Mensagem Rápida e agendamento; os serviços apenas fornecem o contexto técnico.

## Verificações finais

- Vitest focado: 7 arquivos e 90 testes aprovados.
- TypeScript compilável do backend (`tsconfig.build.json`): aprovado.
- ESLint dos arquivos de implementação, preflight e CRUD/acesso tocados: aprovado.
- `git diff --check`: aprovado; apenas avisos de conversão LF/CRLF do checkout Windows.
- Fixture sanitizada: 8 definições e 3 valores inseridos; após o bloqueio, a consulta de estado retornou `8|3|0|0|0` para definições, valores, histórico alvo, coluna e índice.
- Concorrência PostgreSQL real: uma criação aprovada e uma rejeitada pela constraint única na mesma tenant.

## Limitações

- Não foi disponibilizada cópia sanitizada de backup; o ensaio de dados representativos usa somente fixtures sintéticas.
- A transliteração SQL mantém o escopo latino atual. Labels de alfabetos não latinos devem ser avaliadas em cópia sanitizada antes de promoção.
- Não houve acesso a produção, VPS, GLPI, PostgreSQL corrente, Redis corrente ou integrações reais.
- O lint ampliado aos arquivos completos de mensagens ainda aponta quatro usos de `any` já presentes no candidato rejeitado; as linhas adicionadas passaram em typecheck e nos testes, e esse débito fora do escopo não foi reorganizado nesta correção.

## Integridade do snapshot desta correção

Snapshot: `C:/dev/Trixus/backups/campos-adicionais-nogo-20261006-before`.

| Arquivo                                    | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `CAMPOS-ADICIONAIS-IDENTIDADE-20261005.md` | `782b5fe18f614da4477fc97b5f7a6aea2ebb6c05396ac05306b2505ac7b34a23` |
| `contact-additional-fields-access.spec.ts` | `297f6e53d44ffe5a531ebd2990d8121fc0a83edae4818f456f2fab360f0ac3f2` |
| `migration.sql`                            | `f61a812ca864e21a31e0573b26d92af55198295a0e3c4b3ea7402263ac00c831` |

## Retorno

Antes de aplicar a migração em qualquer ambiente persistente, o retorno é o revert do novo commit local; o candidato rejeitado permanece intacto como pai. O snapshot seletivo está em `C:/dev/Trixus/backups/campos-adicionais-nogo-20261006-before`.

Depois de uma aplicação bem-sucedida, não remover automaticamente `variableKey` nem seu índice. Reverter primeiro o código mantendo a alteração aditiva; qualquer reversão física exige backup autorizado e migração inversa revisada. Se o wrapper detectar `CONTACT_CUSTOM_FIELD_IDENTITY_PARTIAL_STATE`, interromper o deploy e reconciliar o ambiente explicitamente; não usar `IF NOT EXISTS` nem apagar histórico manualmente.
