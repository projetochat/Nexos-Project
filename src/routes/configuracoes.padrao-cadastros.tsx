import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CaseUpper, Info } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/modal";
import { Card } from "@/components/ui-kit";
import { organizationApi, type ApiRegistrationCaseKey } from "@/lib/trixus-api";

export const Route = createFileRoute("/configuracoes/padrao-cadastros")({
  component: RegistrationCasePage,
});

const ITEMS: Array<{
  key: ApiRegistrationCaseKey;
  label: string;
  unavailable?: boolean;
}> = [
  { key: "contacts", label: "Contatos" },
  { key: "contactCompanies", label: "Empresa do Contato" },
  { key: "contactDepartments", label: "Departamento do Contato" },
  { key: "contactProfiles", label: "Perfil do Contato" },
  { key: "attendants", label: "Atendente" },
  { key: "accessProfiles", label: "Perfil de Acesso" },
  { key: "departments", label: "Departamentos" },
  { key: "tags", label: "Etiquetas" },
  { key: "botFlows", label: "Fluxo de Bot", unavailable: true },
  { key: "automations", label: "Automações" },
  { key: "aiAgents", label: "Agente de IA", unavailable: true },
  { key: "ticketTitles", label: "Título de Chamados" },
];

function RegistrationCasePage() {
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState<{
    key: ApiRegistrationCaseKey;
    label: string;
    count: number;
  } | null>(null);
  const query = useQuery({
    queryKey: ["registration-case-settings"],
    queryFn: organizationApi.registrationCaseSettings,
  });
  const mutation = useMutation({
    mutationFn: organizationApi.updateRegistrationCase,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["registration-case-settings"] });
      toast.success(
        result.enabled
          ? result.converted > 0
            ? `${result.converted} registros convertidos e padrão ativado.`
            : "Padrão de maiúsculas ativado."
          : "Padrão desativado. Os registros já convertidos foram preservados.",
      );
    },
    onError: () => toast.error("Não foi possível atualizar o padrão de cadastros."),
  });

  const change = (key: ApiRegistrationCaseKey, label: string, enabled: boolean) => {
    if (!enabled) {
      mutation.mutate({ key, enabled: false });
      return;
    }
    const count = query.data?.counts[key] ?? 0;
    if (count > 0) {
      setPending({ key, label, count });
      return;
    }
    mutation.mutate({ key, enabled: true });
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <CaseUpper className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Padrão de Cadastros em Maiúsculas</h2>
            <p className="text-sm text-muted-foreground">
              Ative individualmente os cadastros que devem ser gravados em letras maiúsculas.
            </p>
          </div>
        </div>

        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando configurações…</p>
        ) : query.isError ? (
          <button className="text-sm font-medium text-primary" onClick={() => void query.refetch()}>
            Não foi possível carregar. Tentar novamente
          </button>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {ITEMS.map((item) => {
              const enabled = query.data?.values[item.key] ?? false;
              return (
                <li
                  key={item.key}
                  className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                    {item.unavailable ? (
                      <p className="text-xs text-muted-foreground">
                        Módulo ainda sem cadastro persistido.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {query.data?.counts[item.key] ?? 0} registros atuais
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-label={`Gravar ${item.label} em maiúsculas`}
                    aria-checked={enabled}
                    disabled={mutation.isPending}
                    onClick={() => change(item.key, item.label, !enabled)}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition ${enabled ? "bg-primary" : "bg-border"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${enabled ? "left-[18px]" : "left-0.5"}`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex gap-2 rounded-lg bg-surface-2 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Ao desativar, registros já convertidos permanecem em maiúsculas. Fluxo de Bot e Agente
            de IA serão aplicados quando seus cadastros persistentes forem disponibilizados.
          </p>
        </div>
      </Card>

      <ConfirmDialog
        open={pending !== null}
        title="Converter registros existentes?"
        description={
          pending
            ? `Existem ${pending.count} registros em “${pending.label}”. Eles serão convertidos fisicamente para maiúsculas e os próximos cadastros seguirão o mesmo padrão.`
            : undefined
        }
        confirmLabel="Converter e ativar"
        pendingLabel="Convertendo…"
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          await mutation.mutateAsync({
            key: pending.key,
            enabled: true,
            confirmExistingConversion: true,
          });
        }}
      />
    </div>
  );
}
