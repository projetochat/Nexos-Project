import * as React from "react";
import { ChevronDown, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { AudioRecorderButton } from "@/components/audio-recorder-button";
import { Button } from "@/components/ui-kit";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { readMessageAttachment, validateMessageAttachment } from "@/lib/message-attachment";
import type { QuickReplyAttachment } from "@/lib/trixus-api";

const ACCEPTED_MESSAGE_FILES =
  "image/jpeg,image/png,image/webp,video/mp4,video/3gpp,video/webm,audio/ogg,audio/mpeg,audio/mp4,audio/webm,.pdf,.txt,.doc,.docx,.xls,.xlsx";

export function MessageAttachmentMenu({
  disabled,
  fileInputLabel,
  onAttachment,
  onLoadingChange,
}: {
  disabled?: boolean;
  fileInputLabel: string;
  onAttachment: (attachment: QuickReplyAttachment) => void | Promise<void>;
  onLoadingChange?: (loading: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [recording, setRecording] = React.useState(false);

  const attach = async (file?: File) => {
    if (!file) return;
    const validationError = validateMessageAttachment(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setLoading(true);
    onLoadingChange?.(true);
    try {
      await onAttachment(await readMessageAttachment(file));
      setOpen(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && recording) return;
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={disabled || loading}
          aria-label="Abrir opções de anexo"
        >
          Anexo <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        role="dialog"
        aria-label="Opções de anexo"
        side="top"
        align="start"
        sideOffset={6}
        className="z-[260] w-48 space-y-1 p-1.5"
        onEscapeKeyDown={(event) => {
          if (recording) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (recording) event.preventDefault();
        }}
      >
        <AudioRecorderButton
          showLabel
          disabled={disabled || loading}
          onRecorded={attach}
          onRecordingChange={setRecording}
        />
        <label className="inline-flex h-8 w-full cursor-pointer items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-primary transition hover:bg-surface-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
          <Paperclip className="h-3.5 w-3.5" /> Anexar mídia
          <input
            type="file"
            accept={ACCEPTED_MESSAGE_FILES}
            className="sr-only"
            disabled={disabled || loading}
            aria-label={fileInputLabel}
            onChange={(event) => {
              void attach(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </PopoverContent>
    </Popover>
  );
}
