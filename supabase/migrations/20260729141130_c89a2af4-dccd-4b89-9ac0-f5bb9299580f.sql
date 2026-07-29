
-- Allow authenticated to write to the counter (only from within the function context, but Postgres can't scope that; the function no longer runs as owner)
GRANT INSERT, UPDATE ON public.conversation_protocol_counters TO authenticated;
CREATE POLICY "auth insert counters" ON public.conversation_protocol_counters FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update counters" ON public.conversation_protocol_counters FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Convert to SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.assign_conversation_protocolo(_conversation_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
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
$function$;
