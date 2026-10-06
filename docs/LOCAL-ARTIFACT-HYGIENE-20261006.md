# Higiene de artefatos locais — 06/10/2026

## Objetivo e escopo

Esta alteração remove somente saídas locais comprovadamente não rastreadas e implementa prevenção para que logs e artefatos regeneráveis não voltem a se acumular na raiz. Não houve alteração de interface, contrato, banco, serviço, VPS, deploy ou dado persistente.

Os valores abaixo são o inventário anterior à limpeza. `MiB` usa base 1.048.576.

## Inventário anterior

| Alvo absoluto                           |         Arquivos |                  Bytes | Data mais recente (America/Sao_Paulo) | Git                     | Classificação e decisão                                                                                                 |
| --------------------------------------- | ---------------: | ---------------------: | ------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `C:\dev\Trixus\.output`                 |              303 |             17.334.356 | 05/10/2026 23:15:39                   | 0 rastreados; ignorado  | Build frontend regenerável; removido.                                                                                   |
| `C:\dev\Trixus\backend\dist`            |              610 |            523.418.226 | 05/10/2026 23:41:41                   | 0 rastreados; ignorado  | Build backend regenerável; removido. A maior parte do excesso eram cópias temporárias do engine Prisma.                 |
| `C:\dev\Trixus\tmp`                     |              154 |              5.088.295 | 05/10/2026 22:27:27                   | 0 rastreados; ignorado  | Conteúdo misto: 3.867.831 bytes em backups, dumps, RDB, relatórios e evidências recentes. Preservado integralmente.     |
| `C:\dev\Trixus\.tmp`                    |                0 |                      0 | —                                     | 0 rastreados; ignorado  | Vazio; preservado, pois o ganho seria nulo.                                                                             |
| `C:\dev\Trixus\backups`                 |               52 |              1.731.647 | 05/10/2026 22:32:18                   | 0 rastreados; ignorado  | Backup, não temporário; preservado.                                                                                     |
| `C:\dev\Trixus\.local-storage`          |                1 |                254.198 | 15/09/2026 18:15:20                   | 0 rastreados; ignorado  | Armazenamento persistente; preservado.                                                                                  |
| `C:\dev\Trixus\.continuity`             | pelo menos 3.333 | pelo menos 305.580.738 | 05/10/2026 23:45:08                   | 0 rastreados; ignorado  | Evidências, backups, bundles, dumps e ambientes; preservado. O total é parcial por erros de acesso documentados abaixo. |
| `C:\dev\Trixus\.env`                    |                1 |                  3.846 | 04/10/2026 17:59:59                   | não rastreado; ignorado | Sensível; preservado sem leitura de conteúdo nesta higiene.                                                             |
| `C:\dev\Trixus\.env.validation-b9ead52` |                1 |                  1.269 | 01/10/2026 17:46:56                   | não rastreado; ignorado | Validação potencialmente sensível; preservado.                                                                          |

Não existiam `coverage`, `dist` na raiz, `dist-ssr`, `build` ou `.nyc_output`. `backend/tmp` tinha um log de teste de 32.060 bytes, mas foi preservado por cautela e por oferecer ganho irrelevante.

### Logs antigos da raiz

Todos os 12 logs eram ignorados, não rastreados, estavam sem alteração desde 17–21/09/2026 e aceitaram abertura exclusiva. Antes da remoção, foram copiados para `C:\dev\preservacao-20260921\fechamento\20261005-higiene-artefatos-locais`; origem e cópia foram comparadas individualmente por SHA-256. O manifesto do backup tem SHA-256 `69AE3C1805572C8584242718B0E613A7C5B7ADFA31802ADD9431B6B12B45F5F1`.

| Arquivo em `C:\dev\Trixus`   |     Bytes | SHA-256                                                            |
| ---------------------------- | --------: | ------------------------------------------------------------------ |
| `.backend-dev.err.log`       |   272.712 | `843DB73FB14D27D55F6501ED5ABFCFBC2341D3A09053A7202C96A2BB9FB91AA7` |
| `.backend-dev.log`           | 7.443.524 | `CA0E05C1BD9639F9A53DC4AB0DE0A59DACD9492E0F325CDDAB9B8D430840659A` |
| `.backend-restart.err.log`   |    32.120 | `A58F013ED4FB925A6A2D81C07AC4D9D2041FE6CBC314EFBB89DDE44F75A53F24` |
| `.backend-restart.log`       |   359.616 | `E5CFAE14474E6A6FDDD538DDF0F1D333ED085EAB1BC9729EE52894B6698B567D` |
| `.backend-restarted.err.log` |       994 | `6A61E1FF5C11033E13E3547BA02364EBEBC86E5AD4C528F203EE8A547937856B` |
| `.backend-restarted.log`     |         0 | `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855` |
| `.frontend-dev-5173.err.log` |     6.535 | `D150108906236C0C6B791B3763F591CD4D833AD4D94C142EA41ED3CE84DCCCD3` |
| `.frontend-dev-5173.log`     |    18.246 | `0652057E1DDEA6F0D763C66EA7E3257506A69F74ED177E1F68F9C94E72546837` |
| `.frontend-dev.err.log`      |       836 | `6312C4D75131D22BF8A49DCC85A3C6312E3D679FD3E7A92887A039B89A8A37B0` |
| `.frontend-dev.log`          |    14.163 | `CECA4378EB8B528E3ABC677A07BF938E484063BD5967505447303851A0EBC889` |
| `.frontend-restart.err.log`  |    16.152 | `F5A876220D1F330DB21D147F80648C6C5040C258E895CB52DE12D5C90FE6C439` |
| `.frontend-restart.log`      |    21.243 | `B5A369224644E79FB069501103EF3F95D332A083A7642FB18514FECCCFAEA8B1` |

## Remoção executada

Lista exata:

- os 12 arquivos da tabela de logs acima;
- diretório `C:\dev\Trixus\.output`, com 303 arquivos e 17.334.356 bytes;
- diretório `C:\dev\Trixus\backend\dist`, com 610 arquivos e 523.418.226 bytes.

Espaço final recuperado em relação ao inventário inicial: **548.938.723 bytes (523,51 MiB)**. Os builds de validação recriaram temporariamente `.output` e `backend/dist`; a mesma limpeza allowlisted os removeu novamente. Esse segundo descarte não é somado ao ganho final.

## Política implementada

1. Logs de desenvolvimento em arquivo só podem usar `/logs/`, explicitamente ignorada. Logs fora dela deixam de ser ignorados, ficam visíveis no status e são recusados pelo hook/CI.
2. `bun run dev:logged` e `bun run backend:dev:logged` preservam a saída no console e gravam separadamente `stdout`/`stderr` em `/logs/`.
3. Cada log ativo gira ao atingir 10 MiB; são mantidos no máximo cinco segmentos anteriores por fluxo. Uma trava por processo impede duas sessões do mesmo fluxo de disputar os segmentos. A retenção temporal de 14 dias remove somente segmentos já rotacionados e só é aplicada por comando explícito: `bun run logs:prune` simula e `bun run logs:prune:apply` executa. Nada é removido automaticamente no boot ou deploy.
4. `bun run hygiene:preview` é sempre simulação. `bun run hygiene:clean` exige aplicação explícita e aceita somente esta allowlist imutável: `.output`, `backend/dist`, `dist`, `dist-ssr`, `coverage`, `build`, `.nyc_output` e `.tmp`. `tmp` foi deliberadamente excluído.
5. Antes de excluir, o comando resolve e compara o caminho absoluto, recusa a raiz, traversal, nomes protegidos, links simbólicos/reparse points, tipos especiais, arquivos rastreados e árvores que mudem durante a janela de estabilidade. No modo de aplicação, a árvore é renomeada atomicamente para uma quarentena irmã, observada novamente e só então apagada; se um produtor recriar o alvo original, o novo conteúdo é preservado.
6. `scripts/check-repository-hygiene.mjs` verifica o índice (`--staged`) ou toda a árvore rastreada (`--tracked`) e recusa logs, builds, ambientes não exemplares, dumps/bancos locais, SQL fora das migrations aprovadas, arquivos acima de 5 MiB e padrões de credenciais. Valores potencialmente sensíveis nunca são impressos. Fixtures, exemplos e documentos antigos com credenciais fictícias revisadas têm exceção por hash integral; qualquer alteração invalida a exceção.
7. `.githooks/pre-commit` executa a checagem staged. A ativação local é explícita: `git config core.hooksPath .githooks`. A CI `.github/workflows/repository-hygiene.yml` executa a checagem completa em push e pull request.

Redirecionamentos manuais para a raiz permanecem proibidos. Se um processo externo precisar persistir logs, o destino deve ser um nome aprovado dentro de `C:\dev\Trixus\logs`.

## Verificações executadas

- caminhos absolutos, contagem, tamanho, datas, status Git e regras de ignore;
- hashes SHA-256 e comparação 12/12 do backup novo dos logs;
- abertura exclusiva dos arquivos candidatos e observações repetidas de estabilidade;
- preview da limpeza antes de cada aplicação;
- `node --check` nos três scripts novos;
- `node scripts/check-repository-hygiene.mjs --tracked`: aprovado para os 956 arquivos então rastreados;
- testes negativos staged: um `.log` e uma atribuição fictícia `JWT_SECRET` realista foram recusados, sem exibir o valor;
- wrapper de log: `stdout` e `stderr` foram gravados somente em `/logs/` e a trava da sessão foi liberada ao encerrar;
- limpeza descartável de `dist`: preview preservou o fixture, aplicação usou quarentena irmã e não deixou resíduo;
- `bun run build`: aprovado fora da restrição de processos do sandbox;
- `bun run backend:build`: aprovado, sem acessar banco;
- confirmação posterior de ausência dos 12 logs, `.output` e `backend/dist`;
- `git diff --check` e comparação Git final antes do commit.

Não foi executado `scripts/verify.mjs`, migração, seed, reset ou E2E, pois essa verificação geral altera estado e exigiria recursos descartáveis explicitamente isolados.

## Limitações

- O sistema negou consulta às linhas de comando via CIM. Um processo `esbuild` do checkout estava ativo, sem listener nas portas locais conhecidas. Nenhum dos arquivos candidatos apresentou lock ou mudança nas observações, mas isso não constitui prova absoluta de ausência de escritor em todos os processos.
- A varredura de `.continuity` encontrou diretórios com acesso negado; por isso sua contagem e tamanho são limites inferiores, não inventário integral.
- A verificação de credenciais é uma barreira preventiva por padrões, não substitui scanner dedicado nem rotação de segredo já exposto.
- A política não controla redirecionamentos criados fora do repositório; ela fornece os comandos aprovados, ignore, hook e CI.

## Plano separado para `.continuity` — não executado

O destino absoluto fora do checkout ainda depende de aprovação. Devido a dumps, 22 arquivos com nome de ambiente, bundles Git, evidências e possíveis dados pessoais, o destino deverá ter ACL restrita, criptografia em repouso e backup independente.

Após aprovação do destino:

1. interromper produtores e comprovar uma janela sem escrita;
2. auditar handles e resolver os diretórios inacessíveis sem alterar ACL silenciosamente;
3. gerar fora da origem um manifesto versionado com caminho relativo canônico, tipo, tamanho, atributos, data UTC, SHA-256, classificação e todos os erros;
4. copiar, nunca mover, para uma área de estágio no destino, sem seguir junctions;
5. recalcular no destino e exigir igualdade de caminhos, contagem, tamanhos e hashes;
6. recuperar uma cópia em diretório descartável fora do checkout e comparar 100% do manifesto;
7. validar bundles internamente e dumps apenas de forma estrutural ou em recurso descartável, nunca em banco corrente;
8. registrar o teste e manter origem e arquivo simultaneamente até nova autorização explícita.

Retorno futuro de `.continuity`: restaurar primeiro para diretório temporário, validar integralmente o manifesto e só então copiar para `C:\dev\Trixus\.continuity`, sem sobrescrever uma árvore existente.

## Procedimento de retorno desta higiene

- Logs: conferir `manifest.sha256.json` no backup externo, comparar SHA-256 e copiar apenas o arquivo necessário de volta para `C:\dev\Trixus` ou, preferencialmente, para `C:\dev\Trixus\logs`.
- Frontend: executar `bun run build` para regenerar `.output`.
- Backend: executar `bun run backend:build` para regenerar `backend/dist`.
- Automação/política: reverter o commit de higiene local. Não é necessário restaurar saída gerada para reverter código.

Nenhum arquivo rastreado foi removido; portanto, o retorno dos artefatos apagados não depende de checkout ou reset Git.
