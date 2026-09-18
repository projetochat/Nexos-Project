import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Eye, EyeOff, Lock, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Button, Card, Field, Input } from "@/components/ui-kit";
import {
  ProfileCameraModal,
  ProfilePhotoMenu,
  ProfilePhotoMenuButton,
  ProfilePhotoPreviewModal,
} from "@/components/profile-photo-controls";
import { usePhotoCropper } from "@/hooks/use-photo-cropper";
import { organizationApi } from "@/lib/trixus-api";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/configuracoes/empresa")({
  component: EmpresaSettings,
});

function EmpresaSettings() {
  const sessionUser = useSession((state) => state.user);
  const queryClient = useQueryClient();
  const { data: company, isLoading: isLoadingCompany } = useQuery({
    queryKey: ["trixus", "company"],
    queryFn: organizationApi.getCompany,
  });
  const [savingPassword, setSavingPassword] = React.useState(false);
  const [savingAvatar, setSavingAvatar] = React.useState(false);
  const [photoMenuOpen, setPhotoMenuOpen] = React.useState(false);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [photoPreviewOpen, setPhotoPreviewOpen] = React.useState(false);
  const [administratorAvatarUrl, setAdministratorAvatarUrl] = React.useState<string | null>(null);
  const photoInputRef = React.useRef<HTMLInputElement>(null);
  const photoButtonRef = React.useRef<HTMLButtonElement>(null);
  const [presentationName, setPresentationName] = React.useState("");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const newPasswordMatchesCurrent =
    Boolean(currentPassword) && Boolean(newPassword) && currentPassword === newPassword;
  const confirmPasswordMatchesCurrent =
    Boolean(currentPassword) && Boolean(confirmPassword) && currentPassword === confirmPassword;
  const passwordsDoNotMatch =
    Boolean(newPassword) && Boolean(confirmPassword) && newPassword !== confirmPassword;
  const passwordReuseError = "A nova senha deve ser diferente da senha atual.";
  const passwordConfirmationError = "A confirmação da senha não confere.";

  React.useEffect(() => {
    setPresentationName(company?.presentationName ?? company?.responsibleName ?? "Administrador");
  }, [company?.presentationName, company?.responsibleName]);

  React.useEffect(() => {
    setAdministratorAvatarUrl(company?.administratorAvatarUrl ?? sessionUser?.avatarUrl ?? null);
  }, [company?.administratorAvatarUrl, sessionUser?.avatarUrl]);

  const saveAvatarUrl = async (avatarUrl: string | null) => {
    setSavingAvatar(true);
    try {
      const updated = await organizationApi.updateAdministratorCredentials({ avatarUrl });
      const nextAvatarUrl = updated.avatarUrl ?? null;
      setAdministratorAvatarUrl(nextAvatarUrl);
      useSession.setState((state) => ({
        user: state.user ? { ...state.user, avatarUrl: nextAvatarUrl ?? undefined } : state.user,
      }));
      await queryClient.invalidateQueries({ queryKey: ["trixus", "company"] });
      toast.success(nextAvatarUrl ? "Foto de perfil atualizada." : "Foto de perfil removida.");
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível salvar a foto.");
      throw error;
    } finally {
      setSavingAvatar(false);
    }
  };

  const photoCrop = usePhotoCropper(saveAvatarUrl);
  const choosePhoto = (file: File | undefined) => {
    photoCrop.choose(file);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const savePassword = async () => {
    const trimmedPresentationName = presentationName.trim();
    // A senha atual pode continuar preenchida sem transformar a edição do nome em troca de senha.
    const isChangingPassword = Boolean(newPassword || confirmPassword);
    if (!trimmedPresentationName) return toast.error("Informe o nome de apresentação.");
    if (isChangingPassword) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        toast.error("Preencha todos os campos de senha.");
        return;
      }
      if (newPassword.length < 6) {
        toast.error("A nova senha deve ter ao menos 6 caracteres.");
        return;
      }
      if (newPasswordMatchesCurrent) {
        toast.error(passwordReuseError);
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error("A confirmação da senha não confere.");
        return;
      }
    }
    setSavingPassword(true);
    try {
      await organizationApi.updateAdministratorCredentials({
        presentationName: trimmedPresentationName,
        ...(isChangingPassword ? { currentPassword, newPassword, confirmPassword } : {}),
      });
      useSession.setState((state) => ({
        user: state.user ? { ...state.user, nome: trimmedPresentationName } : state.user,
      }));
      await queryClient.invalidateQueries({ queryKey: ["trixus", "company"] });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(
        isChangingPassword ? "Credenciais atualizadas." : "Nome de apresentação atualizado.",
      );
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
              Este usuário possui acesso a todas as funcionalidades permitidas pelo plano da
              empresa.
            </p>
            <p className="mt-0.5 font-normal text-blue-700">
              Utilize as credenciais abaixo para acessar o sistema.
            </p>
          </div>

          <div className="mt-4 grid gap-5 md:grid-cols-[132px_minmax(0,1fr)]">
            <div className="flex min-h-full items-center justify-center">
              <div className="relative">
                <button
                  ref={photoButtonRef}
                  type="button"
                  disabled={savingAvatar}
                  onClick={() => setPhotoMenuOpen((current) => !current)}
                  className="group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-1 text-center text-sm font-semibold text-muted-foreground disabled:opacity-60"
                  title="Opções da foto"
                  aria-label="Opções da foto"
                >
                  <Avatar
                    name={presentationName || "Administrador"}
                    src={administratorAvatarUrl ?? undefined}
                    size={96}
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Camera className="h-8 w-8" />
                  </span>
                </button>
                <ProfilePhotoMenu
                  open={photoMenuOpen}
                  anchorRef={photoButtonRef}
                  onClose={() => setPhotoMenuOpen(false)}
                >
                  <ProfilePhotoMenuButton
                    icon={<Eye className="h-4 w-4" />}
                    onClick={() => {
                      setPhotoMenuOpen(false);
                      if (!administratorAvatarUrl)
                        return toast.info("Nenhuma foto cadastrada para este perfil.");
                      setPhotoPreviewOpen(true);
                    }}
                  >
                    Mostrar foto
                  </ProfilePhotoMenuButton>
                  <ProfilePhotoMenuButton
                    icon={<Camera className="h-4 w-4" />}
                    onClick={() => {
                      setPhotoMenuOpen(false);
                      setCameraOpen(true);
                    }}
                  >
                    Tirar foto
                  </ProfilePhotoMenuButton>
                  <ProfilePhotoMenuButton
                    icon={<Upload className="h-4 w-4" />}
                    onClick={() => {
                      setPhotoMenuOpen(false);
                      photoInputRef.current?.click();
                    }}
                  >
                    Carregar foto
                  </ProfilePhotoMenuButton>
                  <div className="my-1 border-t border-border" />
                  <ProfilePhotoMenuButton
                    className="trash-action"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => {
                      setPhotoMenuOpen(false);
                      void saveAvatarUrl(null).catch(() => {});
                    }}
                  >
                    Remover foto
                  </ProfilePhotoMenuButton>
                </ProfilePhotoMenu>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => choosePhoto(event.target.files?.[0])}
                />
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nome do atendente *">
                  <Input
                    value={presentationName}
                    onChange={(event) => setPresentationName(event.target.value)}
                    disabled={isLoadingCompany || savingPassword}
                    maxLength={120}
                  />
                </Field>
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
              </div>

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
                <Field
                  label="Nova senha *"
                  error={newPasswordMatchesCurrent ? passwordReuseError : undefined}
                >
                  <PasswordInput
                    value={newPassword}
                    onChange={setNewPassword}
                    visible={showNewPassword}
                    onToggle={() => setShowNewPassword((current) => !current)}
                    autoComplete="new-password"
                    invalid={newPasswordMatchesCurrent}
                  />
                </Field>
                <Field
                  label="Confirmar nova senha *"
                  error={
                    passwordsDoNotMatch
                      ? passwordConfirmationError
                      : confirmPasswordMatchesCurrent
                        ? passwordReuseError
                        : undefined
                  }
                >
                  <PasswordInput
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    visible={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword((current) => !current)}
                    autoComplete="new-password"
                    invalid={passwordsDoNotMatch || confirmPasswordMatchesCurrent}
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end border-t border-border pt-4">
            <Button variant="primary" size="lg" onClick={savePassword} disabled={savingPassword}>
              <Lock className="h-4 w-4" />
              {savingPassword ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
          {photoCrop.dialog}
          <ProfileCameraModal
            open={cameraOpen}
            onClose={() => setCameraOpen(false)}
            onCapture={(avatarUrl) => {
              setCameraOpen(false);
              photoCrop.choose(avatarUrl);
            }}
          />
          <ProfilePhotoPreviewModal
            open={photoPreviewOpen}
            src={administratorAvatarUrl ?? undefined}
            onClose={() => setPhotoPreviewOpen(false)}
          />
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
  invalid = false,
}: {
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  canToggle?: boolean;
  onToggle: () => void;
  autoComplete: string;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        className={`pr-10 ${invalid ? "!border-destructive" : ""}`}
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
