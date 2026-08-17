# Technical Debt

- Environment files allow confusion between `nexos` and `nexos_0802`.
- Migration history is not fully reproducible from local files.
- Messaging worktree contains multiple sprint scopes mixed together.
- Storage provider abstraction is not physically verified beyond local health.
- Queue failed jobs lack a documented cleanup/classification procedure.
- Physical evidence is spread across sprint notes and not yet normalized into a repeatable harness.
- Evolution contract knowledge is embedded in adapter code and tests, but should be recorded as versioned contract fixtures.
- Realtime behavior has code and health checks, but lacks browser-level regression automation for messaging events.
