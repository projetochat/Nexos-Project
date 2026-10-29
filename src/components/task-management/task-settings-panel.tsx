import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui-kit";
import { ConfirmDialog, Modal } from "@/components/modal";
import {
  taskManagementApi,
  type TaskSettings,
  type TaskSmtp,
  type TaskSmtpInput,
  type TaskCapabilities,
} from "@/lib/task-management";
import { TaskCheck, TaskError } from "./task-ui";
import { taskDate } from "./task-labels";
const emptySmtp: TaskSmtpInput = {
  name: "",
  host: "",
  port: 587,
  secure: false,
  username: "",
  fromAddress: "",
  fromName: "",
  active: true,
};
export function TaskSettingsPanel({
  settings,
  smtp,
  capabilities,
  canUpdate,
  canSend = false,
  onChanged,
}: {
  settings: TaskSettings;
  smtp: TaskSmtp[];
  capabilities: TaskCapabilities;
  canUpdate: boolean;
  canSend?: boolean;
  onChanged: () => void;
}) {
  const [preferences, setPreferences] = React.useState(settings);
  const [editing, setEditing] = React.useState<TaskSmtp | null | undefined>();
  const [form, setForm] = React.useState<TaskSmtpInput>(emptySmtp);
  const [removing, setRemoving] = React.useState<TaskSmtp | null>(null);
  const [verifying, setVerifying] = React.useState<TaskSmtp | null>(null);
  const [result, setResult] = React.useState("");
  const [testRecipient, setTestRecipient] = React.useState("");
  const [testError, setTestError] = React.useState("");
  const [testAddressInvalid, setTestAddressInvalid] = React.useState(false);
  const [testAmbiguous, setTestAmbiguous] = React.useState(false);
  const testRecipientRef = React.useRef<HTMLInputElement>(null);
  const testErrorId = React.useId();
  const sendingTest = React.useRef(false);
  const savingAccount = React.useRef(false);
  const savePreferences = useMutation({
    mutationFn: () => taskManagementApi.updateSettings(preferences),
    onSuccess: () => {
      setResult("Preferências salvas.");
      onChanged();
    },
  });
  const saveSmtp = useMutation({
    retry: false,
    mutationFn: () => {
      if (
        !form.name.trim() ||
        !form.host.trim() ||
        !form.username.trim() ||
        !form.fromAddress.trim()
      )
        throw Error("Preencha nome, host, usuário e e-mail remetente.");
      if (!editing && !form.password) throw Error("Informe a senha da nova conta.");
      const { password, ...publicFields } = form;
      const payload = password ? { ...publicFields, password } : publicFields;
      return editing
        ? taskManagementApi.updateSmtp(editing.id, payload)
        : taskManagementApi.createSmtp(payload);
    },
    onSuccess: (saved) => {
      setEditing(undefined);
      setForm(emptySmtp);
      setResult(
        !saved.active
          ? "Conta SMTP salva como rascunho inativo."
          : saved.validationStatus === "validated" && saved.lastValidatedAt
            ? "Conexão validada e conta SMTP salva. Nenhum e-mail foi enviado."
            : "Conta SMTP salva. A validação da conexão não foi confirmada.",
      );
      onChanged();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => taskManagementApi.removeSmtp(id),
    onSuccess: () => {
      setRemoving(null);
      onChanged();
    },
  });
  const verify = useMutation({
    retry: false,
    mutationFn: async ({ id, recipient }: { id: string; recipient: string }) => {
      const response = await taskManagementApi.verifySmtp(id, recipient);
      if (
        response.accepted !== true ||
        typeof response.reference !== "string" ||
        typeof response.messageId !== "string"
      )
        throw Object.assign(new Error("Não foi possível confirmar o resultado do envio."), {
          code: "TASK_SMTP_TEST_OUTCOME_UNKNOWN",
        });
      return response;
    },
    onSuccess: (response) => {
      setVerifying(null);
      setResult(
        `E-mail de teste aceito pelo servidor SMTP. Referência: ${response.reference}. Identificador da mensagem: ${response.messageId}.${response.auditRecorded === false ? " Não foi possível confirmar o registro deste teste." : ""}${response.configurationUnchanged === false ? " A configuração mudou durante o teste; valide os dados atuais novamente." : ""}`,
      );
      onChanged();
    },
    onError: (error) => {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      const ambiguous = code === "TASK_SMTP_TEST_OUTCOME_UNKNOWN" || code === "NETWORK_ERROR";
      setTestAmbiguous(ambiguous);
      const details =
        error && typeof error === "object" && "details" in error ? error.details : undefined;
      const reference =
        details &&
        typeof details === "object" &&
        "reference" in details &&
        typeof details.reference === "string" &&
        /^[a-f0-9-]{36}$/i.test(details.reference)
          ? details.reference
          : "";
      setTestError(
        ambiguous
          ? `Não foi possível confirmar o resultado do envio. Confira a caixa de entrada antes de enviar outro teste.${reference ? ` Referência: ${reference}.` : ""}`
          : error instanceof Error
            ? error.message
            : "Não foi possível enviar o e-mail de teste.",
      );
    },
  });
  const openTest = (account: TaskSmtp) => {
    if (
      sendingTest.current ||
      savingAccount.current ||
      (editing?.id === account.id && transportChanged) ||
      !canUpdate ||
      !canSend ||
      !account.active ||
      !capabilities.smtpConfigured
    )
      return;
    verify.reset();
    setTestError("");
    setTestAddressInvalid(false);
    setTestAmbiguous(false);
    setResult("");
    setTestRecipient(account.fromAddress);
    setVerifying(account);
  };
  const sendTest = () => {
    if (
      sendingTest.current ||
      !verifying ||
      !canUpdate ||
      !canSend ||
      !smtp.some((account) => account.id === verifying.id && account.active)
    )
      return;
    const recipient = testRecipient.trim();
    if (
      !recipient ||
      recipient.length > 254 ||
      !testRecipientRef.current?.checkValidity() ||
      !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient)
    ) {
      setTestAddressInvalid(true);
      setTestError("Informe um único e-mail válido para receber o teste.");
      testRecipientRef.current?.focus();
      return;
    }
    sendingTest.current = true;
    setTestAddressInvalid(false);
    setTestError("");
    void verify
      .mutateAsync({ id: verifying.id, recipient })
      .catch(() => undefined)
      .finally(() => {
        sendingTest.current = false;
      });
  };
  const saveAccount = () => {
    if (savingAccount.current || sendingTest.current || !canUpdate || (!canSend && form.active))
      return;
    savingAccount.current = true;
    void saveSmtp
      .mutateAsync()
      .catch(() => undefined)
      .finally(() => {
        savingAccount.current = false;
      });
  };
  const open = (account: TaskSmtp | null) => {
    setEditing(account);
    setResult("");
    saveSmtp.reset();
    setForm(
      account
        ? {
            name: account.name,
            host: account.host,
            port: account.port,
            secure: account.secure,
            username: account.username,
            fromAddress: account.fromAddress,
            fromName: account.fromName,
            active: account.active,
          }
        : { ...emptySmtp, active: canSend },
    );
  };
  const transportChanged =
    Boolean(editing) &&
    (Boolean(form.password) ||
      (["host", "port", "secure", "username", "fromAddress", "fromName", "active"] as const).some(
        (key) => form[key] !== editing?.[key],
      ));
  const validated = (account: TaskSmtp) =>
    account.active && account.validationStatus === "validated" && Boolean(account.lastValidatedAt);
  return (
    <div className="space-y-4">
      {result && (
        <p role="status" className="rounded-lg bg-primary/5 p-3 text-sm">
          {result}
        </p>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        <div className="space-y-4">
          <Card>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="font-semibold">Contas SMTP</h3>
              {canUpdate && (
                <Button
                  disabled={!capabilities.smtpConfigured || saveSmtp.isPending || verify.isPending}
                  onClick={() => open(null)}
                >
                  Nova conta SMTP
                </Button>
              )}
            </div>
            {!capabilities.smtpConfigured && (
              <p className="mb-3 text-sm text-muted-foreground">
                A configuração segura de SMTP ainda não está disponível neste ambiente.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-surface-2">
                  <tr>
                    {["Nome", "Host", "Porta", "Remetente", "Situação", "Validação", "Ações"].map(
                      (label) => (
                        <th key={label} className="p-2 text-xs">
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {smtp.map((account) => (
                    <tr key={account.id} className="border-b border-border">
                      <td className="p-2">{account.name}</td>
                      <td className="p-2">{account.host}</td>
                      <td className="p-2">{account.port}</td>
                      <td className="p-2">{account.fromAddress}</td>
                      <td className="p-2">{account.active ? "Ativo" : "Inativo"}</td>
                      <td className="space-y-1 p-2">
                        <Badge tone={validated(account) ? "success" : "warning"}>
                          {validated(account)
                            ? "Conexão validada"
                            : account.active
                              ? "Conexão não validada"
                              : "Rascunho inativo"}
                        </Badge>
                        {validated(account) && (
                          <p className="text-xs text-muted-foreground">
                            {taskDate(account.lastValidatedAt)}
                          </p>
                        )}
                        {account.active && account.lastTestAcceptedAt && (
                          <>
                            <Badge tone="info">E-mail de teste aceito pelo servidor</Badge>
                            <p className="text-xs text-muted-foreground">
                              {taskDate(account.lastTestAcceptedAt)}
                            </p>
                            {account.lastTestReference && (
                              <p className="break-all text-xs text-muted-foreground">
                                Referência: {account.lastTestReference}
                              </p>
                            )}
                            {account.lastTestMessageId && (
                              <p className="break-all text-xs text-muted-foreground">
                                Identificador: {account.lastTestMessageId}
                              </p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="p-2">
                        {canUpdate && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              disabled={
                                !capabilities.smtpConfigured ||
                                saveSmtp.isPending ||
                                verify.isPending
                              }
                              onClick={() => open(account)}
                            >
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              disabled={
                                !capabilities.smtpConfigured ||
                                !canSend ||
                                !account.active ||
                                verify.isPending ||
                                saveSmtp.isPending ||
                                (editing?.id === account.id && transportChanged)
                              }
                              onClick={() => openTest(account)}
                            >
                              Enviar e-mail de teste
                            </Button>
                            <Button
                              size="sm"
                              disabled={saveSmtp.isPending || verify.isPending}
                              onClick={() => setRemoving(account)}
                            >
                              Desativar
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!smtp.length && (
                <p className="py-5 text-center text-sm text-muted-foreground">
                  Nenhuma conta SMTP cadastrada.
                </p>
              )}
            </div>
          </Card>
          {editing !== undefined && (
            <Card>
              <h3 className="mb-4 font-semibold">
                {editing ? "Editar conta SMTP" : "Nova conta SMTP"}
              </h3>
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge
                  tone={
                    form.active && !transportChanged && editing && validated(editing)
                      ? "success"
                      : "warning"
                  }
                >
                  {!form.active
                    ? "Rascunho inativo"
                    : transportChanged
                      ? "Alterações ainda não validadas"
                      : editing && validated(editing)
                        ? "Conexão validada"
                        : "Conexão não validada"}
                </Badge>
                {editing?.lastTestAcceptedAt && !transportChanged && form.active && (
                  <Badge tone="info">E-mail de teste aceito pelo servidor</Badge>
                )}
              </div>
              <fieldset
                disabled={!canUpdate || saveSmtp.isPending}
                className="grid gap-3 md:grid-cols-3"
              >
                <Field label="Nome da conta *">
                  <Input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </Field>
                <Field label="Host SMTP *">
                  <Input
                    value={form.host}
                    onChange={(event) => setForm({ ...form, host: event.target.value })}
                  />
                </Field>
                <Field label="Porta *">
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={form.port}
                    onChange={(event) => setForm({ ...form, port: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Segurança">
                  <Select
                    value={String(form.secure)}
                    onChange={(event) =>
                      setForm({ ...form, secure: event.target.value === "true" })
                    }
                  >
                    <option value="false">STARTTLS</option>
                    <option value="true">TLS direto</option>
                  </Select>
                </Field>
                <Field label="Usuário *">
                  <Input
                    autoComplete="off"
                    value={form.username}
                    onChange={(event) => setForm({ ...form, username: event.target.value })}
                  />
                </Field>
                <Field label={editing ? "Nova senha (opcional)" : "Senha *"}>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={form.password ?? ""}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                  />
                </Field>
                <Field label="E-mail remetente *">
                  <Input
                    type="email"
                    value={form.fromAddress}
                    onChange={(event) => setForm({ ...form, fromAddress: event.target.value })}
                  />
                </Field>
                <Field label="Nome do remetente">
                  <Input
                    value={form.fromName}
                    onChange={(event) => setForm({ ...form, fromName: event.target.value })}
                  />
                </Field>
                <TaskCheck
                  label="Conta ativa"
                  checked={form.active}
                  disabled={!canSend && !form.active}
                  onChange={(active) => setForm({ ...form, active })}
                />
              </fieldset>
              {editing && (
                <p className="my-2 text-xs text-muted-foreground">
                  Deixe a senha vazia para preservar a credencial. Última validação da conexão:{" "}
                  {taskDate(editing.lastValidatedAt)}.
                </p>
              )}
              {!canSend && (
                <p className="my-2 text-xs text-muted-foreground">
                  Seu perfil pode salvar contas inativas. Ativar ou testar uma conta exige permissão
                  de envio.
                </p>
              )}
              <p className="my-2 text-xs text-muted-foreground">
                {form.active
                  ? "Ao salvar, a conexão será validada com o servidor SMTP. Essa validação não envia e-mail."
                  : "A conta inativa será salva como rascunho, sem abrir uma conexão com o servidor SMTP."}
              </p>
              <TaskError error={saveSmtp.error} />
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  onClick={() => {
                    setEditing(undefined);
                    setForm(emptySmtp);
                  }}
                  disabled={saveSmtp.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  disabled={
                    saveSmtp.isPending ||
                    verify.isPending ||
                    !canUpdate ||
                    (!canSend && form.active)
                  }
                  onClick={saveAccount}
                >
                  {saveSmtp.isPending
                    ? form.active
                      ? "Validando conexão..."
                      : "Salvando..."
                    : form.active
                      ? "Salvar e validar conexão"
                      : "Salvar rascunho"}
                </Button>
              </div>
            </Card>
          )}
        </div>
        <Card>
          <h3 className="mb-4 font-semibold">Preferências gerais</h3>
          <fieldset disabled={!canUpdate || savePreferences.isPending} className="space-y-4">
            <TaskCheck
              label="Habilitar popup interno"
              checked={preferences.popupEnabled}
              onChange={(popupEnabled) => setPreferences({ ...preferences, popupEnabled })}
            />
            <TaskCheck
              label="Usar sino do TRIXUS"
              checked={preferences.bellEnabled}
              onChange={(bellEnabled) => setPreferences({ ...preferences, bellEnabled })}
            />
            <TaskCheck
              label="Permitir envios por WhatsApp"
              checked={preferences.whatsappEnabled}
              disabled={!canSend && !preferences.whatsappEnabled}
              onChange={(whatsappEnabled) => setPreferences({ ...preferences, whatsappEnabled })}
            />
            <TaskCheck
              label="Permitir envios por e-mail"
              checked={preferences.emailEnabled}
              disabled={!canSend && !preferences.emailEnabled}
              onChange={(emailEnabled) => setPreferences({ ...preferences, emailEnabled })}
            />
            <Field label="Conta SMTP padrão">
              <Select
                value={preferences.defaultSmtpAccountId ?? ""}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    defaultSmtpAccountId: event.target.value || null,
                  })
                }
              >
                <option value="">Nenhuma</option>
                {smtp
                  .filter((account) => account.active)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Antecedência padrão (minutos)">
              <Input
                type="number"
                min={0}
                value={preferences.defaultLeadMinutes}
                onChange={(event) =>
                  setPreferences({ ...preferences, defaultLeadMinutes: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="Fuso horário">
              <Input
                value={preferences.timezone}
                onChange={(event) =>
                  setPreferences({ ...preferences, timezone: event.target.value })
                }
              />
            </Field>
          </fieldset>
          <p className="my-3 text-xs text-muted-foreground">
            As preferências de popup e sino são independentes. Dispensar um aviso não conclui a
            tarefa.
          </p>
          <TaskError error={savePreferences.error} />
          {canUpdate && (
            <Button
              variant="primary"
              disabled={savePreferences.isPending}
              onClick={() => savePreferences.mutate()}
            >
              Salvar preferências
            </Button>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={!!removing}
        title="Desativar conta SMTP?"
        description="A conta ficará indisponível para novos envios. O histórico será preservado."
        confirmLabel="Desativar"
        onClose={() => setRemoving(null)}
        onConfirm={() => remove.mutateAsync(removing!.id).then(() => undefined)}
      />
      <Modal
        open={!!verifying}
        onClose={() => {
          if (!verify.isPending && !sendingTest.current) setVerifying(null);
        }}
        dismissible={!verify.isPending}
        title="Enviar e-mail de teste"
        size="sm"
        initialFocus="[data-smtp-test-recipient]"
        footer={
          <div className="w-full space-y-3">
            {testError && (
              <p id={testErrorId} role="alert" className="text-sm text-destructive">
                {testError}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button
                disabled={verify.isPending}
                onClick={() => {
                  if (!sendingTest.current) setVerifying(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                disabled={
                  verify.isPending ||
                  !canUpdate ||
                  !canSend ||
                  !smtp.some((account) => account.id === verifying?.id && account.active)
                }
                onClick={sendTest}
              >
                {verify.isPending
                  ? "Enviando e-mail de teste..."
                  : testAmbiguous
                    ? "Enviar novo e-mail de teste"
                    : "Enviar e-mail de teste"}
              </Button>
            </div>
          </div>
        }
      >
        <p className="mb-3 text-sm">
          O teste enviará um e-mail para o destinatário informado usando a configuração salva de{" "}
          {verifying?.name}. Você pode alterar o endereço antes de confirmar.
        </p>
        <Field label="Destinatário do teste *">
          <Input
            data-smtp-test-recipient
            ref={testRecipientRef}
            type="email"
            required
            autoComplete="email"
            aria-label="Destinatário do e-mail de teste"
            aria-invalid={testAddressInvalid}
            aria-describedby={testError ? testErrorId : undefined}
            disabled={verify.isPending}
            value={testRecipient}
            onChange={(event) => {
              setTestRecipient(event.target.value);
              setTestAddressInvalid(false);
              setTestError("");
              setTestAmbiguous(false);
            }}
          />
        </Field>
      </Modal>
      <TaskError error={remove.error} />
    </div>
  );
}
