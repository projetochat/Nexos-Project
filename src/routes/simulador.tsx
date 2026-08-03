import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { SectionHeader, Card, Avatar, Button, Badge } from "@/components/ui-kit";
import { CATALOG, SIMULATOR, type Contact, type Message } from "@/lib/mvp";
import { supabase } from "@/integrations/supabase/client";
import { fmtHM } from "@/lib/format";

export const Route = createFileRoute("/simulador")({
  head: () => ({ meta: [{ title: "Simulador de Cliente · Nexo" }] }),
  component: SimuladorPage,
});

/** Contatos "não salvos" — não existem no banco. Servem para testar o fluxo
 * de primeiro contato (mensagem de boas-vindas por instância). */
type GhostContact = Contact & { __ghost: true };
const GHOSTS: GhostContact[] = [
  {
    id: "ghost-zyvo-1",
    nome: "Contato desconhecido",
    telefone: "+55 11 90000-1111",
    avatar_url: null,
    instancia: "Instancia conectada",
    __ghost: true,
  },
  {
    id: "ghost-flowid-1",
    nome: "Contato desconhecido",
    telefone: "+55 21 90000-2222",
    avatar_url: null,
    instancia: "Instancia conectada",
    __ghost: true,
  },
];

function SimuladorPage() {
  const qc = useQueryClient();
  const { data: contatos = [] } = useQuery({
    queryKey: ["mvp", "contacts"],
    queryFn: CATALOG.contacts,
  });
  const { data: activeContactIds = [] } = useQuery({
    queryKey: ["mvp", "sim-active-contact-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("contact_id")
        .neq("status", "fechada");
      if (error) throw error;
      return Array.from(
        new Set(((data ?? []) as { contact_id: string }[]).map((r) => r.contact_id)),
      );
    },
    refetchInterval: 5000,
  });
  const activeSet = React.useMemo(() => new Set(activeContactIds), [activeContactIds]);

  // Agrupa contatos salvos por instância + separa não salvos
  const grupos = React.useMemo(() => {
    const byInst = new Map<string, Contact[]>();
    for (const c of contatos) {
      const key = c.instancia?.trim() || "Sem instância";
      if (!byInst.has(key)) byInst.set(key, []);
      byInst.get(key)!.push(c);
    }
    return Array.from(byInst.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [contatos]);

  const [activeId, setActiveId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!activeId && contatos[0]) setActiveId(contatos[0].id);
  }, [contatos, activeId]);

  const activeGhost = GHOSTS.find((g) => g.id === activeId) ?? null;
  const activo: Contact | null = activeGhost ?? contatos.find((c) => c.id === activeId) ?? null;
  const isGhost = !!activeGhost;

  const { data: mensagens = [] } = useQuery({
    queryKey: ["mvp", "sim-messages", activeId],
    queryFn: () =>
      activeId && !isGhost
        ? SIMULATOR.messagesForContact(activeId)
        : Promise.resolve([] as Message[]),
    enabled: !!activeId && !isGhost,
  });

  React.useEffect(() => {
    if (!activeId || isGhost) return;
    const ch = supabase
      .channel(`sim-${activeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["mvp", "sim-messages", activeId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [activeId, isGhost, qc]);

  const [text, setText] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [mensagens.length]);

  const send = async () => {
    if (!activo) return;
    const t = text.trim();
    if (!t) return;
    try {
      let targetId = activo.id;
      // Ghost → cria contato real no momento do primeiro envio, herdando a instância
      if (isGhost) {
        const { data, error } = await supabase
          .from("contacts")
          .insert({
            nome: activeGhost!.nome,
            telefone: activeGhost!.telefone,
            instancia: activeGhost!.instancia,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        targetId = (data as { id: string }).id;
        qc.invalidateQueries({ queryKey: ["mvp", "contacts"] });
        setActiveId(targetId);
      }
      await SIMULATOR.sendContactMessage(targetId, t);
      setText("");
      qc.invalidateQueries({ queryKey: ["mvp", "sim-messages", targetId] });
      qc.invalidateQueries({ queryKey: ["mvp", "conversations"] });
      toast.success(`Mensagem enviada por ${activo.nome.split(" ")[0]}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Simulador de Cliente"
          subtitle="Simule mensagens recebidas via WhatsApp por instância conectada."
          actions={<Badge tone="warning">Ambiente de simulação</Badge>}
        />

        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Card className="p-0">
            <ul className="max-h-[560px] overflow-y-auto">
              {grupos.map(([instNome, items]) => (
                <ContactGroup
                  key={instNome}
                  title={instNome}
                  items={items}
                  activeSet={activeSet}
                  activeId={activeId}
                  onSelect={setActiveId}
                />
              ))}
              <li className="sticky top-0 z-10 flex items-center justify-between border-y border-border bg-warning/10 px-4 py-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-warning">
                  <UserPlus className="h-3 w-3" /> Não salvos · primeiro contato
                </p>
                <Badge tone="warning">{GHOSTS.length}</Badge>
              </li>
              {GHOSTS.map((g) => (
                <li key={g.id}>
                  <button
                    onClick={() => setActiveId(g.id)}
                    className={`flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition ${
                      activeId === g.id ? "bg-surface-2" : "hover:bg-surface-1"
                    }`}
                  >
                    <Avatar name="?" size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{g.telefone}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        Via {g.instancia}
                      </p>
                    </div>
                    <Badge tone="warning">novo</Badge>
                  </button>
                </li>
              ))}
              {contatos.length === 0 && (
                <li className="p-4 text-xs text-muted-foreground">Nenhum contato cadastrado.</li>
              )}
            </ul>
          </Card>

          <Card className="flex h-[560px] flex-col p-0">
            <header className="flex items-center gap-3 border-b border-border px-4 py-3">
              {activo ? (
                <>
                  <Avatar name={isGhost ? "?" : activo.nome} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {isGhost ? activo.telefone : activo.nome}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {activo.instancia ? `Instância ${activo.instancia}` : "Sem instância"}
                      {isGhost && " · não salvo"}
                    </p>
                  </div>
                  {isGhost && <Badge tone="warning">Primeiro contato</Badge>}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Selecione um contato</p>
              )}
            </header>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-surface-1/50 p-4">
              {isGhost ? (
                <p className="pt-16 text-center text-xs text-muted-foreground">
                  Esse número ainda não está cadastrado. Ao enviar a primeira mensagem, o contato
                  será criado automaticamente na instância <b>{activo?.instancia}</b> e a mensagem
                  de boas-vindas configurada será disparada.
                </p>
              ) : (
                <>
                  {mensagens.map((m) => {
                    const mine = m.sender === "contact";
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-card ${
                            mine
                              ? "rounded-br-sm bg-success/90 text-white"
                              : "rounded-bl-sm border border-border bg-card"
                          }`}
                        >
                          <p>{m.content}</p>
                          <p
                            className={`mt-0.5 text-right font-mono text-[10px] ${mine ? "text-white/80" : "text-muted-foreground"}`}
                          >
                            {fmtHM(new Date(m.created_at).getTime())}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {mensagens.length === 0 && (
                    <p className="pt-16 text-center text-xs text-muted-foreground">
                      Nenhuma mensagem ainda. Envie a primeira abaixo.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="border-t border-border bg-card p-3">
              <div className="flex items-end gap-2 rounded-xl border border-border bg-surface-1 p-2 focus-within:border-primary">
                <textarea
                  rows={2}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={
                    activo
                      ? `Escreva como ${isGhost ? "novo contato" : activo.nome.split(" ")[0]}…`
                      : "Selecione um contato"
                  }
                  disabled={!activo}
                  className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={send}
                  disabled={!activo || !text.trim()}
                >
                  <Send className="h-3.5 w-3.5" /> Enviar
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                A mensagem aparecerá na Inbox dos atendentes em tempo real, vinculada à instância do
                contato.
              </p>
            </div>
          </Card>
        </div>
      </PageContainer>
    </AppShell>
  );
}

function ContactGroup({
  title,
  items,
  activeId,
  activeSet,
  onSelect,
}: {
  title: string;
  items: Contact[];
  activeId: string | null;
  activeSet: Set<string>;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <li className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface-1 px-4 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
        <Badge tone="default">{items.length}</Badge>
      </li>
      {items.map((c) => {
        const ativa = activeSet.has(c.id);
        return (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className={`flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition ${
                activeId === c.id ? "bg-surface-2" : "hover:bg-surface-1"
              }`}
            >
              <span className="relative">
                <Avatar name={c.nome} size={36} />
                {ativa && (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-success" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.nome}</p>
                <p className="truncate text-[11px] text-muted-foreground">{c.telefone}</p>
              </div>
            </button>
          </li>
        );
      })}
    </>
  );
}
