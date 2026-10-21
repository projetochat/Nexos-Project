import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js";
import { onlyDigits } from "@/lib/input-masks";

const CALLING_CODES = [
  ...new Set(getCountries().map((country) => getCountryCallingCode(country))),
].sort((a, b) => b.length - a.length);

export function splitPhoneByCountry(value: string) {
  const digits = onlyDigits(value);
  const phone = parsePhoneNumberFromString(value.trim().startsWith("+") ? value : `+${digits}`);
  const countryCode =
    phone?.countryCallingCode ??
    CALLING_CODES.find((code) => digits.startsWith(code) && digits.length > code.length) ??
    "55";

  return {
    countryCode,
    localPhone: phone?.nationalNumber
      ? String(phone.nationalNumber)
      : digits.startsWith(countryCode)
        ? digits.slice(countryCode.length)
        : digits,
  };
}

export function formatPhoneForSubmit(value: string, countryCode = "55") {
  const code = onlyDigits(countryCode) || "55";
  const digits = normalizeBrazilMobileDigits(onlyDigits(value), code);
  if (!digits) return value;
  const fullNumber = digits.startsWith(code) ? `+${digits}` : `+${code}${digits}`;
  const phone = parsePhoneNumberFromString(fullNumber);
  return phone?.number ?? fullNumber;
}

function normalizeBrazilMobileDigits(digits: string, countryCode: string) {
  if (countryCode !== "55") return digits;
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return local.length === 10 ? `${local.slice(0, 2)}9${local.slice(2)}` : local;
}
