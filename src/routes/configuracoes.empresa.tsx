import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Eye, EyeOff, Lock } from "lucide-react";
import { toast } from "sonner";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui-kit";
import { organizationApi } from "@/lib/nexos-api";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/configuracoes/empresa")({
  component: EmpresaSettings,
});

function EmpresaSettings() {
  const user = useSession((state) => state.user);
  const [savingPassword, setSavingPassword] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showCurrentPassword, setShowCurrentPassword] = React.useState(false);
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  const saveCompany = () => {
    toast.success("Dados cadastrais sincronizados.");
  };

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
    <div className="space-y-6">
      <Card>
        <p className="text-sm font-semibold">Perfil da empresa</p>
        <p className="text-xs text-muted-foreground">
          Estas informações serão preenchidas automaticamente após a aquisição do software.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Razão social">
            <Input value="Empresa Teste" readOnly />
          </Field>
          <Field label="CNPJ">
            <Input value="12.345.678/0001-90" readOnly />
          </Field>
          <Field label="Fuso horário">
            <Select value="America/Sao_Paulo" disabled>
              <option value="America/Sao_Paulo">America/Sao_Paulo (GMT-3)</option>
            </Select>
          </Field>
          <Field label="Idioma padrão">
            <Select value="pt-BR" disabled>
              <option value="pt-BR">Português (BR)</option>
            </Select>
          </Field>
        </div>
        <div className="mt-6 flex justify-end border-t border-border pt-4">
          <Button variant="primary" onClick={saveCompany}>
            Salvar alterações
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Lock className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-foreground">Troca de senha</h2>
            <p className="text-sm text-muted-foreground">
              Altere a senha do usuário administrador do sistema.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <Alert
            tone="info"
            title="Este usuário é o administrador do sistema, possui acesso total a todas as funcionalidades e não está vinculado a nenhum grupo de permissões."
          >
            Utilize o e-mail e a nova senha abaixo para acessar o sistema.
          </Alert>
        </div>

        <div className="mt-4 space-y-4">
          <Field label="E-mail de acesso *">
            <div className="relative">
              <Input value={user?.email ?? ""} readOnly className="pr-10" />
              <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </Field>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Senha atual *">
              <PasswordInput
                value={currentPassword}
                onChange={setCurrentPassword}
                visible={showCurrentPassword}
                onToggle={() => setShowCurrentPassword((current) => !current)}
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
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
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
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-muted-foreground transition hover:text-foreground"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        title={visible ? "Ocultar senha" : "Mostrar senha"}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
