-- Preserve the existing image background for every current user.
ALTER TABLE "users"
  ADD COLUMN "chat_background_mode" TEXT NOT NULL DEFAULT 'IMAGE';

ALTER TABLE "users"
  ADD CONSTRAINT "users_chat_background_mode_check"
  CHECK ("chat_background_mode" IN ('IMAGE', 'COLOR'));
