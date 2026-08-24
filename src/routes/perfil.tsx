import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import {
  SectionHeader,
  Card,
  Button,
  Field,
  Input,
  Textarea,
  Avatar,
  Badge,
} from "@/components/ui-kit";
import { organizationApi } from "@/lib/nexos-api";
import { ROLE_META, useSession } from "@/lib/session";

export const Route = createFileRoute("/perfil")({
  component: PerfilPage,
});

function PerfilPage() {
  const user = useSession((state) => state.user);
  const [savingAvatar, setSavingAvatar] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const roleMeta = user ? ROLE_META[user.role] : null;
  const displayName = user?.nome ?? "Usuario";
  const initialsScope = user?.empresaNome ?? roleMeta?.scope ?? "Nexo";

  const saveAvatar = async (file: File | undefined) => {
    if (!file || !user) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      toast.error("Use uma imagem PNG, JPG ou WebP.");
      return;
    }
    if (file.size > 250 * 1024) {
      toast.error("A imagem deve ter até 250 KB.");
      return;
    }
    setSavingAvatar(true);
    try {
      const avatarUrl = await readFileAsDataUrl(file);
      const updated = await organizationApi.updateMyProfile({ avatarUrl });
      useSession.setState((state) => ({
        user: state.user
          ? {
              ...state.user,
              nome: updated.user.name,
              avatarUrl: updated.user.avatarUrl ?? undefined,
            }
          : state.user,
      }));
      toast.success("Foto de perfil atualizada.");
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível salvar a foto.");
    } finally {
      setSavingAvatar(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <AppShell>
      <PageContainer>
        <SectionHeader
          title="Seu perfil"
          subtitle="Informacoes do usuario autenticado nesta sessao."
        />

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="flex flex-col items-center text-center">
            <div className="relative">
              <Avatar name={displayName} src={user?.avatarUrl} size={96} />
              <button
                type="button"
                disabled={savingAvatar}
                onClick={() => inputRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-2 text-muted-foreground transition hover:text-foreground disabled:opacity-60"
                title="Alterar foto"
                aria-label="Alterar foto"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => saveAvatar(event.target.files?.[0])}
              />
            </div>
            <p className="mt-4 text-base font-semibold">{displayName}</p>
            <p className="text-xs text-muted-foreground">
              {roleMeta?.label ?? "Perfil"} · {initialsScope}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              <Badge tone="success">Online</Badge>
              <Badge tone="brand" dot={false}>
                {roleMeta?.label ?? "Usuario"}
              </Badge>
            </div>
            <div className="mt-6 w-full border-t border-border pt-4 text-left">
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Empresa</dt>
                  <dd className="text-right font-medium">{user?.empresaNome ?? "Nexo"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Permissoes</dt>
                  <dd className="font-mono font-semibold">{user?.permissions?.length ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">E-mail</dt>
                  <dd className="truncate pl-3 text-right">{user?.email ?? "-"}</dd>
                </div>
              </dl>
            </div>
          </Card>

          <Card>
            <p className="text-sm font-semibold">Dados pessoais</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="Nome completo">
                <Input value={displayName} readOnly />
              </Field>
              <Field label="Perfil">
                <Input value={roleMeta?.label ?? "Usuario"} readOnly />
              </Field>
              <Field label="E-mail">
                <Input value={user?.email ?? ""} readOnly />
              </Field>
              <Field label="Empresa">
                <Input value={user?.empresaNome ?? ""} readOnly />
              </Field>
              <div className="md:col-span-2">
                <Field label="Escopo operacional">
                  <Textarea rows={2} value={roleMeta?.scope ?? ""} readOnly />
                </Field>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="primary" disabled>
                Dados sincronizados pela sessao
              </Button>
            </div>
          </Card>
        </div>
      </PageContainer>
    </AppShell>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}
