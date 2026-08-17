# Inbound Trace

## Current Flow

Evolution webhook enters through the Evolution webhook controller and translator, then reaches `MessagingInboundService`.

Expected normalization:

- tenant/connection resolution
- conversation resolution
- external message id extraction
- provider chat id extraction
- participant extraction for group messages
- quoted message extraction
- media metadata extraction
- status/reaction routing where applicable

## Evidence

Backend test logs during `verify` show:

- `messaging.inbound.processed`
- duplicate detection with `ignored_duplicate`
- persisted inbound message event

## Gaps

- No physical inbound WhatsApp text was executed in MRC-01.
- No physical inbound reply/media/audio/reaction/group event was executed in MRC-01.
- Translator contract must be validated with raw v2.3.7 webhook payloads captured from the real container.
