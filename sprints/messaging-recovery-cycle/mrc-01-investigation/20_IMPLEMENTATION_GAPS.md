# Implementation Gaps

Gaps requiring correction or proof in MRC-02:

- Apply/reconcile messaging core migration on the official runtime database.
- Freeze a single homologation database in `.env`, Prisma CLI and backend process.
- Preserve Evolution v2.3.7 payload contract normalization.
- Prove outbound text through Nexos, not direct Evolution only.
- Prove reply outbound/inbound with quoted provider id.
- Prove group outbound for text, reply, media, audio and reaction.
- Prove media storage, checksum, magic bytes and authorized download.
- Prove inbound media download and storage.
- Prove receipts from Evolution to UI/timeline.
- Prove reaction add/change/remove direct and group.
- Prove realtime updates without browser refresh.
- Prove retry/idempotency with provider and backend outage scenarios.
- Classify existing failed BullMQ jobs.
