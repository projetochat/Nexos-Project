import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Trixus" }] }),
  component: () => (
    <AdminShell>
      <Outlet />
    </AdminShell>
  ),
});
