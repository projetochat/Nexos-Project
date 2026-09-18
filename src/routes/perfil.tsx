import { usePhotoCropper } from "@/hooks/use-photo-cropper";
import * as React from "react";
import { createPortal } from "react-dom";
import { createFileRoute } from "@tanstack/react-router";
import { Camera, Eye, EyeOff, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { Modal } from "@/components/modal";
import { SectionHeader, Card, Button, Field, Input, Avatar, Badge } from "@/components/ui-kit";
import { organizationApi } from "@/lib/trixus-api";
import { ROLE_META, useSession } from "@/lib/session";

export const Route = createFileRoute("/perfil")({
  component: PerfilPage,
});

function PerfilPage() {
  const user = useSession((state) => state.user);
  const [savingAvatar, setSavingAvatar] = React.useState(false);
  const [photoMenuOpen, setPhotoMenuOpen] = React.useState(false);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [photoPreviewOpen, setPhotoPreviewOpen] = React.useState(false);
  const [savingPassword, setSavingPassword] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const photoButtonRef = React.useRef<HTMLButtonElement>(null);
  const roleMeta = user ? ROLE_META[user.role] : null;
  const displayName = user?.nome ?? "Usuário";
  const initialsScope = user?.empresaNome ?? roleMeta?.scope ?? "Trixus";
  const newPasswordMatchesCurrent =
    Boolean(currentPassword) && Boolean(newPassword) && currentPassword === newPassword;
  const confirmPasswordMatchesCurrent =
    Boolean(currentPassword) && Boolean(confirmPassword) && currentPassword === confirmPassword;
  const passwordsDoNotMatch =
    Boolean(newPassword) && Boolean(confirmPassword) && newPassword !== confirmPassword;
  const passwordReuseError = "A nova senha deve ser diferente da senha atual.";
  const passwordConfirmationError = "A confirmação da senha não confere.";

  const saveAvatarUrl = async (avatarUrl: string | null) => {
    if (!user) return;
    setSavingAvatar(true);
    try {
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
      toast.success(avatarUrl ? "Foto de perfil atualizada." : "Foto de perfil removida.");
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível salvar a foto.");
      throw error;
    } finally {
      setSavingAvatar(false);
    }
  };

  const photoCrop = usePhotoCropper(saveAvatarUrl);
  const saveAvatar = (file: File | undefined) => {
    photoCrop.choose(file);
    if (inputRef.current) inputRef.current.value = "";
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
    if (newPasswordMatchesCurrent) {
      toast.error(passwordReuseError);
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
        <SectionHeader title="Seu Perfil" />

        <div className="grid items-stretch gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="flex h-full flex-col items-center text-center">
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
                <Avatar name={displayName} src={user?.avatarUrl} size={96} />
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
                    if (!user?.avatarUrl)
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
                    inputRef.current?.click();
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
                {roleMeta?.label ?? "Usuário"}
              </Badge>
            </div>
            <div className="mt-6 w-full border-t border-border pt-4 text-left">
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Empresa</dt>
                  <dd className="text-right font-medium">{user?.empresaNome ?? "Trixus"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Permissões</dt>
                  <dd className="font-mono font-semibold">{user?.permissions?.length ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">E-mail</dt>
                  <dd className="truncate pl-3 text-right">{user?.email ?? "-"}</dd>
                </div>
              </dl>
            </div>
          </Card>

          <Card className="h-full">
            <p className="text-sm font-semibold">Dados Pessoais</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Nome">
                <Input value={displayName} readOnly />
              </Field>
              <Field label="Perfil">
                <Input value={roleMeta?.label ?? "Usuário"} readOnly />
              </Field>
              <Field label="E-mail">
                <Input value={user?.email ?? ""} readOnly />
              </Field>
              <Field label="Empresa">
                <Input value={user?.empresaNome ?? ""} readOnly />
              </Field>
            </div>
            <section className="mt-5">
              <p className="text-sm font-semibold">Alterar senha</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Field label="Senha atual *">
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </Field>
                <Field label="Nova senha *">
                  <PasswordInput
                    value={newPassword}
                    visible={showNewPassword}
                    autoComplete="new-password"
                    onChange={setNewPassword}
                    onToggle={() => setShowNewPassword((value) => !value)}
                    error={newPasswordMatchesCurrent ? passwordReuseError : undefined}
                    errorId="profile-new-password-reuse-error"
                  />
                </Field>
                <Field label="Confirmar senha *">
                  <PasswordInput
                    value={confirmPassword}
                    visible={showConfirmPassword}
                    autoComplete="new-password"
                    onChange={setConfirmPassword}
                    onToggle={() => setShowConfirmPassword((value) => !value)}
                    error={
                      passwordsDoNotMatch
                        ? passwordConfirmationError
                        : confirmPasswordMatchesCurrent
                          ? passwordReuseError
                          : undefined
                    }
                    errorId="profile-confirm-password-reuse-error"
                  />
                </Field>
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="primary" onClick={savePassword} disabled={savingPassword}>
                  Salvar senha
                </Button>
              </div>
            </section>
          </Card>
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
          src={user?.avatarUrl}
          onClose={() => setPhotoPreviewOpen(false)}
        />
      </PageContainer>
    </AppShell>
  );
}

function PasswordInput({
  value,
  visible,
  autoComplete,
  onChange,
  onToggle,
  error,
  errorId,
}: {
  value: string;
  visible: boolean;
  autoComplete: string;
  onChange: (value: string) => void;
  onToggle: () => void;
  error?: string;
  errorId?: string;
}) {
  return (
    <div>
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`pr-10 ${error ? "!border-destructive" : ""}`}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          title={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && (
        <span
          id={errorId}
          role="alert"
          className="mt-1 block text-[11px] font-medium text-destructive"
        >
          {error}
        </span>
      )}
    </div>
  );
}

function ProfilePhotoMenuButton({
  icon,
  onClick,
  children,
  className = "",
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-foreground transition hover:bg-surface-1 ${className}`}
      onClick={onClick}
    >
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </button>
  );
}

function ProfilePhotoMenu({
  open,
  anchorRef,
  onClose,
  children,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });

  React.useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        top: Math.min(window.innerHeight - 220, rect.bottom + 8),
        left: Math.max(12, Math.min(window.innerWidth - 204, rect.left)),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, open]);

  React.useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [anchorRef, onClose, open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[260] w-48 rounded-lg border border-border bg-card py-2 text-sm shadow-xl"
      style={{ top: position.top, left: position.left }}
    >
      {children}
    </div>,
    document.body,
  );
}

function ProfileCameraModal({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setError(null);
    const stopCamera = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      })
      .catch(() => setError("Não foi possível acessar a câmera neste dispositivo."));
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open]);

  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight)
      return setError("A câmera ainda não está pronta.");
    const ratio = Math.min(1, 2048 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
    canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) return setError("Não foi possível capturar a imagem.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.82));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tirar foto"
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={capture} disabled={!!error}>
            Capturar
          </Button>
        </>
      }
    >
      {error ? (
        <div className="rounded-lg border border-border bg-surface-1 p-6 text-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : (
        <video
          ref={videoRef}
          playsInline
          muted
          className="aspect-video w-full rounded-lg border border-border bg-black object-cover"
        />
      )}
    </Modal>
  );
}

function ProfilePhotoPreviewModal({
  open,
  src,
  onClose,
}: {
  open: boolean;
  src?: string;
  onClose: () => void;
}) {
  return (
    <Modal open={open && !!src} onClose={onClose} title="Foto de perfil" size="md">
      <div className="flex justify-center">
        {src && (
          <img
            src={src}
            alt="Foto de perfil"
            className="max-h-[70vh] w-full max-w-sm rounded-xl border border-border object-contain"
          />
        )}
      </div>
    </Modal>
  );
}
