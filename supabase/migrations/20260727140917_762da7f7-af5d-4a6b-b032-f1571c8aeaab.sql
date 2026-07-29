
DROP POLICY IF EXISTS "auth manage customers" ON public.customers;
CREATE POLICY "auth manage customers" ON public.customers FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth insert contacts" ON public.contacts;
CREATE POLICY "auth insert contacts" ON public.contacts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth update contacts" ON public.contacts;
CREATE POLICY "auth update contacts" ON public.contacts FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth manage ct" ON public.contact_tags;
CREATE POLICY "auth manage ct" ON public.contact_tags FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth manage tags" ON public.tags;
CREATE POLICY "auth manage tags" ON public.tags FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
