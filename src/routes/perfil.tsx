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
  const [savingPassword, setSavingPassword] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
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
    if (file.size > 2 * 1024 * 1024) {
      toast.error("A imagem deve ter até 2 MB.");
      return;
    }
    setSavingAvatar(true);
    try {
      const avatarUrl = await readImageAsCompressedDataUrl(file);
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

  const savePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.error("Informe a senha atual e a nova senha.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter ao menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("A confirmação da senha não confere.");
      return;
    }
    setSavingPassword(true);
    try {
      await organizationApi.updateMyProfile({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Senha atualizada.");
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível alterar a senha.");
    } finally {
      setSavingPassword(false);
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

          <Card className="lg:col-start-2">
            <p className="text-sm font-semibold">Alterar senha</p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <Field label="Senha atual *">
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </Field>
              <Field label="Nova senha *">
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </Field>
              <Field label="Confirmar senha *">
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </Field>
            </div>
            <div className="mt-6 flex justify-end border-t border-border pt-4">
              <Button variant="primary" onClick={savePassword} disabled={savingPassword}>
                Salvar senha
              </Button>
            </div>
          </Card>
        </div>
      </PageContainer>
    </AppShell>
  );
}

function readImageAsCompressedDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const maxSize = 512;
      const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * ratio));
      canvas.height = Math.max(1, Math.round(img.height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Não foi possível processar a imagem."));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem."));
    };
    img.src = url;
  });
}
