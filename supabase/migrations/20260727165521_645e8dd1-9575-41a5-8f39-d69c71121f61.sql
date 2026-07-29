DROP POLICY IF EXISTS "authenticated update conv" ON public.conversations;

CREATE POLICY "authenticated update conv"
  ON public.conversations
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (agent_id = auth.uid())
    OR (agent_id IS NULL)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (agent_id = auth.uid())
    OR (agent_id IS NULL)
  );