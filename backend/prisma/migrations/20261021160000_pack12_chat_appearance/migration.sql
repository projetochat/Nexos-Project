ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "chat_bubble_color" TEXT,
  ADD COLUMN IF NOT EXISTS "chat_bubble_text_color" TEXT,
  ADD COLUMN IF NOT EXISTS "customer_bubble_color" TEXT,
  ADD COLUMN IF NOT EXISTS "customer_bubble_text_color" TEXT,
  ADD COLUMN IF NOT EXISTS "chat_background_color" TEXT;

COMMENT ON COLUMN "users"."chat_bubble_color" IS
  'Cor individual do balao de mensagem enviada no Chat. NULL preserva o azul oficial Trixus.';
COMMENT ON COLUMN "users"."chat_bubble_text_color" IS
  'Cor de texto calculada/validada para contraste no balao de mensagem enviada.';
