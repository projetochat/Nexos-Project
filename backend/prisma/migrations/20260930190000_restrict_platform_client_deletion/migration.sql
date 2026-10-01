-- Preserve the historical client link once a subscription has used it.
ALTER TABLE "tenant_subscriptions"
DROP CONSTRAINT "tenant_subscriptions_clientId_fkey";

ALTER TABLE "tenant_subscriptions"
ADD CONSTRAINT "tenant_subscriptions_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "platform_clients"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
