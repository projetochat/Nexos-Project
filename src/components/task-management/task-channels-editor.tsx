import * as React from "react";
import { Card, Field, Input, Select } from "@/components/ui-kit";
import { GreetingMessageEditor } from "@/components/greeting-message-editor";
import {
  type TaskChannels,
  type TaskOptions,
  type TaskSmtp,
  type TaskCapabilities,
  type TaskSettings,
} from "@/lib/task-management";
import { TaskCheck } from "./task-ui";

const connectionStatusLabels: Record<string, string> = {
  connected: "Conectada",
  disconnected: "Desconectada",
  connecting: "Conectando",
  error: "Com erro",
  removed: "Removida",
};

const leadOptions = [
  [0, "No horário"],
  [5, "5 minutos antes"],
  [15, "15 minutos antes"],
  [30, "30 minutos antes"],
  [60, "1 hora antes"],
  [1440, "1 dia antes"],
] as const;
function LeadInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  const custom = !leadOptions.some(([minutes]) => minutes === value);
  return (
    <Field label="Antecedência">
      <div className="flex gap-2">
        <Select
          disabled={disabled}
          value={custom ? "custom" : String(value)}
          onChange={(event) =>
            onChange(event.target.value === "custom" ? 1 : Number(event.target.value))
          }
        >
          {leadOptions.map(([minutes, label]) => (
            <option key={minutes} value={minutes}>
              {label}
            </option>
          ))}
          <option value="custom">Personalizado</option>
        </Select>
        {custom && (
          <Input
            type="number"
            aria-label="Antecedência em minutos"
            min={0}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        )}
      </div>
    </Field>
  );
}
export function TaskChannelsEditor({
  value,
  onChange,
  options,
  smtp,
  capabilities,
  canSend,
  settings,
  disabled = false,
}: {
  value: TaskChannels;
  onChange: (value: TaskChannels) => void;
  options: TaskOptions;
  smtp: TaskSmtp[];
  capabilities: TaskCapabilities;
  canSend: boolean;
  settings: TaskSettings;
  disabled?: boolean;
}) {
  const update = (patch: Partial<TaskChannels>) => onChange({ ...value, ...patch });
  const available = (channel: "popup" | "bell" | "whatsapp" | "email") =>
    capabilities.channels.includes(channel);
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(17rem,1fr)]">
      <div className="space-y-4">
        <Card>
          <TaskCheck
            label="Exibir popup interno"
            checked={value.popup}
            disabled={disabled || !available("popup")}
            onChange={(popup) => update({ popup })}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Aviso interno para o responsável. Dispensar o popup não conclui a tarefa.
          </p>
        </Card>
        <Card>
          <TaskCheck
            label="Notificar no sino do TRIXUS"
            checked={value.bell}
            disabled={disabled || !available("bell")}
            onChange={(bell) => update({ bell })}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Utiliza a Central de Notificações existente.
          </p>
        </Card>
        <Card>
          <TaskCheck
            label="Enviar WhatsApp"
            checked={value.whatsapp.enabled}
            disabled={disabled || (!value.whatsapp.enabled && (!canSend || !available("whatsapp")))}
            onChange={(enabled) =>
              update({ whatsapp: { ...value.whatsapp, enabled, recipientMode: "audience" } })
            }
          />
          {!canSend && (
            <p className="mt-2 text-xs text-muted-foreground">
              Seu perfil não permite envios externos.
            </p>
          )}
          {!settings.whatsappEnabled && (
            <p className="mt-2 text-xs text-warning">
              O envio de WhatsApp está desativado nas preferências gerais.
            </p>
          )}
          {value.whatsapp.enabled && (
            <div className="mt-3 space-y-3">
              <Field label="Instância de envio">
                <Select
                  value={value.whatsapp.connectionId}
                  disabled={disabled || !canSend}
                  onChange={(event) =>
                    update({ whatsapp: { ...value.whatsapp, connectionId: event.target.value } })
                  }
                >
                  <option value="">Selecione</option>
                  {options.connections.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} (
                      {connectionStatusLabels[item.status.toLowerCase()] ?? "Indisponível"})
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="text-xs text-muted-foreground">
                Destinatários: contatos e grupos explicitamente selecionados. Não utiliza o telefone
                do responsável.
              </p>
              <Field label="Mensagem">
                <GreetingMessageEditor
                  value={value.whatsapp.message}
                  attachment={null}
                  variables={[]}
                  showAttachment={false}
                  showVariables={false}
                  showEmoji
                  disabled={disabled || !canSend}
                  invalid={false}
                  placeholder="Escreva o aviso de WhatsApp..."
                  maxLength={4000}
                  onChange={(message) => update({ whatsapp: { ...value.whatsapp, message } })}
                />
              </Field>
              <LeadInput
                disabled={disabled || !canSend}
                value={value.whatsapp.leadMinutes}
                onChange={(leadMinutes) => update({ whatsapp: { ...value.whatsapp, leadMinutes } })}
              />
            </div>
          )}
        </Card>
        <Card>
          <TaskCheck
            label="Enviar e-mail"
            checked={value.email.enabled}
            disabled={disabled || !canSend || !available("email") || !capabilities.smtpConfigured}
            onChange={(enabled) => update({ email: { ...value.email, enabled } })}
          />
          {!capabilities.smtpConfigured && (
            <p className="mt-2 text-xs text-muted-foreground">
              O envio de e-mail ainda não está disponível neste ambiente.
            </p>
          )}
          {!settings.emailEnabled && (
            <p className="mt-2 text-xs text-warning">
              O envio de e-mail está desativado nas preferências gerais.
            </p>
          )}
          {value.email.enabled && (
            <div className="mt-3 space-y-3">
              <Field label="Conta SMTP">
                <Select
                  value={value.email.smtpAccountId}
                  disabled={disabled || !canSend}
                  onChange={(event) =>
                    update({ email: { ...value.email, smtpAccountId: event.target.value } })
                  }
                >
                  <option value="">Selecione</option>
                  {smtp
                    .filter((item) => item.active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Destinatários do e-mail">
                <Select
                  value={value.email.recipientMode ?? "audience"}
                  disabled={disabled || !canSend}
                  onChange={(event) =>
                    update({
                      email: {
                        ...value.email,
                        recipientMode: event.target.value as "audience" | "responsible" | "both",
                      },
                    })
                  }
                >
                  <option value="audience">Contatos selecionados</option>
                  <option value="responsible">Responsável</option>
                  <option value="both">Responsável e contatos selecionados</option>
                </Select>
              </Field>
              <Field label="Usuários internos adicionais">
                <Select
                  multiple
                  value={value.email.membershipIds ?? []}
                  disabled={disabled || !canSend}
                  onChange={(event) =>
                    update({
                      email: {
                        ...value.email,
                        membershipIds: [...event.target.selectedOptions].map((item) => item.value),
                      },
                    })
                  }
                >
                  {options.memberships.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="text-xs text-muted-foreground">
                Grupos de WhatsApp não são endereços de e-mail.
              </p>
              <Field label="Assunto">
                <Input
                  disabled={disabled || !canSend}
                  value={value.email.subject}
                  onChange={(event) =>
                    update({ email: { ...value.email, subject: event.target.value } })
                  }
                />
              </Field>
              <Field label="Corpo do e-mail">
                <GreetingMessageEditor
                  value={value.email.body}
                  attachment={null}
                  variables={[]}
                  showAttachment={false}
                  showVariables={false}
                  showEmoji
                  disabled={disabled || !canSend}
                  invalid={false}
                  placeholder="Escreva o e-mail..."
                  maxLength={10000}
                  onChange={(body) => update({ email: { ...value.email, body } })}
                />
              </Field>
              <LeadInput
                disabled={disabled || !canSend}
                value={value.email.leadMinutes}
                onChange={(leadMinutes) => update({ email: { ...value.email, leadMinutes } })}
              />
            </div>
          )}
        </Card>
      </div>
      <Card>
        <h3 className="mb-3 font-semibold">Prévia dos avisos</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Prévia visual; nenhum aviso é enviado nesta etapa.
        </p>
        {value.popup && (
          <div className="mb-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
            Popup interno para o responsável.
          </div>
        )}
        {value.bell && (
          <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            Notificação no sino.
          </div>
        )}
        {value.whatsapp.enabled && (
          <p className="mb-3 whitespace-pre-wrap rounded-lg border border-border p-3 text-sm">
            {value.whatsapp.message || "Mensagem do WhatsApp"}
          </p>
        )}
        {value.email.enabled && (
          <div className="rounded-lg border border-border p-3 text-sm">
            <strong>{value.email.subject || "Assunto do e-mail"}</strong>
            <p className="mt-2 whitespace-pre-wrap">{value.email.body}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
