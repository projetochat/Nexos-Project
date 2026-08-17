# Runtime Stabilization

## Database

Official homologation database:

- `nexos_0802`

Actions:

- `.env` updated from `nexos` to `nexos_0802`.
- `prisma migrate status` on `nexos_0802`: up to date.
- `prisma migrate deploy` applied `20260807013000_message_media_state`.
- `nexos_1200` test database also migrated to eliminate e2e schema drift.

## Redis And BullMQ

Queue cleanup routine:

```bash
bun run cleanup:homologation-queues
NEXOS_CONFIRM_HOMOLOGATION_QUEUE_CLEANUP=messaging-outbound bun run cleanup:homologation-queues -- --execute
```

Final `messaging-outbound` counts:

- waiting: 0
- active: 0
- delayed: 0
- completed: 0
- failed: 0
- paused: 0

## Runtime Health

Validated in controlled runtime window:

- backend health: up
- database: up
- redis: up
- queue: up
- realtime: up
- storage: up
- Evolution container could reach Nexos through `host.docker.internal`.

Persistent background launch through the tool runner was blocked, so long-running runtime validation was not completed.
