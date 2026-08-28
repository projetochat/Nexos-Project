import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog, Modal, useDisclosure } from "@/components/modal";
import { Button, Card, Field, Input, SectionHeader, Select, Textarea } from "@/components/ui-kit";
import { crmApi, type ApiContactCustomField } from "@/lib/nexos-api";

export const Route = createFileRoute("/configuracoes/campos-contato")({
  component: ContactFieldsSettings,
});

type TextVariant = "short" | "long" | "html";
type DateVariant = "date" | "datetime";
type NumberSymbol = "" | "R$" | "%" | "$" | "€" | "£" | "¥";

type FieldConfig = {
  text?: { variant?: TextVariant };
  number?: { decimals?: number; thousands?: boolean; symbol?: NumberSymbol };
  date?: { variant?: DateVariant };
};

type FieldForm = {
  label: string;
  type: ApiContactCustomField["type"];
  required: boolean;
  tabName: string;
  groupName: string;
  textVariant: TextVariant;
  dateVariant: DateVariant;
  numberDecimals: number;
  numberThousands: boolean;
  numberSymbol: NumberSymbol;
  note: string;
  optionsText: string;
};

const NUMBER_SYMBOL_OPTIONS: Array<{ value: NumberSymbol; label: string }> = [
  { value: "", label: "Nenhum" },
  { value: "%", label: "%: Percentual" },
  { value: "R$", label: "R$: Real " },
  { value: "$", label: "$: Dólar" },
  { value: "€", label: "€: Euro" },
  { value: "£", label: "£: Libra" },
  { value: "¥", label: "¥: Iene" },
];
const RESERVED_CONTACT_TAB = "Geral";
const RESERVED_CONTACT_GROUP = "Dados do contato";
const DEFAULT_CONTACT_CUSTOM_TAB = "Dados Adicionais";

function ContactFieldsSettings() {
  const [fields, setFields] = React.useState<ApiContactCustomField[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<ApiContactCustomField | null>(null);
  const [deleting, setDeleting] = React.useState<ApiContactCustomField | null>(null);
  const create = useDisclosure();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setFields(await crmApi.listContactCustomFields());
    } catch (error) {
      toast.error("Falha ao carregar campos", { description: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = async (data: FieldForm) => {
    const payload = {
      label: data.label.trim(),
      type: data.type,
      required: data.type === "checkbox" ? false : data.required,
      tabName: data.tabName.trim(),
      groupName: data.groupName.trim(),
      mask: buildFieldMask(data),
      note: data.note.trim() || null,
      options:
        data.type === "list"
          ? data.optionsText
              .split(/\r?\n|,/)
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
    };
    try {
      if (editing) {
        await crmApi.updateContactCustomField(editing.id, payload);
      } else {
        await crmApi.createContactCustomField(payload);
      }
      toast.success(editing ? "Campo atualizado" : "Campo criado");
      create.hide();
      setEditing(null);
      await load();
    } catch (error) {
      toast.error("Falha ao salvar campo", { description: (error as Error).message });
    }
  };

  return (
    <Card className="p-5">
      <SectionHeader
        title="Campos Adicionais"
        subtitle="Defina campos que aparecem no cadastro e edição de contatos."
        actions={
          <Button variant="primary" size="sm" onClick={create.show}>
            <Plus className="h-3.5 w-3.5" /> Novo Campo
          </Button>
        }
      />
      <div className="mt-4 overflow-hidden rounded-lg border border-border">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="w-[24%] px-4 py-3">Campo</th>
              <th className="w-32 px-4 py-3">Tipo</th>
              <th className="w-36 px-4 py-3">Aba</th>
              <th className="w-44 px-4 py-3">Agrupamento</th>
              <th className="w-28 px-4 py-3">Obrigatório</th>
              <th className="px-4 py-3">Nota</th>
              <th className="w-24 px-4 py-3 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            )}
            {!loading &&
              fields.map((field) => (
                <tr key={field.id} className="hover:bg-surface-1">
                  <td className="px-4 py-3 font-medium">{field.label}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fieldTypeLabel(field)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {isReservedContactTab(field.tabName)
                      ? DEFAULT_CONTACT_CUSTOM_TAB
                      : field.tabName}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {isReservedContactGroup(field.groupName) ? "-" : field.groupName || "-"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {field.required ? "Sim" : "Não"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{field.note || "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Editar"
                        onClick={() => setEditing(field)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Excluir"
                        onClick={() => setDeleting(field)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            {!loading && fields.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum campo adicional cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ContactFieldFormModal
        open={create.open || !!editing}
        initial={editing ?? undefined}
        onClose={() => {
          create.hide();
          setEditing(null);
        }}
        onSubmit={save}
        fields={fields}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Excluir campo?"
        description={`Esta ação removerá ${deleting?.label ?? ""} dos novos cadastros.`}
        destructive
        confirmLabel="Excluir"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await crmApi.deleteContactCustomField(deleting.id);
          toast.success("Campo excluído");
          setDeleting(null);
          await load();
        }}
      />
    </Card>
  );
}

function ContactFieldFormModal({
  open,
  onClose,
  onSubmit,
  initial,
  fields,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: FieldForm) => void | Promise<void>;
  initial?: ApiContactCustomField;
  fields: ApiContactCustomField[];
}) {
  const [form, setForm] = React.useState<FieldForm>(emptyFieldForm());
  React.useEffect(() => {
    if (!open) return;
    setForm(initial ? fieldToForm(initial) : emptyFieldForm());
  }, [initial, open]);

  const save = () => {
    if (form.label.trim().length < 2) {
      toast.error("Informe o nome do campo.");
      return;
    }
    if (form.tabName.trim().length < 2) {
      toast.error("Informe a aba do campo.");
      return;
    }
    if (isReservedContactTab(form.tabName)) {
      toast.error("A aba Geral é reservada para os campos padrão do contato.");
      return;
    }
    if (form.groupName.trim() && isReservedContactGroup(form.groupName)) {
      toast.error("Este agrupamento é reservado para os campos padrão do contato.");
      return;
    }
    if (form.type === "list" && !form.optionsText.trim()) {
      toast.error("Informe as opções da lista.");
      return;
    }
    void onSubmit(form);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Editar Campo" : "Novo Campo"}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome *">
          <Input
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
          />
        </Field>
        <div className="grid gap-3 md:grid-cols-[1fr_8rem]">
          <Field label="Tipo *">
            <Select
              value={form.type}
              disabled={!!initial}
              onChange={(event) => {
                const type = event.target.value as FieldForm["type"];
                setForm({ ...form, type, required: type === "checkbox" ? false : form.required });
              }}
            >
              <option value="text">Texto</option>
              <option value="number">Número</option>
              <option value="checkbox">Checkbox</option>
              <option value="list">Lista</option>
              <option value="date">Data</option>
            </Select>
          </Field>
          {form.type !== "checkbox" && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-muted-foreground">
                Obrigatório
              </span>
              <span className="flex h-10 items-center justify-center rounded-lg border border-border bg-surface-1">
                <input
                  type="checkbox"
                  checked={form.required}
                  onChange={(event) => setForm({ ...form, required: event.target.checked })}
                />
              </span>
            </label>
          )}
        </div>
        {form.type === "text" && (
          <Field label="Formato do texto *">
            <Select
              value={form.textVariant}
              onChange={(event) =>
                setForm({ ...form, textVariant: event.target.value as TextVariant })
              }
            >
              <option value="short">Texto Curto</option>
              <option value="long">Texto Longo</option>
              <option value="html">Texto HTML</option>
            </Select>
          </Field>
        )}
        {form.type === "date" && (
          <Field label="Formato da data *">
            <Select
              value={form.dateVariant}
              onChange={(event) =>
                setForm({ ...form, dateVariant: event.target.value as DateVariant })
              }
            >
              <option value="date">Data: 28/08/2026</option>
              <option value="datetime">Data/Hora: 28/08/2026 10:08</option>
            </Select>
          </Field>
        )}
        {form.type === "number" && (
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Casas Decimais">
              <Input
                type="number"
                min={0}
                max={6}
                value={String(form.numberDecimals)}
                onChange={(event) =>
                  setForm({ ...form, numberDecimals: clampInteger(event.target.value, 0, 6) })
                }
              />
            </Field>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-muted-foreground">
                Separador Milhar
              </span>
              <span className="flex h-10 items-center justify-center rounded-lg border border-border bg-surface-1">
                <input
                  type="checkbox"
                  checked={form.numberThousands}
                  onChange={(event) => setForm({ ...form, numberThousands: event.target.checked })}
                />
              </span>
            </label>
            <Field label="Símbolo">
              <Select
                value={form.numberSymbol}
                onChange={(event) =>
                  setForm({ ...form, numberSymbol: event.target.value as NumberSymbol })
                }
              >
                {NUMBER_SYMBOL_OPTIONS.map((option) => (
                  <option key={option.value || "empty"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        {form.type === "list" && (
          <Field label="Opções da lista *">
            <Textarea
              rows={4}
              value={form.optionsText}
              onChange={(event) => setForm({ ...form, optionsText: event.target.value })}
              placeholder="Uma opção por linha"
            />
          </Field>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Field label="Aba *">
              <Input
                value={form.tabName}
                onChange={(event) => setForm({ ...form, tabName: event.target.value })}
                placeholder="Dados Adicionais"
              />
            </Field>
            {isReservedContactTab(form.tabName) && (
              <span className="mt-1 block text-[11px] text-destructive">
                Campos Adicionais não podem ser vinculados na aba Geral
              </span>
            )}
          </div>
          <Field label="Agrupamento">
            <Input
              value={form.groupName}
              onChange={(event) => setForm({ ...form, groupName: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Nota explicativa">
          <Textarea
            rows={3}
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            placeholder="Explique o motivo deste campo."
          />
        </Field>
      </div>
    </Modal>
  );
}

function emptyFieldForm(): FieldForm {
  return {
    label: "",
    type: "text",
    required: false,
    tabName: DEFAULT_CONTACT_CUSTOM_TAB,
    groupName: "",
    textVariant: "short",
    dateVariant: "date",
    numberDecimals: 2,
    numberThousands: true,
    numberSymbol: "",
    note: "",
    optionsText: "",
  };
}

function fieldToForm(field: ApiContactCustomField): FieldForm {
  const config = parseFieldConfig(field.mask);
  const tabName = field.tabName || "";
  const groupName = field.groupName || "";
  return {
    label: field.label,
    type: field.type,
    required: field.required,
    tabName: isReservedContactTab(tabName) ? "" : tabName,
    groupName: isReservedContactGroup(groupName) ? "" : groupName,
    textVariant: config.text?.variant ?? "short",
    dateVariant: config.date?.variant ?? "date",
    numberDecimals: config.number?.decimals ?? 2,
    numberThousands: config.number?.thousands ?? true,
    numberSymbol: config.number?.symbol ?? "",
    note: field.note ?? "",
    optionsText: field.options.join("\n"),
  };
}

function buildFieldMask(data: FieldForm) {
  if (data.type === "text") {
    return JSON.stringify({ text: { variant: data.textVariant } });
  }
  if (data.type === "number") {
    return JSON.stringify({
      number: {
        decimals: clampInteger(data.numberDecimals, 0, 6),
        thousands: data.numberThousands,
        symbol: data.numberSymbol,
      },
    });
  }
  if (data.type === "date") {
    return JSON.stringify({ date: { variant: data.dateVariant } });
  }
  return null;
}

function parseFieldConfig(mask?: string | null): FieldConfig {
  if (!mask?.trim().startsWith("{")) return {};
  try {
    return JSON.parse(mask) as FieldConfig;
  } catch {
    return {};
  }
}

function isReservedContactTab(value: string) {
  return value.trim().toLowerCase() === RESERVED_CONTACT_TAB.toLowerCase();
}

function isReservedContactGroup(value: string) {
  return value.trim().toLowerCase() === RESERVED_CONTACT_GROUP.toLowerCase();
}

function clampInteger(value: string | number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function fieldTypeLabel(field: ApiContactCustomField) {
  if (field.type === "text") {
    const variant = parseFieldConfig(field.mask).text?.variant ?? "short";
    return { short: "Texto Curto", long: "Texto Longo", html: "Texto HTML" }[variant];
  }
  if (field.type === "date") {
    const variant = parseFieldConfig(field.mask).date?.variant ?? "date";
    return variant === "datetime" ? "Data/Hora" : "Data";
  }
  return { number: "Número", checkbox: "Checkbox", list: "Lista" }[field.type];
}
