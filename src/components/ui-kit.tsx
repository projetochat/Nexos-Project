import * as React from "react";
import { ChevronDown } from "lucide-react";

/* ============================================================
   Nexo · UI Kit
   Primitivos visuais compartilhados. Usa os tokens definidos em
   src/styles.css. Nenhum estilo hardcoded.
   ============================================================ */

export function Card({
  children,
  className = "",
  padding = true,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-card shadow-card ${padding ? "p-6" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:border-primary";
  const sizes: Record<string, string> = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-2.5 text-base",
    icon: "h-9 w-9 text-sm",
  };
  const variants: Record<string, string> = {
    primary:
      "bg-gradient-brand text-white shadow-glow hover:brightness-110 active:brightness-95",
    secondary:
      "bg-secondary text-secondary-foreground border border-border hover:bg-surface-3",
    ghost: "border border-border bg-surface-2 text-foreground hover:bg-surface-3",
    outline:
      "border border-border bg-transparent text-foreground hover:bg-surface-2",
    destructive:
      "bg-destructive text-destructive-foreground hover:brightness-110",
  };
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export type BadgeTone =
  | "default"
  | "success"
  | "warning"
  | "info"
  | "destructive"
  | "brand";

export function Badge({
  tone = "default",
  children,
  dot = true,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  dot?: boolean;
}) {
  const tones: Record<BadgeTone, string> = {
    default: "bg-surface-2 text-foreground border-border",
    success: "bg-success/15 text-success border-success/30",
    warning: "bg-warning/15 text-warning border-warning/30",
    info: "bg-info/15 text-info border-info/30",
    destructive: "bg-destructive/15 text-destructive border-destructive/30",
    brand: "bg-primary/15 text-primary border-primary/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

export function Input({
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary ${className}`}
      {...rest}
    />
  );
}

export function Textarea({
  className = "",
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary ${className}`}
      {...rest}
    />
  );
}

export function Select({
  className = "",
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block w-full">
      <select
        className={`w-full appearance-none rounded-lg border border-border bg-surface-1 px-3 py-2 pr-9 text-sm outline-none transition focus:border-primary ${className}`}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const requiredMarkIndex = label.indexOf("*");
  const hasRequiredMark = requiredMarkIndex >= 0;

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {hasRequiredMark ? (
          <>
            {label.slice(0, requiredMarkIndex)}
            <span className="text-destructive">*</span>
            {label.slice(requiredMarkIndex + 1)}
          </>
        ) : (
          label
        )}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[11px] text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}

export function Avatar({
  name,
  size = 32,
  className = "",
  src,
}: {
  name: string;
  size?: number;
  className?: string;
  src?: string | null;
}) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-brand font-semibold text-white shadow-card ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : initials}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-surface-3 ${className}`} />
  );
}

export function Alert({
  tone,
  title,
  children,
}: {
  tone: "info" | "success" | "warning" | "destructive";
  title: string;
  children?: React.ReactNode;
}) {
  const map = {
    info: "border-info/30 bg-info/10 text-info",
    success: "border-success/30 bg-success/10 text-success",
    warning: "border-warning/30 bg-warning/10 text-warning",
    destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  };
  return (
    <div className={`rounded-lg border p-4 ${map[tone]}`}>
      <p className="text-sm font-semibold">{title}</p>
      {children && (
        <p className="mt-0.5 text-sm text-foreground/80">{children}</p>
      )}
    </div>
  );
}

export function KPI({
  label,
  value,
  delta,
  tone = "info",
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "success" | "warning" | "info" | "destructive";
}) {
  const toneClass = {
    success: "text-success",
    warning: "text-warning",
    info: "text-info",
    destructive: "text-destructive",
  }[tone];
  return (
    <Card>
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 font-mono text-3xl font-semibold tabular-nums">
        {value}
      </p>
      {delta && (
        <p className={`mt-1 text-xs font-medium ${toneClass}`}>
          {delta} vs semana
        </p>
      )}
    </Card>
  );
}

export function SectionHeader({
  title,
  subtitle,
  subtitleClassName = "",
  actions,
}: {
  title: string;
  subtitle?: string;
  subtitleClassName?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle && <p className={`mt-1 text-sm text-muted-foreground ${subtitleClassName}`}>{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted-foreground">
          {icon}
        </div>
      )}
      <p className="text-base font-semibold">{title}</p>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </Card>
  );
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="Nexo">
      <defs>
        <linearGradient id="nexo-mark-grad" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0%" stopColor="oklch(0.62 0.22 275)" />
          <stop offset="100%" stopColor="oklch(0.78 0.14 210)" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#nexo-mark-grad)" opacity="0.15" />
      <path
        d="M8 22 L8 10 L16 22 L24 10 L24 22"
        stroke="url(#nexo-mark-grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="16" cy="17" r="2.2" fill="url(#nexo-mark-grad)" />
    </svg>
  );
}
