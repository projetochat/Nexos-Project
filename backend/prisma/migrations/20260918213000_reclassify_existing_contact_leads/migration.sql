-- Remove WhatsApp leads that were created for contacts already registered
-- before the conversation started. Contacts first discovered by the same
-- inbound conversation share its transaction timestamp and remain leads.
DELETE FROM "notifications" AS notification
WHERE notification."kind" = 'LEAD_CREATED'
  AND notification."entityType" = 'lead'
  AND EXISTS (
    SELECT 1
    FROM "leads" AS lead
    INNER JOIN "contacts" AS contact
      ON contact."tenantId" = lead."tenantId"
     AND contact."id" = lead."contactId"
    INNER JOIN "conversations" AS conversation
      ON conversation."tenantId" = lead."tenantId"
     AND conversation."id" = lead."conversationId"
    WHERE lead."id" = notification."entityId"
      AND lead."source" = 'WHATSAPP'
      AND lead."status" IN ('NEW', 'QUEUED')
      AND contact."createdAt" < conversation."createdAt"
  );

DELETE FROM "leads" AS lead
USING "contacts" AS contact, "conversations" AS conversation
WHERE contact."tenantId" = lead."tenantId"
  AND contact."id" = lead."contactId"
  AND conversation."tenantId" = lead."tenantId"
  AND conversation."id" = lead."conversationId"
  AND lead."source" = 'WHATSAPP'
  AND lead."status" IN ('NEW', 'QUEUED')
  AND contact."createdAt" < conversation."createdAt";
