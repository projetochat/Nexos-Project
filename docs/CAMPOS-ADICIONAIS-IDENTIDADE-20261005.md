# Campos Adicionais — identidade, variáveis e colisões

Data: 05/10/2026
Escopo: CRM / Campos Adicionais e resolução de variáveis de mensagens.

## Objetivo

Impedir colisões entre campos nativos e Campos Adicionais, manter nomes e chaves técnicas únicos por tenant, preservar isolamento e tornar o backend a autoridade tanto na validação quanto na resolução de variáveis.

## Evidência observada antes da alteração

- A definição já era tenant-wide (`ContactCustomField.tenantId`) e não possuía escopo de instância.
- A unicidade existente era `tenantId + normalizedName`.
- A chave da variável não era persistida: era recriada a partir da label visível no backend e no frontend.
- O arquivamento alterava `normalizedName` com um sufixo temporal e liberava o nome para reutilização.
- Campos arquivados podiam continuar entrando em contextos de mensagem por meio de valores antigos.
- `note` é apenas descrição/ajuda e não identifica o campo; permanece fora das regras de unicidade.

## Catálogo nativo oficial

As chaves técnicas reservadas são independentes dos textos traduzidos exibidos na interface:

| Chave | Significado |
| --- | --- |
| `saudacao` | Saudação calculada no instante e fuso da mensagem |
| `cumprimento` | Alias compatível de `saudacao` |
| `contato` | Alias do nome do contato |
| `nome` | Nome do contato |
| `telefone` | Telefone do contato |
| `email` | E-mail do contato |
| `instancia` | Instância da conversa |
| `departamento` | Departamento aplicável |
| `cliente` | Empresa/cliente vinculado |
| `empresa` | Alias de `cliente` |

Campos Adicionais não podem usar nenhuma dessas chaves.

Além das chaves, o cadastro reserva separadamente os nomes dos campos nativos observados no
formulário de contato: Nome, WhatsApp/Telefone, E-mail, Instância(s), Empresa/Cliente,
Departamento, Perfil e Etiqueta(s), incluindo as formas “do Contato”. Essa lista visual não é
usada como substituta do catálogo técnico acima; as duas verificações são aplicadas.

## Regras aplicadas

- `normalizedName` usa Unicode NFKC, remoção de espaços externos, colapso de espaços internos e caixa minúscula.
- `variableKey` é uma coluna separada, gerada na criação, persistida e imutável durante renomeações.
- Existem índices únicos de banco para `(tenantId, normalizedName)` e `(tenantId, variableKey)`. A pré-validação melhora a experiência, mas o índice é a autoridade contra concorrência.
- Violações concorrentes `P2002` são convertidas para `CONTACT_CUSTOM_FIELD_ALREADY_EXISTS` e para a mensagem: “Já existe um campo com este nome. Informe um nome diferente.”
- O frontend apresenta a chave técnica e faz validação conveniente contra campos ativos e chaves nativas; o backend repete toda validação.
- Tenants diferentes podem reutilizar o mesmo nome e a mesma chave.
- A resolução usa `variableKey` como identidade oficial. Aliases derivados da label existem apenas
  para compatibilidade com templates antigos, somente quando não são ambíguos e nunca podem
  sobrescrever uma chave técnica oficial ou nativa.
- Campos ativos entram no contexto por tenant. Campos arquivados não entram nos menus nem na resolução.
- Saudação, Ausência, envio manual/Mensagens Rápidas, legendas de mídia e agendamentos passam pelo resolvedor de backend. O resolvedor do navegador é apenas pré-visualização.

## Decisão de arquivamento — D-CRM-001 (05/10/2026)

Decisão mínima aplicada: **bloquear a reutilização do nome e da chave enquanto o registro arquivado existir**.

Justificativa:

- preserva valores e identidade histórica;
- evita que duas definições disputem a mesma variável;
- não exige decidir implicitamente se uma recriação deve restaurar tipo, opções e valores antigos;
- não introduz exclusão física.

Não foi criado fluxo de restauração nesta entrega. Restaurar ou liberar uma identidade arquivada exige uma decisão explícita posterior.

## Migração

`20261005210000_contact_custom_field_identity` é aditiva e não foi executada contra banco corrente.

- Adiciona `variableKey`.
- Normaliza nomes ativos.
- Mantém o token legado primário dos registros existentes quando possível, para reduzir quebra de mensagens já salvas.
- Em históricos de arquivamento/recriação, prioriza o campo ativo (ou o arquivado mais antigo quando não há ativo) para conservar o nome normalizado; as demais identidades históricas recebem sufixo determinístico, sem excluir registros. A identidade principal continua reservada.
- Se houver dois campos ativos que se tornem iguais após NFKC, a migração é interrompida deliberadamente, exigindo revisão dos dados em cópia descartável antes de qualquer aplicação real.

## Verificações executadas

- Prisma Client gerado localmente: aprovado.
- `prisma validate` com URL descartável e inacessível: aprovado; apenas avisos preexistentes sobre `SetNull`.
- Typecheck frontend: aprovado.
- Typecheck compilável do backend (`tsconfig.build`): aprovado.
- ESLint nos arquivos tocados: aprovado.
- Testes backend direcionados: 25 aprovados.
- Testes frontend direcionados: 27 aprovados.
- Suítes adicionais de Saudação, Ausência, envio rápido, mídia e agendamento: 62 testes backend aprovados.
- Suítes adicionais de edição e sequências de Mensagens Rápidas: 23 testes aprovados.

Cobertura direcionada inclui normalização Unicode, caixa/espaços, chave nativa, campo existente/arquivado, concorrência simulada com `P2002`, tenants distintos, criação, edição com chave imutável, resolução por chave técnica, proteção contra sobrescrita nativa, tipos formatados e uso no modal de agendamento.

## Limitações

- Nenhuma migração foi aplicada e nenhum banco foi acessado. A SQL deve ser ensaiada numa cópia descartável com dados representativos antes de promoção.
- A transliteração SQL de chaves legadas cobre o alfabeto latino usado atualmente, mas deve ser comparada com a geração NFKD da aplicação no ensaio descartável caso existam labels em outros alfabetos.
- O teste de concorrência comprova o contrato da aplicação e a presença dos índices no esquema/migração; não substitui um teste de integração PostgreSQL com duas transações reais.
- Não foi criado fluxo para listar/restaurar campos arquivados.
- O typecheck amplo que inclui todos os testes do backend continua apresentando erros preexistentes e não relacionados; o `tsconfig.build` passou.
- Havia alterações simultâneas, fora deste escopo, nos arquivos de mensagens. Elas foram preservadas e integradas; por isso o retorno deve ser seletivo.

## Backup e retorno

Snapshot anterior: `C:/dev/Trixus/backups/campos-adicionais-20261005-before` (arquivos com hashes SHA-256 registrados na criação).

Retorno antes de qualquer aplicação de migração:

1. Reverter seletivamente os hunks de `variableKey`, identidade de Campo Adicional e catálogo/resolução por chave; não copiar os arquivos inteiros do snapshot sobre o trabalho atual, pois isso apagaria alterações simultâneas de mensagens.
2. Remover os novos arquivos `contact-custom-field-identity.ts`, seus testes e a migração somente se ainda não tiver sido aplicada.
3. Regenerar o Prisma Client e repetir typechecks/testes direcionados.

Retorno depois de uma futura aplicação da migração:

- É seguro reverter primeiro o código mantendo a coluna e o índice aditivos no banco.
- Não remover `variableKey` automaticamente: isso perde a identidade persistida. Uma reversão física exige backup do banco descartável/real autorizado e migração inversa revisada explicitamente.
