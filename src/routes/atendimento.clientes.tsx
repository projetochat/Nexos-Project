import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { OperatorShell, OperatorContainer } from "@/components/operator-shell";
import { Card, SectionHeader, Badge, Input, Avatar } from "@/components/ui-kit";
import { useStore } from "@/lib/mock/store";
import { relativeTime } from "@/lib/format";
import { Search, Phone, Mail } from "lucide-react";

export const Route = createFileRoute("/atendimento/clientes")({
  head: () => ({ meta: [{ title: "Clientes · Central de Atendimento" }] }),
  component: () => {
    const clientes = useStore((s) => s.clientes);
    const [q, setQ] = React.useState("");
    const list = clientes.filter((c) => !q || `${c.nome} ${c.email} ${c.telefone}`.toLowerCase().includes(q.toLowerCase()));
    return (
      <OperatorShell>
        <OperatorContainer>
          <SectionHeader title="Meus clientes" subtitle="Contatos com quem você já atendeu." />
          <Card>
            <div className="mb-4 relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente…" className="pl-9" />
            </div>
            <div className="divide-y divide-border">
              {list.slice(0, 40).map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-3">
                  <Avatar name={c.nome} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{c.nome}</span>
                      <Badge tone={c.status === "VIP" ? "brand" : c.status === "Ativo" ? "success" : "default"}>{c.status}</Badge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {c.telefone}</span>
                      <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {c.email}</span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    Última compra
                    <div>{relativeTime(c.ultimaCompra)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </OperatorContainer>
      </OperatorShell>
    );
  },
});
