import { NOTIFICATION_QUEUES } from "@/lib/inbox-notification-sound";
import type { QueueId } from "@/lib/queue-prefs";
import { Switch } from "./ui/switch";

export function NotificationQueueToggles({
  enabled,
  selected,
  onChange,
}: {
  enabled: boolean;
  selected: QueueId[];
  onChange: (queues: QueueId[]) => void;
}) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {NOTIFICATION_QUEUES.map(({ id, label }) => (
        <label
          key={id}
          className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
        >
          <span className="text-sm">{label}</span>
          <Switch
            checked={selected.includes(id)}
            disabled={!enabled}
            aria-label={`Receber avisos em ${label}`}
            onCheckedChange={(checked) =>
              onChange(checked ? [...selected, id] : selected.filter((queue) => queue !== id))
            }
          />
        </label>
      ))}
    </div>
  );
}
