import { createFileRoute, Link } from "@tanstack/react-router";
import type * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, MessageSquareText, PlayCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { Badge, Button, Card, SectionHeader } from "@/components/ui-kit";
import { leadApi, organizationApi } from "@/lib/nexos-api";

export const Route = createFileRoute("/filas")({
  head: () => ({ meta: [{ title: "Filas - Nexo" }] }),
  component: Page,
});

const queueQueryKey = ["nexos", "queues"] as const;

function Page() {
  const qc = useQueryClient();
  const { data: departments = [], isLoading: departmentsLoading } = useQuery({
    queryKey: [...queueQueryKey, "departments"],
    queryFn: organizationApi.listDepartments,
  });
  const { data: leadPage, isLoading: leadsLoading } = useQuery({
    queryKey: [...queueQueryKey, "leads"],
    queryFn: () => leadApi.list({ pageSize: 100 }),
  });
  const leads = leadPage?.items ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: queueQueryKey });

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Filas de atendimento"
          subtitle={`${leads.length} leads e conversas aguardando distribuicao.`}
          actions={
            <Link to="/inbox" search={{ tab: "leads" }}>
              <Button variant="secondary" size="sm">
                <MessageSquareText className="h-3.5 w-3.5" /> Abrir inbox
              </Button>
            </Link>
          }
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {departments.map((department) => {
            const departmentLeads = leads.filter((lead) => lead.department?.id === department.id);
            const assigned = departmentLeads.filter((lead) => lead.assignee).length;
            const waiting = departmentLeads.filter((lead) => !lead.assignee).length;
            return (
              <Card key={department.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="h-8 w-1 rounded-full"
                      style={{ backgroundColor: department.color }}
                    />
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">{department.name}</h3>
                      <p className="truncate text-xs text-muted-foreground">
                        {department.description ?? "Fila operacional"}
                      </p>
                    </div>
                  </div>
                  <Badge tone={waiting > 3 ? "warning" : "success"}>
                    {waiting > 3 ? "Atenção" : "Saudável"}
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Metric icon={<Clock className="h-3.5 w-3.5" />} label="Leads" value={waiting} />
                  <Metric
                    icon={<MessageSquareText className="h-3.5 w-3.5" />}
                    label="Atribuídos"
                    value={assigned}
                  />
                  <Metric
                    icon={<Users className="h-3.5 w-3.5" />}
                    label="Total"
                    value={departmentLeads.length}
                  />
                </div>
                <div className="mt-4 space-y-2">
                  {departmentLeads.slice(0, 3).map((lead) => (
                    <div
                      key={lead.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-1 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{lead.contact.nome}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {lead.firstMessagePreview ?? lead.contact.telefone}
                        </p>
                      </div>
                      {!lead.assignee && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await leadApi.assign(lead.id, { self: true });
                            toast.success("Lead atribuido");
                            refresh();
                          }}
                        >
                          <PlayCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
          {(departmentsLoading || leadsLoading) && (
            <Card className="p-6 text-sm text-muted-foreground">Carregando filas...</Card>
          )}
        </div>
      </PageContainer>
    </AppShell>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-2">
      <div className="mx-auto flex h-4 w-4 items-center justify-center text-muted-foreground">
        {icon}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}
