import { BadRequestException } from "@nestjs/common";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";

export function normalizePhone(phone: string) {
  const raw = phone.trim();
  const digits = phone.replace(/\D/g, "");
  if (isWhatsAppGroupPhone(digits)) return `+${digits}`;
  if (digits.length < 6 || digits.length > 15) {
    throw new BadRequestException("Telefone invalido.");
  }

  if (raw.startsWith("+")) {
    if (digits.startsWith("55") && digits.slice(2).startsWith("0")) {
      throw new BadRequestException("Telefone celular brasileiro deve conter DDD e 9 digitos.");
    }
    const phoneNumber = parsePhoneNumberFromString(raw);
    if (!phoneNumber?.isPossible()) {
      throw new BadRequestException("Telefone invalido.");
    }
    if (phoneNumber.countryCallingCode === "55") {
      return normalizeBrazilPhone(String(phoneNumber.nationalNumber));
    }
    return phoneNumber.number;
  }

  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return normalizeBrazilPhone(digits);
  }

  if (digits.startsWith("55")) {
    return normalizeBrazilPhone(digits.slice(2));
  }

  const phoneNumber = parsePhoneNumberFromString(raw.startsWith("+") ? raw : `+${digits}`);
  if (!phoneNumber?.isPossible()) {
    throw new BadRequestException("Telefone invalido.");
  }

  return phoneNumber.number;
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

function normalizeBrazilPhone(digits: string) {
  const local = digits.length === 10 ? `${digits.slice(0, 2)}9${digits.slice(2)}` : digits;
  if (local.length !== 11 || local[2] !== "9" || !BRAZIL_AREA_CODES.has(local.slice(0, 2))) {
    throw new BadRequestException("Telefone celular brasileiro deve conter DDD e 9 digitos.");
  }
  const subscriber = local.slice(3);
  if (/^(\d)\1+$/.test(subscriber)) {
    throw new BadRequestException("Telefone invalido.");
  }
  return `+55${local}`;
}

const BRAZIL_AREA_CODES = new Set([
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "21",
  "22",
  "24",
  "27",
  "28",
  "31",
  "32",
  "33",
  "34",
  "35",
  "37",
  "38",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "51",
  "53",
  "54",
  "55",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "67",
  "68",
  "69",
  "71",
  "73",
  "74",
  "75",
  "77",
  "79",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "89",
  "91",
  "92",
  "93",
  "94",
  "95",
  "96",
  "97",
  "98",
  "99",
]);
