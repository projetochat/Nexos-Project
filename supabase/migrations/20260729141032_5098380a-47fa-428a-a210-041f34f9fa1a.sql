
-- 1) agents.email: column-level protection
REVOKE SELECT ON public.agents FROM authenticated;
REVOKE SELECT ON public.agents FROM anon;
GRANT SELECT (id, nome, department_id, status, avatar_url, last_seen, created_at, perfil_id) ON public.agents TO authenticated;

-- 2) departments: remove public/anon read
DROP POLICY IF EXISTS "read depts" ON public.departments;
CREATE POLICY "read depts" ON public.departments FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.departments FROM anon;
REVOKE SELECT ON public.departments FROM public;

-- 3) SECURITY DEFINER functions: restrict EXECUTE
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_conversation_protocolo(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assign_conversation_protocolo(uuid) TO authenticated;
