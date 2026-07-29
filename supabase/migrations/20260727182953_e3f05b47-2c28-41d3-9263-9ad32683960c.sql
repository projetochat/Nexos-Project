ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS contato_responsavel_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;