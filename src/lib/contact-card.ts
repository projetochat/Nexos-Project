import type { ApiContact } from "./trixus-api";

export function contactCardFile(contact: Pick<ApiContact, "nome" | "telefone">) {
  const escape = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
  const card = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escape(contact.nome)}`,
    `N:;${escape(contact.nome)};;;`,
    `TEL;TYPE=CELL:${contact.telefone.replace(/[^+\d]/g, "")}`,
    "END:VCARD",
    "",
  ].join("\r\n");
  return new File([card], "contato.vcf", { type: "text/vcard" });
}
