# Connection Forensics

## Observed Database Connections

The queried runtime contains 4 messaging connections, all marked `CONNECTED`.

Observed examples:

- `46a0c5ba-teste`
- `46a0c5ba-nata`
- `FLOWID`
- `ORBIT`

Owner external id and owner normalized phone were null in the sampled rows.

## Evolution Connectivity

Evolution API is reachable and returns v2.3.7 health.

## Webhook

Configured public webhook URL pattern:

- `http://host.docker.internal:3001/api/webhooks/evolution`

Backend tests log webhook audit events with secret present and matching.

## Risks

- Connection status in Nexos can be stale if Evolution state changes and metadata refresh is not executed.
- Owner phone fields are not populated in observed rows, reducing forensic confidence.
- No reconnect physical test was executed in MRC-01.
