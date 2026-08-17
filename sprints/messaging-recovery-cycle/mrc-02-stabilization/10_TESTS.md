# Tests

## Automated

Command:

```bash
bun run verify
```

Result:

- PASS

Included:

- frontend typecheck
- lint baseline
- frontend build
- inbox legacy runtime check
- ticket legacy runtime check
- campaign legacy runtime check
- platform admin legacy runtime check
- operational runtime tests
- backend build
- backend tests: 27 files, 179 tests
- Redis queue smoke
- XSS tests

Targeted messaging tests also passed:

- reaction service
- Evolution webhook translator
- inbound service
- outbound service
- outbound worker
- status service
- Evolution payload factory/client/provider

## Environment Test Fix

`nexos_1200` was migrated with `20260807013000_message_media_state` so e2e tests use the same schema contract as generated Prisma Client.
