import { createFileRoute } from "@tanstack/react-router";
import { Card, Button, Field, Input } from "@/components/ui-kit";

export const Route = createFileRoute("/configuracoes/horarios")({
  component: HorariosSettings,
});

const DAYS = [
  ["Segunda-feira", "08:00", "18:00", true],
  ["Terça-feira", "08:00", "18:00", true],
  ["Quarta-feira", "08:00", "18:00", true],
  ["Quinta-feira", "08:00", "18:00", true],
  ["Sexta-feira", "08:00", "18:00", true],
  ["Sábado", "09:00", "13:00", true],
  ["Domingo", "—", "—", false],
] as const;

function HorariosSettings() {
  return (
    <Card>
      <p className="text-sm font-semibold">Horário de atendimento</p>
      <p className="text-xs text-muted-foreground">
        Fora desses horários, os clientes recebem uma mensagem automática.
      </p>
      <div className="mt-6 space-y-2">
        {DAYS.map(([day, start, end, active]) => (
          <div
            key={day}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-surface-1 p-3 md:grid-cols-[160px_1fr_auto]"
          >
            <span className="truncate text-sm font-medium">{day}</span>
            <div className="col-span-2 flex items-center gap-2 md:col-span-1">
              <Input defaultValue={start} className="w-24" disabled={!active} />
              <span className="text-xs text-muted-foreground">até</span>
              <Input defaultValue={end} className="w-24" disabled={!active} />
            </div>
            <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" defaultChecked={active} className="h-3.5 w-3.5" />
              Ativo
            </label>
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost">Cancelar</Button>
        <Button variant="primary">Salvar</Button>
      </div>
    </Card>
  );
}
