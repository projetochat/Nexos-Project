import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui-kit";
import {
  DASHBOARD_CHART_MARGIN,
  DASHBOARD_CHART_TEXT_COLOR,
  messageHourTicks,
  messageTrafficSummary,
} from "@/lib/dashboard-chart-layout";
import { num } from "@/lib/format";

export type MessageTrafficDatum = {
  hora: string;
  recebidas: number;
  enviadas: number;
  total: number;
  atendimentos: number;
  contatosAtendidos: number;
};

export function MessageTrafficWidget({
  title,
  data,
  contactsTotal,
  columns,
  isMobile,
}: {
  title: string;
  data: MessageTrafficDatum[];
  contactsTotal: number;
  columns: 1 | 2 | 3 | 4;
  isMobile: boolean;
}) {
  const compact = isMobile || columns <= 2;
  const ticks = messageHourTicks(isMobile);
  const totals = messageTrafficSummary(data, contactsTotal);
  return (
    <Card className="h-full min-w-0">
      <p className="mb-4 text-xs uppercase tracking-widest text-muted-foreground">{title}</p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={DASHBOARD_CHART_MARGIN}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="hora"
            stroke="var(--muted-foreground)"
            tick={{ fill: DASHBOARD_CHART_TEXT_COLOR }}
            fontSize={11}
            ticks={ticks}
            interval={0}
            angle={compact ? -45 : 0}
            textAnchor={compact ? "end" : "middle"}
            height={compact ? 48 : 30}
            tickMargin={compact ? 8 : 0}
          />
          <YAxis
            stroke="var(--muted-foreground)"
            tick={{ fill: DASHBOARD_CHART_TEXT_COLOR }}
            fontSize={11}
            allowDecimals={false}
            width={38}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="recebidas"
            name="Recebidos"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="enviadas"
            name="Enviados"
            stroke="#dc2626"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="total"
            name="Total"
            stroke="#94a3b8"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="contatosAtendidos"
            name="Contatos"
            stroke="#16a34a"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <table
        aria-label="Totais do tráfego de mensagens no período"
        className="mx-auto mt-1 w-full max-w-md table-fixed border-collapse whitespace-nowrap text-xs"
      >
        <thead>
          <tr>
            <MessageTrafficLegendHeader label="Recebidos" color="#2563eb" />
            <MessageTrafficLegendHeader label="Enviados" color="#dc2626" />
            <MessageTrafficLegendHeader label="Total" color="#94a3b8" />
            <MessageTrafficLegendHeader label="Contatos" color="#16a34a" />
          </tr>
        </thead>
        <tbody>
          <tr>
            <MessageTrafficTotalCell label="Recebidos" value={totals.recebidas} />
            <MessageTrafficTotalCell label="Enviados" value={totals.enviadas} />
            <MessageTrafficTotalCell label="Total" value={totals.total} emphasized />
            <MessageTrafficTotalCell label="Contatos" value={totals.contatos} />
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

function MessageTrafficTotalCell({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: number;
  emphasized?: boolean;
}) {
  return (
    <td
      className={`border border-border px-2 py-1 text-center font-mono text-foreground ${emphasized ? "bg-surface-1" : ""}`}
    >
      <span className="sr-only">{label}: </span>
      {num(value)}
    </td>
  );
}

function MessageTrafficLegendHeader({ label, color }: { label: string; color: string }) {
  return (
    <th className="px-1 pb-1 text-center align-bottom font-normal text-muted-foreground">
      <span className="inline-flex whitespace-normal text-[10px] leading-tight sm:text-xs">
        <span
          className="mr-1 mt-[0.45em] inline-block h-0 w-3 shrink-0 border-t-2"
          style={{ borderColor: color }}
          aria-hidden="true"
        />
        {label}
      </span>
    </th>
  );
}
