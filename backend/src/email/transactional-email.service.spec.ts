import { ServiceUnavailableException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransactionalEmailService } from "./transactional-email.service";

describe("TransactionalEmailService", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requires the delivery provider in production", () => {
    const service = emailService({ NODE_ENV: "production" });
    expect(() => service.assertInvitationDeliveryReady()).toThrow(ServiceUnavailableException);
  });

  it("sends the tenant administrator invitation through Resend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = emailService({
      NODE_ENV: "production",
      RESEND_API_KEY: "re_test",
      TRIXUS_EMAIL_FROM: "Trixus <acesso@example.com>",
      TRIXUS_PUBLIC_APP_URL: "https://app.example.com",
    });

    await expect(
      service.sendTenantAdministratorInvitation({
        to: "admin@example.com",
        administratorName: "Ana",
        tenantName: "Empresa Teste",
        acceptUrl: "https://app.example.com/login?invite=token",
        expiresAt: new Date("2026-10-07T12:00:00.000Z"),
      }),
    ).resolves.toEqual({ delivered: true, provider: "resend", messageId: "email-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer re_test" }),
      }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as {
      to: string[];
      subject: string;
      text: string;
      html: string;
    };
    expect(payload.to).toEqual(["admin@example.com"]);
    expect(payload.subject).toBe("Bem-vindo ao TRIXUS | Ative seu acesso à Empresa Teste");
    expect(payload.text).toContain("Bem-vindo ao TRIXUS!");
    expect(payload.text).toContain("https://app.example.com/login?invite=token");
    expect(payload.html).toContain("Bem-vindo ao TRIXUS!");
    expect(payload.html).toContain("Olá, <strong>Ana</strong>");
    expect(payload.html).toContain("<strong>Empresa Teste</strong>");
    expect(payload.html).toContain('href="https://app.example.com/login?invite=token"');
    expect(payload.html).toContain('src="https://app.example.com/trixus-logo-wordmark.png"');
    expect(payload.html).toContain('src="https://app.example.com/wizard-assistant.png"');
    expect(payload.html).toContain("Soluções que conectam");
    expect(payload.html).toContain("linear-gradient(135deg,#315bea 0%,#02a7d8 100%)");
    expect(payload.html).toContain("07/10/2026, 09:00");
    expect(payload.html).toContain("pode ignorar esta mensagem");
  });

  it("escapes dynamic content and only creates assets from a safe web origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-2" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = emailService({
      NODE_ENV: "production",
      RESEND_API_KEY: "re_test",
      TRIXUS_EMAIL_FROM: "Trixus <acesso@example.com>",
      TRIXUS_PUBLIC_APP_URL: "javascript:alert(1)",
    });

    await service.sendTenantAdministratorInvitation({
      to: "admin@example.com",
      administratorName: '<img src=x onerror="alert(1)">',
      tenantName: "Empresa & Filhos",
      acceptUrl: "https://app.example.com/login?invite=token-seguro",
      expiresAt: new Date("2026-10-07T12:00:00.000Z"),
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as { subject: string; html: string };
    expect(payload.subject).toBe("Bem-vindo ao TRIXUS | Ative seu acesso à Empresa & Filhos");
    expect(payload.html).not.toContain('<img src=x onerror="alert(1)">');
    expect(payload.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(payload.html).toContain("Empresa &amp; Filhos");
    expect(payload.html).toContain('src="https://app.example.com/trixus-logo-wordmark.png"');
    expect(payload.html).not.toContain("javascript:");
  });

  it("sends an isolated disconnected-instance alert without exposing another recipient", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-disconnect" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = emailService({
      RESEND_API_KEY: "re_test",
      TRIXUS_EMAIL_FROM: "Trixus <alertas@example.com>",
    });

    await service.sendDisconnectedInstanceAlert({
      to: "admin@tenant.test",
      administratorName: "Ana",
      instanceName: "Suporte",
      phone: "+55 62 8114-7652",
      disconnectedAt: new Date("2026-10-20T15:00:00.000Z"),
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as {
      to: string[];
      subject: string;
      text: string;
    };
    expect(payload.to).toEqual(["admin@tenant.test"]);
    expect(payload.subject).toBe("TRIXUS | Instância desconectada — Suporte");
    expect(payload.text).toContain("+55 62 8114-7652");
    expect(payload.text).toContain("20/10/2026, 12:00");
  });
});

function emailService(values: Record<string, string>) {
  return new TransactionalEmailService({
    get: (key: string) => values[key],
  } as never);
}
