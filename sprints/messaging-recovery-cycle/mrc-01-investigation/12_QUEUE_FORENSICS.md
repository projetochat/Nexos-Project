# Queue Forensics

## BullMQ Counts

`messaging-outbound`:

- waiting: 0
- active: 0
- delayed: 0
- completed: 56
- failed: 30
- paused: 0

`campaign-dispatch`:

- waiting: 0
- active: 0
- delayed: 0
- completed: 46
- failed: 0
- paused: 0

## Sample Failed Messaging Jobs

- `Messaging connection is not connected.`
- `Message not found for outbound job.`

## Outbox Sample

Recent `MESSAGING_OUTBOUND_REQUESTED` events were processed with attempts `1`.

There are also pending campaign outbox events, outside the MRC-01 correction scope.

## Risks

- Failed messaging jobs may represent historical invalid attempts, deleted messages, disconnected connections, or retry residue.
- Idempotency is partially protected by deterministic job id `message-{messageId}` and outbox uniqueness, but failed residue needs audit before physical retest.
