import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminContainer } from "@/components/admin-shell";
import { Card, SectionHeader, Field, Input, Button } from "@/components/ui-kit";
import { toast } from "sonner";
import { platformApi, type PlatformSettings } from "@/lib/trixus-api";

export const Route = createFileRoute("/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações · Trixus Admin" }] }),
  component: PlatformSettingsPage,
});

const fallbackSettings: PlatformSettings = {
  defaultTrialDays: 14,
  defaultSubscriptionPeriodDays: 30,
  defaultCurrency: "BRL",
};

function PlatformSettingsPage() {
  const [form, setForm] = React.useState<PlatformSettings>(fallbackSettings);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    platformApi
      .settings()
      .then(setForm)
      .catch((error) => toast.error((error as Error).message))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!/^[A-Z]{3}$/.test(form.defaultCurrency)) {
      toast.error("Informe uma moeda ISO válida, como BRL.");
      return;
    }
    setSaving(true);
    try {
      setForm(await platformApi.updateSettings(form));
      toast.success("Configurações da plataforma atualizadas.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminContainer>
      <SectionHeader
        title="Configurações da plataforma"
        subtitle="Valores aplicados nas novas tenants, assinaturas e faturas."
      />
      <Card className="max-w-2xl">
        <h3 className="text-sm font-semibold">Padrões operacionais</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Estas configurações são persistidas, auditadas e usadas pelo backend.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field label="Dias de trial padrão">
            <Input
              type="number"
              min={1}
              max={90}
              disabled={loading}
              value={form.defaultTrialDays}
              onChange={(event) =>
                setForm((current) => ({ ...current, defaultTrialDays: Number(event.target.value) }))
              }
            />
          </Field>
          <Field label="Dias do período padrão">
            <Input
              type="number"
              min={1}
              max={366}
              disabled={loading}
              value={form.defaultSubscriptionPeriodDays}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  defaultSubscriptionPeriodDays: Number(event.target.value),
                }))
              }
            />
          </Field>
          <Field label="Moeda padrão">
            <Input
              maxLength={3}
              disabled={loading}
              value={form.defaultCurrency}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  defaultCurrency: event.target.value.toUpperCase(),
                }))
              }
            />
          </Field>
        </div>
        <div className="mt-6 flex justify-end border-t border-border pt-4">
          <Button variant="primary" onClick={save} disabled={loading || saving}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </Card>
    </AdminContainer>
  );
}
