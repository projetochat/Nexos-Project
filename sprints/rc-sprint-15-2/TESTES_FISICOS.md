# Testes Fisicos

Nao executados com evidencia completa nesta sessao.

Auditoria local em 2026-08-06:
- Evolution API `evoapicloud/evolution-api:v2.3.7` estava rodando.
- Havia uma instancia Evolution `open`.
- O banco `nexos_0801` usado no verify nao tinha connection Evolution.
- O banco `nexos` tinha connections Nexos `CONNECTED`, mas apontando para `externalReference` diferente da instancia Evolution `open`.

Gate critico pendente:
- texto WhatsApp real
- grupo WhatsApp real
- reply inbound/outbound real
- imagem inbound/outbound real
- documento inbound/outbound real
- audio/voice inbound/outbound real
- receipts sent/delivered/read/failed reais
- reactions reais
- realtime sem F5
- reconexao real
- download/upload/storage com evidencia fisica
- idempotencia fisica

Status: MESSAGING CORE REWORK REQUIRED
