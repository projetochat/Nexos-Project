-- Keeps the Prisma schema and the persisted enum aligned with the Trixus brand.
ALTER TYPE "MessageReactionActorType" RENAME VALUE 'NEXOS_USER' TO 'TRIXUS_USER';
