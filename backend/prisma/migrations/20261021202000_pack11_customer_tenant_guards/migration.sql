BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- PACK 11 already created these constraints in environments that received the
-- original migrations. This forward migration only repairs constraints that
-- are absent, so it is safe for HML, production and a fresh database.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.customer_departments'::regclass
      AND conname = 'customer_departments_tenantId_managerContactId_guard_fkey'
  ) THEN
    ALTER TABLE "customer_departments"
      ADD CONSTRAINT "customer_departments_tenantId_managerContactId_guard_fkey"
      FOREIGN KEY ("tenantId", "managerContactId")
      REFERENCES "contacts"("tenantId", "id")
      ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.contacts'::regclass
      AND conname = 'contacts_tenantId_customerBranchId_guard_fkey'
  ) THEN
    ALTER TABLE "contacts"
      ADD CONSTRAINT "contacts_tenantId_customerBranchId_guard_fkey"
      FOREIGN KEY ("tenantId", "customerBranchId")
      REFERENCES "customer_branches"("tenantId", "id")
      ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.contacts'::regclass
      AND conname = 'contacts_tenantId_customerDepartmentId_guard_fkey'
  ) THEN
    ALTER TABLE "contacts"
      ADD CONSTRAINT "contacts_tenantId_customerDepartmentId_guard_fkey"
      FOREIGN KEY ("tenantId", "customerDepartmentId")
      REFERENCES "customer_departments"("tenantId", "id")
      ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ticket_approvals'::regclass
      AND conname = 'ticket_approvals_requestCommentId_fkey'
  ) THEN
    ALTER TABLE "ticket_approvals"
      ADD CONSTRAINT "ticket_approvals_requestCommentId_fkey"
      FOREIGN KEY ("requestCommentId")
      REFERENCES "ticket_comments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ticket_approvals'::regclass
      AND conname = 'ticket_approvals_decisionCommentId_fkey'
  ) THEN
    ALTER TABLE "ticket_approvals"
      ADD CONSTRAINT "ticket_approvals_decisionCommentId_fkey"
      FOREIGN KEY ("decisionCommentId")
      REFERENCES "ticket_comments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tickets'::regclass
      AND conname = 'tickets_tenantId_customerDepartmentId_guard_fkey'
  ) THEN
    ALTER TABLE "tickets"
      ADD CONSTRAINT "tickets_tenantId_customerDepartmentId_guard_fkey"
      FOREIGN KEY ("tenantId", "customerDepartmentId")
      REFERENCES "customer_departments"("tenantId", "id")
      ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tickets'::regclass
      AND conname = 'tickets_tenantId_originBranchId_guard_fkey'
  ) THEN
    ALTER TABLE "tickets"
      ADD CONSTRAINT "tickets_tenantId_originBranchId_guard_fkey"
      FOREIGN KEY ("tenantId", "originBranchId")
      REFERENCES "customer_branches"("tenantId", "id")
      ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ticket_approvals'::regclass
      AND conname = 'ticket_approvals_tenantId_requestedByMembershipId_guard_fkey'
  ) THEN
    ALTER TABLE "ticket_approvals"
      ADD CONSTRAINT "ticket_approvals_tenantId_requestedByMembershipId_guard_fkey"
      FOREIGN KEY ("tenantId", "requestedByMembershipId")
      REFERENCES "tenant_memberships"("tenantId", "id")
      ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ticket_approvals'::regclass
      AND conname = 'ticket_approvals_tenantId_approverMembershipId_guard_fkey'
  ) THEN
    ALTER TABLE "ticket_approvals"
      ADD CONSTRAINT "ticket_approvals_tenantId_approverMembershipId_guard_fkey"
      FOREIGN KEY ("tenantId", "approverMembershipId")
      REFERENCES "tenant_memberships"("tenantId", "id")
      ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ticket_approvals'::regclass
      AND conname = 'ticket_approvals_tenantId_decidedByMembershipId_guard_fkey'
  ) THEN
    ALTER TABLE "ticket_approvals"
      ADD CONSTRAINT "ticket_approvals_tenantId_decidedByMembershipId_guard_fkey"
      FOREIGN KEY ("tenantId", "decidedByMembershipId")
      REFERENCES "tenant_memberships"("tenantId", "id")
      ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ticket_approvals'::regclass
      AND conname = 'ticket_approvals_tenantId_approverContactId_guard_fkey'
  ) THEN
    ALTER TABLE "ticket_approvals"
      ADD CONSTRAINT "ticket_approvals_tenantId_approverContactId_guard_fkey"
      FOREIGN KEY ("tenantId", "approverContactId")
      REFERENCES "contacts"("tenantId", "id")
      ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ticket_approvals'::regclass
      AND conname = 'ticket_approvals_tenantId_requestCommentId_guard_fkey'
  ) THEN
    ALTER TABLE "ticket_approvals"
      ADD CONSTRAINT "ticket_approvals_tenantId_requestCommentId_guard_fkey"
      FOREIGN KEY ("tenantId", "requestCommentId")
      REFERENCES "ticket_comments"("tenantId", "id")
      ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ticket_approvals'::regclass
      AND conname = 'ticket_approvals_tenantId_decisionCommentId_guard_fkey'
  ) THEN
    ALTER TABLE "ticket_approvals"
      ADD CONSTRAINT "ticket_approvals_tenantId_decisionCommentId_guard_fkey"
      FOREIGN KEY ("tenantId", "decisionCommentId")
      REFERENCES "ticket_comments"("tenantId", "id")
      ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.contacts'::regclass
      AND conname = 'contacts_tenantId_portalMembershipId_guard_fkey'
  ) THEN
    ALTER TABLE "contacts"
      ADD CONSTRAINT "contacts_tenantId_portalMembershipId_guard_fkey"
      FOREIGN KEY ("tenantId", "portalMembershipId")
      REFERENCES "tenant_memberships"("tenantId", "id")
      ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_invitations'::regclass
      AND conname = 'user_invitations_tenantId_contactId_guard_fkey'
  ) THEN
    ALTER TABLE "user_invitations"
      ADD CONSTRAINT "user_invitations_tenantId_contactId_guard_fkey"
      FOREIGN KEY ("tenantId", "contactId")
      REFERENCES "contacts"("tenantId", "id")
      ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
END
$migration$;

COMMIT;
