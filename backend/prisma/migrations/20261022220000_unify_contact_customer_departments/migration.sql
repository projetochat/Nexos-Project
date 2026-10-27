BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- CustomerDepartment becomes the canonical organizational department for contacts.
-- Only unambiguous matches inside the same tenant and customer are backfilled.
-- The legacy contact department remains available for historical compatibility.
-- First remove pre-existing canonical links that point to a department owned by
-- another customer (or tenant), so they can participate in the safe backfill.
UPDATE contacts c
SET "customerDepartmentId" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE c."customerDepartmentId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM customer_departments cd
    WHERE cd.id = c."customerDepartmentId"
      AND cd."tenantId" = c."tenantId"
      AND cd."customerId" = c."customerId"
  );

WITH candidates AS (
  SELECT
    c.id AS contact_id,
    MIN(cd.id) AS customer_department_id
  FROM contacts c
  LEFT JOIN contact_departments legacy
    ON legacy.id = c."contactDepartmentId"
   AND legacy."tenantId" = c."tenantId"
   AND legacy."archivedAt" IS NULL
  JOIN customer_departments cd
    ON cd."tenantId" = c."tenantId"
   AND cd."customerId" = c."customerId"
   AND cd."archivedAt" IS NULL
   AND cd.active = TRUE
   AND LOWER(REGEXP_REPLACE(TRIM(cd.name), '\s+', ' ', 'g')) =
       LOWER(REGEXP_REPLACE(TRIM(COALESCE(legacy.name, c."departmentName")), '\s+', ' ', 'g'))
  WHERE c."archivedAt" IS NULL
    AND c."customerId" IS NOT NULL
    AND c."customerDepartmentId" IS NULL
    AND COALESCE(legacy.name, c."departmentName") IS NOT NULL
  GROUP BY c.id
  HAVING COUNT(cd.id) = 1
)
UPDATE contacts c
SET "customerDepartmentId" = candidates.customer_department_id,
    "updatedAt" = CURRENT_TIMESTAMP
FROM candidates
WHERE c.id = candidates.contact_id;

CREATE UNIQUE INDEX IF NOT EXISTS "customer_departments_tenant_customer_id_key"
  ON customer_departments ("tenantId", "customerId", id);

ALTER TABLE contacts
  ADD CONSTRAINT "contacts_customer_department_owner_fkey"
  FOREIGN KEY ("tenantId", "customerId", "customerDepartmentId")
  REFERENCES customer_departments ("tenantId", "customerId", id)
  ON UPDATE CASCADE
  ON DELETE NO ACTION
  NOT VALID;

ALTER TABLE contacts
  VALIDATE CONSTRAINT "contacts_customer_department_owner_fkey";

COMMIT;
