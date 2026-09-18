import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import { isValidEmail, maskBrazilPhone, maskCnpj, onlyDigits } from "./input-masks";

export const CUSTOM_FIELD_FORMATS = [
  { value: "cpf_cnpj", label: "CPF / CNPJ" },
  { value: "cep", label: "CEP" },
  { value: "phone", label: "Telefone" },
  { value: "email", label: "E-mail" },
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
  if (format === "phone")
    return value.trim().startsWith("+") ? value.trim() : maskBrazilPhone(value);
  const digits = onlyDigits(value);
  if (format === "cep")
    return digits
      .slice(0, 8)
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2-$3");
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
  if (format === "cep") return onlyDigits(value).length === 8 ? null : "Informe um CEP válido.";
  if (format === "phone") return isValidCustomPhone(value) ? null : "Informe um telefone válido.";
  if (format === "cpf_cnpj") {
    const digits = onlyDigits(value);
    const valid =
      digits.length === 11 ? isValidCpf(digits) : digits.length === 14 && isValidCnpj(digits);
    return valid ? null : "Informe um CPF ou CNPJ válido.";
  }
  return null;
}

export function isValidCpf(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const digit = (length: number) => {
    const sum = digits
      .slice(0, length)
      .split("")
      .reduce((total, current, index) => total + Number(current) * (length + 1 - index), 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return digit(9) === Number(digits[9]) && digit(10) === Number(digits[10]);
}

export function isValidCnpj(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const digit = (length: 12 | 13) => {
    const weights =
      length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = digits
      .slice(0, length)
      .split("")
      .reduce((total, current, index) => total + Number(current) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return digit(12) === Number(digits[12]) && digit(13) === Number(digits[13]);
}

function isValidCustomPhone(value: string) {
  const digits = onlyDigits(value);
  const phone = parsePhoneNumberFromString(
    value.trim().startsWith("+") ? value.trim() : `+55${digits}`,
  );
  if (!phone?.isPossible()) return false;

  const subscriber = String(phone.nationalNumber);
  if (/^(\d)\1+$/.test(subscriber)) return false;
  if (phone.countryCallingCode === "55")
    return (
      subscriber.length === 11 && subscriber[2] === "9" && !/^(\d)\1+$/.test(subscriber.slice(3))
    );
  return true;
}
