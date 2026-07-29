
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS protocolo TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS public.conversation_protocol_counters (
  ano INTEGER PRIMARY KEY,
  seq INTEGER NOT NULL DEFAULT 0
);
GRANT SELECT ON public.conversation_protocol_counters TO authenticated;
GRANT ALL ON public.conversation_protocol_counters TO service_role;
ALTER TABLE public.conversation_protocol_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read counters" ON public.conversation_protocol_counters FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.assign_conversation_protocolo(_conversation_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing TEXT;
  y INTEGER;
  n INTEGER;
  proto TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT protocolo INTO existing FROM public.conversations WHERE id = _conversation_id;
  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  y := EXTRACT(YEAR FROM now())::INTEGER;

  INSERT INTO public.conversation_protocol_counters (ano, seq)
  VALUES (y, 1)
  ON CONFLICT (ano) DO UPDATE SET seq = public.conversation_protocol_counters.seq + 1
  RETURNING seq INTO n;

  proto := y::TEXT || '.' || LPAD(n::TEXT, 6, '0');
  UPDATE public.conversations SET protocolo = proto WHERE id = _conversation_id;
  RETURN proto;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_conversation_protocolo(UUID) TO authenticated;
