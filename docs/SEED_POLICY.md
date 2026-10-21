# Politica atual de seed

## D-011 — seed unica por ambiente (08/10/2026)

Esta decisao substitui os fluxos operacionais de seed descritos nos registros historicos das
Sprints 08.01, 08.02 e 08.03. O historico foi preservado, mas nao deve ser usado como instrucao
atual.

Os unicos valores validos de `TRIXUS_ENVIRONMENT` sao:

- `production`
- `homologation`
- `staging`

Nos tres ambientes, `prisma:seed` tem exatamente o mesmo efeito:

1. procura `TRIXUS_PLATFORM_ADMIN_EMAIL` sem diferenciar maiusculas e minusculas;
2. se o usuario nao existir, exige `TRIXUS_PLATFORM_ADMIN_PASSWORD` e cria um Platform Admin;
3. se ja existir como Platform Admin, preserva integralmente senha, nome, status e vinculos;
4. se o e-mail pertencer a outro papel, ou houver mais de um e-mail equivalente, interrompe sem
   promover nem alterar usuarios.

A seed nao cria, atualiza ou remove tenants, planos, assinaturas, usuarios de tenant, departamentos,
permissoes, contatos ou dados operacionais. Tambem nao apaga dados existentes.

Dados de demonstracao pertencem exclusivamente a `prisma:seed:test-fixtures`. Esse comando exige
`NODE_ENV=test`, PostgreSQL local, nome de banco descartavel permitido e confirmacao explicita do
mesmo nome. Ele e usado pelos testes e nao e um procedimento de deploy.

`NODE_ENV` continua controlando o runtime Node. `TRIXUS_ENVIRONMENT` identifica o ambiente Trixus e
nao deve ser substituido por `SEED_MODE`.

## Configuracao minima da seed

```dotenv
TRIXUS_ENVIRONMENT=production
TRIXUS_PLATFORM_ADMIN_EMAIL=<platform-admin-email>
TRIXUS_PLATFORM_ADMIN_PASSWORD=<strong-bootstrap-password>
```

Em homologacao, use `TRIXUS_ENVIRONMENT=homologation`; em staging, use
`TRIXUS_ENVIRONMENT=staging`. A senha so e usada na criacao. Depois disso, sua troca deve ocorrer
por um fluxo explicito, nunca por reexecucao da seed.

## Pendencia separada

O catalogo de planos nao pertence mais a seed. Uma base nova recebe apenas o que suas migrations
definirem. A criacao ou atualizacao do plano `business` deve ser tratada por migration ou backfill
administrativo proprio antes de certificar uma instalacao nova; nao deve ser reintroduzida na seed.
