import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js/min";

export function onlyPhoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatPhoneForDisplay(value: string): string {
  const digits = onlyPhoneDigits(value);
  if (!digits) return "";

  const brazilian = formatBrazilPhoneWithDdi(value, false);
  if (brazilian) return brazilian;

  const phone = parsePhoneNumberFromString(`+${digits}`);
  if (!phone?.country || !phone.nationalNumber) return value.trim();

  const nationalNumber = new AsYouType(phone.country).input(String(phone.nationalNumber));
  return `+${phone.countryCallingCode} ${nationalNumber}`.trim();
}

export function formatBrazilPhoneWithDdi(value: string, fallback = true): string {
  const digits = onlyPhoneDigits(value);
  if (!digits) return "";

  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `+55 ${local.slice(0, 2)} ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `+55 ${local.slice(0, 2)} ${local.slice(2, 6)}-${local.slice(6)}`;
  }

  return fallback ? formatPhoneForDisplay(value) : "";
}

export function formatPhoneVariable(value: string): string {
  const digits = onlyPhoneDigits(value);
  const localWithoutCountryCode =
    digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  const local =
    localWithoutCountryCode.length === 10 && /^[6-9]/.test(localWithoutCountryCode.slice(2))
      ? `${localWithoutCountryCode.slice(0, 2)}9${localWithoutCountryCode.slice(2)}`
      : localWithoutCountryCode;
  if (local.length === 11) {
    return `+55 ${local.slice(0, 2)} ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `+55 ${local.slice(0, 2)} ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return formatPhoneForDisplay(value);
}
