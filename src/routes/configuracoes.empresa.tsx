import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Field, Input } from "@/components/ui-kit";
import { organizationApi } from "@/lib/trixus-api";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/configuracoes/empresa")({
  component: EmpresaSettings,
});

function EmpresaSettings() {
  const sessionUser = useSession((state) => state.user);
  const { data: company, isLoading: isLoadingCompany } = useQuery({
    queryKey: ["trixus", "company"],
    queryFn: organizationApi.getCompany,
  });
  const [savingPassword, setSavingPassword] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  const savePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Preencha todos os campos de senha.");
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
      await organizationApi.updateAdministratorCredentials({
        currentPassword,
        newPassword,
        confirmPassword,
      });
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
    <div className="space-y-6">
      <Card>
        <p className="text-sm font-semibold">Perfil da empresa</p>
        <p className="text-xs text-muted-foreground">
          Dados cadastrais fixos vinculados ao cadastro da empresa.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Nome da empresa">
            <Input value={company?.name ?? ""} readOnly disabled={isLoadingCompany} />
          </Field>
          <Field label="Razão social">
            <Input value={company?.legalName ?? ""} readOnly disabled={isLoadingCompany} />
          </Field>
          <Field label="Nome do responsável">
            <Input value={company?.responsibleName ?? ""} readOnly disabled={isLoadingCompany} />
          </Field>
          <Field label="CNPJ">
            <Input value={company?.document ?? ""} readOnly disabled={isLoadingCompany} />
          </Field>
          <Field label="Fuso horário">
            <Input value={company?.timezone ?? ""} readOnly disabled={isLoadingCompany} />
          </Field>
          <Field label="Idioma padrão">
            <Input value={company?.locale ?? ""} readOnly disabled={isLoadingCompany} />
          </Field>
        </div>
      </Card>

      {sessionUser?.role === "admin" && company?.canManageAdministratorCredentials && (
        <Card>
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Lock className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-foreground">
                Credenciais do Usuário Administrador
              </h2>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <p className="font-semibold">
              Este usuário possui acesso a todas as funcionalidades permitidas pelo plano da empresa.
            </p>
            <p className="mt-0.5 font-normal text-blue-700">
              Utilize as credenciais abaixo para acessar o sistema.
            </p>
          </div>

          <div className="mt-4 space-y-4">
            <Field label="E-mail de acesso *">
              <div className="relative">
                <Input
                  value={company?.accessEmail ?? ""}
                  readOnly
                  disabled={isLoadingCompany}
                  className="pr-10"
                />
                <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </Field>

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Senha atual *">
                <PasswordInput
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  visible={false}
                  canToggle={false}
                  onToggle={() => undefined}
                  autoComplete="current-password"
                />
              </Field>
              <Field label="Nova senha *">
                <PasswordInput
                  value={newPassword}
                  onChange={setNewPassword}
                  visible={showNewPassword}
                  onToggle={() => setShowNewPassword((current) => !current)}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirmar nova senha *">
                <PasswordInput
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  visible={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((current) => !current)}
                  autoComplete="new-password"
                />
              </Field>
            </div>
          </div>

          <div className="mt-6 flex justify-end border-t border-border pt-4">
            <Button variant="primary" size="lg" onClick={savePassword} disabled={savingPassword}>
              <Lock className="h-4 w-4" />
              {savingPassword ? "Confirmando..." : "Confirmar nova senha"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  visible,
  canToggle = true,
  onToggle,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  canToggle?: boolean;
  onToggle: () => void;
  autoComplete: string;
}) {
  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        className="pr-10"
      />
      {canToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-muted-foreground transition hover:text-foreground"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          title={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
