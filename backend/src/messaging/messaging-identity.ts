import { normalizePhone } from "../crm/phone-normalization";

export function phoneFromRemoteIdentity(value: string | null | undefined) {
  if (!value || isGroupRemoteIdentity(value)) return null;
  const localPart = value.split("@")[0]?.split(":")[0];
  const digits = localPart?.replace(/\D/g, "") ?? "";
  return digits || null;
}

export function normalizeRemotePhone(value: string) {
  return normalizePhone(value);
}

export function normalizeRemotePhoneCandidates(value: string) {
  const phone = phoneFromRemoteIdentity(value) ?? value;
  const normalized = normalizeRemotePhone(phone);
  const candidates = new Set([normalized]);
  for (const alternative of brazilMobileDigitAlternatives(normalized)) {
    candidates.add(alternative);
  }
  return [...candidates];
}

export function isGroupRemoteIdentity(value: string | null | undefined) {
  return !!value && value.endsWith("@g.us");
}

function brazilMobileDigitAlternatives(normalizedPhone: string) {
  const digits = normalizedPhone.replace(/\D/g, "");
  if (!digits.startsWith("55")) return [];

  const country = digits.slice(0, 2);
  const areaCode = digits.slice(2, 4);
  const subscriber = digits.slice(4);

  if (subscriber.length === 8) {
    return [`+${country}${areaCode}9${subscriber}`];
  }

  if (subscriber.length === 9 && subscriber.startsWith("9")) {
    return [`+${country}${areaCode}${subscriber.slice(1)}`];
  }

  return [];
}
