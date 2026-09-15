import * as React from "react";
import { setNativeInputValue, shouldFillTodayFromShortcut, todayValueForInput } from "@/lib/date-shortcuts";
import { ChevronDown, Search, X } from "lucide-react";

/* ============================================================
   Trixus · UI Kit
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
      className={`rounded-lg border border-border bg-card shadow-card sm:rounded-xl ${padding ? "p-4 sm:p-6" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export type InstanceFilterOption = {
  value: string;
  label: string;
  color?: string | null;
};

export function InstanceFilterSelect({
  value,
  onChange,
  options,
  extraOptions = [],
  allLabel = "Todas",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: InstanceFilterOption[];
  extraOptions?: InstanceFilterOption[];
  allLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const allOptions = [...extraOptions, ...options];
  const selected = allOptions.find((option) => option.value === value);

  React.useEffect(() => {
    if (!open) return;
    const onDocumentPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentPointerDown);
    return () => document.removeEventListener("mousedown", onDocumentPointerDown);
  }, [open]);

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-left text-sm text-foreground transition hover:border-primary/50 focus:border-primary focus:outline-none"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: selected.color ?? "#22c55e" }}
            />
          )}
          <span className="truncate">{selected?.label ?? allLabel}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-64 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-card"
        >
          <button
            type="button"
            role="option"
            aria-selected={!value}
            onClick={() => choose("")}
            className={`flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-surface-1 ${
              !value ? "bg-surface-1 text-foreground" : "text-muted-foreground"
            }`}
          >
            {allLabel}
          </button>
          {allOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              onClick={() => choose(option.value)}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-surface-1 ${
                value === option.value ? "bg-surface-1 text-foreground" : "text-muted-foreground"
              }`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: option.color ?? "#22c55e" }}
              />
              <span className="truncate">{option.label}</span>
            </button>
          ))}
          {allOptions.length === 0 && (
            <p className="px-2.5 py-3 text-sm text-muted-foreground">Nenhuma instância disponível.</p>
          )}
        </div>
      )}
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
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:border-primary";
  const sizes: Record<string, string> = {
    sm: "min-h-8 px-2.5 py-1.5 text-xs",
    md: "min-h-10 px-3 py-2 text-sm sm:px-4",
    lg: "min-h-11 px-4 py-2.5 text-sm sm:px-5 sm:text-base",
    icon: "h-9 w-9 text-sm",
  };
  const variants: Record<string, string> = {
    primary: "bg-gradient-brand text-white shadow-glow hover:brightness-110 active:brightness-95",
    secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-surface-3",
    ghost: "border border-border bg-surface-2 text-foreground hover:bg-surface-3",
    outline: "border border-border bg-transparent text-foreground hover:bg-surface-2",
    destructive: "bg-destructive text-destructive-foreground hover:brightness-110",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export type BadgeTone = "default" | "success" | "warning" | "info" | "destructive" | "brand";

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

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className = "", type, onKeyDown, ...rest }, ref) => (
  <input
    ref={ref}
    type={type}
    className={`min-h-10 w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary ${className}`}
    onKeyDown={(event) => {
      if (
        (type === "date" || type === "datetime-local") &&
        shouldFillTodayFromShortcut(event.nativeEvent)
      ) {
        event.preventDefault();
        setNativeInputValue(event.currentTarget, todayValueForInput(type, event.currentTarget.value));
      }
      onKeyDown?.(event);
    }}
    {...rest}
  />
));

Input.displayName = "Input";

export function SearchInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-10 items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 transition focus-within:border-primary ${className}`}
    >
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-0 focus:outline-none focus:ring-0"
        placeholder={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-muted-foreground transition hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
          aria-label="Limpar busca"
          title="Limpar busca"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function Textarea({
  className = "",
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`min-h-24 w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary ${className}`}
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
        className={`min-h-10 w-full appearance-none rounded-lg border border-border bg-surface-1 px-3 py-2 pr-9 text-sm outline-none transition focus:border-primary ${className}`}
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
  error,
  children,
  asLabel = true,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  asLabel?: boolean;
}) {
  const requiredMarkIndex = label.indexOf("*");
  const hasRequiredMark = requiredMarkIndex >= 0;
  const content = (
    <>
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
      {error ? (
        <span className="mt-1 block text-[11px] font-medium text-destructive">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>
      ) : null}
    </>
  );

  return asLabel ? <label className="block">{content}</label> : <div className="block">{content}</div>;
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
      {src ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-3 ${className}`} />;
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
      {children && <p className="mt-0.5 text-sm text-foreground/80">{children}</p>}
    </div>
  );
}

export function KPI({
  label,
  value,
  delta,
  tone = "info",
  icon,
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "success" | "warning" | "info" | "destructive";
  icon?: React.ReactNode;
}) {
  const toneClass = {
    success: "text-success",
    warning: "text-warning",
    info: "text-info",
    destructive: "text-destructive",
  }[tone];
  return (
    <Card className={icon ? "relative overflow-hidden" : ""}>
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-3 font-mono text-3xl font-semibold tabular-nums">{value}</p>
      {delta && <p className={`mt-1 text-xs font-medium ${toneClass}`}>{delta} vs semana</p>}
      {icon && (
        <span className={`absolute bottom-4 right-4 ${toneClass}`} aria-hidden="true">
          {icon}
        </span>
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
    <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:mb-6 sm:gap-4">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && (
          <p className={`mt-1 text-sm text-muted-foreground ${subtitleClassName}`}>{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
      )}
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
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </Card>
  );
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/trixus-logo.png"
      alt="Trixus"
      width={size}
      height={size}
      className="shrink-0 object-contain"
    />
  );
}
