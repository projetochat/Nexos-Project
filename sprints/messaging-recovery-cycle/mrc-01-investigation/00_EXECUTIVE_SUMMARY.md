# MRC-01 Executive Summary

Date: 2026-08-07  
Scope: investigation only. No functional correction was applied in this cycle.

## Verdict

MRC-01 identified enough root causes to prepare MRC-02, but the investigation is not eligible for a full approval gate because complete WhatsApp physical homologation and long-running stability evidence were not executed in this cycle.

Gate:

MRC-01 INVESTIGATION INCOMPLETE

## Main Findings

- Evolution is running `evoapicloud/evolution-api:v2.3.7` and answers on `localhost:8080`.
- Nexos backend answers on `localhost:3001/api/health`; Evolution container can reach it through `host.docker.internal:3001`.
- `bun run verify` passed on 2026-08-07: frontend typecheck, lint baseline, frontend build, backend build, backend tests, Redis queue smoke, and XSS tests.
- Active source tree is dirty and contains prior messaging rework and hotfix changes. This must not be treated as committed baseline.
- Prisma migration status reports a drift in database `nexos`: local migration `20260806120000_messaging_core_completion` is not applied, while database migration `20260730132000_redis_bullmq_outbox` is not present locally.
- A manual query against `nexos` confirmed `messages` is missing the new message core columns, while `nexos_0802` contains them. This environment split is a major forensic risk.
- BullMQ `messaging-outbound` has no waiting or active jobs, but has 30 failed jobs, including `Messaging connection is not connected` and `Message not found for outbound job`.
- Current dirty code contains Evolution v2.3.7 payload normalization for text, media, audio and reaction, but the historical failure mode was contract mismatch.

## Can The System Be Recovered Without Rewriting?

Yes. The architecture is recoverable. The failures are concentrated in contract alignment, database migration/environment drift, queue retry residue, physical evidence gaps, and incomplete media/reaction/receipt validation.

## MRC-02 Readiness

MRC-02 can start as a controlled correction sprint, but only after freezing the target database, applying or reconciling migrations, and separating uncommitted work from baseline evidence.
