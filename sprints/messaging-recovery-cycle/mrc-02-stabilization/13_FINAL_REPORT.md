# MRC-02 Final Report

## Summary

MRC-02 completed the automated stabilization work supported by MRC-01 root causes:

- RC-001 database/schema drift corrected for official and test databases.
- RC-002 Evolution v2.3.7 contract normalization preserved.
- RC-003 queue residue addressed with safe cleanup routine and final zero queue counts.
- Reaction inbound gap closed.
- Media state gap closed.
- Final physical fixes implemented for the four remaining failed blocks reported after the rebuilt Evolution environment:
  reply inbound, inbound media, quoted-message navigation, and group display-name preservation.

## Final Physical Fixes - 2026-08-07

Root cause:

- Evolution inbound messages can arrive wrapped (`ephemeralMessage`, `viewOnceMessageV2`,
  `documentWithCaptionMessage`), so reply `contextInfo` and media envelopes were missed by the
  translator.
- Inbound media with only Evolution/Baileys `directPath` had no backend fallback to
  `/chat/getBase64FromMediaMessage/{instance}` and stayed unavailable in Nexos.
- Group inbound `pushName` belongs to the participant, not to the group conversation/contact.
- The inbox reply preview rendered as static text and did not scroll/highlight the referenced
  message.

Files changed in this final pass:

- `backend/src/messaging/evolution/evolution-webhook.translator.ts`
- `backend/src/messaging/evolution/evolution.client.ts`
- `backend/src/messaging/messaging-inbound.service.ts`
- `backend/src/messaging/messaging.contracts.ts`
- `src/routes/inbox.$conversationId.tsx`
- `backend/src/messaging/evolution/evolution-webhook.translator.spec.ts`
- `backend/src/messaging/evolution/evolution.client.spec.ts`

Result:

- Reply inbound is now normalized from wrapped Evolution payloads with quoted provider id, preview
  and media fallback preview.
- Inbound image/document/audio can be downloaded through Evolution when the webhook has no public
  HTTP URL, then stored through the existing private media storage pipeline.
- GROUP conversation/contact names no longer use participant `pushName`; participant names remain
  in participant fields.
- Quoted previews in the inbox scroll to the referenced message and apply a temporary highlight.
- Inbound media rendering respects `mediaState` (`ready`, `pending/downloading`, `failed`) before
  attempting inline download.

## Automated Gate

`bun run verify`: PASS

Backend tests:

- 27 files passed
- 183 tests passed

Focused tests:

- `backend/src/messaging/evolution/evolution-webhook.translator.spec.ts`
- `backend/src/messaging/evolution/evolution.client.spec.ts`
- `backend/src/messaging/messaging-inbound.service.spec.ts`

Focused result: 23 passed, 0 failed.

## Runtime Gate

- Evolution v2.3.7: healthy
- Postgres: healthy
- Redis: healthy
- Prisma migrations on `nexos_0802`: up to date
- `messaging-outbound`: zero waiting/active/delayed/completed/failed/paused jobs after cleanup

## Physical Gate

Not complete after this code pass.

Physical matrix received after environment rebuild:

- texto inbound: PASS
- texto outbound: PASS
- reply inbound: FAIL before this fix
- reply outbound: PASS, with UI scroll/highlight gap before this fix
- reaction add/change/remove: PASS
- imagem inbound: FAIL before this fix
- imagem outbound: PASS
- documento inbound: FAIL before this fix
- documento outbound: PASS
- audio inbound: FAIL before this fix
- audio outbound: PASS
- voice/PTT: PASS
- grupo: PASS, with group-name overwrite gap before this fix
- receipts: PASS
- realtime sem F5: PASS
- retry/recovery/offline/restart/idempotencia: PASS

Required physical retest remains open for:

- reply inbound appears in Nexos with quoted preview
- reply preview click scrolls/highlights the referenced message
- inbound image renders
- inbound document appears as downloadable attachment
- inbound audio appears as player
- group name remains the group name after messages from different participants
- realtime remains no-F5
- zero duplication and backend resilience remain preserved

## Final Gate

MRC-02 FINAL PHYSICAL RETEST REQUIRED

Do not declare:

- `MESSAGING CORE STABILIZED`
- `READY FOR PRODUCTION PILOT`

until the full physical validation matrix passes with evidence.
