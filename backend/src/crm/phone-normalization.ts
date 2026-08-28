import { BadRequestException } from "@nestjs/common";

export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (isWhatsAppGroupPhone(digits)) return `+${digits}`;
  if (digits.length < 10 || digits.length > 15) {
    throw new BadRequestException("Telefone deve conter entre 10 e 15 digitos.");
  }

  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return `+55${digits}`;
  }

  return `+${digits}`;
}

export function contactPhoneDuplicateCandidates(phone: string) {
  const normalized = normalizePhone(phone);
  const candidates = new Set([normalized]);
  const groupIdentity = groupContactIdentityFromPhone(phone);
  if (groupIdentity) candidates.add(groupIdentity);
  return [...candidates];
}

export function groupContactIdentityFromPhone(phone: string) {
  const value = phone.trim();
  if (value.startsWith("group:")) return value;
  if (value.endsWith("@g.us")) return `group:${value.replace(/^group:/, "")}`;
  const digits = value.replace(/\D/g, "");
  return isWhatsAppGroupPhone(digits) ? `group:${digits}@g.us` : null;
}

export function isWhatsAppGroupPhone(digits: string) {
  return digits.startsWith("120363") && digits.length >= 16 && digits.length <= 30;
}
