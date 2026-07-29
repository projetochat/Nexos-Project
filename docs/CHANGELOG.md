# Changelog

## 2026-07-29 - Sprint 01 foundation

- Inicializado Git e criado branch `sprint/01-foundation`.
- Instalado Bun e atualizadas dependencias via `bun.lock`.
- Criado backend NestJS em `backend/`.
- Criado `docker-compose.yml` com PostgreSQL local.
- Criado Prisma schema, migration inicial e seed multi-tenant.
- Implementados endpoints `/api/health`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/me` e `/api/tenant-records/:id`.
- Adicionados testes e2e do backend e teste de sanitizacao XSS.
- Login frontend passa a tentar Nexos API antes do fallback Supabase.
- Removida chamada automatica de `ensureDemoUsers` no login e adicionada flag de seguranca.
- HTML de chamados passa por sanitizacao antes de persistir e ao reabrir edicao.

## 2026-07-29 - Sprint 00 baseline

- Executada auditoria estatica do frontend.
- Atualizada documentacao oficial com estado IMPLEMENTADO, SIMULADO, PLANEJADO e NAO IMPLEMENTADO.
- Adicionado roteiro de validacao local da Sprint 00 ao README.
- Registrados gaps frontend -> backend e divergencias MVP x arquitetura futura.
- Nenhuma alteracao funcional, dependencia ou lockfile foi realizada.

## 2026-07-29 - Documentacao consolidada

- Criada documentacao tecnica inicial no padrao oficial de `docs/`.
- Documentos numerados antigos foram substituidos por apontadores para evitar duplicidade.
