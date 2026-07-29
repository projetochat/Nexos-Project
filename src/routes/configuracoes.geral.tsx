import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, RotateCcw, Save, Play, PauseCircle, Clock, UserPlus } from "lucide-react";
import { Button, Card, Input } from "@/components/ui-kit";
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
    <Card>
      <div className="mb-4">
        <h2 className="text-base font-semibold">Filas do chat</h2>
        <p className="text-sm text-muted-foreground">
          Renomeie, reordene ou desative as filas exibidas na tela de conversas. O padrão do sistema pode ser
          restaurado a qualquer momento.
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
                <Button variant="outline" size="icon" aria-label="Mover para cima" onClick={() => move(index, -1)} disabled={index === 0}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" aria-label="Mover para baixo" onClick={() => move(index, 1)} disabled={index === prefs.length - 1}>
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
          <Button variant="primary" onClick={handleSave} disabled={!dirty}>
            <Save className="mr-1.5 h-4 w-4" />
            Salvar alterações
          </Button>
        </div>
      </div>
    </Card>
  );
}
