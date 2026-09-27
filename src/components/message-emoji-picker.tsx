import * as React from "react";
import { Button } from "@/components/ui-kit";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MESSAGE_EMOJIS = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😊",
  "🙂",
  "😉",
  "😍",
  "🥰",
  "😘",
  "😎",
  "🤓",
  "🤔",
  "😮",
  "😢",
  "😭",
  "😡",
  "🤗",
  "👍",
  "👎",
  "👏",
  "🙌",
  "🙏",
  "👋",
  "🤝",
  "💪",
  "👀",
  "❤️",
  "💙",
  "💚",
  "💛",
  "🧡",
  "💜",
  "🤍",
  "🔥",
  "✨",
  "⭐",
  "💯",
  "✅",
  "❌",
  "🎉",
  "🎊",
  "🎂",
  "🎁",
  "🚀",
  "💡",
  "📌",
  "📞",
  "📱",
  "💬",
  "📩",
  "📅",
  "⏰",
  "☕",
  "🌹",
  "🌟",
];

export function MessageEmojiPicker({
  disabled,
  onSelect,
}: {
  disabled?: boolean;
  onSelect: (emoji: string) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={disabled}
          aria-label="Inserir emoji"
          title="Inserir emoji"
        >
          <FaceSlightlySmilingPlus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        role="dialog"
        aria-label="Biblioteca de emojis"
        side="top"
        align="start"
        sideOffset={6}
        className="z-[260] w-72 max-w-[calc(100vw-1rem)] p-2"
      >
        <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">Emojis</p>
        <div className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto">
          {MESSAGE_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Inserir emoji ${emoji}`}
              title={emoji}
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
              className="flex h-8 items-center justify-center rounded text-lg transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FaceSlightlySmilingPlus({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`lucide lucide-face-slightly-smiling-plus preview-icon ${className ?? ""}`}
      aria-hidden="true"
    >
      <path d="M13.267 2.08a10 10 0 1 0 8.653 8.653" />
      <path d="M15 10V9" />
      <path d="M16 5h6" />
      <path d="M16.472 15a6 6 0 0 1-8.943 0" />
      <path d="M19 2v6" />
      <path d="M9 10V9" />
    </svg>
  );
}
