import { createFileRoute, Outlet } from "@tanstack/react-router";

import type { InboxTabId } from "@/lib/inbox-tab-state";
import { dashboardInboxLocate } from "@/lib/dashboard-recent-location";

export const Route = createFileRoute("/inbox")({
  validateSearch: (search): { locate?: InboxTabId; tab?: string } => ({
    locate: dashboardInboxLocate(search.locate),
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: () => <Outlet />,
});
