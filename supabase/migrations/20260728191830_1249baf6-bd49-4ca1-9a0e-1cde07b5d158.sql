CREATE TABLE public.chamados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero BIGSERIAL NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('Suporte','DEV')),
  status TEXT NOT NULL DEFAULT 'Novo' CHECK (status IN ('Novo','Iniciado','Pendente','Solucionado','Finalizado')),
  titulo TEXT NOT NULL,
  cliente_id UUID,
  cliente_nome TEXT NOT NULL,
  solicitante_id UUID,
  solicitante_nome TEXT NOT NULL,
  departamento_id UUID,
  departamento_nome TEXT NOT NULL,
  descricao_html TEXT NOT NULL,
  aberto_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_abertura_id UUID,
  usuario_abertura_nome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chamados TO authenticated;
GRANT ALL ON public.chamados TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.chamados_numero_seq TO authenticated;
GRANT ALL ON SEQUENCE public.chamados_numero_seq TO service_role;
ALTER TABLE public.chamados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read chamados" ON public.chamados FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert chamados" ON public.chamados FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update chamados" ON public.chamados FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "admin delete chamados" ON public.chamados FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER chamados_touch_updated_at BEFORE UPDATE ON public.chamados FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE INDEX chamados_numero_idx ON public.chamados (numero DESC);
CREATE INDEX chamados_created_at_idx ON public.chamados (created_at DESC);