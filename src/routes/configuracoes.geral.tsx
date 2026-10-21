import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  RotateCcw,
  Save,
  Play,
  PauseCircle,
  Clock,
  UserPlus,
} from "lucide-react";
import { Button, Card, Field, Input, Select } from "@/components/ui-kit";
import { ConfirmDialog } from "@/components/modal";
import { organizationApi, type ApiProtocolSettings } from "@/lib/trixus-api";
import {
  DEFAULT_QUEUE_PREFS,
  loadQueuePrefs,
  resetQueuePrefs,
  saveQueuePrefs,
  type QueueId,
  type QueuePref,
} from "@/lib/queue-prefs";

export const Route = createFileRoute("/configuracoes/geral")({
  component: GeralPage,
});

const QUEUE_ICON: Record<QueueId, React.ComponentType<{ className?: string }>> = {
  ativas: Play,
  standby: PauseCircle,
  fila: Clock,
  leads: UserPlus,
};

const QUEUE_HINT: Record<QueueId, string> = {
  ativas: "Conversas atribuídas ao atendente logado e em andamento.",
  standby: "Conversas aguardando retomada pelo atendente.",
  fila: "Conversas sem atendente com histórico de mensagens.",
  leads: "Novos contatos (primeira mensagem) ainda sem atendente.",
};

function GeralPage() {
  const [prefs, setPrefs] = React.useState<QueuePref[]>(() => loadQueuePrefs());
  const [dirty, setDirty] = React.useState(false);

  const update = (next: QueuePref[]) => {
    setPrefs(next);
    setDirty(true);
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= prefs.length) return;
    const copy = [...prefs];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    update(copy);
  };

  const rename = (id: QueueId, label: string) => {
    update(prefs.map((p) => (p.id === id ? { ...p, label } : p)));
  };

  const toggle = (id: QueueId, enabled: boolean) => {
    update(prefs.map((p) => (p.id === id ? { ...p, enabled } : p)));
  };

  const handleSave = () => {
    const cleaned = prefs.map((p) => ({
      ...p,
      label: p.label.trim() || DEFAULT_QUEUE_PREFS.find((d) => d.id === p.id)!.label,
    }));
    saveQueuePrefs(cleaned);
    setPrefs(cleaned);
    setDirty(false);
    toast.success("Configurações de filas atualizadas.");
  };

  const handleReset = () => {
    resetQueuePrefs();
    setPrefs(DEFAULT_QUEUE_PREFS.map((p) => ({ ...p })));
    setDirty(false);
    toast.success("Configurações restauradas para o padrão do sistema.");
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4">
          <h2 className="text-base font-semibold">Filas do chat</h2>
          <p className="text-sm text-muted-foreground">
            Renomeie, reordene ou desative as filas exibidas na tela de conversas. O padrão do
            sistema pode ser restaurado a qualquer momento.
          </p>
        </div>

        <ul className="divide-y divide-border rounded-lg border border-border">
          {prefs.map((p, index) => {
            const Icon = QUEUE_ICON[p.id];
            const defaultLabel = DEFAULT_QUEUE_PREFS.find((d) => d.id === p.id)!.label;
            return (
              <li key={p.id} className="flex flex-col gap-3 p-3 md:flex-row md:items-center">
                <div className="flex w-8 items-center justify-center font-mono text-xs text-muted-foreground">
                  {index + 1}
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-1 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <Input
                    value={p.label}
                    maxLength={24}
                    onChange={(e) => rename(p.id, e.target.value)}
                    placeholder={defaultLabel}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{QUEUE_HINT[p.id]}</p>
                </div>
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={(e) => toggle(p.id, e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  Ativa
                </label>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Mover para cima"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Mover para baixo"
                    onClick={() => move(index, 1)}
                    disabled={index === prefs.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={handleReset}>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Restaurar padrão do sistema
          </Button>
          <div className="flex items-center gap-2">
            {dirty && <span className="text-xs text-muted-foreground">Alterações não salvas</span>}
            <Button
              variant="primary"
              className="save-action-button"
              onClick={handleSave}
              disabled={!dirty}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Salvar alterações
            </Button>
          </div>
        </div>
      </Card>
      <ProtocolNumberingSettings />
    </div>
  );
}

const protocolFormatOptions = [
  ["YEAR_SEQUENCE", "Ano + Sequencial"],
  ["YEAR_MONTH_SEQUENCE", "Ano + Mês + Sequencial"],
  ["SEQUENCE", "Sequencial Único"],
  ["DATE_SEQUENCE", "Data + Sequencial"],
  ["CUSTOM", "Personalizado"],
] as const;

function ProtocolNumberingSettings() {
  const [settings, setSettings] = React.useState<ApiProtocolSettings[]>([]);
  const [pending, setPending] = React.useState<ApiProtocolSettings | null>(null);

  const reload = React.useCallback(async () => {
    try {
      setSettings(await organizationApi.protocolSettings());
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível carregar os protocolos.");
    }
  }, []);
  React.useEffect(() => void reload(), [reload]);

  const update = (module: ApiProtocolSettings["module"], patch: Partial<ApiProtocolSettings>) => {
    setSettings((current) =>
      current.map((item) => (item.module === module ? { ...item, ...patch } : item)),
    );
  };

  const save = async (item: ApiProtocolSettings, confirmChange = false) => {
    const result = await organizationApi.updateProtocolSettings({
      module: item.module,
      format: item.format,
      digits: item.digits,
      reset: item.reset,
      customPattern: item.customPattern,
      confirmChange,
    });
    if (result.confirmationRequired) {
      setPending(item);
      return;
    }
    setPending(null);
    toast.success("Configuração de protocolo atualizada.");
    await reload();
  };

  return (
    <Card>
      <h2 className="text-base font-semibold">Numeração de protocolos</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure Chat e Chamados separadamente. Protocolos anteriores nunca são renumerados.
      </p>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {settings.map((item) => (
          <section key={item.module} className="rounded-xl border border-border p-4">
            <h3 className="font-semibold">
              Protocolo {item.module === "CHAT" ? "do Chat" : "de Chamados"}
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Formato">
                <Select
                  value={item.format}
                  onChange={(event) =>
                    update(item.module, {
                      format: event.target.value as ApiProtocolSettings["format"],
                    })
                  }
                >
                  {protocolFormatOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Dígitos">
                <Select
                  value={String(item.digits)}
                  onChange={(event) => update(item.module, { digits: Number(event.target.value) })}
                >
                  {[4, 5, 6, 7, 8, 9, 10].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Reset">
                <Select
                  value={item.reset}
                  onChange={(event) =>
                    update(item.module, {
                      reset: event.target.value as ApiProtocolSettings["reset"],
                    })
                  }
                >
                  <option value="YEARLY">Anualmente</option>
                  <option value="MONTHLY">Mensalmente</option>
                  <option value="NEVER">Nunca</option>
                </Select>
              </Field>
              {item.format === "CUSTOM" && (
                <Field label="Padrão personalizado">
                  <Input
                    value={item.customPattern ?? ""}
                    onChange={(event) => update(item.module, { customPattern: event.target.value })}
                    placeholder="CHAT.{YEAR}.{SEQ}"
                  />
                </Field>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
              <span className="text-xs text-muted-foreground">Próximo protocolo</span>
              <strong className="font-mono text-sm">{protocolPreview(item)}</strong>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="primary" size="sm" onClick={() => void save(item)}>
                Salvar
              </Button>
            </div>
          </section>
        ))}
      </div>
      <ConfirmDialog
        open={!!pending}
        title="Alterar padrão de protocolo?"
        description="Os protocolos antigos permanecerão inalterados. Somente os novos usarão o novo padrão."
        confirmLabel="Continuar"
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (pending) await save(pending, true);
        }}
      />
    </Card>
  );
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
  if (item.format === "DATE_SEQUENCE") return `${year}${month}${day}.${seq}`;
  if (item.format === "CUSTOM") {
    return (item.customPattern || "{SEQ}")
      .replaceAll("{YEAR}", year)
      .replaceAll("{MONTH}", month)
      .replaceAll("{DATE}", `${year}${month}${day}`)
      .replaceAll("{SEQ}", seq);
  }
  return seq;
}
