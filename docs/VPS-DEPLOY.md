# Deploy do backend na VPS

Este procedimento prepara apenas API, banco, Redis, migrations e storage do backend. Ele nao altera nem publica a interface; o frontend deve continuar sendo entregue pelo mecanismo ja aprovado para ele. Um proxy reverso deve encaminhar apenas o dominio e os caminhos de API/WebSocket definidos pelo frontend atual para `127.0.0.1:3001`.

## Pre-requisitos e dados persistentes

- Instale Docker Engine e Docker Compose Plugin na VPS.
- Clone o commit aprovado em um diretorio novo. O nome desse diretorio nao e parte da identidade dos dados.
- Crie o diretorio indicado por `TRIXUS_STORAGE_HOST_PATH`, com permissao de leitura/escrita para o Docker. Esse diretorio contem anexos e deve entrar no backup.
- Copie `.env.vps.example` para `.env.vps`, preencha todos os placeholders e mantenha o arquivo fora do Git. Use valores exclusivos para banco, JWT e Evolution.
- Em `DATABASE_URL`, use o host interno `postgres` e codifique caracteres reservados da senha para URL (por exemplo, `@`, `:`, `/`, `?`, `#` e `%`). Nao deixe o Compose montar essa URL a partir da senha bruta.
- O banco e Redis ficam em volumes nomeados pelo `COMPOSE_PROJECT_NAME`. Antes de trocar esse valor ou recriar a pasta, registre `docker volume ls` e execute backup/restauracao testada.

## Sequencia de release

1. Confirme a configuracao sem exibir valores: `docker compose --env-file .env.vps -f docker-compose.vps.yml config --quiet`. Em CI, a configuracao pode ser validada sem segredos com `TRIXUS_ENV_FILE=.env.vps.example docker compose --env-file .env.vps.example -f docker-compose.vps.yml config --quiet`; isso nao substitui a validacao do arquivo real na VPS.
2. Construa as imagens: `docker compose --env-file .env.vps -f docker-compose.vps.yml build`.
3. Suba somente dependencias: `docker compose --env-file .env.vps -f docker-compose.vps.yml up -d postgres redis`.
4. Confira o estado das migrations: `docker compose --env-file .env.vps -f docker-compose.vps.yml --profile release run --rm migrate bun run prisma:migrate:status`.
5. Aplique migrations uma unica vez por release: `docker compose --env-file .env.vps -f docker-compose.vps.yml --profile release run --rm migrate`.
6. Suba a API: `docker compose --env-file .env.vps -f docker-compose.vps.yml up -d backend`.
7. Verifique `http://127.0.0.1:3001/api/health` na VPS e, pelo dominio real, teste CORS, login, refresh, Socket.IO e webhook Evolution quando habilitado.

Quando a integracao Evolution fizer parte do ambiente, suba-a explicitamente com `docker compose --env-file .env.vps -f docker-compose.vps.yml up -d evolution-api`. A API Trixus pode iniciar sem ela, mas conexoes Evolution permanecem degradadas ate que esse servico e os quatro valores `EVOLUTION_*` exigidos estejam disponiveis.

Nao rode `prisma migrate dev`, `prisma db push`, resets ou seeds contra a VPS durante esse fluxo. O seed de producao exige uma decisao operacional separada e credenciais proprias.

## Backup e rollback

Antes de qualquer migration, gere um dump consistente de PostgreSQL e uma copia verificavel de `TRIXUS_STORAGE_HOST_PATH`. Registre tambem a imagem/commit atualmente em uso. O rollback de aplicacao so e seguro quando a migration for retrocompativel; caso contrario, restaure o dump em uma janela controlada. Nunca execute `docker compose down -v` para uma reinstalacao ou troca de pasta.

## Ambiente local

O `docker-compose.yml` e exclusivo para desenvolvimento. O nome padrao agora e `trixus-local`, mas pode ser isolado com `COMPOSE_PROJECT_NAME=trixus-local-<apelido>`. Seus volumes mudam junto com o project name: manter o mesmo nome preserva dados; trocar o nome cria dados novos. Para um ambiente limpo, copie `.env.example`, execute `docker compose up -d`, `bun run backend:prisma:generate`, `bun run backend:prisma:migrate:deploy` e `bun run backend:prisma:seed`.

Para o webhook Evolution em desenvolvimento com Docker Desktop, `host.docker.internal` e apropriado. Na VPS, use uma URL HTTPS publica para `EVOLUTION_WEBHOOK_PUBLIC_URL`; nao use esse hostname como destino publico.
