import type { ReactNode } from "react";
import { AppShell, PageContainer } from "@/components/app-shell";
import { EmptyState, SectionHeader } from "@/components/ui-kit";

export function ComingSoonPage({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <AppShell>
      <PageContainer>
        <SectionHeader title={title} />
        <EmptyState icon={icon} title="Em breve" description={description} />
      </PageContainer>
    </AppShell>
  );
}
