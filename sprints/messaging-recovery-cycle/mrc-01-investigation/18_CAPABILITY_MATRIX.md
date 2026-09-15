# Capability Matrix

| Capability | Current Evidence | Status |
| --- | --- | --- |
| Text outbound | Current dirty payload aligned; verify pass | Partial |
| Text inbound | Unit/integration tests only | Partial |
| Reply outbound | Model/code paths present | Partial |
| Reply inbound | Translator/service paths present | Partial |
| Image outbound | Multipart code present | Partial |
| Image inbound | Not physically tested | Unknown |
| Document outbound | Multipart code present | Partial |
| Document inbound | Not physically tested | Unknown |
| Audio outbound | `sendWhatsAppAudio` code present | Partial |
| Audio inbound | Not physically tested | Unknown |
| Receipts | Status service/tests present | Partial |
| Reactions | Code/tests present | Partial |
| Group inbound | Existing model/normalization paths | Partial |
| Group outbound | Recipient normalizer supports `@g.us` | Partial |
| Storage local | Health up | Partial |
| Storage R2/S3 | Not tested | Unknown |
| Download auth | Endpoints present | Partial |
| Realtime | Health up; code present | Partial |
| Reconnect | Not tested | Unknown |
| Idempotency | Unit coverage and queue ids | Partial |

No row is eligible for final PASS without physical evidence.
