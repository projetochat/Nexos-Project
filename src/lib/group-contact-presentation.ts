import { formatBrazilPhoneWithDdi, onlyDigits } from "./input-masks";
import { normalizeOptionLabel } from "./sort-options";

export function matchesGroupContactSearch(
  contact: { name: string; phone?: string | null; normalizedPhone?: string | null },
  query: string,
) {
  const normalizedQuery = normalizeOptionLabel(query);
  if (!normalizedQuery) return true;
  const digits = onlyDigits(query);
  return (
    normalizeOptionLabel(contact.name).includes(normalizedQuery) ||
    normalizeOptionLabel(contact.phone ?? "").includes(normalizedQuery) ||
    (digits.length > 0 &&
      onlyDigits(contact.normalizedPhone || contact.phone || "").includes(digits))
  );
}

export function formatGroupContactPhone(value?: string | null) {
  if (!value) return "-";
  return formatBrazilPhoneWithDdi(value.split("@")[0] ?? value) || value;
}
