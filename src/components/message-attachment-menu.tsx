import * as React from "react";
import { ChevronDown, Mic, Paperclip, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { AudioAttachmentRecorder, AudioRecorderButton } from "@/components/audio-recorder-button";
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
  variant = "menu",
  attachment,
  onRemove,
}: {
  disabled?: boolean;
  fileInputLabel: string;
  onAttachment: (attachment: QuickReplyAttachment) => void | Promise<void>;
  onLoadingChange?: (loading: boolean) => void;
  variant?: "menu" | "segmented";
  attachment?: QuickReplyAttachment | null;
  onRemove?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [mode, setMode] = React.useState<"attachment" | "audio">(
    attachment?.mimeType.startsWith("audio/") ? "audio" : "attachment",
  );

  React.useEffect(() => {
    if (!attachment) return;
    setMode(attachment.mimeType.startsWith("audio/") ? "audio" : "attachment");
  }, [attachment]);

  const attach = async (file?: File, source: "attachment" | "audio" = mode) => {
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
      setMode(source);
      setOpen(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  };

  const selectMode = (nextMode: "attachment" | "audio") => {
    if (nextMode === mode) return;
    if (attachment) return;
    setMode(nextMode);
  };

  if (variant === "segmented") {
    return (
      <div
        className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2"
        data-audio-recording={recording || undefined}
      >
        <div
          role="group"
          aria-label="Tipo de mídia"
          className="inline-flex shrink-0 items-center rounded-lg border border-border bg-surface-2 p-0.5"
        >
          <button
            type="button"
            aria-pressed={mode === "attachment"}
            aria-label="Selecionar anexo"
            title="Anexar arquivo"
            disabled={disabled || loading || recording || (!!attachment && mode !== "attachment")}
            onClick={() => selectMode("attachment")}
            className={`flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-60 ${mode === "attachment" ? "text-blue-700 ring-1 ring-inset ring-blue-300" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-pressed={mode === "audio"}
            aria-label="Selecionar gravação de áudio"
            title="Gravar áudio"
            disabled={disabled || loading || recording || (!!attachment && mode !== "audio")}
            onClick={() => selectMode("audio")}
            className={`flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-60 ${mode === "audio" ? "text-blue-700 ring-1 ring-inset ring-blue-300" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Mic className="h-3.5 w-3.5" />
          </button>
        </div>

        {attachment ? (
          <div className="flex min-w-0 items-center gap-2 text-xs text-foreground">
            <button
              type="button"
              aria-label={mode === "audio" ? "Remover áudio" : "Remover arquivo"}
              title={mode === "audio" ? "Remover áudio" : "Remover arquivo"}
              disabled={disabled || loading || recording}
              onClick={onRemove}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="truncate italic" title={attachment.fileName}>
              {mode === "audio" ? "Áudio gravado." : attachment.fileName}
            </span>
          </div>
        ) : mode === "attachment" ? (
          <label className="inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-xs text-foreground transition hover:text-blue-700 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
            <Upload className="h-4 w-4 shrink-0" />
            <span className="truncate italic">Carregar anexo.</span>
            <input
              type="file"
              accept={ACCEPTED_MESSAGE_FILES}
              className="sr-only"
              disabled={disabled || loading}
              aria-label={fileInputLabel}
              onChange={(event) => {
                void attach(event.target.files?.[0], "attachment");
                event.target.value = "";
              }}
            />
          </label>
        ) : (
          <div className="min-w-0 flex-1">
            <AudioAttachmentRecorder
              disabled={disabled || loading}
              onRecorded={(file) => attach(file, "audio")}
              onRecordingChange={setRecording}
            />
          </div>
        )}
      </div>
    );
  }

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
          onRecorded={(file) => attach(file, "audio")}
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
              void attach(event.target.files?.[0], "attachment");
              event.target.value = "";
            }}
          />
        </label>
      </PopoverContent>
    </Popover>
  );
}
