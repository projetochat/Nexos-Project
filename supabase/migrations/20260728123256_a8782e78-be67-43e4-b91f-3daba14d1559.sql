-- 1) INSTANCIAS
CREATE TABLE public.instancias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  provedor TEXT NOT NULL DEFAULT 'evolution',
  telefone TEXT,
  cor TEXT NOT NULL DEFAULT '#6366f1',
  status TEXT NOT NULL DEFAULT 'ativa',
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instancias TO authenticated;
GRANT ALL ON public.instancias TO service_role;
ALTER TABLE public.instancias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read instancias" ON public.instancias FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage instancias" ON public.instancias FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER instancias_touch BEFORE UPDATE ON public.instancias
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- 2) ACCESS PROFILES
CREATE TABLE public.access_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  pode_editar_contato BOOLEAN NOT NULL DEFAULT false,
  pode_editar_vinculo_cliente BOOLEAN NOT NULL DEFAULT false,
  pode_editar_etiquetas BOOLEAN NOT NULL DEFAULT false,
  visualiza_leads BOOLEAN NOT NULL DEFAULT true,
  visualiza_contatos BOOLEAN NOT NULL DEFAULT true,
  visualiza_numero BOOLEAN NOT NULL DEFAULT false,
  excluir_mensagem BOOLEAN NOT NULL DEFAULT false,
  editar_mensagem BOOLEAN NOT NULL DEFAULT false,
  acessa_mensagens_rapidas BOOLEAN NOT NULL DEFAULT true,
  bloquear_contatos BOOLEAN NOT NULL DEFAULT false,
  enviar_audio BOOLEAN NOT NULL DEFAULT true,
  jornada JSONB NOT NULL DEFAULT '{
    "seg":{"ativo":true,"inicio":"08:00","fim":"18:00"},
    "ter":{"ativo":true,"inicio":"08:00","fim":"18:00"},
    "qua":{"ativo":true,"inicio":"08:00","fim":"18:00"},
    "qui":{"ativo":true,"inicio":"08:00","fim":"18:00"},
    "sex":{"ativo":true,"inicio":"08:00","fim":"18:00"},
    "sab":{"ativo":false,"inicio":"08:00","fim":"12:00"},
    "dom":{"ativo":false,"inicio":"08:00","fim":"12:00"}
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_profiles TO authenticated;
GRANT ALL ON public.access_profiles TO service_role;
ALTER TABLE public.access_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read profiles" ON public.access_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage profiles" ON public.access_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER access_profiles_touch BEFORE UPDATE ON public.access_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- 3) JUNCTIONS
CREATE TABLE public.access_profile_instancias (
  profile_id UUID NOT NULL REFERENCES public.access_profiles(id) ON DELETE CASCADE,
  instancia_id UUID NOT NULL REFERENCES public.instancias(id) ON DELETE CASCADE,
  PRIMARY KEY (profile_id, instancia_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_profile_instancias TO authenticated;
GRANT ALL ON public.access_profile_instancias TO service_role;
ALTER TABLE public.access_profile_instancias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read api" ON public.access_profile_instancias FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage api" ON public.access_profile_instancias FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.access_profile_departments (
  profile_id UUID NOT NULL REFERENCES public.access_profiles(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  PRIMARY KEY (profile_id, department_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_profile_departments TO authenticated;
GRANT ALL ON public.access_profile_departments TO service_role;
ALTER TABLE public.access_profile_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read apd" ON public.access_profile_departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage apd" ON public.access_profile_departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) AGENTS.perfil_id
ALTER TABLE public.agents ADD COLUMN perfil_id UUID REFERENCES public.access_profiles(id) ON DELETE SET NULL;

-- 5) Seed default instances (matching contacts.instancia values)
INSERT INTO public.instancias (nome, provedor, telefone, cor) VALUES
  ('FLOWID', 'evolution', NULL, '#3b82f6'),
  ('ZYVO', 'evolution', NULL, '#8b5cf6'),
  ('ENORE', 'evolution', NULL, '#06b6d4')
ON CONFLICT (nome) DO NOTHING;