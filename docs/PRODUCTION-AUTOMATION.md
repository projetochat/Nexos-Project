# Publicacao do Trixus

## Estado e autorizacao

O acesso SSH, o build e o preflight da VPS passaram. Esta alteracao prepara
o executor e o workflow; nao instala nem publica na VPS. O primeiro deploy
exige aprovacao depois da simulacao.

O workflow `build-production.yml` oferece tres modos manuais na main:

| Modo             | Efeito                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `build` (padrao) | Testa e empacota no GitHub. Nao acessa a VPS.                                                                       |
| `plan`           | Transfere e valida pacote, recursos e GLPI. Remove temporarios; nao importa imagens, para servicos ou altera banco. |
| `deploy`         | Publica somente se o administrador tambem habilitou o executor na VPS.                                              |

Push na main executa testes e build. Apenas a **repository variable**
`TRIXUS_AUTO_DEPLOY=true` habilita publicacao automatica depois do build.
Deixar ausente ate a primeira publicacao aprovada. Nao cadastrar essa chave
como environment variable: o `if` do job precisa dela antes do runner.

## Configuracao existente

- Environment `production`, somente main.
- Variables: `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER=trixus-deploy`,
  `VITE_TRIXUS_API_URL` e variaveis publicas opcionais Supabase.
- Secrets: `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` (host key conferida).
- VPS: `/opt/trixus/app/docker-compose.vps.yml`, ambiente privado `.env.vps`,
  projeto `trixus-vps`, anexos `/srv/trixus-data`, linux/amd64.
- GLPI: Apache/MariaDB do host, `https://glpi.flowid.com.br/`.

## Instalar e simular sem deploy

1. Revisar e integrar esta branch. Manter `TRIXUS_AUTO_DEPLOY` ausente.
2. Baixar de commit fixo os arquivos de `scripts/production/`: `preflight.py`,
   `release.py`, `gateway.py`, `entrypoint.py`, `install.sh`. Conferir os SHA256
   fornecidos para esse commit antes de executar.
3. Executar `sh install.sh` como root nessa pasta. Instalacao de uso unico:
   bloqueia se ja existe. Instala arquivos root em `/usr/local/lib/trixus-production`
   e `/usr/local/sbin/trixus-release`. Copia o gateway anterior para a pasta
   privada `/var/lib/trixus-production` antes de substituir.
4. A unica autorizacao sudo e o executor fixo. Aceita apenas `plan|deploy`,
   commit hexadecimal, checksum hexadecimal e tamanho limitado. O usuario
   continua fora dos grupos docker/sudo e sem shell SSH livre.
5. Executar **Check Trixus production access**. Depois executar **Build Trixus
   production images**, main, `release_mode=plan`.
6. Resultado esperado: `SIMULACAO_OK_SEM_DEPLOY`. Compartilhar esse resultado
   antes de aprovar a primeira publicacao. Espaco insuficiente bloqueia,
   sem limpeza automatica. A simulacao verifica tambem o filesystem Docker.

Nao adicionar senhas de producao ao GitHub. `.env.vps` permanece na VPS.

## Primeira publicacao — somente apos aprovacao

O administrador habilita explicitamente o executor:

```sh
printf '%s\n' approved > /var/lib/trixus-production/enabled
chown root:root /var/lib/trixus-production/enabled
chmod 600 /var/lib/trixus-production/enabled
```

Executar workflow na main com `release_mode=deploy`. Ele constroi novamente
o commit escolhido e baixa apenas o artifact da propria execucao. Confirmar
`DEPLOY_OK`, acesso/login no Trixus e GLPI. Depois cadastrar
`TRIXUS_AUTO_DEPLOY=true` em Settings > Secrets and variables > Actions > Variables
(nivel repositorio). Proximos pushes/merges na main publicam automaticamente.

Para impedir novas publicacoes, remover a variavel e renomear `enabled` na VPS.
Isso nao interrompe uma publicacao ja em andamento.

## O que acontece no deploy

1. Lock exclusivo no servidor e fila no GitHub. Confere configuracao root,
   banco, memoria, containers e GLPI antes de parar algo.
2. Recebe pacote de ate 2 GiB e confere SHA256. Expansao limitada a 5 GiB.
   Nunca extrai caminhos tar no host; reempacota apenas as tres imagens
   `trixus-release/{backend,frontend,migrate}:COMMIT`. Descarta indices OCI
   e nomes alternativos para impedir sobrescrita de tags da infraestrutura.
3. Verifica disco para importacao, backup e reserva de 2 GiB. Importa imagens;
   nao compila na VPS nem remove imagens antigas.
4. Registra imagens/configuracao anteriores. Para apenas frontend/backend.
   Faz pg_dump custom, verifica catalogo com pg_restore, copia anexos e grava
   checksums. Backups root-only em `/var/lib/trixus-production/releases`.
5. Executa somente `bun run prisma:migrate:deploy` no container temporario.
   Sem seed/reset/db push. O Compose vem da configuracao local confiavel;
   nenhum script ou Compose remoto e executado como root.
6. Sobe frontend/backend com `--no-deps --no-build --pull never`. Limites:
   backend 768 MiB, frontend/migrate 512 MiB, uma CPU cada, 256 processos,
   sem capabilities e sem escalada de privilegios.
7. Confere API, frontend, HTTPS e GLPI; confirma que containers de infraestrutura
   mantiveram o mesmo inicio de execucao. Grava `DEPLOY_OK` e release atual.

Apache, MariaDB, PostgreSQL, Redis e Evolution nao sao reiniciados pelo executor.
Nao ha compose down, prune global, mudanca de proxy/certificados ou reboot.
O Trixus fica temporariamente indisponivel no backup/migration. Webhooks nessa
janela dependem da politica de retentativa do emissor. O compartilhamento do
host ainda permite impacto por recursos ou falha da VPS; isolamento absoluto
do GLPI exige outra VPS.

## Falhas e recuperacao

- Transferencia/checksum/espaco invalidos: bloqueia antes de parar a aplicacao.
- Falha antes da migration: tenta religar os containers anteriores.
- Migration iniciada ou saude final reprovada: para a aplicacao e exige revisao
  manual. Nao restaura banco nem volta codigo automaticamente.
- `recovery-required` em `/var/lib/trixus-production` bloqueia outra tentativa
  ate revisao root. O caminho nele identifica a pasta com `status.txt`, dump,
  anexos, checksums e `previous-compose.json`. Preservar durante diagnostico.
- Falhas de comandos podem estar em `last-error.log`, privado: nao colar
  indiscriminadamente no chat/GitHub porque pode conter dados sensiveis.
- Se somente o backup falhou e nenhuma migration iniciou, confirmar saude
  da aplicacao anterior antes de remover manualmente o bloqueio.
- Depois de migration, decidir entre corrigir para frente ou restaurar.
  Restauracao exige revisar dados gravados, parar escritores e combinar
  banco, anexos e codigo anterior. Nao aplicar `previous-compose.json`
  sozinho sobre schema incompativel.
- `pg_restore --list` nao substitui ensaio completo de restore. Backups locais
  nao protegem contra perda da VPS; manter backup externo.
- Sem exclusao automatica de backups/imagens. Revisar retencao e disco;
  novas releases bloqueiam se faltar espaco.

Infraestrutura, variaveis novas, volumes e portas exigem revisao local.
Atualizacoes comuns de codigo e migrations sao automatizadas.

## Validacao tecnica

`python3 -m unittest discover -s scripts/production -p 'test_*.py' -v`
cobre entradas invalidas, checksum, truncamento, tags extras, caminhos perigosos,
isolamento da configuracao, falha de backup e falha de migration simuladas.
O teste opt-in `TRIXUS_TEST_DOCKER_ARCHIVE=1` exporta/importa tres imagens
locais temporarias, compara configuracao/camadas e executa Bun nelas.
Nao usa dados ou servicos da VPS.

Referencias: [Docker load](https://docs.docker.com/reference/cli/docker/image/load/),
[Compose up](https://docs.docker.com/reference/cli/docker/compose/up/).
