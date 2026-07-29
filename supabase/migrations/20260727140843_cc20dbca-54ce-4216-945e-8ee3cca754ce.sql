
-- customers
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  telefone text,
  empresa text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manage customers" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER customers_touch BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- contacts: link to customers + allow atendentes to insert/update
ALTER TABLE public.contacts ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE POLICY "auth insert contacts" ON public.contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update contacts" ON public.contacts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- contact_tags: allow atendentes to add/remove tags on contacts
CREATE POLICY "auth manage ct" ON public.contact_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- tags: allow atendentes to create tags
CREATE POLICY "auth manage tags" ON public.tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- conversations: is_group
ALTER TABLE public.conversations ADD COLUMN is_group boolean NOT NULL DEFAULT false;

-- messages: type + media + duration
CREATE TYPE public.msg_type AS ENUM ('text','audio','image','system');
ALTER TABLE public.messages ADD COLUMN type public.msg_type NOT NULL DEFAULT 'text';
ALTER TABLE public.messages ADD COLUMN media_data text;
ALTER TABLE public.messages ADD COLUMN duration_ms integer;

-- allow marking messages read by anyone who can view them
CREATE POLICY "auth mark msgs read" ON public.messages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (has_role(auth.uid(),'admin'::app_role) OR c.agent_id = auth.uid() OR c.agent_id IS NULL)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (has_role(auth.uid(),'admin'::app_role) OR c.agent_id = auth.uid() OR c.agent_id IS NULL)));

-- quick_replies: personal ownership
ALTER TABLE public.quick_replies ADD COLUMN agent_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE POLICY "auth manage own qr" ON public.quick_replies FOR ALL TO authenticated
  USING (agent_id = auth.uid() OR agent_id IS NULL OR has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (agent_id = auth.uid() OR agent_id IS NULL OR has_role(auth.uid(),'admin'::app_role));

-- reopen conversation on new contact message
CREATE OR REPLACE FUNCTION public.reopen_on_contact_message()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.sender = 'contact' THEN
    UPDATE public.conversations
    SET status = CASE WHEN status = 'fechada' THEN 'aberta'::conv_status ELSE status END
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER reopen_on_contact_msg AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.reopen_on_contact_message();
