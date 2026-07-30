ALTER TABLE "conversations" DROP CONSTRAINT "conversations_tenantId_connectionId_fkey";
ALTER TABLE "messages" DROP CONSTRAINT "messages_tenantId_connectionId_fkey";

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenantId_connectionId_fkey" FOREIGN KEY ("tenantId", "connectionId") REFERENCES "messaging_connections"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenantId_connectionId_fkey" FOREIGN KEY ("tenantId", "connectionId") REFERENCES "messaging_connections"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
