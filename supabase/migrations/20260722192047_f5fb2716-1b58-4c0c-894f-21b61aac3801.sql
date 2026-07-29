
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'agent');
CREATE TYPE public.conv_status AS ENUM ('aberta', 'em_andamento', 'aguardando', 'fechada');
CREATE TYPE public.msg_sender AS ENUM ('contact', 'agent');
CREATE TYPE public.agent_status AS ENUM ('online', 'ausente', 'offline');

-- ============ USER ROLES + has_role ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- ============ DEPARTMENTS ============
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT '#6366f1',
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
GRANT SELECT ON public.departments TO anon;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read depts" ON public.departments FOR SELECT USING (true);
CREATE POLICY "admin write depts" ON public.departments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ AGENTS ============
CREATE TABLE public.agents (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  status public.agent_status NOT NULL DEFAULT 'offline',
  avatar_url TEXT,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents TO authenticated;
GRANT ALL ON public.agents TO service_role;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read agents" ON public.agents FOR SELECT TO authenticated USING (true);
CREATE POLICY "self update" ON public.agents FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "admin manage agents" ON public.agents FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ CONTACTS ============
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
GRANT SELECT, INSERT ON public.contacts TO anon;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read contacts" ON public.contacts FOR SELECT USING (true);
CREATE POLICY "auth manage contacts" ON public.contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ TAGS ============
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read tags" ON public.tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manage tags" ON public.tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.contact_tags (
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_tags TO authenticated;
GRANT ALL ON public.contact_tags TO service_role;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read ct" ON public.contact_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manage ct" ON public.contact_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ CONVERSATIONS ============
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  status public.conv_status NOT NULL DEFAULT 'aberta',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.conversations TO anon;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
-- Simulador (anon) precisa criar/ler conversas
CREATE POLICY "public read conv" ON public.conversations FOR SELECT USING (true);
CREATE POLICY "public insert conv" ON public.conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "auth update conv" ON public.conversations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin delete conv" ON public.conversations FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ============ MESSAGES ============
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender public.msg_sender NOT NULL,
  author_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
GRANT SELECT, INSERT ON public.messages TO anon;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read msgs" ON public.messages FOR SELECT USING (true);
CREATE POLICY "public insert msgs" ON public.messages FOR INSERT WITH CHECK (true);
CREATE POLICY "auth update msgs" ON public.messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============ QUICK REPLIES ============
CREATE TABLE public.quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atalho TEXT NOT NULL,
  texto TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_replies TO authenticated;
GRANT ALL ON public.quick_replies TO service_role;
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read qr" ON public.quick_replies FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manage qr" ON public.quick_replies FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.bump_conversation_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_bump_conv AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_on_message();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  default_dept UUID;
  is_admin BOOLEAN;
BEGIN
  SELECT id INTO default_dept FROM public.departments ORDER BY created_at LIMIT 1;
  is_admin := COALESCE((NEW.raw_user_meta_data->>'role') = 'admin', false);
  INSERT INTO public.agents (id, nome, email, department_id, status)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)), NEW.email, default_dept, 'offline');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, CASE WHEN is_admin THEN 'admin'::public.app_role ELSE 'agent'::public.app_role END);
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ REALTIME ============
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.agents REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agents;

-- ============ VIEW: report_first_response ============
CREATE OR REPLACE VIEW public.report_first_response WITH (security_invoker=on) AS
SELECT
  c.id AS conversation_id,
  c.department_id,
  c.agent_id,
  MIN(CASE WHEN m.sender='contact' THEN m.created_at END) AS first_contact_at,
  MIN(CASE WHEN m.sender='agent' THEN m.created_at END) AS first_agent_at,
  EXTRACT(EPOCH FROM (MIN(CASE WHEN m.sender='agent' THEN m.created_at END) - MIN(CASE WHEN m.sender='contact' THEN m.created_at END))) AS first_response_seconds
FROM public.conversations c
LEFT JOIN public.messages m ON m.conversation_id = c.id
GROUP BY c.id, c.department_id, c.agent_id;
GRANT SELECT ON public.report_first_response TO authenticated;

-- ============ SEEDS ============
INSERT INTO public.departments (id, nome, cor, descricao) VALUES
  ('11111111-1111-1111-1111-111111111111','Geral','#6366f1','Fila padrão de entrada'),
  ('22222222-2222-2222-2222-222222222222','Suporte','#06b6d4','Suporte técnico e pós-venda'),
  ('33333333-3333-3333-3333-333333333333','Comercial','#a855f7','Vendas e propostas');

INSERT INTO public.contacts (id, nome, telefone, avatar_url) VALUES
  ('c0000000-0000-0000-0000-000000000001','Marina Souza','+55 11 98800-0001',NULL),
  ('c0000000-0000-0000-0000-000000000002','Rafael Lima','+55 11 98800-0002',NULL),
  ('c0000000-0000-0000-0000-000000000003','Juliana Prado','+55 21 97700-0003',NULL),
  ('c0000000-0000-0000-0000-000000000004','Diego Barbosa','+55 31 96600-0004',NULL),
  ('c0000000-0000-0000-0000-000000000005','Patrícia Nunes','+55 41 95500-0005',NULL),
  ('c0000000-0000-0000-0000-000000000006','Eduardo Freitas','+55 51 94400-0006',NULL),
  ('c0000000-0000-0000-0000-000000000007','Camila Rocha','+55 61 93300-0007',NULL),
  ('c0000000-0000-0000-0000-000000000008','Thiago Menezes','+55 71 92200-0008',NULL);

INSERT INTO public.tags (nome, cor) VALUES
  ('VIP','#a855f7'),('Prospect','#06b6d4'),('Urgente','#ef4444'),('Follow-up','#f59e0b'),('Parceiro','#22c55e');

INSERT INTO public.quick_replies (atalho, texto, department_id) VALUES
  ('/ola','Olá! Como posso ajudar você hoje?', NULL),
  ('/aguarde','Só um momento, estou verificando isso para você.', NULL),
  ('/obrigado','Obrigado pelo contato! Tenha um ótimo dia.', NULL),
  ('/suporte','Vou te encaminhar para o time de Suporte.', '22222222-2222-2222-2222-222222222222'),
  ('/proposta','Já vou preparar uma proposta comercial para você.', '33333333-3333-3333-3333-333333333333');
