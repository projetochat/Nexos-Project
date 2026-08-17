# Networking Analysis

## Host To Services

`localhost:3001`:

- TCP succeeded.
- `GET /api/health` returned healthy Nexos API.

`localhost:8080`:

- TCP succeeded.
- Evolution returned status `200` and version `2.3.7`.

## Evolution Container To Backend

From `nexos-evolution-api`:

- `http://host.docker.internal:3001/api/health` returned healthy Nexos API.
- `http://localhost:8080` returned Evolution health.

## Conclusion

No active `ECONNREFUSED` was reproduced during the short MRC-01 network probe.

Remaining uncertainty:

- No 10 minute continuous monitor was executed in MRC-01.
- No reconnect/failover test was executed.
- Historical `ECONNREFUSED` remains associated with backend process availability or worker failure, but requires long-running repro evidence for final closure.
