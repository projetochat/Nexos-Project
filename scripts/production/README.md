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
compartilhados. O procedimento de publicacao ainda devera verificar o tamanho
descompactado das imagens, limitar recursos e usar somente configuracao fixa
controlada por root. Apache ativo tambem nao substitui um teste HTTP do GLPI.

Execute `python3 -B -m unittest discover -s scripts/production` no repositorio
para testar a validacao de configuracao sem acessar Docker ou a VPS.
