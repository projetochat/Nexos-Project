
-- Make self view invoker-based
ALTER VIEW public.agents_self SET (security_invoker = true);

-- Lock down trigger functions from Data API
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_conversation_on_message() FROM PUBLIC, anon, authenticated;

-- Tighten insert conv policy (remove WITH CHECK true)
DROP POLICY IF EXISTS "authenticated insert conv" ON public.conversations;
CREATE POLICY "authenticated insert conv" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    agent_id IS NULL OR agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
