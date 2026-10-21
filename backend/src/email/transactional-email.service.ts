import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type TenantAdministratorInvitation = {
  to: string;
  administratorName: string;
  tenantName: string;
  acceptUrl: string;
  expiresAt: Date;
};

type CustomerPortalInvitation = {
  to: string;
  contactName: string;
  customerName: string;
  acceptUrl: string;
  expiresAt: Date;
};

type DisconnectedInstanceAlert = {
  to: string;
  administratorName: string;
  instanceName: string;
  phone?: string | null;
  disconnectedAt: Date;
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
      this.logger.warn("Convite do administrador não enviado por e-mail em ambiente local.");
      return { delivered: false, provider: "local-preview" as const };
    }

    const assets = this.invitationBrandAssets(input.acceptUrl);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromAddress(),
        to: [input.to],
        subject: `Bem-vindo ao TRIXUS | Ative seu acesso à ${input.tenantName}`,
        text: invitationText(input),
        html: invitationHtml(input, assets),
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

  async sendCustomerPortalInvitation(input: CustomerPortalInvitation) {
    if (!this.isResendConfigured()) {
      this.logger.warn("Convite do portal do cliente não enviado por e-mail em ambiente local.");
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
        subject: `Ative seu acesso ao portal da ${input.customerName}`,
        text: customerPortalInvitationText(input),
        html: customerPortalInvitationHtml(input),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      this.logger.error(`Falha ao enviar convite do portal pelo Resend (${response.status}).`);
      throw new ServiceUnavailableException({
        code: "CUSTOMER_PORTAL_INVITATION_DELIVERY_FAILED",
        message: "Não foi possível enviar o convite de acesso do cliente.",
        providerStatus: response.status,
      });
    }
    const result = (await response.json()) as { id?: string };
    return { delivered: true, provider: "resend" as const, messageId: result.id ?? null };
  }

  async sendDisconnectedInstanceAlert(input: DisconnectedInstanceAlert) {
    if (!this.isResendConfigured()) {
      this.logger.warn(
        "Alerta de instância desconectada não enviado por e-mail em ambiente local.",
      );
      return { delivered: false, provider: "local-preview" as const };
    }
    const instanceName = escapeHtml(input.instanceName);
    const administratorName = escapeHtml(input.administratorName);
    const phone = input.phone?.trim() ? escapeHtml(input.phone.trim()) : null;
    const disconnectedAt = escapeHtml(formatExpiration(input.disconnectedAt));
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromAddress(),
        to: [input.to],
        subject: `TRIXUS | Instância desconectada — ${input.instanceName}`,
        text: [
          `Olá, ${input.administratorName}.`,
          "",
          `A instância ${input.instanceName}${input.phone ? ` (${input.phone})` : ""} foi desconectada em ${formatExpiration(input.disconnectedAt)}.`,
          "Verifique a conexão e realize a reconexão pelo TRIXUS.",
        ].join("\n"),
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto"><h1 style="font-size:24px">Instância desconectada</h1><p>Olá, ${administratorName}.</p><p>A instância <strong>${instanceName}</strong>${phone ? ` (${phone})` : ""} foi desconectada em <strong>${disconnectedAt}</strong>.</p><p>Verifique a conexão e realize a reconexão pelo TRIXUS.</p></div>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      this.logger.error(`Falha ao enviar alerta de desconexão pelo Resend (${response.status}).`);
      throw new ServiceUnavailableException({
        code: "DISCONNECTED_INSTANCE_EMAIL_DELIVERY_FAILED",
        message: "Não foi possível enviar o alerta de instância desconectada.",
        providerStatus: response.status,
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

  private invitationBrandAssets(acceptUrl: string) {
    const configuredBase =
      this.config.get<string>("TRIXUS_PUBLIC_APP_URL")?.trim() ||
      this.config.get<string>("TRIXUS_TENANT_APP_URL")?.trim();
    const baseUrl = safeWebOrigin(configuredBase) ?? safeWebOrigin(acceptUrl);
    return {
      logoUrl: baseUrl ? new URL("/trixus-logo-wordmark.png", baseUrl).toString() : null,
      artworkUrl: baseUrl ? new URL("/wizard-assistant.png", baseUrl).toString() : null,
    };
  }
}

function customerPortalInvitationText(input: CustomerPortalInvitation) {
  return [
    `Olá, ${input.contactName}.`,
    "",
    `Você recebeu um convite para acessar o portal da ${input.customerName}.`,
    "Use o link abaixo para criar sua senha e ativar o acesso:",
    input.acceptUrl,
    "",
    `O convite expira em ${formatExpiration(input.expiresAt)}.`,
  ].join("\n");
}

function customerPortalInvitationHtml(input: CustomerPortalInvitation) {
  const name = escapeHtml(input.contactName);
  const customerName = escapeHtml(input.customerName);
  const url = escapeHtml(input.acceptUrl);
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto">
      <h1 style="font-size:24px;margin-bottom:16px">Ativar meu acesso</h1>
      <p>Olá, ${name}.</p>
      <p>Você recebeu um convite para acessar o portal da <strong>${customerName}</strong>.</p>
      <p style="margin:28px 0"><a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#176ef2;color:#fff;text-decoration:none;font-weight:600">Ativar acesso</a></p>
      <p style="font-size:13px;color:#64748b">Este convite expira em ${escapeHtml(formatExpiration(input.expiresAt))}.</p>
    </div>
  `.trim();
}

function invitationText(input: TenantAdministratorInvitation) {
  return [
    "TRIXUS — Soluções que conectam",
    "",
    "Bem-vindo ao TRIXUS!",
    "",
    `Olá, ${input.administratorName}.`,
    "",
    `A empresa ${input.tenantName} foi ativada no TRIXUS e seu acesso de Administrador está pronto para ser configurado.`,
    "Defina sua senha para concluir a ativação:",
    input.acceptUrl,
    "",
    `Este convite expira em ${formatExpiration(input.expiresAt)}.`,
    "Se você não esperava este convite, pode ignorar esta mensagem.",
    "",
    "Equipe TRIXUS",
  ].join("\n");
}

function invitationHtml(
  input: TenantAdministratorInvitation,
  assets: { logoUrl: string | null; artworkUrl: string | null },
) {
  const name = escapeHtml(input.administratorName);
  const tenantName = escapeHtml(input.tenantName);
  const url = escapeHtml(input.acceptUrl);
  const expiration = escapeHtml(formatExpiration(input.expiresAt));
  const logo = assets.logoUrl
    ? `<img src="${escapeHtml(assets.logoUrl)}" width="176" alt="TRIXUS — Soluções que conectam" style="display:block;width:176px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none">`
    : `<div style="font-size:26px;line-height:32px;font-weight:800;letter-spacing:.08em;color:#0f2d76">TRIXUS</div>`;
  const artwork = assets.artworkUrl
    ? `<img src="${escapeHtml(assets.artworkUrl)}" width="188" alt="Assistente virtual TRIXUS" style="display:block;width:188px;max-width:100%;height:auto;margin:0 auto;border:0;outline:none;text-decoration:none">`
    : "";
  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
          @media only screen and (max-width: 620px) {
            .trixus-shell { width: 100% !important; }
            .trixus-card { padding: 28px 22px !important; }
            .trixus-title { font-size: 28px !important; line-height: 34px !important; }
            .trixus-art { display: none !important; }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;background-color:#eef4ff;font-family:Arial,Helvetica,sans-serif;color:#14213d;-webkit-text-size-adjust:100%">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Ative seu acesso de Administrador à ${tenantName} no TRIXUS.</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#eef4ff">
          <tr>
            <td align="center" style="padding:32px 12px">
              <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" class="trixus-shell" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #dbe7fb;border-radius:20px;overflow:hidden;box-shadow:0 14px 40px rgba(23,78,166,.12)">
                <tr>
                  <td style="padding:26px 34px;border-bottom:1px solid #e5edf9;background-color:#ffffff">
                    ${logo}
                    <div style="margin-top:5px;font-size:12px;line-height:18px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#3970c7">Soluções que conectam</div>
                  </td>
                </tr>
                <tr>
                  <td class="trixus-card" style="padding:38px 42px 34px">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="vertical-align:top">
                          <div class="trixus-title" style="font-size:32px;line-height:39px;font-weight:800;color:#0d2459">Bem-vindo ao TRIXUS!</div>
                          <p style="margin:22px 0 0;font-size:16px;line-height:25px;color:#31415f">Olá, <strong>${name}</strong>.</p>
                          <p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#31415f">A empresa <strong>${tenantName}</strong> foi ativada e seu acesso de Administrador está pronto para ser configurado.</p>
                          <p style="margin:12px 0 0;font-size:16px;line-height:25px;color:#31415f">Defina sua senha para concluir a ativação e começar a usar a plataforma.</p>
                        </td>
                        ${artwork ? `<td class="trixus-art" width="196" align="right" style="width:196px;vertical-align:bottom;padding-left:18px">${artwork}</td>` : ""}
                      </tr>
                    </table>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px">
                      <tr>
                        <td align="center" bgcolor="#176ef2" style="border-radius:10px;background-color:#176ef2;background-image:linear-gradient(135deg,#315bea 0%,#02a7d8 100%)">
                          <a href="${url}" style="display:inline-block;padding:14px 24px;border-radius:10px;color:#ffffff;font-size:16px;line-height:20px;font-weight:700;text-decoration:none">Definir minha senha</a>
                        </td>
                      </tr>
                    </table>
                    <div style="margin-top:26px;padding:16px 18px;border-radius:12px;background-color:#f5f8fd;font-size:13px;line-height:20px;color:#5a6983">
                      Este convite expira em <strong style="color:#31415f">${expiration}</strong>.<br>
                      Se você não esperava este convite, pode ignorar esta mensagem.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:22px 28px;background-color:#0d2459;color:#d9e6ff;font-size:12px;line-height:19px">
                    <strong style="color:#ffffff">TRIXUS</strong> · Soluções que conectam<br>
                    Esta é uma mensagem automática de ativação de acesso.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
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

function safeWebOrigin(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}
