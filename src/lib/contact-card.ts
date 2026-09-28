import type { ApiContact } from "./trixus-api";
import { formatBrazilPhoneWithDdi } from "./input-masks";

export function contactCardFile(
  contact: Pick<ApiContact, "nome" | "telefone"> & Partial<Pick<ApiContact, "normalizedPhone">>,
) {
  const escape = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
  const card = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escape(contact.nome)}`,
    `N:;${escape(contact.nome)};;;`,
    `TEL;TYPE=CELL:${formatBrazilPhoneWithDdi(contact.normalizedPhone || contact.telefone)}`,
    "END:VCARD",
    "",
  ].join("\r\n");
  return new File([card], "contato.vcf", { type: "text/vcard" });
}
