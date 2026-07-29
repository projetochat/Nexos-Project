ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS departamento text,
  ADD COLUMN IF NOT EXISTS nivel_gerencia text CHECK (nivel_gerencia IN ('Departamento','Geral'));