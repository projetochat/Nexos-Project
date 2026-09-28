# Preparação para publicação — 22/09/2026

## Resultado e escopo

Preparação local da branch `feat/respostas-rapidas-e-interface`, preservando as funcionalidades e decisões aprovadas. A main remota foi consultada e integrada; seu merge não trouxe alterações adicionais de conteúdo nem conflitos. Os oito commits locais anteriores foram preservados. Não houve push, merge de PR, acesso à VPS ou deploy.

Esta versão está preparada para revisão e publicação pelo fluxo existente, condicionada às verificações operacionais remotas abaixo. Aprovação local não certifica a instalação do executor, os segredos/variáveis do GitHub, login do GLPI ou recuperação de dados em produção.

## Correções desta preparação

- Corrigidos tipos JSON no serviço de mensagens, formatação e dois exports auxiliares desnecessários do seletor de fuso. Nenhuma regra ou baseline de lint foi relaxada.
- Contrato PRC-07 alinhado à remoção aprovada do painel de logs. Mantida cobertura das APIs; acrescentada verificação do histórico carregando mensagens reais, paginação, ordenação e componente compartilhado em modo somente leitura. Teste DOM reforçado.
- Rascunho vazio de migração preservado fora da pasta de migrations: sua presença causava P3015 em builds locais. Nenhuma migration publicada foi editada ou removida.
- Schema Prisma alinhado a quatro nomes físicos de índices e dois índices já existentes nas migrations. Sem apagar/renomear índices no banco, sem mudar seletores compostos e sem migration de dados adicional. Comparação com banco descartável sem diferenças.
- Backups, provas, storage e cliente Prisma gerado localmente excluídos de versionamento/contexto de imagem conforme aplicável. O cliente da plataforma de destino é gerado durante o build.
- Um PDF de storage que já estava rastreado foi retirado do índice, preservado localmente e em backup. Ele também já existia na main remota: a remoção atual não apaga o histórico; nenhum rewrite/force-push foi realizado.
- Regras de continuidade receberam a exceção expressamente autorizada para Git e commits locais nesta etapa. Demais decisões preservadas.

As funcionalidades locais anteriores de Inbox, histórico, instâncias, pausa/retomada, reativação e estabilização foram preservadas e incluídas, com seus testes e a migration aditiva `20260922120000_messaging_service_pause`.

## Verificações

- Ambiente Linux descartável: Node 22, Bun 1.3.14, PostgreSQL 16 e Redis 7.4; cópia sem `.env`, rede interna, sem portas publicadas ou volumes de bancos/arquivos correntes. Nenhuma credencial real usada.
- Instalação com `bun install --frozen-lockfile` e geração Prisma aprovadas. Manifestos de dependência/lockfile não alterados. `bun audit --json`: nenhum alerta conhecido retornado.
- `bun run verify` completo aprovado: tipos frontend, lint global (zero erros/avisos), build frontend, contratos de legado/PRC, testes operacionais, build backend, migrations, suite backend, smoke Redis/BullMQ e testes XSS.
- Backend: 405 testes em 63 arquivos, incluindo E2E com PostgreSQL descartável. Build e suite repetidos após o ajuste final de schema.
- Frontend completo: 137 testes em 38 arquivos; cinco testes afetados pelo PRC-07 repetidos após reforçar o contrato. Tipagem aprovada.
- Migrations completas aplicadas em banco limpo descartável. Reaplicação sem migrations pendentes; schema comparado sem drift.
- Scripts produção: 13 testes Python aprovados, incluindo testes Docker opt-in de empacotamento/normalização/importação de imagens fictícias. Sintaxe Bash e Compose com `.env.vps.example` aprovados, sem subir a stack.
- Imagens linux/amd64 backend, migrate e frontend construídas pelos Dockerfiles de produção. Executáveis/artefatos e ausência dos diretórios privados conferidos sem rede. Build frontend usa URL HTTPS fictícia, não as variáveis privadas/remotas do environment production.
- Scanner de padrões de segredos sem achados no snapshot publicável; inspeção de arquivos novos e binários encontrou o PDF removido. Isso não constitui auditoria de todo o histórico Git ou do conteúdo de todos os documentos.
- `git diff --check` aprovado. Não houve aumento de limites, testes desabilitados ou alteração do baseline.

Avisos não bloqueantes: depreciação da configuração Prisma 6 em package.json, recomendação Vite sobre tsconfig paths, avisos act no teste XSS existente e detector Docker sobre a chave explicitamente pública `VITE_SUPABASE_PUBLISHABLE_KEY`. Não são falhas de gate; nenhum segredo privado foi usado como build arg.

## Limites e condições antes de publicar

1. O workflow atual não faz deploy em push/merge na main. A publicação exige disparo manual na main com `release_mode=plan` ou `release_mode=deploy`; preservar essa proteção.
2. Confirmar environment `production`, variáveis públicas corretas, segredos SSH, host key e instalação do executor pelo procedimento existente. Não repetir a instalação se já estiver instalado: `install.sh` é de uso único.
3. Executar a simulação na VPS em etapa autorizada e exigir `SIMULACAO_OK_SEM_DEPLOY`, espaço, backup/restore planejado e saúde do GLPI. Nada disso foi executado ou certificado aqui.
4. Preservar D-001: permissões individuais continuam temporariamente suspensas por decisão explícita. Isolamento entre empresas e vínculos permanece testado. Itens D-007 (por exemplo executor de agendamentos) não foram inventados/concluídos nesta preparação.
5. Pausa retém eventos autenticados recebidos; recuperação integral de callbacks descartados pelo provedor durante indisponibilidade não é garantida. A política observada da Evolution pode expirar tokens durante retries longos.
6. O PDF removido continua em commits antigos, inclusive na main já existente. Qualquer saneamento histórico exige plano separado para preservar trabalho e evitar reescrita remota não autorizada.

## Enviar branch e abrir revisão — etapa posterior

Na pasta do projeto, conferir que o trabalho permanece na branch e o estado está limpo:

```powershell
git status --short --branch
git branch --show-current
git push -u origin feat/respostas-rapidas-e-interface
```

Abrir PR de `feat/respostas-rapidas-e-interface` para `main`, revisar o conjunto e aguardar aprovação. Nenhum desses envios/PR foi realizado por esta preparação. O workflow atual só executa seus jobs em `main`; não apresentá-lo como check automático de PR desta branch.

## Publicar pelo fluxo existente — somente depois de revisão e autorização

Com GitHub CLI instalado/autenticado, ou os mesmos modos pela interface Actions:

```powershell
# Depois do merge aprovado na main: validar/empacotar, sem VPS.
gh workflow run build-production.yml --repo projetochat/Nexos-Project --ref main -f release_mode=build
gh run list --repo projetochat/Nexos-Project --workflow build-production.yml --limit 5
# Substituir ID pela execução recém-criada; aguardar aprovação completa.
gh run watch ID --repo projetochat/Nexos-Project --exit-status
```

O push/merge na main já dispara teste/build; pode acompanhar essa execução em vez de repetir manualmente. Identificar o commit de cada execução e impedir alterações concorrentes na main durante a publicação.

Após confirmar executor e autorizar o acesso remoto:

```powershell
gh workflow run check-production-access.yml --repo projetochat/Nexos-Project --ref main
gh workflow run build-production.yml --repo projetochat/Nexos-Project --ref main -f release_mode=plan
```

Aguardar cada execução, conferir `SIMULACAO_OK_SEM_DEPLOY` e o commit. Para a primeira publicação, o administrador deve habilitar explicitamente o executor conforme [PRODUCTION-AUTOMATION.md](PRODUCTION-AUTOMATION.md), após a simulação aprovada. Se a main mudar, repetir a validação/simulação para o novo commit.

Somente após essa autorização:

```powershell
gh workflow run build-production.yml --repo projetochat/Nexos-Project --ref main -f release_mode=deploy
```

Aguardar a execução e exigir `DEPLOY_OK`, login funcional Trixus e GLPI. Não executar `compose down`, reset, seed ou migrations manuais no banco de produção. Não habilitar deploy automático como parte desta entrega. O modo plan também acessa/transfere para a VPS; por isso não foi executado nesta etapa.

## Provas e retorno local

Provas detalhadas e backup privado em `.continuity/20260922-producao` (deliberadamente não versionado): snapshot anterior de 759 arquivos, bundle Git anterior, logs de gates, manifests e relatório de isolamento. Backups de ciclos anteriores permanecem preservados. O anexo e o diretório vazio foram preservados, não descartados.

Para retorno local, preservar primeiro qualquer trabalho posterior, identificar os commits desta preparação e revertê-los de maneira coordenada ou recuperar arquivos específicos pelo snapshot/hashes. Não usar reset hard nem sobrescrever alterações posteriores. Reintroduzir a pasta vazia quebraria migrations; reintroduzir o PDF no índice voltaria a publicar o anexo. Não houve alteração de dados correntes nesta etapa. Recuperação de uma futura publicação deve seguir o procedimento de banco/anexos/imagens em PRODUCTION-AUTOMATION.md, nunca apenas voltar o código sobre schema incompatível.
