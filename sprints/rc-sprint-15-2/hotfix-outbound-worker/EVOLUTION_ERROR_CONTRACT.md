# Evolution Error Contract

Classificador: `backend/src/messaging/evolution/evolution-provider-error.classifier.ts`.

Regras principais:
- HTTP 400/422: payload invalido, permanente.
- HTTP 401/403: autenticacao/configuracao, permanente.
- HTTP 404: instancia/endpoint ausente, permanente ate correcao operacional.
- HTTP 408/429/500/502/503/504: retryable.
- `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`: retryable.
- timeout e connection reset sao marcados como `unknownOutcome`.

Campos propagados:
- `httpStatus`
- `providerCode`
- `endpointPath`
- `method`
- `unknownOutcome`

Sanitizacao:
- API key, token, authorization, jwt_key e data URI/base64 sao redigidos.
- Mensagens de provider sao limitadas a 500 caracteres.

