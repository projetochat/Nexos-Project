import {
  CreditCard,
  DollarSign,
  Headphones,
  Monitor,
  Network,
  Package,
  Receipt,
  ShoppingCart,
  Truck,
} from "lucide-react";
import type { ComponentType } from "react";
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
