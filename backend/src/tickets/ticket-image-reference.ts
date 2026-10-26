export type TicketImageReference =
  | { kind: "message"; conversationId: string; messageId: string }
  | { kind: "attachment"; ticketId: string; attachmentId: string };

const id = "[A-Za-z0-9_:-]{1,191}";
const messagePattern = new RegExp(`^/ticket-images/conversations/(${id})/messages/(${id})$`);
const attachmentPattern = new RegExp(`^/ticket-images/tickets/(${id})/attachments/(${id})$`);

export function parseTicketImageReference(value: string): TicketImageReference | null {
  const message = messagePattern.exec(value);
  if (message) return { kind: "message", conversationId: message[1], messageId: message[2] };
  const attachment = attachmentPattern.exec(value);
  if (attachment)
    return { kind: "attachment", ticketId: attachment[1], attachmentId: attachment[2] };
  return null;
}

export function messageImageReference(conversationId: string, messageId: string) {
  const value = `/ticket-images/conversations/${conversationId}/messages/${messageId}`;
  if (!parseTicketImageReference(value)) throw new Error("Referência de imagem inválida.");
  return value;
}

export function ticketImageSources(html: string) {
  const sources = new Set<string>();
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const source = /\ssrc="([^"]*)"/i.exec(tag)?.[1];
    if (source && parseTicketImageReference(source)) sources.add(source);
  }
  return [...sources];
}

export function replaceTicketImageSources(html: string, replacements: Map<string, string>) {
  return html.replace(/<img\b[^>]*>/gi, (tag) =>
    tag.replace(/(\ssrc=")([^"]*)(")/i, (attribute, prefix, source, suffix) => {
      const replacement = replacements.get(source);
      return replacement ? `${prefix}${replacement}${suffix}` : attribute;
    }),
  );
}
