# Recipient Forensics

## Direct Recipients

Current normalizer accepts:

- raw phone digits
- `@s.whatsapp.net`
- `@c.us`
- `@lid`

Raw phone digits are converted to `remoteJid` as `number@s.whatsapp.net`.

## Group Recipients

Group conversations require `externalChatId` ending in `@g.us`.

## Risks

- Owner identity fields on observed connections are null.
- Recipient correctness depends on `Conversation.type`, `externalChatId`, and `Contact.normalizedPhone`.
- A direct conversation with a group JID is rejected.
- A group conversation without `@g.us` is rejected.

## MRC-02 Requirement

Add physical fixtures for:

- direct phone
- direct JID
- LID recipient
- group JID
- quoted group message with participant
