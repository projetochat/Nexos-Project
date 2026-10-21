import type { ApiQuickReply, QuickReplyMessage } from "./trixus-api";

export function assertQuickReplySaved(saved: ApiQuickReply, expected: QuickReplyMessage[]) {
  const matches =
    saved?.messages?.length === expected.length &&
    expected.every((item, index) => {
      const actual = saved.messages![index];
      return (
        actual.text === item.text.trim() &&
        (actual.attachment?.dataUrl ?? null) === (item.attachment?.dataUrl ?? null) &&
        (actual.attachment?.fileName ?? null) === (item.attachment?.fileName ?? null) &&
        (actual.attachment?.mimeType ?? null) === (item.attachment?.mimeType ?? null) &&
        (actual.attachment?.size ?? null) === (item.attachment?.size ?? null)
      );
    });
  if (!matches)
    throw new Error(
      "O sistema não confirmou o salvamento das mensagens separadas. Atualize a página e tente novamente. Se persistir, solicite a atualização do servidor.",
    );
}

export function quickReplyMessages(reply: ApiQuickReply): QuickReplyMessage[] {
  if (reply.messages?.length) return reply.messages;
  return [
    {
      text: reply.texto,
      attachment: reply.attachmentDataUrl
        ? {
            fileName: reply.attachmentFileName ?? "arquivo",
            mimeType: reply.attachmentMimeType ?? "application/octet-stream",
            size: reply.attachmentSize ?? 0,
            dataUrl: reply.attachmentDataUrl,
          }
        : null,
    },
  ];
}

export type SequenceItem = QuickReplyMessage & {
  clientMessageId: string;
  /** Raw template is resolved by the backend when this individual item is enqueued. */
  templateText?: string;
};
export type SequenceDraft = {
  items: SequenceItem[];
  next: number;
  closeAfter: boolean;
};

export function quickReplyAttachmentMediaType(mimeType: string) {
  if (mimeType.startsWith("image/")) return "image" as const;
  if (mimeType.startsWith("video/")) return "video" as const;
  if (mimeType.startsWith("audio/")) return "voice" as const;
  return "document" as const;
}

export function createSequence(
  reply: ApiQuickReply,
  resolveText: (text: string) => string = (text) => text,
): SequenceDraft {
  return {
    items: quickReplyMessages(reply).map((item) => ({
      ...item,
      text: resolveText(item.text),
      templateText: item.text,
      clientMessageId: crypto.randomUUID(),
    })),
    next: 0,
    closeAfter: reply.close_on_send,
  };
}

const activeSequences = new WeakSet<SequenceItem[]>();

// Keep stable IDs and the accepted cursor so retrying cannot resend earlier items.
export async function sendSequence(
  draft: SequenceDraft,
  signal: AbortSignal,
  transport: {
    send: (item: SequenceItem) => Promise<{ id: string; status: string }>;
    progress: (sent: number) => void;
  },
) {
  if (activeSequences.has(draft.items))
    throw new Error("Aguarde a conclusão do envio em andamento para continuar.");
  activeSequences.add(draft.items);
  try {
    while (draft.next < draft.items.length) {
      if (signal.aborted) throw new Error("Envio interrompido.");
      const item = draft.items[draft.next];
      const result = await transport.send(item);
      if (result.status === "failed")
        throw new Error(`A mensagem ${draft.next + 1} falhou. A sequência foi interrompida.`);
      draft.next++;
      transport.progress(draft.next);
    }
  } finally {
    activeSequences.delete(draft.items);
  }
}
