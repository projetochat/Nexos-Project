ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_nivel_gerencia_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_nivel_gerencia_check
  CHECK (nivel_gerencia IS NULL OR nivel_gerencia IN ('Colaborador','Supervisor','Gerente','Diretoria'));