# Automacao de producao Trixus

## Estado atual

O acesso SSH restrito foi validado no GitHub. O workflow
`build-production.yml` e uma etapa manual de validacao e empacotamento:
nao instala nada na VPS, nao consome a chave SSH e nao executa deploy.
O deploy automatico ainda nao esta implementado/ativado neste workflow.

O projeto em producao e `trixus-vps`, instalado em `/opt/trixus/app`;
seu ambiente privado fica em `/opt/trixus/app/.env.vps`. Os anexos ficam
em `/srv/trixus-data`. A arquitetura e linux/amd64.
Apache e MariaDB sao servicos do host; o GLPI compartilha o Apache.

## Testar a construcao no GitHub

1. No environment `production`, cadastrar `VITE_TRIXUS_API_URL` com o valor
   publico usado hoje na producao (incluindo `/api`, se presente).
2. Se o frontend atual usa a compatibilidade Supabase, copiar tambem os
   valores publicos `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e
   `VITE_SUPABASE_PROJECT_ID` para as variables homonimas. Nao cadastrar
   `SUPABASE_SERVICE_ROLE_KEY` nem qualquer senha como variable de frontend.
3. Integrar o workflow na main e executar **Build Trixus production images**
   manualmente na main.
4. O job validate instala dependencias pelo lockfile, aplica migrations e
   carrega fixtures com `SEED_MODE=demo` exclusivamente no PostgreSQL
   descartavel do runner. Depois executa `bun run verify` com esse banco e
   Redis descartavel. As contas ficticias do CI nunca sao criadas na VPS.
5. O job build cria as tres imagens, verifica arquivos/executaveis e gera um
   artifact do repositorio com tags vinculadas ao commit, manifesto e
   SHA256SUMS. A retencao e de tres dias para limitar armazenamento cobrado.

Esse primeiro build permite medir o pacote real antes de dimensionar a
transferencia para uma VPS que tem aproximadamente 12 GB livres. O tamanho
comprimido nao representa todo o espaco exigido para importar as imagens.

## Contrato para a proxima etapa (ainda nao instalada)

- Construir imagens exclusivamente no GitHub; nao compilar na VPS.
- Manter o usuario `trixus-deploy` fora de sudo/docker e sem shell SSH livre.
  A autorizacao de um comando privilegiado fixo sera instalada pelo administrador.
- Nao executar scripts, Compose ou comandos arbitrarios recebidos pelo SSH
  como root. O procedimento do servidor deve ser fixo, de propriedade do root.
- Restringir atualizacoes a backend, frontend e ao container temporario de
  migrations do Trixus. Preservar PostgreSQL, Redis, Evolution, Apache, MariaDB,
  configuracao de proxy, certificados e dados do GLPI.
- Conferir identidade do banco, volumes, disco e recursos antes de parar a API.
  Serializar releases e limitar recursos dos containers atualizados.
- Pausar escritores do Trixus, salvar banco e anexos e verificar os backups
  antes de aplicar `prisma migrate deploy`. Registrar versao anterior.
- Nao executar reset, seed, db push, limpeza global do Docker ou restore
  automatico. Uma falha de migration exige diagnostico e recuperacao controlada.
- Validar saude da API e frontend e verificar disponibilidade do GLPI.
- Apresentar o procedimento final e obter aprovacao antes do primeiro deploy.

Alteracoes futuras de infraestrutura (variaveis, volumes, portas ou servicos)
exigirao atualizacao revisada da configuracao do servidor. Publicar imagens
automaticamente nao significa autorizar mudancas irrestritas na VPS.
