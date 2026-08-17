# Recipient Normalization

Implemented in `EvolutionRecipientNormalizer`.

Rules:
- Direct phone input is stripped to digits before sending as `number`.
- Direct JID input ending in `@s.whatsapp.net`, `@c.us` or `@lid` is preserved.
- Group input must end in `@g.us`.
- Group JIDs are never normalized as phone numbers.
- Empty direct targets fail before Evolution with `INVALID_RECIPIENT`.
- Invalid group targets fail before Evolution with `INVALID_RECIPIENT`.

Canonical output:

```ts
type EvolutionRecipient = {
  conversationType: "DIRECT" | "GROUP";
  target: string;
  number?: string;
  remoteJid?: string;
};
```
