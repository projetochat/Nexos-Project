import { useState } from "react";
import { SmilePlus } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";

const EMOJIS = [
  "👍",
  "👎",
  "❤️",
  "😂",
  "😊",
  "😍",
  "🥰",
  "😘",
  "😎",
  "🤔",
  "😮",
  "😢",
  "😭",
  "😡",
  "🙏",
  "👏",
  "🙌",
  "👋",
  "🤝",
  "💪",
  "🎉",
  "🎊",
  "🔥",
  "✨",
  "💯",
  "✅",
  "❌",
  "⭐",
  "💙",
  "💚",
  "💛",
  "🧡",
  "💜",
  "🤍",
  "👀",
  "🚀",
  "🎂",
  "☕",
  "🌹",
  "🤗",
];

export function MessageReactionPicker({
  onReact,
}: {
  onReact: (emoji: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const select = async (emoji: string | null) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onReact(emoji);
      setOpen(false);
    } catch {
      setError("Não foi possível atualizar a reação. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Mais emojis"
          title="Mais emojis"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full opacity-70 hover:bg-black/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        className="z-[300] w-64 max-w-[calc(100vw-1rem)] p-2"
        aria-label="Escolher reação"
      >
        <div className="grid grid-cols-8 gap-1">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              disabled={busy}
              aria-label={`Reagir com ${emoji}`}
              onClick={() => void select(emoji)}
              className="flex h-7 items-center justify-center rounded text-lg hover:bg-surface-2 disabled:opacity-50"
            >
              {emoji}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void select(null)}
          className="mt-2 w-full rounded p-2 text-xs hover:bg-surface-2 disabled:opacity-50"
        >
          Remover minha reação
        </button>
        {error && (
          <p role="alert" className="p-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
