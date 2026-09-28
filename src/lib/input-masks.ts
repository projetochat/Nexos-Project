import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js/min";

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatPhoneForDisplay(value: string) {
  const digits = onlyDigits(value);
  if (!digits) return "";

  const phone = parsePhoneNumberFromString(`+${digits}`);
  if (!phone?.country || !phone.nationalNumber) return value.trim();

  const nationalNumber = new AsYouType(phone.country).input(String(phone.nationalNumber));
  return `+${phone.countryCallingCode} ${nationalNumber}`.trim();
}

export function formatBrazilPhoneWithDdi(value: string) {
  const digits = onlyDigits(value);
  if (!digits) return "";

  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `+55 ${local.slice(0, 2)} ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `+55 ${local.slice(0, 2)} ${local.slice(2, 6)}-${local.slice(6)}`;
  }

  return formatPhoneForDisplay(value);
}

export function maskBrazilPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 13);
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length <= 10) {
    return local.replace(/(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3").replace(/-$/, "");
  }
  return local.replace(/(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3").replace(/-$/, "");
}

export function maskCnpj(value: string) {
  return onlyDigits(value)
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
