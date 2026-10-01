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
    expect(String(request.body)).toContain("admin@example.com");
    expect(String(request.body)).toContain("https://app.example.com/login?invite=token");
  });
});

function emailService(values: Record<string, string>) {
  return new TransactionalEmailService({
    get: (key: string) => values[key],
  } as never);
}
