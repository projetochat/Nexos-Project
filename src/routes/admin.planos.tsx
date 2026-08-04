import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Database, Phone, Users } from "lucide-react";
import { AdminContainer } from "@/components/admin-shell";
import { Badge, Card, SectionHeader } from "@/components/ui-kit";
import { platformApi, type PlatformPlan } from "@/lib/nexos-api";

export const Route = createFileRoute("/admin/planos")({
  head: () => ({ meta: [{ title: "Planos · Nexo Admin" }] }),
  component: PlanosAdmin,
});

function PlanosAdmin() {
  const [plans, setPlans] = React.useState<PlatformPlan[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    platformApi
      .plans({ pageSize: 50 })
      .then((data) => setPlans(data.items))
      .catch((err) => setError((err as Error).message));
  }, []);

  return (
    <AdminContainer>
      <SectionHeader
        title="Planos"
        subtitle="Catálogo server-side com snapshot de features e limites em cada assinatura."
      />
      {error && <Card className="border-destructive/40 text-sm text-destructive">{error}</Card>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="text-xs text-muted-foreground">{plan.code}</p>
              </div>
              <Badge tone={plan.status === "ACTIVE" ? "success" : "default"}>{plan.status}</Badge>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <Limit icon={Users} label="Usuários" value={plan.limits.maxUsers} />
              <Limit icon={Database} label="Departamentos" value={plan.limits.maxDepartments} />
              <Limit icon={Phone} label="Connections" value={plan.limits.maxConnections} />
              <Limit icon={Database} label="Contatos" value={plan.limits.maxContacts} />
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Features
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(plan.features).map(([feature, enabled]) => (
                  <Badge key={feature} tone={enabled ? "success" : "default"}>
                    <Check className="h-3 w-3" /> {feature}
                  </Badge>
                ))}
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              {plan._count?.subscriptions ?? 0} assinaturas vinculadas.
            </p>
          </Card>
        ))}
      </div>
    </AdminContainer>
  );
}

function Limit({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <span className="font-mono text-xs">{value.toLocaleString("pt-BR")}</span>
    </div>
  );
}
