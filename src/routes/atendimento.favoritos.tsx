import { createFileRoute } from "@tanstack/react-router";
import { OperatorShell, OperatorContainer } from "@/components/operator-shell";
import { Card, SectionHeader, Badge, Avatar, EmptyState } from "@/components/ui-kit";
import { useStore } from "@/lib/mock/store";
import { relativeTime } from "@/lib/format";
import { Star } from "lucide-react";

export const Route = createFileRoute("/atendimento/favoritos")({
  head: () => ({ meta: [{ title: "Favoritos · Central de Atendimento" }] }),
  component: () => {
    const conversas = useStore((s) => s.conversas).filter((c) => c.favorito && c.status !== "arquivada");
    const clientes = useStore((s) => s.clientes);
    return (
      <OperatorShell>
        <OperatorContainer>
          <SectionHeader title="Conversas favoritas" subtitle="Suas conversas marcadas como prioritárias." />
          {conversas.length === 0 ? (
            <EmptyState icon={<Star className="h-6 w-6" />} title="Nenhuma conversa favorita" description="Marque conversas com estrela para acessá-las rapidamente." />
          ) : (
            <Card padding={false}>
              <div className="divide-y divide-border">
                {conversas.map((c) => {
                  const cli = clientes.find((x) => x.id === c.clienteId);
                  return (
                    <div key={c.id} className="flex items-center gap-3 p-4">
                      <Avatar name={cli?.nome ?? "?"} size={38} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{cli?.nome}</span>
                          <Star className="h-3 w-3 fill-warning text-warning" />
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge tone={c.status === "atendendo" ? "info" : c.status === "aguardando" ? "warning" : "success"}>{c.status}</Badge>
                          <span>·</span>
                          <span>Atualizada {relativeTime(c.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </OperatorContainer>
      </OperatorShell>
    );
  },
});
