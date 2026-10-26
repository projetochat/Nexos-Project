# Preparacao local de release — 25/10/2026

Estado: validacao local concluida; candidato aguardando revisao e autorizacao
antes de push/PR. Sem acionamento de Actions ou alteracao na VPS.

## Objetivo e justificativa

Preservar o candidato e as cinco alteracoes migradas, corrigir bloqueadores locais
de publicacao e validar no Linux com recursos descartaveis. O lint do candidato
exigia correcoes antes de prosseguir; baseline e limites permanecem inalterados.

## Recuperacao

Backup privado anterior: `.task-backups/release-linux-20261026T002920Z`.
`source-and-git.tar.gz` inclui fontes, arquivos novos e metadados Git; os 1249
arquivos do manifesto foram relidos do arquivo e conferidos por SHA-256. Nao
inclui `.env` ignorado, bancos, storage ou dependencias. `RECOVERY.txt`,
`manifest.json`, `working.patch`, `status.txt` e `SHA256SUMS` acompanham o arquivo.
Conferir o checksum e extrair em diretorio vazio privado; comparar antes de
restaurar arquivos selecionados. Nunca sobrescrever o checkout ou executar reset,
clean ou stash como parte automatica do retorno.

## Alteracoes realizadas

- Gates de ambos ambientes consumidos sob lock antes de carregar imagens; recibo
  registra commit e checksum. Falhas nao rearmam o gate.
- Ambos marcadores de recuperacao/investigacao bloqueiam plan e deploy.
- Plan/deploy reutilizam pacote do `source_run_id`, sem reconstruir. Proveniencia
  prende workflow, sucesso e SHA; deploy exige recibo do `plan_run_id` vinculado
  a ambiente, SHA, build e checksum do arquivo.
- API de producao exige igualdade a URL canonica; frontend declara `USER bun`;
  os workflows verificam os tres usuarios de imagem.
- Politica LF ampliada. A migration historica
  `20260827100000_contact_custom_fields/migration.sql` possui um CRLF no proprio
  commit e conserva seus bytes, com excecao `-text` especifica para impedir
  conversao automatica. Blob preservado: `de1a85747554018aa8892cc59023bcc5b5ddc4b4`.
  Nao foi aplicada normalizacao de checksum historico.
- Correcoes de lint: formatacao, tipos explicitos em AiService e extracao de dois
  helpers para modulos sem componentes. Dependencias internas foram atualizadas;
  nao foram modificados textos ou fluxos da interface.
- Comparacao da AST de JavaScript emitido confirma ausencia de diferencas runtime
  nos 30 arquivos com alteracao somente de formatacao. Um hash de fixture no
  verificador de higiene foi atualizado exclusivamente por essa formatacao.
  O hash da fixture E2E tambem foi atualizado ao adicionar provas reais de copia,
  exclusao da origem e isolamento. Regras, arquivos permitidos e limites nao foram
  ampliados.

## Evidencias executadas

Logs privados em `.task-backups/` (nao incluir em commit ou publicar):

- Backup conferido; fetch confirmou `main` em
  `d06c8be564bb774d4e3663a7a019fcd59f8e6d11`, sem integracao necessaria.
- `git diff --check` sem apontamentos.
- Cinco arquivos migrados, bun.lock, baseline ESLint e migration historica com
  os mesmos hashes do inventario anterior (`preservation-check.json`).
- Testes production: 31 passaram, incluindo dois opt-in com Docker real; arquivos
  sinteticos percorrem save/normalize/load/run e sao removidos.
- Testes homologation: 23 passaram. Promocao: 5 passaram.
- actionlint 1.7.7: workflows de HML, producao e acesso sem diagnosticos.
- Instalacao congelada e Prisma Client passaram na imagem descartavel.
- DTO: 3 testes passaram. Favicons: 9 testes passaram. Imagens/editor: 18 testes
  focados passaram; chamados/sanitizador: 73 testes focados passaram.
- Verify: higiene e typecheck frontend passaram; lint passou dentro da baseline
  legada (29 erros existentes, zero warnings, sem regressao).
- Suite frontend: 167 arquivos, 937 testes passaram; build frontend passou.
- Suite backend: 163 arquivos, 1371 testes passaram, incluindo 68 E2E com banco
  real descartavel e clonagem de imagem persistida com isolamento entre tenants.
- As 100 migrations foram aplicadas e o schema final esta atualizado. Fixtures
  rodaram apenas nesse PostgreSQL descartavel; smoke Redis e 17 testes de
  seguranca passaram. `bun run verify` terminou com `verify passed`.
- Catalogo verificado: 252 paises, 3865 divisoes, 230044 cidades, 5571 municipios
  brasileiros; SHA-256 `e00d7f6b6eeab51765584d08033246153eab59fa2f4a32b2d2f2b768f2800a27`.
- O bloqueio inicial de `ticket:legacy-runtime` foi corrigido usando anexos
  persistidos. O script de protecao esta identico ao backup; passou sem excecoes.
- Backend, migrate e dois frontends foram construidos Linux/AMD64. Todos usam
  usuario `bun`; entrypoints e artefatos foram inspecionados. Migrate executou
  somente `--help` e catalogo `--verify-only` na inspecao sem rede.
- URLs canonicas foram confirmadas nos artefatos compilados e configuracoes.
  Ausencia de `chat.trixus.com.br` em `.output`. Ambos frontends responderam 200
  em `/login` em containers sem rede externa, sem restart ou OOM.
  Imagens e IDs estao em `image-inspection.json`.

A primeira tentativa parou no lint; a seguinte detectou Node Alpine sem locale
pt-BR. Os dados ICU completos foram adicionados somente a imagem de validacao;
formatadores e expectativas dos testes nao foram alterados.

## Isolamento comprovado

Copia de fontes sem `.env`, sem metadados Git/credenciais do host. Rede Docker
exclusiva interna, sem portas publicadas e sem egress. PostgreSQL e Redis
compartilham apenas o namespace de rede do validador, em loopback; dados em tmpfs,
storage local descartavel, integracoes sem credenciais reais. Nenhum socket
Docker montado na aplicacao. Containers e rede de validacao foram removidos ao final; imagens e cache de build
locais permanecem disponiveis para nova validacao.
Os cinco containers locais preexistentes conservaram IDs, imagens, estado de
execucao e StartedAt (`containers-before.json`/`containers-after.json`).

## Pendencias e limites

Decisao autorizada em 25/10/2026: preservar imagens importadas da conversa usando
anexos persistidos, sem flexibilizar a protecao. Implementacao concluida:
referencias de mensagem na previa sao resolvidas com autenticacao; no save, o
backend valida conversa, tenant, permissoes e instancia e copia bytes para storage
do chamado. O HTML guarda somente a referencia do novo anexo. Clonagem copia
imagens de chamados visiveis para objetos independentes; o Portal usa apenas
`ticketApi.preview`, sem depender de acesso ao Chat. Todos os campos HTML de
chamados validam referencias contra o chamado atual. ObjectURLs sao temporarias,
revogadas e restauradas para referencias antes da serializacao. Escrita parcial
ou falha de historico tenta compensar todos os objetos envolvidos.

A importacao mantem o limite existente de dez anexos e a whitelist MIME do
storage. Excesso ou formato nao aceito (por exemplo GIF) causa erro explicito;
nao ha corte silencioso de imagens nem ampliacao de limites. Imagens coladas
manualmente e dados legados nao sofreram migracao nesta tarefa. Limpeza de objetos
pode falhar, conforme o tratamento existente; o scanner atual retorna NOT_SCANNED,
portanto esta entrega nao certifica antivirus. DOM/API e smoke local nao substituem
os testes visuais e funcionais que o usuario fara na HML.

Configuracao GitHub HML sem secrets SSH no escopo ambiente/repositorio consultado;
variable tenant URL de producao divergente, versoes instaladas dos runners,
chaves IA por ambiente, gate remoto, backups/restore de producao e certificacao
publica continuam pendentes. Nada disso foi alterado remotamente. Correcoes locais
de runner ainda precisam de revisao e upgrade administrativo autorizado antes de
ter efeito na VPS. A regra SQL historica preserva checksum, portanto nao se afirma
que todo SQL tenha LF puro. Nao se afirma prontidao para producao.

## Proximos gates

Os testes locais e builds estao concluidos. Commits locais separados por finalidade:
`9c08dab` preserva as cinco alteracoes; `1200a37` corrige lint sem mudar baseline;
`0f78b10` persiste imagens com autenticacao; o commit de fechamento acrescenta
protecao de release e este relatorio. O SHA candidato final e informado no chat.
Nao houve push/PR/VPS; o working tree foi conferido limpo apos os commits.
A copia exata de fontes validada e registrada em `validated-source-manifest.json`.
Receitas locais e checksums estao em `.task-backups/validation-harness/`; as fontes
sanitizadas de reproducao estao em `.task-temp/release-linux/source`.

Posteriormente: autorizacao de publicacao no GitHub, HML build/plan/deploy
separados, certificacao e `HML APROVADA`; producao no mesmo SHA em main, build/plan,
plano final e `PRODUCAO APROVADA`. Sem repeticao automatica de deploy.

## Inventario local para revisao

- `.gitattributes`
- `.github/workflows/build-homologation.yml`
- `.github/workflows/build-production.yml`
- `Dockerfile.frontend`
- `backend/src/ai/ai-credential-encryption.service.spec.ts`
- `backend/src/ai/ai-provider.service.ts`
- `backend/src/ai/ai.service.ts`
- `backend/src/common/protocol-numbering.spec.ts`
- `backend/src/config/environment.spec.ts`
- `backend/src/config/environment.ts`
- `backend/src/conversations/bulk-conversation-actions.spec.ts`
- `backend/src/conversations/dto/assign-conversation.dto.spec.ts`
- `backend/src/conversations/dto/assign-conversation.dto.ts`
- `backend/src/conversations/groups-sync.service.ts`
- `backend/src/crm/crm.controller.ts`
- `backend/src/crm/customer-pack11.dto.spec.ts`
- `backend/src/messaging/contact-profile-picture-sync.service.ts`
- `backend/src/messaging/messaging-inbound.service.ts`
- `backend/src/operations/operations.service.spec.ts`
- `backend/src/operations/operations.service.ts`
- `backend/src/realtime/realtime-auth.service.ts`
- `backend/src/tickets/ticket-image-reference.ts`
- `backend/src/tickets/ticket-sanitizer.ts`
- `backend/src/tickets/tickets.controller.ts`
- `backend/src/tickets/tickets.service.spec.ts`
- `backend/src/tickets/tickets.service.ts`
- `backend/test/app.e2e-spec.ts`
- `docs/PRODUCTION-AUTOMATION.md`
- `docs/RELEASE-LINUX-20261025.md`
- `public/favicon-dev.ico`
- `public/favicon-hom.ico`
- `scripts/check-repository-hygiene.mjs`
- `scripts/homologation/README.md`
- `scripts/homologation/release.py`
- `scripts/homologation/test_release.py`
- `scripts/production/INSTALL-SHA256SUMS`
- `scripts/production/README.md`
- `scripts/production/release.py`
- `scripts/production/test_release.py`
- `scripts/release/promotion.py`
- `scripts/release/test_promotion.py`
- `src/components/dashboard-component-renderer.test.ts`
- `src/components/schedule-message-modal.tsx`
- `src/components/ticket-rich-text-content.tsx`
- `src/components/ticket-rich-text-editor.tsx`
- `src/components/ui-kit.avatar.test.ts`
- `src/components/ui-kit.tsx`
- `src/lib/avatar-initials.ts`
- `src/lib/favicon.ts`
- `src/lib/session-navigation.test.ts`
- `src/lib/ticket-editor-dom.ts`
- `src/lib/ticket-image-dom.test.ts`
- `src/lib/ticket-image-dom.ts`
- `src/lib/ticket-image-reference.ts`
- `src/lib/ticket-search.ts`
- `src/routes/-admin.index.test.ts`
- `src/routes/-chamados-grid-shell.test.ts`
- `src/routes/-customer-portal-dashboard.test.ts`
- `src/routes/-customer-portal-login.test.ts`
- `src/routes/-grid-footer-header-color.test.ts`
- `src/routes/-historico-metadata-layout.test.ts`
- `src/routes/-inbox-index-layout.test.ts`
- `src/routes/-login-security-flow.test.ts`
- `src/routes/-pack12-ai-chat-tickets.test.ts`
- `src/routes/-toggle-and-group-action-consistency.test.ts`
- `src/routes/chamados.tsx`
- `src/routes/clientes.tsx`
- `src/routes/login.tsx`
- `src/routes/perfil.tsx`
- `src/routes/portal-cliente_.chamados.tsx`
- `src/routes/portal-cliente_.dashboard.tsx`
