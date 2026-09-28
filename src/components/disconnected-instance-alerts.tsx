import { AlertTriangle } from "lucide-react";

export function DisconnectedInstanceAlerts({
  connections,
}: {
  connections: Array<{ id: string; name: string; status: string }>;
}) {
  const disconnected = connections.filter((connection) => connection.status === "disconnected");
  if (!disconnected.length) return null;

  return (
    <div className="space-y-2">
      {disconnected.map((connection) => (
        <div
          key={connection.id}
          role="alert"
          className="flex items-center gap-3 rounded-xl bg-destructive/10 px-4 py-3"
        >
          <AlertTriangle className="h-7 w-7 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1 text-sm font-semibold text-black">
            Instância {connection.name} desconectada!
          </p>
        </div>
      ))}
    </div>
  );
}
