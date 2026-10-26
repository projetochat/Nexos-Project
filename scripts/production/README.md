# Verificacao previa da VPS

`preflight.py` e somente leitura e deve ser executado pelo administrador da
VPS com `python3 -I -B preflight.py`. Nao recebe parametros nem instala
permissoes para o usuario de deploy. Nao executa migrations, backups, pulls,
builds, limpeza, atualizacao ou reinicio de servicos.

Consultas feitas:

- Propriedade/permissoes dos arquivos Compose e ambiente e seus diretorios.
- Configuracao resolvida do projeto `trixus-vps` (mantida apenas em memoria;
  valores privados nao aparecem no relatorio).
- Correspondencia entre os bancos da API, migrations e futuro backup.
- Montagem do backend exclusivamente em `/srv/trixus-data`; portas da API
  e frontend apenas em loopback; ausencia de privilegios adicionais.
- Containers atuais do Trixus e estado ativo de Apache/MariaDB.
- Espaco livre, memoria disponivel e tamanho do banco via consulta SQL.

O sucesso nao autoriza deploy nem garante isolamento absoluto dos recursos
compartilhados. O executor em `release.py` verifica tambem imagens, recursos
e HTTP do GLPI. Instalacao, simulacao, aprovacao e recuperacao estao descritas
em [PRODUCTION-AUTOMATION.md](../../docs/PRODUCTION-AUTOMATION.md).

Execute `python3 -B -m unittest discover -s scripts/production` no repositorio
para testar a validacao de configuracao sem acessar Docker ou a VPS.

## Atualizacao do runner instalado

O workflow nao substitui automaticamente os scripts root-owned da VPS. Depois
de revisar um checkout ou pacote administrativo, execute como root, a partir de
`scripts/production`, `bash upgrade.sh`. O script valida `INSTALL-SHA256SUMS`,
compilacao Python e sudoers; troca atomicamente somente `preflight.py`,
`release.py`, `gateway.py` e `entrypoint.py`. Em falha, restaura os quatro.

A copia anterior contem somente esses scripts em
`/var/lib/trixus-production/runner-backups`; as duas mais recentes sao mantidas.
O upgrade nao toca banco, anexos, containers, proxy, GLPI ou outros servicos.

## Promocao de pacote imutavel e aprovacao unica

No workflow, execute `build` primeiro. Em `plan`, informe `source_run_id` da
execucao build concluida com sucesso no mesmo SHA. O pacote e baixado dessa
execucao, sem recompilar. O plan bem-sucedido publica um recibo com ambiente,
SHA, ID do build e SHA-256 do arquivo. Em `deploy`, informe o mesmo
`source_run_id` e o `plan_run_id` revisado. Divergencias bloqueiam antes do SSH.

O gate root-owned `enabled`, modo 0600 e conteudo `approved`, e consumido sob
lock antes de carregar imagens. `approval.txt` e `approval-consumed.json`
registram o consumo na pasta da tentativa. Falhas nao rearmam o gate; nao
repetir automaticamente. `recovery-required` e `investigation-required`
bloqueiam plan e deploy, inclusive quando sao links pendentes. Nao remover
marcadores manualmente; preservar evidencias e seguir recuperacao explicita.

A mudanca local so vale na VPS apos upgrade administrativo revisado do runner.
Esta documentacao nao autoriza instalar scripts, habilitar gate ou publicar.
