import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Select } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { connectionPrimaryLabel } from "@/lib/connection-options";
import type { ReportFilters, PeriodKey } from "@/lib/mvp";
import { useConnectedMessagingConnections } from "@/lib/use-connected-messaging-connections";

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "ontem", label: "Ontem" },
  { value: "semana", label: "Essa semana" },
  { value: "mes", label: "Esse mês" },
  { value: "mes_passado", label: "Mês passado" },
  { value: "ano", label: "Esse ano" },
  { value: "geral", label: "Geral" },
];

export function ReportFiltersBar({
  value,
  onChange,
}: {
  value: ReportFilters;
  onChange: (patch: Partial<ReportFilters>) => void;
}) {
  const { connectionOptions } = useConnectedMessagingConnections();
  const { data: clientes = [] } = useQuery({
    queryKey: ["report-filters", "customers"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id,nome").order("nome");
      return data ?? [];
    },
  });
  const { data: departamentos = [] } = useQuery({
    queryKey: ["report-filters", "departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id,nome").order("nome");
      return data ?? [];
    },
  });

  return (
    <Card className="mb-6 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">
            Período
          </label>
          <Select
            value={value.period}
            onChange={(e) => onChange({ period: e.target.value as PeriodKey })}
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">
            Instância
          </label>
          <Select value={value.instancia} onChange={(e) => onChange({ instancia: e.target.value })}>
            <option value="all">Todas</option>
            {connectionOptions.map((option) => (
              <option key={option.id} value={option.value}>
                {connectionPrimaryLabel(option.connection)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">
            Cliente
          </label>
          <Select value={value.clienteId} onChange={(e) => onChange({ clienteId: e.target.value })}>
            <option value="all">Todos</option>
            {(clientes as { id: string; nome: string }[]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">
            Departamento
          </label>
          <Select
            value={value.departamentoId}
            onChange={(e) => onChange({ departamentoId: e.target.value })}
          >
            <option value="all">Todos</option>
            {(departamentos as { id: string; nome: string }[]).map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Card>
  );
}
