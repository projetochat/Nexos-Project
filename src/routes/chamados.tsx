import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Plus,
  Ticket as TicketIcon,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  ImageIcon,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import {
  SectionHeader,
  Card,
  Button,
  Field,
  Input,
  Select,
  Badge,
  EmptyState,
} from "@/components/ui-kit";
import { Modal, useDisclosure } from "@/components/modal";
import {
  CUSTOMERS,
  CATALOG,
  CONTACTS,
  type Customer,
  type Contact,
  type Department,
} from "@/lib/mvp";
import { useSession } from "@/lib/session";
import { sanitizeRichTextHtml } from "@/lib/sanitize-html";
import { supabase } from "@/integrations/supabase/client";

function fmtAbertura(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const Route = createFileRoute("/chamados")({
  head: () => ({
    meta: [
      { title: "Chamados · GLPI · Nexo" },
      { name: "description", content: "Abertura e acompanhamento de chamados GLPI." },
    ],
  }),
  component: ChamadosPage,
});

type TipoChamado = "Suporte" | "DEV";
type StatusChamado = "Novo" | "Iniciado" | "Pendente" | "Solucionado" | "Finalizado";

const STATUS_OPTIONS: StatusChamado[] = [
  "Novo",
  "Iniciado",
  "Pendente",
  "Solucionado",
  "Finalizado",
];

type Chamado = {
  id: number;
  tipo: TipoChamado;
  status: StatusChamado;
  titulo: string;
  clienteId: string;
  clienteNome: string;
  solicitanteId: string;
  solicitanteNome: string;
  departamentoId: string;
  departamentoNome: string;
  abertoEm: number;
  usuarioAbertura: string;
  descricaoHtml: string;
};

function rowToChamado(r: any): Chamado {
  return {
    id: Number(r.numero),
    tipo: r.tipo,
    status: r.status,
    titulo: r.titulo,
    clienteId: r.cliente_id ?? "",
    clienteNome: r.cliente_nome,
    solicitanteId: r.solicitante_id ?? "",
    solicitanteNome: r.solicitante_nome,
    departamentoId: r.departamento_id ?? "",
    departamentoNome: r.departamento_nome,
    abertoEm: new Date(r.aberto_em).getTime(),
    usuarioAbertura: r.usuario_abertura_nome,
    descricaoHtml: r.descricao_html,
  };
}

function ChamadosPage() {
  const user = useSession((s) => s.user);
  const [items, setItems] = React.useState<Chamado[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState<Chamado | null>(null);
  const novo = useDisclosure();

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("chamados")
      .select("*")
      .order("numero", { ascending: false });
    if (error) {
      toast.error("Falha ao carregar chamados.");
      setItems([]);
    } else {
      setItems((data ?? []).map(rowToChamado));
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = items.filter((t) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      String(t.id).includes(s) ||
      t.titulo.toLowerCase().includes(s) ||
      t.clienteNome.toLowerCase().includes(s) ||
      t.solicitanteNome.toLowerCase().includes(s) ||
      t.departamentoNome.toLowerCase().includes(s) ||
      t.tipo.toLowerCase().includes(s) ||
      t.status.toLowerCase().includes(s)
    );
  });

  const handleCreate = async (payload: Omit<Chamado, "id">) => {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id ?? null;
    const { data, error } = await supabase
      .from("chamados")
      .insert({
        tipo: payload.tipo,
        status: payload.status,
        titulo: payload.titulo,
        cliente_id: payload.clienteId || null,
        cliente_nome: payload.clienteNome,
        solicitante_id: payload.solicitanteId || null,
        solicitante_nome: payload.solicitanteNome,
        departamento_id: payload.departamentoId || null,
        departamento_nome: payload.departamentoNome,
        descricao_html: payload.descricaoHtml,
        aberto_em: new Date(payload.abertoEm).toISOString(),
        usuario_abertura_id: uid,
        usuario_abertura_nome: payload.usuarioAbertura,
      })
      .select("*")
      .single();
    if (error || !data) {
      toast.error("Não foi possível abrir o chamado.");
      return;
    }
    const c = rowToChamado(data);
    setItems((prev) => [c, ...prev]);
    toast.success(`Chamado #${String(c.id).padStart(6, "0")} aberto`);
    novo.hide();
  };

  const handleUpdate = async (id: number, payload: Omit<Chamado, "id">) => {
    const { data, error } = await supabase
      .from("chamados")
      .update({
        tipo: payload.tipo,
        status: payload.status,
        titulo: payload.titulo,
        cliente_id: payload.clienteId || null,
        cliente_nome: payload.clienteNome,
        solicitante_id: payload.solicitanteId || null,
        solicitante_nome: payload.solicitanteNome,
        departamento_id: payload.departamentoId || null,
        departamento_nome: payload.departamentoNome,
        descricao_html: payload.descricaoHtml,
      })
      .eq("numero", id)
      .select("*")
      .single();
    if (error || !data) {
      toast.error("Não foi possível atualizar o chamado.");
      return;
    }
    const c = rowToChamado(data);
    setItems((prev) => prev.map((x) => (x.id === id ? c : x)));
    toast.success(`Chamado #${String(id).padStart(6, "0")} atualizado`);
    setEditing(null);
    novo.hide();
  };

  const openNew = () => {
    setEditing(null);
    novo.show();
  };
  const openEdit = (c: Chamado) => {
    setEditing(c);
    novo.show();
  };

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Chamados"
          subtitle={loading ? "Carregando…" : `${items.length} chamado(s) registrado(s).`}
          actions={
            <Button variant="primary" size="sm" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" /> Novo chamado
            </Button>
          }
        />

        <Card>
          <div className="mb-4 flex flex-wrap gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por ID, cliente, solicitante…"
                className="pl-9"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<TicketIcon className="h-5 w-5" />}
              title="Nenhum chamado ainda"
              description="Registre o primeiro chamado para acompanhar demandas de Suporte e DEV."
              action={
                <Button variant="primary" size="sm" onClick={openNew}>
                  <Plus className="h-3.5 w-3.5" /> Novo chamado
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-widest text-muted-foreground">
                    <th className="py-2 pr-3">ID</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3">Título</th>
                    <th className="py-2 pr-3">Cliente</th>
                    <th className="py-2 pr-3">Solicitante</th>
                    <th className="py-2 pr-3">Departamento</th>
                    <th className="py-2 pr-3">Abertura</th>
                    <th className="py-2 pr-3">Usuário</th>
                    <th className="py-2 pr-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className="border-b border-border/60 hover:bg-surface-1">
                      <td className="py-2 pr-3 font-mono text-xs">
                        #{String(t.id).padStart(6, "0")}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge
                          tone={
                            t.status === "Finalizado" || t.status === "Solucionado"
                              ? "success"
                              : t.status === "Pendente"
                                ? "warning"
                                : t.status === "Iniciado"
                                  ? "info"
                                  : "default"
                          }
                        >
                          {t.status ?? "Novo"}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge tone={t.tipo === "DEV" ? "brand" : "info"}>{t.tipo}</Badge>
                      </td>
                      <td className="py-2 pr-3 max-w-[280px] truncate">{t.titulo ?? "—"}</td>
                      <td className="py-2 pr-3">{t.clienteNome}</td>
                      <td className="py-2 pr-3">{t.solicitanteNome}</td>
                      <td className="py-2 pr-3">{t.departamentoNome}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {fmtAbertura(t.abertoEm)}
                      </td>
                      <td className="py-2 pr-3 text-xs">{t.usuarioAbertura}</td>
                      <td className="py-2 pr-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                          Editar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <NovoChamadoModal
          open={novo.open}
          onClose={() => {
            setEditing(null);
            novo.hide();
          }}
          usuario={user?.nome ?? user?.email ?? "—"}
          editing={editing}
          onCreate={(payload) => {
            handleCreate(payload);
          }}
          onUpdate={(id, payload) => {
            handleUpdate(id, payload);
          }}
        />
      </PageContainer>
    </AppShell>
  );
}

const CLIENTE_OPTIONS = ["SDE", "VOCICAL", "DIPS"] as const;

function NovoChamadoModal({
  open,
  onClose,
  usuario,
  editing,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  onClose: () => void;
  usuario: string;
  editing: Chamado | null;
  onCreate: (payload: Omit<Chamado, "id">) => void;
  onUpdate: (id: number, payload: Omit<Chamado, "id">) => void;
}) {
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [tipo, setTipo] = React.useState<TipoChamado>("Suporte");
  const [status, setStatus] = React.useState<StatusChamado>("Novo");
  const [titulo, setTitulo] = React.useState("");
  const [clienteId, setClienteId] = React.useState("");
  const [solicitanteId, setSolicitanteId] = React.useState("");
  const [departamentoId, setDepartamentoId] = React.useState("");
  const [abertoEm, setAbertoEm] = React.useState<number>(() => Date.now());
  const editorRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const idValue = editing ? `#${String(editing.id).padStart(6, "0")}` : null;

  React.useEffect(() => {
    if (!open) return;
    setTipo(editing?.tipo ?? "Suporte");
    setStatus(editing?.status ?? "Novo");
    setTitulo(editing?.titulo ?? "");
    setClienteId(editing?.clienteId ?? "");
    setSolicitanteId(editing?.solicitanteId ?? "");
    setDepartamentoId(editing?.departamentoId ?? "");
    setAbertoEm(editing?.abertoEm ?? Date.now());
    if (editorRef.current)
      editorRef.current.innerHTML = sanitizeRichTextHtml(editing?.descricaoHtml ?? "");
    (async () => {
      try {
        const [cs, ct, dp] = await Promise.all([
          CUSTOMERS.list().catch(() => [] as Customer[]),
          CATALOG.contacts().catch(() => [] as Contact[]),
          CATALOG.departments().catch(() => [] as Department[]),
        ]);
        setCustomers(cs);
        setContacts(ct);
        setDepartments(dp);
      } catch {}
    })();
  }, [open, editing]);

  const filteredCustomers = customers.filter((c) =>
    CLIENTE_OPTIONS.some((n) => c.nome.toUpperCase().includes(n)),
  );
  const clienteSource = filteredCustomers.length > 0 ? filteredCustomers : customers;

  const exec = (cmd: string) => {
    document.execCommand(cmd, false);
    editorRef.current?.focus();
  };

  const onPasteImage = async (files: FileList | null) => {
    if (!files || !files.length || !editorRef.current) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const img = `<img src="${dataUrl}" alt="anexo" style="max-width:100%;border-radius:8px;margin:4px 0" />`;
      document.execCommand("insertHTML", false, img);
    }
    editorRef.current.focus();
  };

  const submit = () => {
    if (!titulo.trim()) return toast.error("Informe o título do chamado.");
    if (!clienteId) return toast.error("Selecione o cliente.");
    if (!solicitanteId) return toast.error("Selecione o solicitante.");
    if (!departamentoId) return toast.error("Selecione o departamento.");
    const html = sanitizeRichTextHtml(editorRef.current?.innerHTML.trim() ?? "");
    if (!html || html === "<br>") return toast.error("Descreva o chamado.");
    const cliente = clienteSource.find((c) => c.id === clienteId);
    const sol = contacts.find((c) => c.id === solicitanteId);
    const dep = departments.find((d) => d.id === departamentoId);
    const payload: Omit<Chamado, "id"> = {
      tipo,
      status,
      titulo: titulo.trim(),
      clienteId,
      clienteNome: cliente?.nome ?? editing?.clienteNome ?? "—",
      solicitanteId,
      solicitanteNome: sol?.nome ?? editing?.solicitanteNome ?? "—",
      departamentoId,
      departamentoNome: dep?.nome ?? editing?.departamentoNome ?? "—",
      abertoEm,
      usuarioAbertura: editing?.usuarioAbertura ?? usuario,
      descricaoHtml: html,
    };
    if (editing) onUpdate(editing.id, payload);
    else onCreate(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Editar chamado ${idValue}` : "Novo chamado"}
      size="xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={submit}>
            {editing ? "Salvar alterações" : "Abrir chamado"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="ID chamado">
          <Input value={idValue ?? ""} placeholder="" disabled readOnly />
        </Field>
        <Field label="Status *">
          <Select value={status} onChange={(e) => setStatus(e.target.value as StatusChamado)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tipo *">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoChamado)}>
            <option value="Suporte">Suporte</option>
            <option value="DEV">DEV</option>
          </Select>
        </Field>
        <Field label="Cliente *">
          <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Selecione…</option>
            {clienteSource.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Solicitante *">
          <Select value={solicitanteId} onChange={(e) => setSolicitanteId(e.target.value)}>
            <option value="">Selecione…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Departamento *">
          <Select value={departamentoId} onChange={(e) => setDepartamentoId(e.target.value)}>
            <option value="">Selecione…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data/hora de abertura">
          <Input value={fmtAbertura(abertoEm)} disabled readOnly />
        </Field>
        <div className="md:col-span-2">
          <Field label="Usuário de abertura">
            <Input value={usuario} disabled readOnly />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Título do chamado *">
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Resumo curto do chamado"
              maxLength={160}
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Descrição do chamado *
          </span>
          <div className="rounded-lg border border-border bg-surface-1">
            <div className="flex flex-wrap items-center gap-1 border-b border-border p-1.5">
              <ToolbarBtn onClick={() => exec("bold")} label="Negrito">
                <Bold className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => exec("italic")} label="Itálico">
                <Italic className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => exec("underline")} label="Sublinhado">
                <UnderlineIcon className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <div className="mx-1 h-4 w-px bg-border" />
              <ToolbarBtn onClick={() => fileRef.current?.click()} label="Inserir imagem">
                <ImageIcon className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  onPasteImage(e.target.files);
                  e.target.value = "";
                }}
              />
              <span className="ml-auto text-[11px] text-muted-foreground">
                Cole prints com Ctrl+V
              </span>
            </div>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onPaste={(e) => {
                const files = e.clipboardData?.files;
                if (files && files.length > 0) {
                  e.preventDefault();
                  onPasteImage(files);
                }
              }}
              className="min-h-[180px] max-h-[360px] overflow-y-auto px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              data-placeholder="Descreva o chamado, cole prints (Ctrl+V) e use os botões para formatar…"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ToolbarBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
    >
      {children}
    </button>
  );
}
