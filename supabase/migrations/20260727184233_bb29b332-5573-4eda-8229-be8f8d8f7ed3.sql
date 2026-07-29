ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS contato_responsavel TEXT;

UPDATE public.customers c
SET contato_responsavel = ct.nome
FROM public.contacts ct
WHERE c.contato_responsavel_id = ct.id
  AND c.contato_responsavel IS NULL;

ALTER TABLE public.customers DROP COLUMN IF EXISTS contato_responsavel_id;