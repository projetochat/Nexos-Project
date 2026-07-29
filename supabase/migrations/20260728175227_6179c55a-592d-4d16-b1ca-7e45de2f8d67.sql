ALTER TABLE public.instancias
  ADD COLUMN IF NOT EXISTS mensagem_novo_contato TEXT,
  ADD COLUMN IF NOT EXISTS mensagem_contato_existente TEXT;