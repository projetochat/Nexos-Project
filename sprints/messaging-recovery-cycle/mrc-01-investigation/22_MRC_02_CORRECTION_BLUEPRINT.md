# MRC-02 Correction Blueprint

## Phase 1: Baseline Hygiene

1. Freeze official database name and `.env`.
2. Back up current database.
3. Reconcile migration table and local migration files.
4. Apply `20260806120000_messaging_core_completion` or equivalent reconciled migration.
5. Regenerate Prisma client.
6. Run schema smoke queries against the same database used by backend.

## Phase 2: Evolution Contract Lock

1. Keep Evolution image pinned to `evoapicloud/evolution-api:v2.3.7`.
2. Add raw v2.3.7 fixture payloads for text, media, audio, reaction, quoted and receipts.
3. Validate current outbound factory against those fixtures.
4. Reject generic Evolution docs as source of truth.

## Phase 3: Queue And Outbox

1. Classify 30 failed `messaging-outbound` jobs.
2. Clean only approved stale diagnostic residue.
3. Prove deterministic job id and outbox uniqueness.
4. Prove retry under provider outage without duplication.

## Phase 4: Messaging Completion

1. Text direct and group.
2. Reply direct and group.
3. Image direct and group.
4. Document direct and group.
5. Audio/voice direct and group.
6. Reaction add/change/remove direct and group.
7. Receipts pending/queued/sent/delivered/read/failed.

## Phase 5: Physical Gate

Run the complete WhatsApp real matrix and attach evidence before any approval wording.
