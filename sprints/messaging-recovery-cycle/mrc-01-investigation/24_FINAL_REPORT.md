# MRC-01 Final Report

## Scope

MRC-01 was executed as investigation only. No functional fix was intentionally applied during this cycle.

## Evidence Collected

- Git branch, HEAD and dirty worktree state.
- Runtime versions for Bun, Node and Docker.
- Docker container state for Nexos, Redis, Postgres and Evolution.
- Health checks from host and Evolution container.
- Evolution API version: `2.3.7`.
- Queue counts and failed job samples.
- Database counts and migration drift.
- Code inventory for messaging, Evolution, queue, realtime, storage and frontend inbox.
- `bun run verify` result: PASS.

## Root Causes

1. Database/migration drift between active database and messaging schema.
2. Historical Evolution v2.3.7 payload contract mismatch.
3. Queue failed-job residue requiring classification.
4. Dirty worktree ambiguity between baseline and correction candidates.
5. Missing complete physical WhatsApp evidence.

## Regression

No new functional code was changed in MRC-01. Documentation files were added only under `sprints/messaging-recovery-cycle/mrc-01-investigation/`.

## Gate

MRC-01 INVESTIGATION INCOMPLETE

Reason:

- Root causes were identified.
- MRC-02 blueprint is ready.
- However, full physical homologation and long-running stability/reconnect evidence were not executed in MRC-01.

The following approval wording is not allowed yet:

- `MESSAGING CORE APPROVED`
- `READY TO RESUME RC ROADMAP`
