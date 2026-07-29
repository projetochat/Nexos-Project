import { createFileRoute } from "@tanstack/react-router";
import { OperatorShell, OperatorContainer } from "@/components/operator-shell";
import { Card, SectionHeader, Badge, Avatar } from "@/components/ui-kit";
import { useStore } from "@/lib/mock/store";
import { relativeTime, fmtDuration } from "@/lib/format";

export const Route = createFileRoute("/atendimento/historico")({
  head: () => ({ meta: [{ title: "Histórico · Central de Atendimento" }] }),
  component: () => {
    const currentUserId = useStore((s) => s.currentUserId);
    const conversas = useStore((s) => s.conversas)
      .filter((c) => c.atendenteId === currentUserId && (c.status === "resolvida" || c.status === "arquivada"))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const clientes = useStore((s) => s.clientes);
    return (
      <OperatorShell>
        <OperatorContainer>
          <SectionHeader title="Meu histórico" subtitle={`${conversas.length} conversas encerradas por você.`} />
          <Card padding={false}>
            <div className="divide-y divide-border">
              {conversas.slice(0, 50).map((c) => {
                const cli = clientes.find((x) => x.id === c.clienteId);
                return (
                  <div key={c.id} className="flex items-center gap-3 p-4">
                    <Avatar name={cli?.nome ?? "?"} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{cli?.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmtDuration(c.duracaoS)} de atendimento · {relativeTime(c.updatedAt)}
                      </div>
                    </div>
                    <Badge tone={c.status === "resolvida" ? "success" : "default"}>{c.status}</Badge>
                  </div>
                );
              })}
              {conversas.length === 0 && (
                <div className="py-16 text-center text-sm text-muted-foreground">Nenhum atendimento no histórico ainda.</div>
              )}
            </div>
          </Card>
        </OperatorContainer>
      </OperatorShell>
    );
  },
});
