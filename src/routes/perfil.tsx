import { usePhotoCropper } from "@/hooks/use-photo-cropper";
import * as React from "react";
import { createPortal } from "react-dom";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  Camera,
  Check,
  Eye,
  EyeOff,
  Image as ImageIcon,
  MoreVertical,
  Paperclip,
  Palette,
  RotateCcw,
  Search,
  Send,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageContainer } from "@/components/app-shell";
import { ConfirmDialog, Modal } from "@/components/modal";
import { SectionHeader, Card, Button, Field, Input, Avatar, Badge } from "@/components/ui-kit";
import { organizationApi } from "@/lib/trixus-api";
import { ROLE_META, useSession } from "@/lib/session";
import {
  inboxNotificationSoundEnabled,
  inboxTagNotificationSoundEnabled,
  applyInboxNotificationSoundPreference,
  inboxNotificationQueues,
  setInboxNotificationQueues,
  setInboxTagNotificationSoundEnabled,
} from "@/lib/inbox-notification-sound";
import { Switch } from "@/components/ui/switch";
import type { QueueId } from "@/lib/queue-prefs";
import { NotificationQueueToggles } from "@/components/notification-queue-toggles";
import {
  CHAT_BUBBLE_PALETTE,
  CHAT_APPEARANCE_PALETTES,
  DEFAULT_CHAT_BACKGROUND_COLOR,
  DEFAULT_CHAT_BUBBLE_COLOR,
  DEFAULT_CHAT_BUBBLE_TEXT_COLOR,
  DEFAULT_CUSTOMER_BUBBLE_COLOR,
  DEFAULT_CUSTOMER_BUBBLE_TEXT_COLOR,
  chatBackgroundStyle,
  contrastRatio,
  contrastingTextColor,
  normalizeHexColor,
} from "@/lib/chat-appearance";
import { requiredFieldClassName, showRequiredFieldsToast } from "@/lib/required-fields";

export const Route = createFileRoute("/perfil")({
  component: PerfilPage,
});

function PerfilPage() {
  const user = useSession((state) => state.user);
  const [tab, setTab] = React.useState<"general" | "notifications" | "appearance">("general");
  const [soundEnabled, setSoundEnabled] = React.useState(() =>
    inboxNotificationSoundEnabled(useSession.getState().user?.id),
  );
  const [tagSoundEnabled, setTagSoundEnabled] = React.useState(() =>
    inboxTagNotificationSoundEnabled(useSession.getState().user?.id),
  );
  const [savingAvatar, setSavingAvatar] = React.useState(false);
  const [savingSidebarPreference, setSavingSidebarPreference] = React.useState(false);
  const [notificationQueues, setNotificationQueues] = React.useState(() =>
    inboxNotificationQueues(useSession.getState().user?.id),
  );
  const [photoMenuOpen, setPhotoMenuOpen] = React.useState(false);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [photoPreviewOpen, setPhotoPreviewOpen] = React.useState(false);
  const [savingPassword, setSavingPassword] = React.useState(false);
  const [savingAppearance, setSavingAppearance] = React.useState(false);
  const [requiredPasswordErrors, setRequiredPasswordErrors] = React.useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [chatBubbleColor, setChatBubbleColor] = React.useState(
    () => useSession.getState().user?.chatBubbleColor ?? DEFAULT_CHAT_BUBBLE_COLOR,
  );
  const [chatBubbleTextColor, setChatBubbleTextColor] = React.useState(
    () => useSession.getState().user?.chatBubbleTextColor ?? DEFAULT_CHAT_BUBBLE_TEXT_COLOR,
  );
  const [customerBubbleColor, setCustomerBubbleColor] = React.useState(
    () => useSession.getState().user?.customerBubbleColor ?? DEFAULT_CUSTOMER_BUBBLE_COLOR,
  );
  const [customerBubbleTextColor, setCustomerBubbleTextColor] = React.useState(
    () => useSession.getState().user?.customerBubbleTextColor ?? DEFAULT_CUSTOMER_BUBBLE_TEXT_COLOR,
  );
  const [chatBackgroundColor, setChatBackgroundColor] = React.useState(
    () => useSession.getState().user?.chatBackgroundColor ?? DEFAULT_CHAT_BACKGROUND_COLOR,
  );
  const [chatBackgroundMode, setChatBackgroundMode] = React.useState<"image" | "color">(() =>
    useSession.getState().user?.chatBackgroundMode === "COLOR" ? "color" : "image",
  );
  const [confirmAppearanceReset, setConfirmAppearanceReset] = React.useState(false);
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

  React.useEffect(() => {
    setSoundEnabled(inboxNotificationSoundEnabled(user?.id));
    setNotificationQueues(inboxNotificationQueues(user?.id));
    setChatBubbleColor(user?.chatBubbleColor ?? DEFAULT_CHAT_BUBBLE_COLOR);
    setChatBubbleTextColor(user?.chatBubbleTextColor ?? DEFAULT_CHAT_BUBBLE_TEXT_COLOR);
    setCustomerBubbleColor(user?.customerBubbleColor ?? DEFAULT_CUSTOMER_BUBBLE_COLOR);
    setCustomerBubbleTextColor(user?.customerBubbleTextColor ?? DEFAULT_CUSTOMER_BUBBLE_TEXT_COLOR);
    setChatBackgroundColor(user?.chatBackgroundColor ?? DEFAULT_CHAT_BACKGROUND_COLOR);
    setChatBackgroundMode(user?.chatBackgroundMode === "COLOR" ? "color" : "image");
  }, [
    user?.chatBackgroundColor,
    user?.chatBackgroundMode,
    user?.chatBubbleColor,
    user?.chatBubbleTextColor,
    user?.customerBubbleColor,
    user?.customerBubbleTextColor,
    user?.id,
  ]);

  const saveAppearance = async (reset = false) => {
    if (!user || savingAppearance) return;
    const background = reset
      ? DEFAULT_CHAT_BUBBLE_COLOR
      : normalizeHexColor(chatBubbleColor, DEFAULT_CHAT_BUBBLE_COLOR);
    const textColor = reset
      ? DEFAULT_CHAT_BUBBLE_TEXT_COLOR
      : normalizeHexColor(chatBubbleTextColor, contrastingTextColor(background));
    const customerBackground = reset
      ? DEFAULT_CUSTOMER_BUBBLE_COLOR
      : normalizeHexColor(customerBubbleColor, DEFAULT_CUSTOMER_BUBBLE_COLOR);
    const customerText = reset
      ? DEFAULT_CUSTOMER_BUBBLE_TEXT_COLOR
      : normalizeHexColor(customerBubbleTextColor, contrastingTextColor(customerBackground));
    const useBackgroundImage = reset || chatBackgroundMode === "image";
    const conversationBackground = useBackgroundImage
      ? null
      : normalizeHexColor(chatBackgroundColor, DEFAULT_CHAT_BACKGROUND_COLOR);
    setSavingAppearance(true);
    try {
      const updated = await organizationApi.updateMyProfile({
        chatBubbleColor: reset ? null : background,
        chatBubbleTextColor: reset ? null : textColor,
        customerBubbleColor: reset ? null : customerBackground,
        customerBubbleTextColor: reset ? null : customerText,
        chatBackgroundColor: conversationBackground,
        chatBackgroundMode: useBackgroundImage ? "IMAGE" : "COLOR",
      });
      setChatBubbleColor(updated.user.chatBubbleColor ?? DEFAULT_CHAT_BUBBLE_COLOR);
      setChatBubbleTextColor(updated.user.chatBubbleTextColor ?? DEFAULT_CHAT_BUBBLE_TEXT_COLOR);
      setCustomerBubbleColor(updated.user.customerBubbleColor ?? DEFAULT_CUSTOMER_BUBBLE_COLOR);
      setCustomerBubbleTextColor(
        updated.user.customerBubbleTextColor ?? DEFAULT_CUSTOMER_BUBBLE_TEXT_COLOR,
      );
      setChatBackgroundColor(updated.user.chatBackgroundColor ?? DEFAULT_CHAT_BACKGROUND_COLOR);
      setChatBackgroundMode(updated.user.chatBackgroundMode === "COLOR" ? "color" : "image");
      useSession.setState((state) => ({
        user: state.user
          ? {
              ...state.user,
              chatBubbleColor: updated.user.chatBubbleColor ?? undefined,
              chatBubbleTextColor: updated.user.chatBubbleTextColor ?? undefined,
              customerBubbleColor: updated.user.customerBubbleColor ?? undefined,
              customerBubbleTextColor: updated.user.customerBubbleTextColor ?? undefined,
              chatBackgroundColor: updated.user.chatBackgroundColor ?? undefined,
              chatBackgroundMode: updated.user.chatBackgroundMode ?? "IMAGE",
            }
          : state.user,
      }));
      toast.success(
        reset ? "Aparência restaurada para o padrão Trixus." : "Aparência do Chat atualizada.",
      );
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível salvar a aparência do Chat.");
    } finally {
      setSavingAppearance(false);
    }
  };

  const changeNotificationQueues = (queues: QueueId[]) => {
    if (!user) return;
    setInboxNotificationQueues(user.id, queues);
    setNotificationQueues(queues);
  };

  const changeSoundPreference = (enabled: boolean) => {
    if (!user) return;
    const queues = applyInboxNotificationSoundPreference(user.id, enabled);
    setSoundEnabled(enabled);
    setNotificationQueues(queues);
    toast.success(enabled ? "Aviso sonoro ativado." : "Aviso sonoro desativado.");
  };

  const changeTagSoundPreference = (enabled: boolean) => {
    if (!user) return;
    setInboxTagNotificationSoundEnabled(user.id, enabled);
    setTagSoundEnabled(enabled);
    toast.success(
      enabled ? "Aviso sonoro de etiquetas ativado." : "Aviso sonoro de etiquetas desativado.",
    );
  };

  const changeSidebarPreference = async (checked: boolean) => {
    if (!user || savingSidebarPreference) return;
    setSavingSidebarPreference(true);
    try {
      const updated = await organizationApi.updateMyProfile({ keepSidebarCollapsed: checked });
      useSession.setState((state) => ({
        user: state.user
          ? {
              ...state.user,
              keepSidebarCollapsed: updated.user.keepSidebarCollapsed ?? checked,
            }
          : state.user,
      }));
      toast.success("Preferência do menu atualizada.");
    } catch (error) {
      toast.error((error as Error).message || "Não foi possível atualizar a preferência do menu.");
    } finally {
      setSavingSidebarPreference(false);
    }
  };

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
    const nextRequiredErrors = {
      currentPassword: !currentPassword,
      newPassword: !newPassword,
      confirmPassword: !confirmPassword,
    };
    if (
      nextRequiredErrors.currentPassword ||
      nextRequiredErrors.newPassword ||
      nextRequiredErrors.confirmPassword
    ) {
      setRequiredPasswordErrors(nextRequiredErrors);
      showRequiredFieldsToast([
        ...(nextRequiredErrors.currentPassword ? ["Senha atual"] : []),
        ...(nextRequiredErrors.newPassword ? ["Nova senha"] : []),
        ...(nextRequiredErrors.confirmPassword ? ["Confirmar senha"] : []),
      ]);
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
      setRequiredPasswordErrors({
        currentPassword: false,
        newPassword: false,
        confirmPassword: false,
      });
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
            <div className="mb-5 flex border-b border-border text-sm">
              <ProfileTabButton active={tab === "general"} onClick={() => setTab("general")}>
                Dados pessoais
              </ProfileTabButton>
              <ProfileTabButton
                active={tab === "notifications"}
                onClick={() => setTab("notifications")}
              >
                <Bell className="h-4 w-4" /> Notificações
              </ProfileTabButton>
              <ProfileTabButton active={tab === "appearance"} onClick={() => setTab("appearance")}>
                <Palette className="h-4 w-4" /> Aparência
              </ProfileTabButton>
            </div>
            {tab === "general" ? (
              <>
                <p className="text-sm font-semibold">Dados Pessoais</p>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
                  <Field label="Nome">
                    <Input value={displayName} readOnly />
                  </Field>
                  <Field label="Perfil">
                    <Input value={roleMeta?.label ?? "Usuário"} readOnly />
                  </Field>
                  <div className="col-span-2 md:col-span-1">
                    <Field label="E-mail">
                      <Input value={user?.email ?? ""} readOnly />
                    </Field>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <Field label="Empresa">
                      <Input value={user?.empresaNome ?? ""} readOnly />
                    </Field>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-1 p-4">
                  <div>
                    <label htmlFor="profile-keep-sidebar-collapsed" className="text-sm font-medium">
                      Manter menu recolhido
                    </label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Mantém o menu lateral recolhido por padrão neste usuário.
                    </p>
                  </div>
                  <Switch
                    id="profile-keep-sidebar-collapsed"
                    checked={user?.keepSidebarCollapsed ?? false}
                    disabled={savingSidebarPreference}
                    onCheckedChange={(checked) => void changeSidebarPreference(checked)}
                    aria-label="Manter menu recolhido"
                  />
                </div>
                <section className="mt-5">
                  <p className="text-sm font-semibold">Alterar senha</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
                    <div className="col-span-2 md:col-span-1">
                      <Field label="Senha atual *">
                        <Input
                          type="password"
                          autoComplete="current-password"
                          value={currentPassword}
                          onChange={(event) => {
                            setCurrentPassword(event.target.value);
                            if (event.target.value)
                              setRequiredPasswordErrors((current) => ({
                                ...current,
                                currentPassword: false,
                              }));
                          }}
                          aria-invalid={requiredPasswordErrors.currentPassword}
                          className={requiredFieldClassName(requiredPasswordErrors.currentPassword)}
                        />
                      </Field>
                    </div>
                    <Field label="Nova senha *">
                      <PasswordInput
                        value={newPassword}
                        visible={showNewPassword}
                        autoComplete="new-password"
                        onChange={(value) => {
                          setNewPassword(value);
                          if (value)
                            setRequiredPasswordErrors((current) => ({
                              ...current,
                              newPassword: false,
                            }));
                        }}
                        onToggle={() => setShowNewPassword((value) => !value)}
                        error={newPasswordMatchesCurrent ? passwordReuseError : undefined}
                        invalid={requiredPasswordErrors.newPassword}
                        errorId="profile-new-password-reuse-error"
                      />
                    </Field>
                    <Field label="Confirmar senha *">
                      <PasswordInput
                        value={confirmPassword}
                        visible={showConfirmPassword}
                        autoComplete="new-password"
                        onChange={(value) => {
                          setConfirmPassword(value);
                          if (value)
                            setRequiredPasswordErrors((current) => ({
                              ...current,
                              confirmPassword: false,
                            }));
                        }}
                        onToggle={() => setShowConfirmPassword((value) => !value)}
                        error={
                          passwordsDoNotMatch
                            ? passwordConfirmationError
                            : confirmPasswordMatchesCurrent
                              ? passwordReuseError
                              : undefined
                        }
                        errorId="profile-confirm-password-reuse-error"
                        invalid={requiredPasswordErrors.confirmPassword}
                      />
                    </Field>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="primary"
                      className="save-action-button"
                      onClick={savePassword}
                      disabled={savingPassword}
                    >
                      Salvar senha
                    </Button>
                  </div>
                </section>
              </>
            ) : tab === "notifications" ? (
              <section aria-labelledby="notification-preferences-title">
                <p id="notification-preferences-title" className="text-sm font-semibold">
                  Notificações
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Escolha como deseja receber avisos durante o atendimento.
                </p>
                <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-1 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                      {soundEnabled ? (
                        <Volume2 className="h-4 w-4" />
                      ) : (
                        <VolumeX className="h-4 w-4" />
                      )}
                    </span>
                    <div>
                      <label htmlFor="profile-notification-sound" className="text-sm font-medium">
                        Aviso sonoro de novas mensagens
                      </label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Reproduz um som quando uma nova mensagem é recebida no atendimento.
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="profile-notification-sound"
                    checked={soundEnabled}
                    onCheckedChange={changeSoundPreference}
                    aria-label="Aviso sonoro de novas mensagens"
                  />
                </div>
                <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-1 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                      {tagSoundEnabled ? (
                        <Volume2 className="h-4 w-4" />
                      ) : (
                        <VolumeX className="h-4 w-4" />
                      )}
                    </span>
                    <div>
                      <label
                        htmlFor="profile-tag-notification-sound"
                        className="text-sm font-medium"
                      >
                        Aviso sonoro de etiquetas
                      </label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Avisa sobre uma nova conversa passiva com etiqueta sonora ativa.
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="profile-tag-notification-sound"
                    checked={tagSoundEnabled}
                    onCheckedChange={changeTagSoundPreference}
                    aria-label="Aviso sonoro de etiquetas"
                  />
                </div>
                <fieldset className="mt-4" disabled={!soundEnabled}>
                  <legend className="text-sm font-medium">Receber avisos nas abas</legend>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Selecione as abas que devem emitir um aviso sonoro. As preferências são salvas
                    automaticamente neste navegador.
                  </p>
                  <NotificationQueueToggles
                    enabled={soundEnabled}
                    selected={notificationQueues}
                    onChange={changeNotificationQueues}
                  />
                </fieldset>
              </section>
            ) : (
              <section aria-labelledby="chat-appearance-title">
                <ChatAppearancePanel
                  chatBubbleColor={chatBubbleColor}
                  chatBubbleTextColor={chatBubbleTextColor}
                  customerBubbleColor={customerBubbleColor}
                  customerBubbleTextColor={customerBubbleTextColor}
                  chatBackgroundColor={chatBackgroundColor}
                  chatBackgroundMode={chatBackgroundMode}
                  saving={savingAppearance}
                  onChatBubbleColorChange={setChatBubbleColor}
                  onChatBubbleTextColorChange={setChatBubbleTextColor}
                  onCustomerBubbleColorChange={setCustomerBubbleColor}
                  onCustomerBubbleTextColorChange={setCustomerBubbleTextColor}
                  onChatBackgroundColorChange={setChatBackgroundColor}
                  onChatBackgroundModeChange={setChatBackgroundMode}
                  onReset={() => setConfirmAppearanceReset(true)}
                  onSave={() => void saveAppearance()}
                />
                <ConfirmDialog
                  open={confirmAppearanceReset}
                  title="Restaurar aparência?"
                  description="As cores oficiais do Trixus serão restauradas para este usuário."
                  confirmLabel="Restaurar"
                  onClose={() => setConfirmAppearanceReset(false)}
                  onConfirm={async () => {
                    await saveAppearance(true);
                    setConfirmAppearanceReset(false);
                  }}
                />
              </section>
            )}
          </Card>
        </div>
        <footer className="mt-6 border-t border-border pt-4 text-center text-[11px] font-semibold tracking-[0.16em] text-muted-foreground">
          V 1.0
        </footer>
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

type ChatBackgroundMode = "image" | "color";

function ChatAppearancePanel({
  chatBubbleColor,
  chatBubbleTextColor,
  customerBubbleColor,
  customerBubbleTextColor,
  chatBackgroundColor,
  chatBackgroundMode,
  saving,
  onChatBubbleColorChange,
  onChatBubbleTextColorChange,
  onCustomerBubbleColorChange,
  onCustomerBubbleTextColorChange,
  onChatBackgroundColorChange,
  onChatBackgroundModeChange,
  onReset,
  onSave,
}: {
  chatBubbleColor: string;
  chatBubbleTextColor: string;
  customerBubbleColor: string;
  customerBubbleTextColor: string;
  chatBackgroundColor: string;
  chatBackgroundMode: ChatBackgroundMode;
  saving: boolean;
  onChatBubbleColorChange: (value: string) => void;
  onChatBubbleTextColorChange: (value: string) => void;
  onCustomerBubbleColorChange: (value: string) => void;
  onCustomerBubbleTextColorChange: (value: string) => void;
  onChatBackgroundColorChange: (value: string) => void;
  onChatBackgroundModeChange: (value: ChatBackgroundMode) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const currentColors = [
    normalizeHexColor(chatBubbleColor, DEFAULT_CHAT_BUBBLE_COLOR),
    normalizeHexColor(chatBubbleTextColor, DEFAULT_CHAT_BUBBLE_TEXT_COLOR),
    normalizeHexColor(customerBubbleColor, DEFAULT_CUSTOMER_BUBBLE_COLOR),
    normalizeHexColor(customerBubbleTextColor, DEFAULT_CUSTOMER_BUBBLE_TEXT_COLOR),
    normalizeHexColor(chatBackgroundColor, DEFAULT_CHAT_BACKGROUND_COLOR),
  ];
  const selectedPalette = Object.entries(CHAT_APPEARANCE_PALETTES).find(([name, colors]) => {
    const paletteMatches = colors.every((color, index) => color === currentColors[index]);
    return paletteMatches && (name !== "Padrão" || chatBackgroundMode === "image");
  })?.[0];
  const colorsValid = [
    chatBubbleColor,
    chatBubbleTextColor,
    customerBubbleColor,
    customerBubbleTextColor,
    ...(chatBackgroundMode === "color" ? [chatBackgroundColor] : []),
  ].every((color) => /^#[0-9A-Fa-f]{6}$/.test(color));
  const hasLowContrast =
    contrastRatio(chatBubbleColor, chatBubbleTextColor) < 4.5 ||
    contrastRatio(customerBubbleColor, customerBubbleTextColor) < 4.5;

  const applyPalette = (name: string, colors: readonly string[]) => {
    onChatBubbleColorChange(colors[0]);
    onChatBubbleTextColorChange(colors[1]);
    onCustomerBubbleColorChange(colors[2]);
    onCustomerBubbleTextColorChange(colors[3]);
    onChatBackgroundColorChange(colors[4]);
    onChatBackgroundModeChange(name === "Padrão" ? "image" : "color");
  };

  return (
    <div>
      <p id="chat-appearance-title" className="text-sm font-semibold">
        Personalize a aparência das conversas
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Escolha as cores e o fundo que melhor se adequam à sua visualização. As alterações são
        aplicadas somente ao seu perfil.
      </p>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-border p-4">
            <p className="text-sm font-semibold">Paletas de cores predefinidas</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Selecione uma paleta ou personalize manualmente.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {Object.entries(CHAT_APPEARANCE_PALETTES).map(([name, colors]) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={selectedPalette === name}
                  onClick={() => applyPalette(name, colors)}
                  className={`relative min-h-20 rounded-lg border p-2 text-center transition hover:border-primary/60 ${
                    selectedPalette === name
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-surface-1"
                  }`}
                >
                  {selectedPalette === name && (
                    <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-primary" />
                  )}
                  <span className="mx-auto flex w-fit overflow-hidden rounded-md border border-border">
                    <span className="h-7 w-7" style={{ backgroundColor: colors[0] }} />
                    <span className="h-7 w-7" style={{ backgroundColor: colors[2] }} />
                  </span>
                  <span className="mt-1.5 block text-[11px] font-medium leading-tight">{name}</span>
                </button>
              ))}
              <button
                type="button"
                aria-pressed={!selectedPalette}
                onClick={() => onChatBackgroundModeChange("color")}
                className={`relative min-h-20 rounded-lg border p-2 text-center transition hover:border-primary/60 ${
                  !selectedPalette
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-surface-1"
                }`}
              >
                {!selectedPalette && (
                  <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-primary" />
                )}
                <span className="mx-auto flex h-7 w-14 items-center justify-center rounded-md border border-border bg-gradient-to-r from-blue-500 via-emerald-400 to-rose-500">
                  <Palette className="h-4 w-4 text-white" />
                </span>
                <span className="mt-1.5 block text-[11px] font-medium">Personalizada</span>
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Cores das mensagens</p>
            <div className="space-y-3">
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold">Minhas mensagens (lado direito)</p>
                <p className="text-xs text-muted-foreground">Cor das mensagens que você envia.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ColorField
                    label="Cor da mensagem"
                    value={chatBubbleColor}
                    onChange={onChatBubbleColorChange}
                  />
                  <ColorField
                    label="Cor do texto"
                    value={chatBubbleTextColor}
                    onChange={onChatBubbleTextColorChange}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2" aria-label="Cores rápidas da mensagem">
                  {CHAT_BUBBLE_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="h-8 w-8 rounded-full border-2 border-white shadow ring-1 ring-border"
                      style={{ backgroundColor: color }}
                      aria-label={`Usar cor ${color}`}
                      onClick={() => onChatBubbleColorChange(color)}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold">Mensagens do cliente (lado esquerdo)</p>
                <p className="text-xs text-muted-foreground">Cor das mensagens recebidas.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ColorField
                    label="Cor da mensagem"
                    value={customerBubbleColor}
                    onChange={onCustomerBubbleColorChange}
                  />
                  <ColorField
                    label="Cor do texto"
                    value={customerBubbleTextColor}
                    onChange={onCustomerBubbleTextColorChange}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold">Plano de fundo da conversa</p>
                <p className="text-xs text-muted-foreground">
                  Use a imagem oficial do Chat ou substitua por uma cor sólida.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <button
                    type="button"
                    aria-pressed={chatBackgroundMode === "image"}
                    onClick={() => onChatBackgroundModeChange("image")}
                    className={`relative overflow-hidden rounded-lg border p-2 text-left ${
                      chatBackgroundMode === "image"
                        ? "border-primary ring-1 ring-primary"
                        : "border-border"
                    }`}
                  >
                    <span
                      className="inbox-message-background flex h-14 items-center justify-center rounded-md border border-border bg-cover"
                      aria-hidden="true"
                    >
                      <ImageIcon className="h-5 w-5 text-primary" />
                    </span>
                    <span className="mt-1.5 block text-xs font-medium">Imagem padrão</span>
                    {chatBackgroundMode === "image" && (
                      <Check className="absolute right-3 top-3 h-4 w-4 rounded-full bg-primary p-0.5 text-primary-foreground" />
                    )}
                  </button>
                  <div
                    role="radio"
                    aria-checked={chatBackgroundMode === "color"}
                    tabIndex={0}
                    onClick={() => onChatBackgroundModeChange("color")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onChatBackgroundModeChange("color");
                      }
                    }}
                    className={`rounded-lg border p-3 text-left ${
                      chatBackgroundMode === "color"
                        ? "border-primary ring-1 ring-primary"
                        : "border-border"
                    }`}
                  >
                    <span className="mb-2 flex items-center gap-2 text-xs font-medium">
                      <span
                        className={`h-3.5 w-3.5 rounded-full border ${
                          chatBackgroundMode === "color"
                            ? "border-4 border-primary"
                            : "border-border"
                        }`}
                      />
                      Cor sólida
                    </span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="color"
                        value={normalizeHexColor(
                          chatBackgroundColor,
                          DEFAULT_CHAT_BACKGROUND_COLOR,
                        )}
                        onChange={(event) => {
                          onChatBackgroundColorChange(event.target.value.toUpperCase());
                          onChatBackgroundModeChange("color");
                        }}
                        className="h-9 w-12 p-1"
                        aria-label="Cor do plano de fundo"
                      />
                      <Input
                        value={chatBackgroundColor}
                        maxLength={7}
                        onChange={(event) => {
                          onChatBackgroundColorChange(event.target.value.toUpperCase());
                          onChatBackgroundModeChange("color");
                        }}
                        aria-label="Cor do plano de fundo hexadecimal"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {hasLowContrast && (
            <p
              role="alert"
              className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning"
            >
              O contraste escolhido pode dificultar a leitura. Recomendamos razão mínima de 4,5:1.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <Button variant="ghost" onClick={onReset} disabled={saving}>
              <RotateCcw className="mr-1.5 h-4 w-4" /> Restaurar padrão
            </Button>
            <Button
              variant="primary"
              className="save-action-button"
              onClick={onSave}
              disabled={saving || !colorsValid}
            >
              Salvar configuração
            </Button>
          </div>
        </div>

        <ConversationAppearancePreview
          chatBubbleColor={chatBubbleColor}
          chatBubbleTextColor={chatBubbleTextColor}
          customerBubbleColor={customerBubbleColor}
          customerBubbleTextColor={customerBubbleTextColor}
          chatBackgroundColor={chatBackgroundColor}
          chatBackgroundMode={chatBackgroundMode}
        />
      </div>
    </div>
  );
}

function ConversationAppearancePreview({
  chatBubbleColor,
  chatBubbleTextColor,
  customerBubbleColor,
  customerBubbleTextColor,
  chatBackgroundColor,
  chatBackgroundMode,
}: {
  chatBubbleColor: string;
  chatBubbleTextColor: string;
  customerBubbleColor: string;
  customerBubbleTextColor: string;
  chatBackgroundColor: string;
  chatBackgroundMode: ChatBackgroundMode;
}) {
  const ownStyle = {
    backgroundColor: normalizeHexColor(chatBubbleColor, DEFAULT_CHAT_BUBBLE_COLOR),
    color: normalizeHexColor(chatBubbleTextColor, DEFAULT_CHAT_BUBBLE_TEXT_COLOR),
  };
  const customerStyle = {
    backgroundColor: normalizeHexColor(customerBubbleColor, DEFAULT_CUSTOMER_BUBBLE_COLOR),
    color: normalizeHexColor(customerBubbleTextColor, DEFAULT_CUSTOMER_BUBBLE_TEXT_COLOR),
  };
  return (
    <aside className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-border bg-surface-1 xl:sticky xl:top-4 xl:max-w-none">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">Preview da conversa</p>
        <p className="text-[11px] text-muted-foreground">
          Veja como ficará a aparência das mensagens.
        </p>
      </div>
      <div className="flex items-center gap-3 border-b border-border bg-background px-3 py-3">
        <Avatar name="Christiane Oliveira" size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">Christiane O.</p>
          <p className="truncate text-[10px] text-muted-foreground">(21) 96478-0851 · SUPORTE</p>
        </div>
        <Search className="h-4 w-4 text-muted-foreground" />
        <MoreVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div
        data-profile-chat-background={chatBackgroundMode}
        className="inbox-message-background min-h-[370px] space-y-3 px-3 py-4"
        style={chatBackgroundStyle(
          chatBackgroundMode === "color" ? chatBackgroundColor : null,
          chatBackgroundMode === "color" ? "COLOR" : "IMAGE",
        )}
      >
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">21 OUT 2026</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="flex justify-start">
          <div>
            <div
              className="max-w-[205px] rounded-xl rounded-bl-sm px-3 py-2 text-xs shadow-card"
              style={customerStyle}
            >
              Olá, bom dia! Gostaria de saber sobre o meu atendimento.
            </div>
            <span className="mt-0.5 block text-[9px] text-muted-foreground">10:34</span>
          </div>
        </div>
        <div className="flex justify-end">
          <div>
            <div
              className="max-w-[205px] rounded-xl rounded-br-sm px-3 py-2 text-xs shadow-card"
              style={ownStyle}
            >
              Olá Christiane! Tudo bem? Vou verificar as informações para você.
            </div>
            <span className="mt-0.5 block text-right text-[9px] text-muted-foreground">
              10:35 ✓✓
            </span>
          </div>
        </div>
        <div className="flex justify-start">
          <div>
            <div
              className="max-w-[205px] rounded-xl rounded-bl-sm px-3 py-2 text-xs shadow-card"
              style={customerStyle}
            >
              Perfeito, obrigado!
            </div>
            <span className="mt-0.5 block text-[9px] text-muted-foreground">10:36</span>
          </div>
        </div>
        <div className="flex justify-end">
          <div>
            <div
              className="max-w-[205px] rounded-xl rounded-br-sm px-3 py-2 text-xs shadow-card"
              style={ownStyle}
            >
              Qualquer outra dúvida estamos à disposição!
            </div>
            <span className="mt-0.5 block text-right text-[9px] text-muted-foreground">
              10:37 ✓✓
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-border bg-background p-2">
        <div className="flex h-8 flex-1 items-center rounded-full border border-border px-3 text-[10px] text-muted-foreground">
          Digite uma mensagem...
        </div>
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Send className="h-4 w-4" />
        </span>
      </div>
    </aside>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <Input
          type="color"
          value={normalizeHexColor(value, "#FFFFFF")}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-10 w-12 p-1"
          aria-label={label}
        />
        <Input
          value={value}
          maxLength={7}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          aria-label={`${label} hexadecimal`}
        />
      </div>
    </Field>
  );
}

function ProfileTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 font-medium transition ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
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
  invalid = false,
}: {
  value: string;
  visible: boolean;
  autoComplete: string;
  onChange: (value: string) => void;
  onToggle: () => void;
  error?: string;
  errorId?: string;
  invalid?: boolean;
}) {
  return (
    <div>
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid || Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`pr-10 ${requiredFieldClassName(invalid || Boolean(error))}`}
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
