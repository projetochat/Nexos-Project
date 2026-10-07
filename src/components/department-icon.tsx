import {
  CreditCard,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Headphones,
  Monitor,
  Network,
  Package,
  Receipt,
  ShoppingCart,
  Truck,
} from "lucide-react";
import * as React from "react";
import type { ComponentType } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { DepartmentIcon as DepartmentIconName } from "@/lib/trixus-api";

export const DEPARTMENT_ICON_OPTIONS = [
  { id: "department", label: "Departamento", icon: Network },
  { id: "shopping-cart", label: "Comercial", icon: ShoppingCart },
  { id: "dollar-sign", label: "Financeiro", icon: DollarSign },
  { id: "credit-card", label: "Cobrança", icon: CreditCard },
  { id: "truck", label: "Logística", icon: Truck },
  { id: "package", label: "Estoque", icon: Package },
  { id: "receipt", label: "Fiscal", icon: Receipt },
  { id: "headset", label: "Suporte", icon: Headphones },
  { id: "monitor", label: "TI", icon: Monitor },
] satisfies Array<{
  id: DepartmentIconName;
  label: string;
  icon: ComponentType<{ className?: string }>;
}>;

export function DepartmentIcon({
  icon,
  className = "h-5 w-5",
}: {
  icon?: DepartmentIconName;
  className?: string;
}) {
  const Icon = DEPARTMENT_ICON_OPTIONS.find((option) => option.id === icon)?.icon ?? Network;
  return <Icon className={className} />;
}

export function DepartmentIconSelect({
  value = "department",
  onChange,
}: {
  value?: DepartmentIconName;
  onChange: (value: DepartmentIconName) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selected =
    DEPARTMENT_ICON_OPTIONS.find((option) => option.id === value) ?? DEPARTMENT_ICON_OPTIONS[0];
  const SelectedIcon = selected.icon;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Selecionar ícone. Atual: ${selected.label}`}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface-1 px-3 text-foreground outline-none transition hover:bg-muted focus:border-primary"
        >
          <SelectedIcon className="h-5 w-5" />
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[250] w-52 p-2">
        <div className="grid grid-cols-3 gap-1">
          {DEPARTMENT_ICON_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = selected.id === option.id;
            return (
              <DropdownMenuItem
                key={option.id}
                title={option.label}
                aria-label={option.label}
                onSelect={() => onChange(option.id)}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center justify-center rounded-md border p-2",
                  isSelected
                    ? "border-primary bg-primary/10 text-primary focus:bg-primary/15"
                    : "border-transparent focus:bg-muted",
                )}
              >
                <Icon className="h-5 w-5" />
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
