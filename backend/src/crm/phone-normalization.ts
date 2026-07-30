import { BadRequestException } from "@nestjs/common";

export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    throw new BadRequestException("Telefone deve conter entre 10 e 15 digitos.");
  }

  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return `+55${digits}`;
  }

  return `+${digits}`;
}
