
-- 1) has_role → SECURITY INVOKER (relies on user_roles own-row SELECT policy)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 2) agents: hide email from generic authenticated reads (self + admin still see email via separate paths)
DROP POLICY IF EXISTS "read agents" ON public.agents;
CREATE POLICY "read agents non-sensitive" ON public.agents
  FOR SELECT TO authenticated USING (true);

-- Column-level: revoke email column from anon/authenticated broad SELECT.
REVOKE SELECT ON public.agents FROM anon;
REVOKE SELECT ON public.agents FROM authenticated;
GRANT SELECT (id, nome, department_id, status, avatar_url, last_seen, created_at) ON public.agents TO authenticated;
-- self can see own email via self-scoped column grant using a view
CREATE OR REPLACE VIEW public.agents_self AS
  SELECT id, nome, email, department_id, status, avatar_url, last_seen, created_at
  FROM public.agents
  WHERE id = auth.uid();
GRANT SELECT ON public.agents_self TO authenticated;

-- 3) contacts: remove anon read; scope writes to admins
DROP POLICY IF EXISTS "read contacts" ON public.contacts;
DROP POLICY IF EXISTS "auth manage contacts" ON public.contacts;
REVOKE SELECT ON public.contacts FROM anon;
GRANT SELECT ON public.contacts TO authenticated;
CREATE POLICY "authenticated read contacts" ON public.contacts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage contacts" ON public.contacts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) conversations: remove public read/write; scope to authenticated
DROP POLICY IF EXISTS "public read conv" ON public.conversations;
DROP POLICY IF EXISTS "public insert conv" ON public.conversations;
DROP POLICY IF EXISTS "auth update conv" ON public.conversations;
REVOKE ALL ON public.conversations FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;

CREATE POLICY "authenticated read conv" ON public.conversations
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR agent_id = auth.uid()
    OR agent_id IS NULL
  );
CREATE POLICY "authenticated insert conv" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update conv" ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR agent_id = auth.uid()
    OR agent_id IS NULL
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR agent_id = auth.uid()
  );

-- 5) messages: remove public read/write; scope to authenticated
DROP POLICY IF EXISTS "public read msgs" ON public.messages;
DROP POLICY IF EXISTS "public insert msgs" ON public.messages;
DROP POLICY IF EXISTS "auth update msgs" ON public.messages;
REVOKE ALL ON public.messages FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;

CREATE POLICY "authenticated read msgs" ON public.messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR c.agent_id = auth.uid()
          OR c.agent_id IS NULL
        )
    )
  );
CREATE POLICY "authenticated insert msgs" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    (sender = 'agent'::public.msg_sender AND author_id = auth.uid())
    OR (sender = 'contact'::public.msg_sender AND author_id IS NULL)
  );
CREATE POLICY "authenticated update msgs own" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR author_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR author_id = auth.uid()
  );

-- 6) tags: scope writes to admin
DROP POLICY IF EXISTS "auth manage tags" ON public.tags;
CREATE POLICY "admin manage tags" ON public.tags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 7) contact_tags: scope writes to admin
DROP POLICY IF EXISTS "auth manage ct" ON public.contact_tags;
CREATE POLICY "admin manage ct" ON public.contact_tags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 8) quick_replies: scope writes to admin
DROP POLICY IF EXISTS "auth manage qr" ON public.quick_replies;
CREATE POLICY "admin manage qr" ON public.quick_replies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
