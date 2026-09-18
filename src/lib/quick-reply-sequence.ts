import type { ApiQuickReply, QuickReplyMessage } from "./trixus-api";

export function assertQuickReplySaved(
  saved: ApiQuickReply,
  expected: QuickReplyMessage[],
  intervalSeconds: number,
) {
  const matches =
    saved?.messages?.length === expected.length &&
    saved.intervalSeconds === intervalSeconds &&
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

export type SequenceItem = QuickReplyMessage & { clientMessageId: string; messageId?: string };
export type SequenceDraft = {
  items: SequenceItem[];
  next: number;
  intervalSeconds: number;
  closeAfter: boolean;
};
export function createSequence(
  reply: ApiQuickReply,
  resolveText: (text: string) => string = (text) => text,
): SequenceDraft {
  return {
    items: quickReplyMessages(reply).map((item) => ({
      ...item,
      text: resolveText(item.text),
      clientMessageId: crypto.randomUUID(),
    })),
    next: 0,
    intervalSeconds: reply.intervalSeconds ?? 0,
    closeAfter: reply.close_on_send,
  };
}

export function waitForSequence(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("Envio interrompido."));
    const cancel = () => {
      clearTimeout(timer);
      reject(new Error("Envio interrompido."));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

const activeSequences = new WeakSet<SequenceItem[]>();

// Keep IDs and the confirmed cursor in the draft so retrying cannot resend earlier items.
export async function sendSequence(
  draft: SequenceDraft,
  signal: AbortSignal,
  transport: {
    send: (item: SequenceItem) => Promise<{ id: string; status: string }>;
    get: (id: string) => Promise<{ id: string; status: string }>;
    progress: (sent: number) => void;
    wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  },
) {
  if (activeSequences.has(draft.items))
    throw new Error("Aguarde a conclusão do envio em andamento para continuar.");
  activeSequences.add(draft.items);
  try {
    const wait = transport.wait ?? waitForSequence;
    while (draft.next < draft.items.length) {
      if (signal.aborted) throw new Error("Envio interrompido.");
      if (draft.next > 0 && draft.intervalSeconds) await wait(draft.intervalSeconds * 1000, signal);
      if (signal.aborted) throw new Error("Envio interrompido.");
      const item = draft.items[draft.next];
      let result = item.messageId
        ? await transport.get(item.messageId)
        : await transport.send(item);
      item.messageId = result.id;
      let polls = 0;
      while (!["sent", "delivered", "read"].includes(result.status)) {
        if (result.status === "failed")
          throw new Error(`A mensagem ${draft.next + 1} falhou. A sequência foi interrompida.`);
        if (++polls > 120)
          throw new Error(
            "O envio ainda não foi confirmado. Clique em Continuar para verificar e retomar a sequência.",
          );
        await wait(1000, signal);
        result = await transport.get(item.messageId);
      }
      draft.next++;
      transport.progress(draft.next);
    }
  } finally {
    activeSequences.delete(draft.items);
  }
}
