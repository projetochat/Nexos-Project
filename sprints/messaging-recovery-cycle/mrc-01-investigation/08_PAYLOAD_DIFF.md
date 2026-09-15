# Payload Diff

## Historical Failed Shape

The failing pre-normalization shape used nested payloads incompatible with the observed v2.3.7 contract:

```json
{
  "number": "5511999999999",
  "textMessage": {
    "text": "message"
  }
}
```

Reaction historical risk:

```json
{
  "reactionKey": {},
  "reactionMessage": {}
}
```

## Current Dirty Worktree Shape

Current dirty adapter code builds:

- text root `number` and `text`
- media multipart `file`
- audio multipart `file` to `sendWhatsAppAudio`
- reaction root `key` and `reaction`
- quoted root `quoted.key`

## Diff Assessment

The current dirty worktree appears aligned with v2.3.7 for outbound payload creation. However, because these changes are uncommitted and mixed with other sprint work, they are evidence of a correction candidate, not a clean MRC-01 baseline.

MRC-02 must re-apply or preserve this contract deliberately, with physical tests.
