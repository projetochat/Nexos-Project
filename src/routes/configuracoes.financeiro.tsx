import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CreditCard } from "lucide-react";
import { Badge, Card, SearchInput, Select } from "@/components/ui-kit";
import { organizationApi, type ApiFinancialPayment } from "@/lib/nexos-api";

export const Route = createFileRoute("/configuracoes/financeiro")({
  component: FinanceiroSettings,
});

function FinanceiroSettings() {
  const [search, setSearch] = React.useState("");
  const [period, setPeriod] = React.useState("all");
  const {
    data: payments = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["nexos", "financial-payments"],
    queryFn: organizationApi.listFinancialPayments,
  });
  const periods = React.useMemo(
    () => Array.from(new Set(payments.map((payment) => payment.referenceAt.slice(0, 7)))),
    [payments],
  );
  const records = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return payments.filter((record) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          record.paymentId,
          record.subscriptionId,
          record.service,
          formatReference(record.referenceAt),
          invoiceStatusLabel(record.status),
        ].some((value) => value.toLowerCase().includes(normalizedSearch));
      const matchesPeriod = period === "all" || record.referenceAt.startsWith(period);
      return matchesSearch && matchesPeriod;
    });
  }, [payments, period, search]);

  return (
    <Card className="overflow-hidden" padding={false}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-4 sm:px-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Financeiro</h2>
          <p className="text-sm text-muted-foreground">
            Histórico de mensalidades e pagamentos da sua empresa.
          </p>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Pesquisar por serviço, ID, referência ou status..."
          />
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Select
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="pl-9"
            >
              <option value="all">Todos os períodos</option>
              {periods.map((item) => (
                <option key={item} value={item}>
                  {formatReference(`${item}-01T00:00:00.000Z`)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-surface-1 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">ID do pagamento</th>
                <th className="px-4 py-3 text-left font-semibold">ID da assinatura</th>
                <th className="px-4 py-3 text-left font-semibold">Serviço</th>
                <th className="px-4 py-3 text-left font-semibold">Mês de referência</th>
                <th className="px-4 py-3 text-left font-semibold">Data de pagamento</th>
                <th className="px-4 py-3 text-right font-semibold">Valor</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map((record) => (
                <tr key={record.paymentId} className="transition hover:bg-surface-1/70">
                  <td className="px-4 py-3 font-mono text-xs font-medium">{record.paymentId}</td>
                  <td className="px-4 py-3 font-mono text-xs text-primary">
                    {record.subscriptionId}
                  </td>
                  <td className="px-4 py-3">{record.service}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatReference(record.referenceAt)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {record.paidAt ? formatDate(record.paidAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {(record.amountCents / 100).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: record.currency,
                    })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge tone={invoiceStatusTone(record.status)} dot={false}>
                      {invoiceStatusLabel(record.status)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && records.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {isError
                ? "Não foi possível carregar o histórico financeiro."
                : "Nenhuma mensalidade encontrada para os filtros selecionados."}
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {isLoading
            ? "Carregando mensalidades..."
            : `Exibindo ${records.length} de ${payments.length} mensalidades.`}
        </p>
      </div>
    </Card>
  );
}

function formatReference(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value));
}

function invoiceStatusLabel(status: ApiFinancialPayment["status"]) {
  return {
    DRAFT: "Rascunho",
    OPEN: "Em aberto",
    PAID: "Pago",
    VOID: "Cancelada",
    OVERDUE: "Vencida",
  }[status];
}

function invoiceStatusTone(
  status: ApiFinancialPayment["status"],
): "success" | "warning" | "destructive" | "default" {
  if (status === "PAID") return "success";
  if (status === "OVERDUE") return "destructive";
  if (status === "OPEN") return "warning";
  return "default";
}
