# Login metrics federation (disabled by default)

Local implementation only. No configuration, migration, deployment or remote activation is performed by these files. Apply the schema migration to each intended database **before** enabling this feature; never enable it against an unmigrated database.

The existing local audit remains the source of truth. With `TRIXUS_LOGIN_METRICS_ENABLED=true`, successful internal logins stamp immutable source/environment provenance on their audit event and enqueue a minimal `LOGIN_METRIC_V1` outbox payload in the same transaction. Export contains only event ID, tenant ID, normalized first tenant-name token and timestamp. No users, sessions, emails, credentials or names beyond that approved token are exported. Refresh, portal, platform and impersonation remain excluded. No historical audit or session fallback/backfill is used.

## Configuration contract

All values belong to a deployment, outside database backups. Default is disabled and performs no new-schema queries, timers or network calls.

- `TRIXUS_LOGIN_METRICS_ENABLED`: exact string `true` to opt in.
- `TRIXUS_LOGIN_METRICS_SOURCE_ID`: stable, unique installation identity. Restoring the same installation keeps it; cloning into another environment requires a different identity BEFORE enabling.
- `TRIXUS_LOGIN_METRICS_ENVIRONMENT`: `local`, `homologation` or `production`.
- `TRIXUS_LOGIN_METRICS_KEY`: per-source HMAC secret, at least 32 characters. Never send it to a browser or log it.
- `TRIXUS_LOGIN_METRICS_START_AT`: canonical UTC ISO instant defining prospective coverage.
- `TRIXUS_LOGIN_METRICS_COLLECTOR`: exact `true` only for the selected central deployment.
- `TRIXUS_LOGIN_METRICS_CENTRAL_URL`: HTTPS origin only, no path, query, credentials or redirects. All noncentral Platform backends use this same collector; localhost only sends outbound traffic.
- `TRIXUS_LOGIN_METRICS_PEERS_JSON`: collector-only object keyed by source ID; each peer has `{key, environment, tenantKeys: [approvedNormalizedFirstTokens], startAt}`. The collector must include its own source with identical key, environment and cutover. Include intended sources for all three environments; allowlists explicitly authorize each tenant token.

No real keys or environment settings are included here. Keys and origins must be installed independently through an authorized activation process. First-name discovery is not user authentication.

## Identity and clone safety

A complete source tenant inventory is sent to detect duplicate first tokens globally within that source. Central discovery requires a unique central tenant with the same normalized first token, ignoring accents/case. Authorized mappings persist as `(sourceId, localTenantId) -> canonicalTenantId`. A renamed source token fails closed rather than rerouting the old binding. Existing bindings retain their canonical ID even if central presentation labels later change; new mappings still require uniqueness. Unknown tokens cannot ingest events or read counts.

Only outbox rows stamped with this installation's source ID AND environment are exported. Restoring a backup into another environment does not relabel copied audits or outbox rows. Reusing the SAME source ID/environment in a clone is invalid configuration and cannot be distinguished automatically; the operator must register installations correctly.

## Protocol, completeness and delivery

Machine endpoints are `POST /api/login-metrics/v1/events` and `/counts`. HMAC covers POST, exact path, source, timestamp, nonce and canonical JSON body hash. Authentication accepts a 90-second clock window. Nonces are persisted for five minutes; replay is rejected. Retry signs a fresh nonce. Events are unique by source/event ID and a conflicting payload is rejected rather than overwritten.

Input/output is bounded to 256 KiB; event batches contain at most 100 records and inventories at most 500 tenants. HTTPS redirects are rejected. Export retries the dedicated outbox type every 60 seconds; overlapping work in the same process is prevented. Idempotent central insertion makes retries/multiple exporter processes safe. Network failures never occur in the login transaction. An outbox persistence failure rolls back login and its audit together.

A repeatable-read source snapshot covers pending rows and inventory. The heartbeat reports that snapshot's `observedAt` and remaining backlog, not the central request time. A count is available only if all three expected environments have an authorized peer binding to the canonical tenant, fresh delivery state (five minutes), and zero reported backlog. A heartbeat with no relevant tenant binding cannot fabricate an environment's zero. Counts are eventually consistent committed-event snapshots; logins committed after the reported observation may appear on the next dispatch. `updatedAt` is the oldest contributing source observation. A readonly count request never refreshes delivery state.

`disabled` preserves the caller's local audit behavior. `unavailable`/`ambiguous` returns null counts, not zero. Never add local counts to the central aggregate a second time. The Platform caller applies tenant/client filters to returned local tenant IDs. Client names are not part of federation identity; each Platform retains its own client-to-tenant mapping.

## Recovery and limits

Turn the feature off to restore local-only queries without removing durable audit history. Preserve new audit/outbox data and central events/bindings; do not drop tables as routine rollback. Source renames, ambiguous tokens, binding corrections, historical imports and cutover changes need explicit reconciliation, not automatic remapping.

This code does not certify actual network reachability, operational activation, clock synchronization, peer completeness or production deployment. Those require an authorized rollout and verification. No existing environment is enabled automatically.
