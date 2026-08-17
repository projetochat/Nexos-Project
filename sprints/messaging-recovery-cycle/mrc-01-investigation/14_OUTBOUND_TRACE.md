# Outbound Trace

## Current Flow

Frontend -> Controller -> Service -> Outbox -> BullMQ -> Worker -> Provider -> Evolution.

## Evidence

`verify` passed and backend tests include worker and outbound service coverage.

Current dirty adapter sends:

- text through `/message/sendText`
- image/document through `/message/sendMedia`
- audio/voice through `/message/sendWhatsAppAudio`
- reactions through `/message/sendReaction`

## Historical Root Cause

Pre-normalized Evolution payloads were incompatible with v2.3.7. This explains provider `400` responses for text and reaction shapes.

## Remaining Gaps

- No full Nexos UI/API -> Outbox -> Worker -> Evolution -> WhatsApp physical send was executed in MRC-01.
- No group outbound physical send was executed in MRC-01.
- No retry under provider outage was executed in MRC-01.
