import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, MessageCircle, Save, Ticket } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/modal";
import { Button, Card, Field, Input, Select } from "@/components/ui-kit";
import { organizationApi, type ApiProtocolSettings } from "@/lib/trixus-api";

export const Route = createFileRoute("/configuracoes/controle-numeracao")({
  component: ControleNumeracaoPage,
});

const FORMAT_OPTIONS: Array<{
  value: ApiProtocolSettings["format"];
  label: string;
}> = [
  {
    value: "SEQUENCE",
    label: "Sequencial Único",
  },
  {
    value: "YEAR_SEQUENCE",
    label: "Ano + Sequencial",
  },
  {
    value: "YEAR_MONTH_SEQUENCE",
    label: "Ano + Mês + Sequencial",
  },
  {
    value: "DATE_SEQUENCE",
    label: "Data + Sequencial",
  },
  {
    value: "CUSTOM",
    label: "Personalizado",
  },
];

type PendingConfirmation = {
  current: ApiProtocolSettings;
  remaining: ApiProtocolSettings[];
};

function ControleNumeracaoPage() {
  const [settings, setSettings] = React.useState<ApiProtocolSettings[]>([]);
  const [original, setOriginal] = React.useState<ApiProtocolSettings[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [pending, setPending] = React.useState<PendingConfirmation | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await organizationApi.protocolSettings();
      setSettings(result);
      setOriginal(result);
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível carregar os protocolos.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => void reload(), [reload]);

  const update = (module: ApiProtocolSettings["module"], patch: Partial<ApiProtocolSettings>) => {
    setSettings((current) =>
      current.map((item) => (item.module === module ? { ...item, ...patch } : item)),
    );
  };

  const dirtySettings = settings.filter((item) => {
    const previous = original.find((candidate) => candidate.module === item.module);
    return !previous || protocolSignature(previous) !== protocolSignature(item);
  });

  const persist = async (
    items: ApiProtocolSettings[],
    confirmedModule?: ApiProtocolSettings["module"],
  ) => {
    if (!items.length) return true;
    setSaving(true);
    try {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const result = await organizationApi.updateProtocolSettings({
          module: item.module,
          format: item.format,
          digits: item.digits,
          reset: item.reset,
          customPattern: item.customPattern,
          confirmChange: confirmedModule === item.module,
        });
        if (result.confirmationRequired) {
          setPending({ current: item, remaining: items.slice(index) });
          return false;
        }
        setOriginal((current) => [
          ...current.filter((candidate) => candidate.module !== result.module),
          result,
        ]);
        setSettings((current) =>
          current.map((candidate) => (candidate.module === result.module ? result : candidate)),
        );
      }
      setPending(null);
      toast.success("Controle de numeração atualizado.");
      await reload();
      return true;
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível salvar a numeração.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Card padding={false}>
        <div className="flex items-start gap-3 border-b border-border p-3 sm:p-4">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Save className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Controle de Numeração</h2>
            <p className="text-xs text-muted-foreground">
              Defina os padrões dos protocolos de Chat e Chamados.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Carregando configurações...
          </div>
        ) : (
          <div className="space-y-4 p-3 sm:p-4">
            {settings.map((item) => (
              <ProtocolModuleCard key={item.module} item={item} onChange={update} />
            ))}

            <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="text-xs">
                <p className="font-semibold">Importante</p>
                <p className="text-muted-foreground">
                  As novas configurações valem somente para os próximos protocolos. Os números já
                  gerados não serão alterados.
                </p>
              </div>
            </div>

            <div className="flex justify-end border-t border-border pt-4">
              <Button
                variant="primary"
                className="save-action-button"
                disabled={saving || dirtySettings.length === 0}
                onClick={() => void persist(dirtySettings)}
              >
                <Save className="mr-1.5 h-4 w-4" />
                Salvar configurações
              </Button>
            </div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!pending}
        title="Alterar padrão de protocolo?"
        description="Os protocolos antigos permanecerão inalterados. Somente os novos usarão o novo padrão."
        confirmLabel="Continuar"
        onClose={() => {
          const closingModule = pending?.current.module;
          setPending((current) => (current?.current.module === closingModule ? null : current));
        }}
        onConfirm={async () => {
          if (!pending) return;
          const confirmation = pending;
          setPending(null);
          await persist(confirmation.remaining, confirmation.current.module);
        }}
      />
    </div>
  );
}

function ProtocolModuleCard({
  item,
  onChange,
}: {
  item: ApiProtocolSettings;
  onChange: (module: ApiProtocolSettings["module"], patch: Partial<ApiProtocolSettings>) => void;
}) {
  const isChat = item.module === "CHAT";
  const Icon = isChat ? MessageCircle : Ticket;
  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <div
        className="flex items-center gap-3 border-b border-border px-3 py-3 sm:px-4"
        style={{
          backgroundColor: "color-mix(in srgb, var(--surface-1) 98%, var(--foreground) 2%)",
        }}
      >
        <div className="rounded-lg bg-surface-2 p-2 text-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Protocolo {isChat ? "do Chat" : "de Chamados"}</h3>
          <p className="text-xs text-muted-foreground">
            Defina o padrão dos protocolos {isChat ? "das novas conversas" : "dos chamados"}.
          </p>
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <fieldset>
          <legend className="text-xs font-semibold">Formato de numeração</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {FORMAT_OPTIONS.map((option) => {
              const selected = item.format === option.value;
              return (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-lg border p-2.5 transition hover:border-primary/60 ${
                    selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
                  }`}
                >
                  <span className="flex items-start gap-2">
                    <input
                      type="radio"
                      name={`protocol-format-${item.module}`}
                      value={option.value}
                      checked={selected}
                      onChange={() =>
                        onChange(item.module, {
                          format: option.value,
                          ...(option.value === "CUSTOM"
                            ? { reset: item.reset === "DAILY" ? "NEVER" : item.reset }
                            : { reset: defaultResetForFormat(option.value) }),
                        })
                      }
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold">{option.label}</span>
                      <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
                        Exemplo: {protocolPreview({ ...item, format: option.value })}
                      </span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div
          className={`mt-3 grid gap-3 ${
            item.format === "CUSTOM" ? "md:grid-cols-4" : "md:grid-cols-3"
          }`}
        >
          <Field
            label="Quantidade de dígitos do sequencial"
            hint="Mínimo de dígitos, com zeros à esquerda. A sequência continua ao ultrapassar essa quantidade."
          >
            <Select
              value={String(item.digits)}
              onChange={(event) => onChange(item.module, { digits: Number(event.target.value) })}
            >
              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Resetar número sequencial">
            <Select
              value={item.format === "DATE_SEQUENCE" ? "DAILY" : item.reset}
              disabled={item.format !== "CUSTOM"}
              onChange={(event) =>
                onChange(item.module, {
                  reset: event.target.value as ApiProtocolSettings["reset"],
                })
              }
            >
              {item.format === "DATE_SEQUENCE" && <option value="DAILY">Diariamente</option>}
              <option value="YEARLY">Anualmente</option>
              <option value="MONTHLY">Mensalmente</option>
              <option value="NEVER">Nunca</option>
            </Select>
          </Field>
          {item.format === "CUSTOM" && (
            <Field label="Padrão personalizado">
              <div>
                <Input
                  value={item.customPattern ?? ""}
                  onChange={(event) => onChange(item.module, { customPattern: event.target.value })}
                  placeholder={isChat ? "CHAT.{YEAR}.{SEQ}" : "CH.{YEAR}.{SEQ}"}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Variáveis: {"{YEAR}"}, {"{MONTH}"}, {"{DATE}"} e {"{SEQ}"}.
                </p>
              </div>
            </Field>
          )}
          <Field label="Visualização do próximo protocolo">
            <Input value={protocolPreview(item)} readOnly className="font-mono" />
          </Field>
        </div>
      </div>
    </section>
  );
}

function protocolSignature(item: ApiProtocolSettings) {
  return JSON.stringify({
    module: item.module,
    format: item.format,
    digits: item.digits,
    reset: item.reset,
    customPattern: item.customPattern ?? null,
  });
}

function defaultResetForFormat(
  format: ApiProtocolSettings["format"],
): ApiProtocolSettings["reset"] {
  if (format === "YEAR_SEQUENCE") return "YEARLY";
  if (format === "YEAR_MONTH_SEQUENCE") return "MONTHLY";
  if (format === "DATE_SEQUENCE") return "DAILY";
  return "NEVER";
}

function protocolPreview(item: ApiProtocolSettings) {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const lastDigits = item.preview.match(/(\d+)$/)?.[1];
  const seq = String(lastDigits ? Number(lastDigits) : 1).padStart(item.digits, "0");
  if (item.format === "YEAR_SEQUENCE") return `${year}.${seq}`;
  if (item.format === "YEAR_MONTH_SEQUENCE") return `${year}.${month}.${seq}`;
  if (item.format === "DATE_SEQUENCE")
    return `${now.toISOString().slice(0, 10).replaceAll("-", "")}.${seq}`;
  if (item.format === "CUSTOM") {
    return (
      item.customPattern || (item.module === "CHAT" ? "CHAT.{YEAR}.{SEQ}" : "CH.{YEAR}.{SEQ}")
    )
      .replaceAll("{YEAR}", year)
      .replaceAll("{MONTH}", month)
      .replaceAll("{DATE}", `${year}${month}${day}`)
      .replaceAll("{SEQ}", seq);
  }
  return seq;
}
