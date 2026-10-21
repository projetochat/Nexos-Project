import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Expand, Shrink } from "lucide-react";
import { DashboardMaximizedContext } from "@/components/dashboard-maximized-context";

export function DashboardMaximizeFrame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className="group relative h-full" data-dashboard-maximize-frame>
        {!open && (
          <DashboardMaximizedContext.Provider value={false}>
            {children}
          </DashboardMaximizedContext.Provider>
        )}
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="pointer-events-none absolute right-2 top-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card/95 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 group-hover:pointer-events-auto group-hover:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
            aria-label={`Maximizar ${title}`}
            title={`Maximizar ${title}`}
          >
            <Expand className="h-4 w-4" aria-hidden />
          </button>
        </Dialog.Trigger>
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[250] bg-black/45 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[251] flex h-dvh w-dvw flex-col bg-background p-0 outline-none"
          data-dashboard-maximized
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <div className="min-h-0 flex-1 overflow-auto" data-dashboard-maximized-scroll>
            <div className="flex min-h-full min-w-full p-3 sm:p-6">
              <div
                className="relative m-auto h-[calc(100dvh-1.5rem)] w-full min-w-0 rounded-xl outline outline-1 outline-gray-300 sm:h-[calc(100dvh-3rem)] dark:outline-gray-600"
                data-dashboard-maximized-content
              >
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="absolute right-2 top-2 z-30 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card/95 text-muted-foreground shadow-sm backdrop-blur transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    aria-label={`Restaurar ${title}`}
                    title={`Restaurar ${title}`}
                  >
                    <Shrink className="h-4 w-4" aria-hidden />
                  </button>
                </Dialog.Close>
                {open && (
                  <DashboardMaximizedContext.Provider value>
                    {children}
                  </DashboardMaximizedContext.Provider>
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
