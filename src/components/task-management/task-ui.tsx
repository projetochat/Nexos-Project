import * as React from "react";
import { Badge, Button } from "@/components/ui-kit";

import { taskStatusLabels, taskPriorityLabels, taskDeliveryFailureMessage } from "./task-labels";

export function TaskStatus({ value }: { value: string }) {
  return (
    <Badge
      tone={
        value === "failed" || value === "ambiguous"
          ? "destructive"
          : value === "completed" || value === "sent"
            ? "success"
            : value === "paused" || value === "pending"
              ? "warning"
              : "info"
      }
    >
      {taskStatusLabels[value] ?? value}
    </Badge>
  );
}
export function TaskPriority({ value }: { value: string }) {
  return (
    <Badge tone={value === "high" ? "destructive" : value === "medium" ? "warning" : "success"}>
      {taskPriorityLabels[value] ?? value}
    </Badge>
  );
}
export function TaskPager({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (value: number) => void;
  onPageSize: (value: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
      <span>{total} registro(s)</span>
      <div className="flex items-center gap-2">
        <select
          aria-label="Registros por página"
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value))}
          className="rounded border border-border bg-card px-2 py-1"
        >
          {[25, 50, 100].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Anterior
        </Button>
        <span>
          {page} / {Math.max(1, totalPages)}
        </span>
        <Button size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Próxima
        </Button>
      </div>
    </div>
  );
}
export function TaskCheck({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
export function TaskError({ error }: { error: unknown }) {
  return error ? (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {error instanceof Error ? error.message : String(error)}
    </p>
  ) : null;
}

export function TaskDeliveryFailure({ code }: { code: string }) {
  return <p className="text-xs text-destructive">{taskDeliveryFailureMessage(code)}</p>;
}
