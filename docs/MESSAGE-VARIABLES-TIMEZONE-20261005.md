# Variáveis de mensagens e time zone — 05/10/2026

## Objetivo e resultado

O resolvedor efetivo do backend passou a ser a fonte de verdade no enfileiramento de mensagens. A prévia do Chat usa o mesmo contrato de fuso e tipos, mas o texto é resolvido novamente no backend para impedir que o horário do navegador ou uma prévia antiga determine o conteúdo enviado.

- `{{saudacao}}`: `Bom dia` de 00:00 a 11:59, `Boa tarde` de 12:00 a 17:59 e `Boa noite` de 18:00 a 23:59.
- `{{cumprimento}}` continua aceito somente como alias de compatibilidade.
- Instantes continuam representados em UTC e são convertidos com o time zone IANA da conexão da conversa.
- Checkbox: `Sim`, `Não` ou vazio quando nulo.
- Data civil: `DD/MM/AAAA`.
- Data/hora: `DD/MM/AAAA HH:mm`, no time zone da conexão.
- Lista múltipla: uma opção por linha, com prefixo `- `.
- Variáveis desconhecidas permanecem no texto, preservando o comportamento anterior.

## Divergências comprovadas antes da alteração

- Mensagens de saudação, ausência e agendadas usavam o resolvedor backend; mensagens rápidas eram materializadas no navegador com `Date#getHours()`.
- O backend aplicava fallback silencioso para `America/Sao_Paulo` em saudação, enquanto o expediente tratava fuso inválido como fora do horário.
- Campos persistidos chegavam sem `mask` ao Chat e sem tipo/máscara aos resolvedores backend; por isso checkbox, data/hora e lista múltipla eram enviados como strings cruas.
- Sequências rápidas resolviam todos os itens na seleção, mesmo quando seriam enviados muito depois.
- Horários com fim menor que o início eram rejeitados, impedindo períodos que atravessam meia-noite.

## Comportamento de segurança

- Fuso ausente ou inválido nunca usa o fuso do servidor, container, banco ou navegador.
- Respostas automáticas são suprimidas quando o fuso da instância está ausente/inválido, pois a decisão de expediente não é confiável.
- Uma mensagem humana/agendada com variável temporal ou campo data/hora falha antes de ser enfileirada quando o fuso persistido está inválido. Templates sem variável temporal continuam resolvíveis.
- A decisão de expediente e a resolução da saudação permanecem funções distintas, recebendo a mesma referência temporal controlada pelo serviço.
- Consultas continuam delimitadas por `tenantId`, conversa e conexão selecionada. O time zone é obtido da conexão da própria conversa.

## Compatibilidade e retirada futura de `{{cumprimento}}`

A busca estática encontrou o alias no seed, no placeholder de instância, nas opções de criação e em testes. Seed, placeholder e opções novas passaram a usar `{{saudacao}}`; dados já persistidos não foram reescritos.

Não foi consultado nenhum banco corrente. Portanto, mensagens persistidas ainda podem conter o alias em:

- `MessagingConnection.welcomeNewMessage`, `welcomeExistingMessage` e `absenceMessage`;
- conteúdo/mensagens de `QuickReply`;
- payloads de `Schedule`.

Retirada futura proposta:

1. Em ambiente autorizado, gerar inventário somente leitura por tenant dessas superfícies, sem registrar conteúdo sensível.
2. Manter o alias durante uma janela de compatibilidade e medir apenas a contagem de resoluções do nome legado.
3. Oferecer atualização explícita dos templates encontrados, com backup e validação por tenant.
4. Remover o alias somente após contagem zero e nova decisão aprovada.

Campanhas ficaram fora desta centralização porque usam outro contrato comprovado (`{{contact.name}}`, `{{customer.name}}`) e não o resolvedor do Chat.

## Limitações

- O runtime depende da base IANA fornecida pelo JavaScript/Node instalado; não foi feita certificação contra um provedor real.
- A prévia do frontend é informativa. O backend é a fonte de verdade no instante de enfileiramento.
- Não houve inventário de dados reais persistidos, migração, seed, E2E ou acesso a produção.

## Verificações executadas

- Backend focado, incluindo contrato de conversa: 7 arquivos, 98 testes aprovados.
- Frontend focado: 6 arquivos carregados pelo runner, 52 testes aprovados.
- Build TypeScript do backend aprovado.
- Typecheck do frontend aprovado.

## Retorno

O backup anterior às alterações está em `C:/dev/Trixus/backups/2026-10-05-message-variables-timezone`.

Como a árvore de trabalho contém alterações paralelas, não copie a pasta inteira sobre o projeto. Para retornar:

1. interrompa novos envios no ambiente local de teste;
2. compare cada arquivo alterado com a cópia correspondente do backup;
3. reverta somente os trechos deste mecanismo (resolvedor, relógio, expediente, contrato de conversa e template bruto de sequência);
4. remova apenas os novos arquivos `message-clock.ts`, `message-local-time.ts` e este documento;
5. execute novamente os testes focados e a tipagem;
6. não execute migração: esta alteração não criou nem exige mudança de banco.
