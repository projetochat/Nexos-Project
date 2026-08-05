import { supabase } from "@/integrations/supabase/client";

/* ============================================================
   Nexo · MVP data layer (Supabase)
   ============================================================ */

export type ConvStatus = "aberta" | "em_andamento" | "aguardando" | "fechada";
export type MsgSender = "contact" | "agent";
export type MsgType = "text" | "audio" | "image" | "system";

export type Contact = {
  id: string;
  nome: string;
  telefone: string;
  avatar_url: string | null;
  customer_id?: string | null;
  email?: string | null;
  departamento?: string | null;
  nivel_gerencia?: "Colaborador" | "Supervisor" | "Gerente" | "Diretoria" | null;
  instancia?: string | null;
};
export type Department = { id: string; nome: string; cor: string; descricao: string | null };
export type AgentRow = {
  id: string;
  nome: string;
  email: string;
  department_id: string | null;
  status: string;
};
export type Tag = { id: string; nome: string; cor: string };
export type Customer = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;

  notas: string | null;
  contato_responsavel?: string | null;
  cor?: string | null;
};
export type QuickReply = {
  id: string;
  atalho: string;
  texto: string;
  agent_id: string | null;
  department_id: string | null;
  close_on_send: boolean;
};
export type Message = {
  id: string;
  conversation_id: string;
  sender: MsgSender;
  author_id: string | null;
  content: string;
  created_at: string;
  read_at: string | null;
  type: MsgType;
  media_data: string | null;
  duration_ms: number | null;
};
export type ConversationRow = {
  id: string;
  contact_id: string;
  department_id: string | null;
  agent_id: string | null;
  status: ConvStatus;
  is_group: boolean;
  created_at: string;
  last_message_at: string;
  protocolo: string | null;
  contact: Contact | null;
  department: Department | null;
  agent: { id: string; nome: string } | null;
};

export const CATALOG = {
  async contacts(): Promise<Contact[]> {
    const { data, error } = await supabase
      .from("contacts")
      .select(
        "id, nome, telefone, avatar_url, customer_id, email, departamento, nivel_gerencia, instancia",
      )
      .order("nome");
    if (error) throw error;
    return (data as Contact[]) ?? [];
  },
  async departments(): Promise<Department[]> {
    const { data, error } = await supabase.from("departments").select("*").order("nome");
    if (error) throw error;
    return data ?? [];
  },
  async agents(): Promise<AgentRow[]> {
    const { data, error } = await supabase
      .from("agents")
      .select("id, nome, department_id, status")
      .order("nome");
    if (error) throw error;
    return (data as AgentRow[]) ?? [];
  },
  async tags(): Promise<Tag[]> {
    const { data, error } = await supabase.from("tags").select("*").order("nome");
    if (error) throw error;
    return (data as Tag[]) ?? [];
  },
};

export const CUSTOMERS = {
  async list(q?: string): Promise<Customer[]> {
    let query = supabase.from("customers").select("*").order("nome").limit(500);
    if (q) query = query.ilike("nome", `%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    return (data as unknown as Customer[]) ?? [];
  },
  async getById(id: string): Promise<Customer | null> {
    const { data, error } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as Customer) ?? null;
  },
  async create(input: Partial<Customer> & { nome: string }): Promise<Customer> {
    const { data, error } = await supabase
      .from("customers")
      .insert(input as never)
      .select("*")
      .single();
    if (error) throw error;
    return data as Customer;
  },
  async update(id: string, patch: Partial<Customer>): Promise<Customer> {
    const { data, error } = await supabase
      .from("customers")
      .update(patch as never)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as Customer;
  },
  async remove(id: string): Promise<void> {
    // Desvincula contatos antes de excluir
    await supabase
      .from("contacts")
      .update({ customer_id: null } as never)
      .eq("customer_id", id);
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) throw error;
  },
  async contactsOf(customerId: string): Promise<Contact[]> {
    const { data, error } = await supabase
      .from("contacts")
      .select(
        "id, nome, telefone, avatar_url, customer_id, email, departamento, nivel_gerencia, instancia",
      )
      .eq("customer_id", customerId)
      .order("nome");
    if (error) throw error;
    return (data as Contact[]) ?? [];
  },
};

export type ContactWithCustomer = Contact & {
  customer: Pick<Customer, "id" | "nome" | "cor"> | null;
};

export const CONTACTS = {
  async list(q?: string): Promise<ContactWithCustomer[]> {
    let query = supabase
      .from("contacts")
      .select(
        "id, nome, telefone, avatar_url, customer_id, email, departamento, nivel_gerencia, instancia, customer:customers(id, nome, cor)",
      )
      .order("nome")
      .limit(500);
    if (q) query = query.or(`nome.ilike.%${q}%,telefone.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    return (data as unknown as ContactWithCustomer[]) ?? [];
  },
  async create(input: {
    nome: string;
    telefone: string;
    customer_id?: string | null;
    email?: string | null;
    departamento?: string | null;
    nivel_gerencia?: "Colaborador" | "Supervisor" | "Gerente" | "Diretoria" | null;
    instancia?: string | null;
  }): Promise<Contact> {
    const { data, error } = await supabase
      .from("contacts")
      .insert(input as never)
      .select(
        "id, nome, telefone, avatar_url, customer_id, email, departamento, nivel_gerencia, instancia",
      )
      .single();
    if (error) throw error;
    return data as Contact;
  },
  async update(id: string, patch: Partial<Contact>): Promise<Contact> {
    const { data, error } = await supabase
      .from("contacts")
      .update(patch as never)
      .eq("id", id)
      .select(
        "id, nome, telefone, avatar_url, customer_id, email, departamento, nivel_gerencia, instancia",
      )
      .single();
    if (error) throw error;
    return data as Contact;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) throw error;
  },
  async setCustomer(contactId: string, customerId: string | null): Promise<void> {
    const { error } = await supabase
      .from("contacts")
      .update({ customer_id: customerId } as never)
      .eq("id", contactId);
    if (error) throw error;
  },
  async tags(contactId: string): Promise<Tag[]> {
    const { data, error } = await supabase
      .from("contact_tags")
      .select("tags(id, nome, cor)")
      .eq("contact_id", contactId);
    if (error) throw error;
    return (data ?? []).map((r: { tags: Tag | null }) => r.tags).filter(Boolean) as Tag[];
  },
  async addTag(contactId: string, tagId: string): Promise<void> {
    const { error } = await supabase
      .from("contact_tags")
      .insert({ contact_id: contactId, tag_id: tagId } as never);
    if (error && !`${error.message}`.includes("duplicate")) throw error;
  },
  async removeTag(contactId: string, tagId: string): Promise<void> {
    const { error } = await supabase
      .from("contact_tags")
      .delete()
      .eq("contact_id", contactId)
      .eq("tag_id", tagId);
    if (error) throw error;
  },
};

export const TAGS = {
  async create(input: { nome: string; cor: string }): Promise<Tag> {
    const { data, error } = await supabase
      .from("tags")
      .insert(input as never)
      .select("*")
      .single();
    if (error) throw error;
    return data as Tag;
  },
};

export const QUICK_REPLIES = {
  async mine(): Promise<QuickReply[]> {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    const { data, error } = await supabase
      .from("quick_replies")
      .select("id, atalho, texto, agent_id, department_id, close_on_send")
      .or(uid ? `agent_id.eq.${uid},agent_id.is.null` : "agent_id.is.null")
      .order("atalho");
    if (error) throw error;
    return (data as QuickReply[]) ?? [];
  },
  async listAll(): Promise<QuickReply[]> {
    const { data, error } = await supabase
      .from("quick_replies")
      .select("id, atalho, texto, agent_id, department_id, close_on_send")
      .order("atalho");
    if (error) throw error;
    return (data as QuickReply[]) ?? [];
  },
  async create(input: {
    atalho: string;
    texto: string;
    close_on_send?: boolean;
  }): Promise<QuickReply> {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    const { data, error } = await supabase
      .from("quick_replies")
      .insert({ ...input, agent_id: uid } as never)
      .select("id, atalho, texto, agent_id, department_id, close_on_send")
      .single();
    if (error) throw error;
    return data as QuickReply;
  },
  async update(
    id: string,
    patch: Partial<Pick<QuickReply, "atalho" | "texto" | "close_on_send">>,
  ): Promise<void> {
    const { error } = await supabase
      .from("quick_replies")
      .update(patch as never)
      .eq("id", id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("quick_replies").delete().eq("id", id);
    if (error) throw error;
  },
};

export const CONV = {
  async list(): Promise<ConversationRow[]> {
    const { data, error } = await supabase
      .from("conversations")
      .select(
        "id, contact_id, department_id, agent_id, status, is_group, created_at, last_message_at, protocolo, contact:contacts(id,nome,telefone,avatar_url,customer_id,instancia,customer:customers(id,nome,cor)), department:departments(id,nome,cor,descricao), agent:agents(id,nome)",
      )
      .order("last_message_at", { ascending: false });
    if (error) throw error;
    return (data as unknown as ConversationRow[]) ?? [];
  },
  async messages(conversationId: string): Promise<Message[]> {
    const { data, error } = await supabase
      .from("messages")
      .select(
        "id, conversation_id, sender, author_id, content, created_at, read_at, type, media_data, duration_ms",
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data as Message[]) ?? [];
  },
  async unreadCounts(): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from("messages")
      .select("conversation_id")
      .eq("sender", "contact")
      .is("read_at", null);
    if (error) throw error;
    const map: Record<string, number> = {};
    (data ?? []).forEach((r: { conversation_id: string }) => {
      map[r.conversation_id] = (map[r.conversation_id] ?? 0) + 1;
    });
    return map;
  },
  async markRead(conversationId: string): Promise<void> {
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() } as never)
      .eq("conversation_id", conversationId)
      .eq("sender", "contact")
      .is("read_at", null);
  },
  async sendAgentMessage(conversationId: string, content: string, authorId: string): Promise<void> {
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: "agent",
      author_id: authorId,
      content,
      type: "text",
    } as never);
    if (error) throw error;
    await supabase
      .from("conversations")
      .update({ agent_id: authorId, status: "em_andamento" as ConvStatus } as never)
      .eq("id", conversationId)
      .is("agent_id", null);
  },
  async sendAgentMedia(
    conversationId: string,
    authorId: string,
    kind: "audio" | "image",
    dataUrl: string,
    opts?: { caption?: string; durationMs?: number },
  ): Promise<void> {
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: "agent",
      author_id: authorId,
      content: opts?.caption ?? (kind === "audio" ? "[áudio]" : "[imagem]"),
      type: kind,
      media_data: dataUrl,
      duration_ms: opts?.durationMs ?? null,
    } as never);
    if (error) throw error;
  },
  async sendSystem(conversationId: string, authorId: string, content: string): Promise<void> {
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: "agent",
      author_id: authorId,
      content,
      type: "system",
    } as never);
    if (error) throw error;
  },
  async startWithAgent(input: {
    contactId: string;
    agentId: string;
    departmentId?: string | null;
    firstMessage: string;
  }): Promise<string> {
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", input.contactId)
      .neq("status", "fechada")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let convId = existing?.id as string | undefined;
    if (!convId) {
      let deptId = input.departmentId ?? null;
      if (!deptId) {
        const { data: dep } = await supabase
          .from("departments")
          .select("id")
          .order("created_at")
          .limit(1)
          .maybeSingle();
        deptId = (dep?.id as string | undefined) ?? null;
      }
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          contact_id: input.contactId,
          department_id: deptId,
          agent_id: input.agentId,
          status: "em_andamento" as ConvStatus,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      convId = data.id as string;
    } else {
      await supabase
        .from("conversations")
        .update({ agent_id: input.agentId, status: "em_andamento" as ConvStatus } as never)
        .eq("id", convId);
    }
    const { error: mErr } = await supabase.from("messages").insert({
      conversation_id: convId,
      sender: "agent",
      author_id: input.agentId,
      content: input.firstMessage,
      type: "text",
    } as never);
    if (mErr) throw mErr;
    await supabase.rpc(
      "assign_conversation_protocolo" as never,
      { _conversation_id: convId } as never,
    );
    return convId!;
  },
  async assume(conversationId: string, agentId: string): Promise<void> {
    const { error } = await supabase
      .from("conversations")
      .update({ agent_id: agentId, status: "em_andamento" as ConvStatus } as never)
      .eq("id", conversationId);
    if (error) throw error;
    await supabase.rpc(
      "assign_conversation_protocolo" as never,
      { _conversation_id: conversationId } as never,
    );
  },
  async transferAgent(
    conversationId: string,
    agentId: string,
    systemNote?: { authorId: string; text: string },
  ): Promise<void> {
    const { error } = await supabase
      .from("conversations")
      .update({ agent_id: agentId, status: "em_andamento" as ConvStatus } as never)
      .eq("id", conversationId);
    if (error) throw error;
    if (systemNote) {
      await CONV.sendSystem(conversationId, systemNote.authorId, systemNote.text);
    }
  },
  async moveDepartment(conversationId: string, departmentId: string): Promise<void> {
    const { error } = await supabase
      .from("conversations")
      .update({ department_id: departmentId } as never)
      .eq("id", conversationId);
    if (error) throw error;
  },
  async close(
    conversationId: string,
    systemNote?: { authorId: string; text: string },
  ): Promise<void> {
    const { error } = await supabase
      .from("conversations")
      .update({ status: "fechada" as ConvStatus } as never)
      .eq("id", conversationId);
    if (error) throw error;
    if (systemNote) await CONV.sendSystem(conversationId, systemNote.authorId, systemNote.text);
  },
  async setStatus(conversationId: string, status: ConvStatus): Promise<void> {
    const { error } = await supabase
      .from("conversations")
      .update({ status } as never)
      .eq("id", conversationId);
    if (error) throw error;
  },
};

export type PeriodKey = "hoje" | "ontem" | "semana" | "mes" | "mes_passado" | "ano" | "geral";
export type ReportFilters = {
  period: PeriodKey;
  instancia: string; // "all" or instance name
  clienteId: string; // "all" or uuid
  departamentoId: string; // "all" or uuid
};

export const DEFAULT_REPORT_FILTERS: ReportFilters = {
  period: "hoje",
  instancia: "all",
  clienteId: "all",
  departamentoId: "all",
};

export function periodRange(p: PeriodKey): { from: Date | null; to: Date | null } {
  const now = new Date();
  const s = new Date(now);
  s.setHours(0, 0, 0, 0);
  const e = new Date(now);
  e.setHours(23, 59, 59, 999);
  switch (p) {
    case "hoje":
      return { from: s, to: e };
    case "ontem":
      s.setDate(s.getDate() - 1);
      e.setDate(e.getDate() - 1);
      return { from: s, to: e };
    case "semana": {
      const day = s.getDay();
      const diff = day === 0 ? 6 : day - 1;
      s.setDate(s.getDate() - diff);
      return { from: s, to: e };
    }
    case "mes":
      s.setDate(1);
      return { from: s, to: e };
    case "mes_passado": {
      s.setDate(1);
      s.setMonth(s.getMonth() - 1);
      const end = new Date(s.getFullYear(), s.getMonth() + 1, 0, 23, 59, 59, 999);
      return { from: s, to: end };
    }
    case "ano":
      s.setMonth(0);
      s.setDate(1);
      return { from: s, to: e };
    case "geral":
      return { from: null, to: null };
  }
}

export const REPORTS = {
  async overview(f: ReportFilters = DEFAULT_REPORT_FILTERS) {
    const { from, to } = periodRange(f.period);
    const needsContactFilter = f.instancia !== "all" || f.clienteId !== "all";
    let q = supabase
      .from("conversations")
      .select(
        needsContactFilter
          ? "id,status,department_id,agent_id,contact_id,created_at,last_message_at,contact:contacts!inner(id, customer_id, instancia)"
          : "id,status,department_id,agent_id,contact_id,created_at,last_message_at,contact:contacts(id, customer_id, instancia)",
      );
    if (from) q = q.gte("created_at", from.toISOString());
    if (to) q = q.lte("created_at", to.toISOString());
    if (f.departamentoId !== "all") q = q.eq("department_id", f.departamentoId);
    if (f.instancia !== "all") q = q.eq("contact.instancia", f.instancia);
    if (f.clienteId !== "all") q = q.eq("contact.customer_id", f.clienteId);
    const { data: convsRaw } = await q;
    const convs = (convsRaw ?? []) as any[];

    const ids = convs.map((c) => c.id as string);
    let totalMsg = 0;
    const msgCountByConv = new Map<string, number>();
    if (ids.length > 0) {
      let msgQ = supabase
        .from("messages")
        .select("*", { head: true, count: "exact" })
        .in("conversation_id", ids);
      if (from) msgQ = msgQ.gte("created_at", from.toISOString());
      if (to) msgQ = msgQ.lte("created_at", to.toISOString());
      const { count } = await msgQ;
      totalMsg = count ?? 0;

      // Contagem por conversa (para distinguir Leads x Fila)
      const { data: msgRows } = await supabase
        .from("messages")
        .select("conversation_id")
        .in("conversation_id", ids);
      for (const r of (msgRows ?? []) as { conversation_id: string }[]) {
        msgCountByConv.set(r.conversation_id, (msgCountByConv.get(r.conversation_id) ?? 0) + 1);
      }
    }
    const isLead = (id: string) => (msgCountByConv.get(id) ?? 0) <= 1;

    const contactIds = Array.from(new Set(convs.map((c) => c.contact_id).filter(Boolean)));
    const [{ data: deps }, { data: ags }, { data: custs }, { data: insts }, { data: tags }, ctRes] =
      await Promise.all([
        supabase.from("departments").select("id, nome, cor"),
        supabase.from("agents").select("id, nome"),
        supabase.from("customers").select("id, nome, cor"),
        supabase.from("instancias").select("id, nome, cor, tipo"),
        supabase.from("tags").select("id, nome, cor"),
        contactIds.length > 0
          ? supabase.from("contact_tags").select("contact_id, tag_id").in("contact_id", contactIds)
          : Promise.resolve({ data: [] as { contact_id: string; tag_id: string }[] }),
      ]);
    const ct = (ctRes as any).data ?? [];
    const tagCounts = new Map<string, number>();
    for (const row of ct as { contact_id: string; tag_id: string }[]) {
      const nConvs = convs.filter((c) => c.contact_id === row.contact_id).length;
      tagCounts.set(row.tag_id, (tagCounts.get(row.tag_id) ?? 0) + nConvs);
    }

    return {
      kpis: {
        abertas: convs.filter((c) => c.status === "aberta").length,
        emAndamento: convs.filter((c) => c.status === "em_andamento").length,
        aguardando: convs.filter((c) => c.status === "aguardando").length,
        fechadas: convs.filter((c) => c.status === "fechada").length,
        // Espelham os filtros da Inbox
        ativas: convs.filter(
          (c) => c.agent_id && c.status !== "fechada" && c.status !== "aguardando",
        ).length,
        standby: convs.filter((c) => c.status === "aguardando").length,
        fila: convs.filter((c) => c.status === "aberta" && !c.agent_id && !isLead(c.id)).length,
        leads: convs.filter((c) => !c.agent_id && c.status !== "fechada" && isLead(c.id)).length,
        totalMensagens: totalMsg,
        primeiraRespostaS: 0,
      },

      byDepartment: (deps ?? []).map((d) => ({
        nome: d.nome,
        cor: d.cor,
        total: convs.filter((c) => c.department_id === d.id).length,
      })),
      byAgent: (ags ?? []).map((a) => ({
        nome: a.nome,
        total: convs.filter((c) => c.agent_id === a.id).length,
        resolvidas: convs.filter((c) => c.agent_id === a.id && c.status === "fechada").length,
      })),
      byCustomer: (custs ?? [])
        .map((c) => ({
          nome: c.nome,
          cor: c.cor,
          total: convs.filter((cv) => cv.contact?.customer_id === c.id).length,
        }))
        .filter((r) => r.total > 0),
      byInstancia: (insts ?? [])
        .map((i) => ({
          nome: i.nome,
          cor: i.cor,
          total: convs.filter((cv) => cv.contact?.instancia === i.nome).length,
        }))
        .filter((r) => r.total > 0),
      byTag: (tags ?? [])
        .map((t) => ({ nome: t.nome, cor: t.cor, total: tagCounts.get(t.id) ?? 0 }))
        .filter((r) => r.total > 0),
      convs,
    };
  },
};
