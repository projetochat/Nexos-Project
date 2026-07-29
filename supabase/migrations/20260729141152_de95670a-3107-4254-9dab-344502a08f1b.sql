
DROP POLICY IF EXISTS "auth insert counters" ON public.conversation_protocol_counters;
DROP POLICY IF EXISTS "auth update counters" ON public.conversation_protocol_counters;
CREATE POLICY "auth insert counters" ON public.conversation_protocol_counters FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update counters" ON public.conversation_protocol_counters FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
