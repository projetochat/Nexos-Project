# Release automatizada da homologação

Este diretório contém um executor exclusivo para a HML. Ele não importa nem
chama o executor de produção e fixa no código todos os limites de isolamento:

- projeto Compose `trixus-hml`;
- aplicação em `/opt/trixus-hml/app`;
- estado em `/var/lib/trixus-hml-release`;
- storage em `/srv/trixus-hml-data`;
- imagens `trixus-hml-release/*`;
- frontend `https://hom.trixus.com.br`;
- API e webhook em `https://api-hom.trixus.com.br`.

O executor não contém seed, reset, `db push`, limpeza de volumes ou alteração de
produção. O pacote remoto fornece somente três imagens e quatro campos validados:
`plan|deploy`, commit, SHA-256 e tamanho. Configuração e comandos não atravessam
SSH.

## Fluxo

1. O workflow `build-homologation.yml` valida o projeto usando Postgres e Redis
   descartáveis e constrói as três imagens Linux/AMD64.
2. `plan` recebe e inspeciona o pacote, valida a configuração HML, calcula espaço
   para backup e termina sem carregar imagens nem interromper serviços.
3. `deploy` exige o arquivo root-owned
   `/var/lib/trixus-hml-release/enabled` com conteúdo `approved`. A aprovação é
   consumida uma única vez e guardada na pasta da release.
4. O preflight de migração roda com a aplicação antiga online.
5. O runner cria o marcador `recovery-required`, para somente os escritores HML,
   gera dumps dos dois PostgreSQL, snapshots dos dois Redis, e arquivos do
   storage e das instâncias Evolution. Os dois dumps são restaurados em
   PostgreSQL descartáveis, os Redis são iniciados a partir das cópias em
   containers sem rede, os demais tarballs são extraídos em área temporária e
   todos recebem SHA-256.
6. Com todos os escritores ainda parados, o preflight é repetido e só então a
   migração segura é executada. Não há seed ou reset.
7. Apenas `backend` e `frontend` são publicados com `--no-deps --no-build`.
   PostgreSQL, Redis e Evolution não são recriados.
8. A Evolution só é religada depois que o novo backend está saudável. Sua API é
   certificada mesmo quando não há instâncias. Webhooks de instâncias existentes
   são ajustados para a URL canônica da HML e
   certificados com segredo e os sete eventos esperados, incluindo edição e
   exclusão de mensagens. A leitura aceita tanto `byEvents`/`base64` quanto
   `webhookByEvents`/`webhookBase64`, conforme a resposta da Evolution 2.3.7.
   Zero instâncias é um
   resultado válido e não cria conta WhatsApp.
9. Saúde local/pública, rejeição 401 do webhook anônimo, produção e GLPI são
   revalidados antes de registrar `DEPLOY_OK` e remover o marcador.

Falhas anteriores à migração religam e certificam a aplicação anterior. Depois
que uma migração começa, não há rollback automático: a HML fica parada, o backup
e o marcador são preservados para recuperação explícita.

## Instalação administrativa

Instale `release.py` e `entrypoint.py` como arquivos `root:root` sem escrita por
grupo/outros em `/usr/local/lib/trixus-homologation`, exponha o entrypoint como
`/usr/local/sbin/trixus-hml-release` e configure `gateway.py` como comando forçado
da chave do usuário `trixus-hml-deploy`. A regra sudo deve autorizar somente esse
entrypoint, sem argumentos curingas interpretados por shell.

O runner instalado não é atualizado automaticamente pelo workflow. Toda troca
de versão deve ser revisada, validada com `python3 -m unittest discover -s
scripts/homologation -p 'test_*.py' -v` e feita atomicamente pelo administrador.

## Recuperação

A pasta da release contém `previous-compose.json`, identidades anteriores,
backups e checksums. Antes da migração, o runner retorna aos mesmos containers.
Após o início da migração, não remova `recovery-required` manualmente: determine
o estado da migration, restaure somente a partir do backup correspondente e
certifique banco, storage, Redis, Evolution, aplicação, produção e GLPI.
