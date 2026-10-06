# Recuperacao da migracao de identidade de Campos Adicionais

Data do ensaio: 06/10/2026. Migracao alvo:
`20261005210000_contact_custom_field_identity`.

Este e o procedimento operacional verificavel. Ele nao autoriza acesso a VPS,
banco corrente ou producao. Todo diagnostico deve comecar por uma copia
descartavel restaurada e isolada. Valores de campos, tenants e credenciais nao
devem ser copiados para tickets ou logs.

## Caminho unico e estados seguros

Ajuda e versao nao exigem banco:

```sh
bun run backend:prisma:migrate:deploy --help
bun run backend:prisma:migrate:deploy --version
```

Preflight somente leitura e aplicacao:

```sh
DATABASE_URL="$DISPOSABLE_DATABASE_URL" bun run backend:prisma:migrate:deploy --preflight-only
DATABASE_URL="$DISPOSABLE_DATABASE_URL" bun run backend:prisma:migrate:deploy
```

O wrapper calcula SHA-256 sobre os bytes de `migration.sql` existentes no
artefato em execucao e compara todas as linhas da migracao alvo em
`_prisma_migrations`. Ele distingue `NOT_APPLIED`, `INCOMPLETE`,
`COMPLETED_VALID`, `COMPLETED_CHECKSUM_MISMATCH`, `ROLLED_BACK` e estados
ambiguos/divergentes. O unico historico antigo aceito e o par exato
`COMPLETED_RECONCILED` definido no manifesto versionado. Nenhum checksum e
atualizado automaticamente.

O deploy oficial executa o preflight antes de parar a aplicacao e novamente
imediatamente antes da aplicacao. A imagem `migrate` mostra ajuda por padrao;
somente `release.py` fornece explicitamente o comando aplicador.
O `release.py` mantem `release.lock` exclusivo durante todo o fluxo. O modo
`--apply-reviewed-reconciliation` tambem deve ser executado somente sob esse
lock e com escritores parados; nao e um comando concorrente de rotina.

## Coleta sem exposicao de dados

Guardar na pasta privada da release:

1. hash SHA-256 do dump, do arquivo de anexos e do `migration.sql` extraido da
   mesma imagem que executaria a migracao;
2. saida do wrapper, que contem apenas codigos e contagens anonimizadas;
3. contagens de linhas de historico por estado;
4. resultado booleano das verificacoes de catalogo e dados;
5. commit e IDs imutaveis das imagens.

Nao registrar labels, `variableKey`, IDs reais, valores de campos ou linhas de
negocio. O wrapper ja informa o drift estrutural por codigos seguros.

## Decisao de recuperacao

### 1. Historico incompleto com transacao comprovadamente revertida

O uso de `prisma migrate resolve --rolled-back` e permitido somente quando
todas as condicoes abaixo forem comprovadas na copia descartavel e novamente na
janela controlada:

- existe uma linha sem `finished_at` e sem `rolled_back_at` para a migracao;
- os logs do PostgreSQL e o estado do catalogo comprovam rollback da transacao;
- nao existe a coluna `variableKey` nem o indice alvo;
- o preflight nao encontrou colisao de nomes ou chaves;
- dump e anexos possuem hashes conferidos.

Somente nesse caso, depois de registrar a evidencia, executar a excecao de
recuperacao do Prisma e retornar imediatamente ao wrapper:

```sh
cd backend
DATABASE_URL="$DISPOSABLE_DATABASE_URL" bunx prisma migrate resolve \
  --rolled-back 20261005210000_contact_custom_field_identity \
  --schema prisma/schema.prisma
cd ..
DATABASE_URL="$DISPOSABLE_DATABASE_URL" bun run backend:prisma:migrate:deploy --preflight-only
DATABASE_URL="$DISPOSABLE_DATABASE_URL" bun run backend:prisma:migrate:deploy
```

Se coluna ou indice existir, nao usar `resolve --rolled-back`: tratar como
estrutura parcial.

### 2. Estrutura parcial

Bloquear a publicacao e todos os escritores. Nao usar `IF NOT EXISTS`, nao
apagar historico e nao reaplicar a mesma pasta. As opcoes revisaveis sao:

- restauracao integral de banco, anexos e codigo para o mesmo ponto; ou
- nova migracao forward que transforme explicitamente o estado observado no
  estado desejado, com checksum proprio, preflight e teste de restauracao.

### 3. Migracao concluida com checksum divergente

Falhar fechado. Nao editar `_prisma_migrations`, nao substituir o arquivo e nao
marcar a migracao como aplicada ou rollback. Para o checksum original do
candidato `b4d85f7`, a reconciliacao revisada esta na nova pasta
`20261006030000_reconcile_contact_custom_field_identity` e no manifesto
`backend/prisma/migration-reconciliations.json`.

O preflight comum deve continuar bloqueando antes da reconciliacao. Depois de
confirmar que o checksum observado, o checksum atual, a migration forward e
todos os demais historicos coincidem exatamente com o manifesto, usar:

```sh
DATABASE_URL="$DISPOSABLE_DATABASE_URL" bun run backend:prisma:migrate:deploy \
  --apply-reviewed-reconciliation
DATABASE_URL="$DISPOSABLE_DATABASE_URL" bun run backend:prisma:migrate:deploy \
  --preflight-only
```

O primeiro comando recusa migracoes ausentes, extras, incompletas ou com hash
divergente. Ele aplica somente quando a forward e a unica migration pendente.
O checksum antigo permanece intacto; o resultado aceito e
`COMPLETED_RECONCILED` mais `forwardState=COMPLETED_VALID`.

### 4. Restauracao integral

Restaurar primeiro em banco novo. Conferir o SHA-256 do dump antes do restore,
usar `pg_restore --exit-on-error` e executar o preflight do wrapper. Comparar,
por contagens e hashes, historico, tabelas criticas, constraints e anexos. A
troca do banco restaurado so pode ocorrer com escritores parados e decisao
operacional separada.

### 5. Reconciliacao forward

A reconciliacao e uma nova pasta de migracao, nunca uma edicao da pasta alvo.
Ela:

- declarar exatamente quais estados de origem aceita;
- abortar antes de DDL/DML quando o estado nao corresponde;
- preservar IDs, campos ativos e arquivados e valores relacionados;
- possuir checksum proprio e teste de repeticao;
- passar o wrapper e um restore integral ensaiado;
- recebeu revisao independente antes de integrar a lista exata de hashes
  reconciliados aceitos no manifesto.

### 6. Depois que `variableKey` foi utilizada

Voltar apenas ao commit anterior nao e recuperacao segura. Templates,
automacoes ou integracoes podem depender da identidade ja gravada. Preservar a
coluna e os dados, corrigir para frente, ou fazer restauracao integral para um
ponto anterior comprovando e aceitando a perda de todas as gravacoes posteriores.

## Ensaio descartavel executado

O ensaio de 06/10/2026 usou PostgreSQL 16 em container sem volume persistente,
exposto somente em `127.0.0.1:55436`. Nenhum banco corrente foi consultado.

- cadeia completa: 71 migracoes aplicadas pelo wrapper e pos-validacao aceita;
- checksum do historico igual ao SHA-256 dos bytes empacotados: aceito;
- checksum concluido alterado: bloqueado com
  `CONTACT_CUSTOM_FIELD_IDENTITY_COMPLETED_CHECKSUM_MISMATCH`;
- coluna remanescente sem indice, marcada como rollback: bloqueada com
  `CONTACT_CUSTOM_FIELD_IDENTITY_PARTIAL_STATE`;
- uma tentativa real do Prisma em clone pre-migracao falhou por colisao
  sintetica dentro de `BEGIN`; o log do PostgreSQL, a linha incompleta, a
  ausencia de coluna/indice e as contagens inalteradas comprovaram rollback;
  depois da remocao da fixture conflitante, o wrapper bloqueou com
  `CONTACT_CUSTOM_FIELD_IDENTITY_INCOMPLETE`;
- depois da comprovacao de rollback, `resolve --rolled-back`, preflight e
  reaplicacao pelo wrapper foram aceitos;
- dump custom recebeu SHA-256, foi restaurado em banco vazio com
  `--exit-on-error` e passou como `COMPLETED_VALID`;
- uma chave sintetica semanticamente divergente foi bloqueada; uma reconciliacao
  forward transacional preservou a definicao, registrou checksum proprio e
  voltou a passar o preflight;
- adicionar um registro forward a um historico de checksum antigo divergente
  nao contornou o bloqueio;
- o checksum antigo exato do candidato foi preservado, a forward versionada foi
  aplicada pelo modo de reconciliacao e o estado final foi
  `COMPLETED_RECONCILED`;
- uma fixture com valor adicional e resposta rapida usando
  `{{plano_cliente}}` foi restaurada integralmente; chave, valor e template
  permaneceram presentes, comprovando que voltar apenas o codigo antigo nao e
  um retorno seguro.

Comandos, hashes e resultados do ensaio estao em
[evidencias/MIGRATION-RECOVERY-DISPOSABLE-20261006.md](./evidencias/MIGRATION-RECOVERY-DISPOSABLE-20261006.md).

Os testes unitarios complementares cobrem coluna nullable, tipo incorreto,
indice homonimo nao unico, colunas/ordem incorretas, indice invalido ou nao
pronto, indice parcial/por expressao, chaves nulas/vazias/reservadas,
normalizacao divergente, duplicidades e campos arquivados.

## Inventario dos caminhos de migracao

A busca integral por `prisma migrate deploy` e `prisma:migrate:deploy` foi
classificada assim:

- executaveis oficiais: `package.json`, `backend/package.json`,
  `scripts/verify.mjs`, `scripts/production/release.py`, `backend/Dockerfile` e
  `.github/workflows/build-production.yml`; todos chegam ao mesmo wrapper;
- configuracao: `docker-compose.vps.yml` usa apenas a imagem `migrate`, cujo
  comando padrao e ajuda sem banco; a aplicacao exige override explicito do
  release depois dos dois preflights;
- documentacao ativa: `docs/PRODUCTION-AUTOMATION.md`, `docs/DEPLOY.md` e este
  runbook usam somente o wrapper;
- testes: `backend/scripts/migrate-deploy-safe.spec.mjs` e
  `scripts/production/test_release.py` apenas exercitam ou verificam o caminho;
- registros historicos nao executaveis: `docs/README.md`, `docs/DATABASE.md`,
  `docs/VPS-DEPLOY.md` e os relatorios de sprint 03, 04, 08.02, 09, 10, 11,
  13, RC-15, MRC-02 e MRC-03. Cada arquivo possui aviso de historicidade; os
  comandos antigos permanecem somente como evidencia do que ocorreu.

O unico uso direto restante de Prisma admitido como operacao e
`migrate resolve --rolled-back`, restrito ao ramo condicionado de recuperacao
descrito acima. Ele nao aplica DDL e nunca substitui o preflight.

## Retorno desta alteracao de automacao

Antes de qualquer aplicacao persistente, o retorno e reverter somente o commit
de automacao e preservar o snapshot anterior. Depois de `variableKey` aplicada
ou usada, este retorno de codigo nao autoriza remover schema ou dados; seguir as
opcoes de restauracao integral ou reconciliacao forward acima.
