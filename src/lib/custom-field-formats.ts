import { isValidEmail, maskBrazilPhone, maskCnpj, onlyDigits } from "./input-masks";

export const CUSTOM_FIELD_FORMATS = [
  { value: "cpf_cnpj", label: "CPF / CNPJ", placeholder: "000.000.000-00 ou 00.000.000/0000-00" },
  { value: "cep", label: "CEP", placeholder: "00000-000" },
  { value: "phone", label: "Telefone", placeholder: "(00) 00000-0000" },
  { value: "email", label: "E-mail", placeholder: "nome@exemplo.com" },
] as const;
export type CustomFieldFormat = (typeof CUSTOM_FIELD_FORMATS)[number]["value"];

// Formatted fields retain TEXT storage; their format lives in the existing mask configuration.
export function customFieldFormat(field: {
  type: string;
  mask?: string | null;
}): CustomFieldFormat | null {
  if (field.type !== "text" || !field.mask) return null;
  try {
    const config = JSON.parse(field.mask);
    const format = config?.custom?.format;
    return CUSTOM_FIELD_FORMATS.some((option) => option.value === format) ? format : null;
  } catch {
    return null;
  }
}

export function formatCustomField(value: string, format: CustomFieldFormat) {
  if (format === "email") return value.trim();
  if (format === "phone") return maskBrazilPhone(value);
  const digits = onlyDigits(value);
  if (format === "cep") return digits.slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
  if (digits.length > 11) return maskCnpj(digits);
  return digits
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function customFieldError(value: string, format: CustomFieldFormat) {
  if (!value.trim()) return null;
  if (format === "email") return isValidEmail(value) ? null : "Informe um e-mail válido.";
  return null;
}
