# Backend Lifecycle

## Observed Health

Backend health is currently up:

- API: ok
- Database: up
- Redis: up
- Queue: up
- Realtime: up
- Storage: up

## Worker Lifecycle

`MessagingOutboundWorker` is present and instrumented with started/completed/failed style events in the current dirty tree.

Historical hotfix evidence points to a worker resilience issue around conversation locks and orphan promise handling. That correction exists in the current dirty worktree, but MRC-01 did not revert to baseline and reproduce the original crash.

## Remaining Risk

- Runtime process stability was not observed for the full requested 10 minutes.
- No process restart/reconnect scenario was executed.
- Database drift can surface only when specific message fields are queried, so a generic health check is not sufficient.
