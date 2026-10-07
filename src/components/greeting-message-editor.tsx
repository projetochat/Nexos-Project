import * as React from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui-kit";
import { MessageAttachmentMenu } from "./message-attachment-menu";
import { MessageEmojiPicker } from "./message-emoji-picker";
import { MessageVariablesMenu } from "./message-variables-menu";
import { formatMessageAttachmentSize } from "@/lib/message-attachment";
import type { QuickReplyAttachment } from "@/lib/trixus-api";

export function GreetingMessageEditor({
  value,
  attachment,
  variables,
  disabled,
  invalid,
  placeholder,
  showAttachment = true,
  showEmoji = false,
  attachmentLayout = "menu",
  onChange,
}: {
  value: string;
  attachment: QuickReplyAttachment | null;
  variables: Array<{ token: string; description: string }>;
  disabled: boolean;
  invalid: boolean;
  placeholder: string;
  showAttachment?: boolean;
  showEmoji?: boolean;
  attachmentLayout?: "menu" | "segmented";
  onChange: (value: string, attachment: QuickReplyAttachment | null) => void;
  onSubmit?: () => void;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const insertText = (text: string) => {
    const input = textareaRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? start;
    if (value.length - (end - start) + text.length > 1000) {
      toast.error("A mensagem deve ter no máximo 1000 caracteres.");
      return;
    }
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next, attachment);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  return (
    <div className="overflow-visible rounded-lg border border-border bg-card focus-within:border-primary">
      <textarea
        ref={textareaRef}
        rows={6}
        maxLength={1000}
        value={value}
        onChange={(event) => onChange(event.target.value, attachment)}
        disabled={disabled}
        aria-invalid={invalid}
        placeholder={placeholder}
        className="block min-h-32 w-full resize-y rounded-t-lg border-0 bg-transparent px-3 py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="flex flex-wrap items-center gap-1.5 overflow-visible rounded-b-lg border-t border-border bg-surface-1 px-2 py-1.5">
        {showEmoji && <MessageEmojiPicker disabled={disabled} onSelect={insertText} />}
        <MessageVariablesMenu disabled={disabled} variables={variables} onSelect={insertText} />
        {showAttachment && attachmentLayout === "menu" && attachment && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={disabled}
            aria-label="Remover arquivo"
            onClick={() => onChange(value, null)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
        {showAttachment && attachmentLayout === "menu" && (
          <>
            <MessageAttachmentMenu
              disabled={disabled}
              fileInputLabel="Anexar arquivo à mensagem automática"
              onAttachment={(nextAttachment) => onChange(value, nextAttachment)}
            />
            <span
              className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
              title={attachment?.fileName}
            >
              {attachment
                ? `${attachment.fileName} (${formatMessageAttachmentSize(attachment.size)})`
                : "Imagens até 8 MB; demais arquivos até 10 MB."}
            </span>
          </>
        )}
        {showAttachment && attachmentLayout === "segmented" && (
          <MessageAttachmentMenu
            variant="segmented"
            attachment={attachment}
            disabled={disabled}
            fileInputLabel="Anexar arquivo à mensagem automática"
            onRemove={() => onChange(value, null)}
            onAttachment={(nextAttachment) => onChange(value, nextAttachment)}
          />
        )}
      </div>
    </div>
  );
}
