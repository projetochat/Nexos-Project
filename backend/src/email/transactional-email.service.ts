import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type TenantAdministratorInvitation = {
  to: string;
  administratorName: string;
  tenantName: string;
  acceptUrl: string;
  expiresAt: Date;
};

@Injectable()
export class TransactionalEmailService {
  private readonly logger = new Logger(TransactionalEmailService.name);

  constructor(private readonly config: ConfigService) {}

  assertInvitationDeliveryReady() {
    if (this.isResendConfigured()) return;
    if (this.environment() !== "production") return;
    throw new ServiceUnavailableException(
      "O envio de convites não está configurado. Defina RESEND_API_KEY e TRIXUS_EMAIL_FROM.",
    );
  }

  async sendTenantAdministratorInvitation(input: TenantAdministratorInvitation) {
    if (!this.isResendConfigured()) {
      this.logger.warn(
        `Convite do administrador não enviado por e-mail em ambiente local. Prévia: ${input.acceptUrl}`,
      );
      return { delivered: false, provider: "local-preview" as const };
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromAddress(),
        to: [input.to],
        subject: `Defina seu acesso de administrador à ${input.tenantName}`,
        text: invitationText(input),
        html: invitationHtml(input),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const providerMessage = (await response.text()).slice(0, 500);
      this.logger.error(`Falha ao enviar convite pelo Resend (${response.status}).`);
      throw new ServiceUnavailableException({
        code: "INVITATION_EMAIL_DELIVERY_FAILED",
        message: "Não foi possível enviar o convite do administrador da Tenant.",
        providerStatus: response.status,
        providerMessage,
      });
    }

    const result = (await response.json()) as { id?: string };
    return { delivered: true, provider: "resend" as const, messageId: result.id ?? null };
  }

  private isResendConfigured() {
    return Boolean(this.apiKey() && this.fromAddress());
  }

  private apiKey() {
    return this.config.get<string>("RESEND_API_KEY")?.trim() ?? "";
  }

  private fromAddress() {
    return this.config.get<string>("TRIXUS_EMAIL_FROM")?.trim() ?? "";
  }

  private environment() {
    return this.config.get<string>("NODE_ENV")?.trim().toLowerCase() ?? "development";
  }
}

function invitationText(input: TenantAdministratorInvitation) {
  return [
    `Olá, ${input.administratorName}.`,
    "",
    `Sua organização ${input.tenantName} foi ativada no Trixus.`,
    "Use o link abaixo para definir sua senha e concluir o acesso de administrador:",
    input.acceptUrl,
    "",
    `O convite expira em ${formatExpiration(input.expiresAt)}.`,
    "Se você não esperava este convite, ignore esta mensagem.",
  ].join("\n");
}

function invitationHtml(input: TenantAdministratorInvitation) {
  const name = escapeHtml(input.administratorName);
  const tenantName = escapeHtml(input.tenantName);
  const url = escapeHtml(input.acceptUrl);
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto">
      <h1 style="font-size:24px;margin-bottom:16px">Defina sua senha no Trixus</h1>
      <p>Olá, ${name}.</p>
      <p>Sua organização <strong>${tenantName}</strong> foi ativada no Trixus.</p>
      <p>Use o botão abaixo para definir sua senha e concluir o acesso de administrador.</p>
      <p style="margin:28px 0">
        <a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#176ef2;color:#fff;text-decoration:none;font-weight:600">Definir minha senha</a>
      </p>
      <p style="font-size:13px;color:#64748b">Este convite expira em ${escapeHtml(formatExpiration(input.expiresAt))}.</p>
      <p style="font-size:13px;color:#64748b">Se você não esperava este convite, ignore esta mensagem.</p>
    </div>
  `.trim();
}

function formatExpiration(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}
