export type ContactGridNativeColumnKey =
  | "name"
  | "whatsapp"
  | "email"
  | "instances"
  | "customer"
  | "department"
  | "profile"
  | "tags"
  | "managementLevel"
  | "createdAt"
  | "updatedAt";

export type ContactGridColumnKey = `native:${ContactGridNativeColumnKey}` | `custom:${string}`;

export type ContactGridCustomField = {
  id: string;
  type: "text" | "number" | "checkbox" | "list" | "date";
  mask?: string | null;
};

export const CONTACT_GRID_NATIVE_COLUMNS: ReadonlyArray<{
  key: ContactGridColumnKey;
  label: string;
}> = [
  { key: "native:name", label: "Nome" },
  { key: "native:whatsapp", label: "WhatsApp" },
  { key: "native:email", label: "E-mail" },
  { key: "native:instances", label: "Instâncias" },
  { key: "native:customer", label: "Empresa do Contato" },
  { key: "native:department", label: "Departamento do Contato" },
  { key: "native:profile", label: "Perfil do Contato" },
  { key: "native:tags", label: "Etiquetas" },
  { key: "native:managementLevel", label: "Nível de Gerência" },
  { key: "native:createdAt", label: "Data de cadastro" },
  { key: "native:updatedAt", label: "Última atualização" },
];

export const DEFAULT_CONTACT_GRID_COLUMNS: ContactGridColumnKey[] = [
  "native:name",
  "native:whatsapp",
  "native:customer",
  "native:department",
];

export function isEligibleContactGridCustomField(field: ContactGridCustomField) {
  const config = parseFieldConfig(field.mask);
  if (field.type === "text") {
    const variant = config.text?.variant ?? "short";
    return variant !== "long" && variant !== "html";
  }
  if (field.type === "list") return (config.list?.variant ?? "single") !== "multi";
  return true;
}

export function sanitizeContactGridColumns(
  value: unknown,
  eligibleCustomFieldIds: readonly string[],
) {
  if (!Array.isArray(value)) return [...DEFAULT_CONTACT_GRID_COLUMNS];
  const allowed = new Set<ContactGridColumnKey>([
    ...CONTACT_GRID_NATIVE_COLUMNS.map((column) => column.key),
    ...eligibleCustomFieldIds.map((id) => `custom:${id}` as const),
  ]);
  return Array.from(
    new Set(
      value.filter(
        (key): key is ContactGridColumnKey =>
          typeof key === "string" && allowed.has(key as ContactGridColumnKey),
      ),
    ),
  );
}

function parseFieldConfig(mask?: string | null) {
  if (!mask?.trim().startsWith("{"))
    return {} as {
      text?: { variant?: string };
      list?: { variant?: string };
    };
  try {
    return JSON.parse(mask) as {
      text?: { variant?: string };
      list?: { variant?: string };
    };
  } catch {
    return {};
  }
}
