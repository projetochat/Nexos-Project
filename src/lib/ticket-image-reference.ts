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

// Only URLs created by our authenticated resolver can be serialized back to a reference.
export const hydratedTicketImages = new WeakMap<
  HTMLImageElement,
  { source: string; url: string }
>();
