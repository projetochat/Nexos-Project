# Fixture descartável — identidade de Campos Adicionais

Use somente em PostgreSQL descartável, depois das migrações anteriores a
`20261005210000_contact_custom_field_identity` e antes da migração alvo. Não executar em banco
corrente, persistente ou de produção.

```sql
INSERT INTO "tenants" (id, name, slug, "updatedAt")
VALUES
  ('00000000-0000-4000-8000-00000000000a', 'Tenant sintetica A', 'tenant-sintetica-a', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-00000000000b', 'Tenant sintetica B', 'tenant-sintetica-b', CURRENT_TIMESTAMP);

INSERT INTO "contacts" (
  id, "tenantId", name, phone, "normalizedPhone", "updatedAt"
)
VALUES
  ('contact-synthetic-a', '00000000-0000-4000-8000-00000000000a', 'Contato sintetico A',
   '5500000000001', '+5500000000001', CURRENT_TIMESTAMP);

INSERT INTO "contact_custom_fields" (
  id, "tenantId", label, "normalizedName", type, "updatedAt", "archivedAt"
)
VALUES
  ('field-a-ascii', '00000000-0000-4000-8000-00000000000a', 'A', 'a', 'TEXT', CURRENT_TIMESTAMP, NULL),
  ('field-a-fullwidth', '00000000-0000-4000-8000-00000000000a', U&'\FF21', U&'\FF41', 'TEXT', CURRENT_TIMESTAMP, NULL),
  ('field-code-long', '00000000-0000-4000-8000-00000000000a', 'Codigo do Cliente', 'codigo do cliente', 'TEXT', CURRENT_TIMESTAMP, NULL),
  ('field-code-short', '00000000-0000-4000-8000-00000000000a', 'Codigo Cliente', 'codigo cliente', 'TEXT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('field-native-name', '00000000-0000-4000-8000-00000000000a', 'Nome', 'nome adicional', 'TEXT', CURRENT_TIMESTAMP, NULL),
  ('field-history-active', '00000000-0000-4000-8000-00000000000a', 'Historico', 'historico', 'TEXT', CURRENT_TIMESTAMP, NULL),
  ('field-history-archived', '00000000-0000-4000-8000-00000000000a', 'Historico', 'historico__archived__fixture', 'TEXT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('field-tenant-b-a', '00000000-0000-4000-8000-00000000000b', 'A', 'a', 'TEXT', CURRENT_TIMESTAMP, NULL);

INSERT INTO "contact_custom_field_values" (
  id, "tenantId", "contactId", "fieldId", value, "updatedAt"
)
VALUES
  ('value-a-ascii', '00000000-0000-4000-8000-00000000000a', 'contact-synthetic-a', 'field-a-ascii', 'valor sintetico 1', CURRENT_TIMESTAMP),
  ('value-a-fullwidth', '00000000-0000-4000-8000-00000000000a', 'contact-synthetic-a', 'field-a-fullwidth', 'valor sintetico 2', CURRENT_TIMESTAMP),
  ('value-code-archived', '00000000-0000-4000-8000-00000000000a', 'contact-synthetic-a', 'field-code-short', 'valor sintetico 3', CURRENT_TIMESTAMP);

SELECT COUNT(*) AS definitions FROM "contact_custom_fields";
SELECT COUNT(*) AS values FROM "contact_custom_field_values";
```

Resultado observado na validação de 06/10/2026: 8 definições e 3 valores inseridos. Após o
preflight bloquear as seis colisões, o estado foi `8|3|0|0|0`: definições, valores, registros da
migração alvo, coluna `variableKey` e índice técnico, respectivamente.
