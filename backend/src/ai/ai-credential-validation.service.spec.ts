import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnprocessableEntityException } from "@nestjs/common";
import { AiAgentBehavior, AiProvider } from "../generated/prisma";
import { AiService } from "./ai.service";

beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network disabled");
    }),
  ),
);
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
const current = { tenantId: "tenant-a" } as never;
const newConnection = {
  name: "Synthetic connection",
  provider: AiProvider.OPENAI,
  apiKey: ` ${"placeholder-value"} `,
  organization: " organization-b ",
};
const newAgent = {
  name: "Synthetic agent",
  connectionId: "connection-a",
  model: "gpt-4o",
  module: "CHAT",
  instructions: "Synthetic instructions",
  behavior: AiAgentBehavior.ATTENDANT,
};
function fixture() {
  const date = new Date("2026-10-28T12:00:00Z");
  const connection = {
    id: "connection-a",
    tenantId: "tenant-a",
    provider: AiProvider.OPENAI,
    active: true,
    name: "Synthetic connection",
    organization: "organization-a",
    credentialCiphertext: "old-cipher",
    credentialIv: "old-iv",
    credentialAuthTag: "old-tag",
    credentialKeyVersion: 1,
    credentialMasked: "masked-old",
    createdAt: date,
    updatedAt: date,
    archivedAt: null,
  };
  const encrypted = {
    credentialCiphertext: "new-cipher",
    credentialIv: "new-iv",
    credentialAuthTag: "new-tag",
    credentialKeyVersion: 1,
    credentialMasked: "masked-new",
  };
  const agent = {
    ...newAgent,
    id: "agent-a",
    tenantId: "tenant-a",
    active: true,
    description: "",
    connection,
    createdAt: date,
    updatedAt: date,
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: connection.id }]),
    aiConnection: {
      findFirst: vi.fn().mockResolvedValue({ id: connection.id }),
      update: vi.fn().mockImplementation(async ({ data }) => ({ ...connection, ...data })),
    },
    aiAgent: {
      findFirst: vi.fn().mockResolvedValue({ id: "agent-a" }),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(async ({ data }) => ({ ...agent, ...data })),
      update: vi.fn().mockImplementation(async ({ data }) => ({ ...agent, ...data })),
    },
    aiAgentUsage: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    aiConnection: {
      findFirst: vi.fn().mockResolvedValue(connection),
      create: vi.fn().mockImplementation(async ({ data }) => ({ ...connection, ...data })),
      update: vi.fn(),
    },
    aiAgent: {
      findFirst: vi.fn().mockResolvedValue(agent),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const credentials = {
    decrypt: vi.fn().mockReturnValue("dummy-value"),
    encrypt: vi.fn().mockReturnValue(encrypted),
  };
  const provider = { validateCredential: vi.fn().mockResolvedValue(undefined) };
  const service = new AiService(
    prisma as never,
    credentials as never,
    provider as never,
    {} as never,
    {} as never,
  );
  return { connection, encrypted, agent, tx, prisma, credentials, provider, service };
}
const invalid = () =>
  new UnprocessableEntityException({
    code: "AI_PROVIDER_CREDENTIAL_INVALID",
    message: "Synthetic invalid key",
  });
describe("AI credentials must validate before saving", () => {
  it("validates the effective create configuration before encrypting or writing and returns only its mask", async () => {
    const f = fixture();
    f.provider.validateCredential.mockImplementation(async () => {
      expect(f.credentials.encrypt).not.toHaveBeenCalled();
      expect(f.prisma.aiConnection.create).not.toHaveBeenCalled();
    });
    const result = await f.service.createConnection(newConnection, current);
    expect(f.provider.validateCredential).toHaveBeenCalledExactlyOnceWith({
      provider: AiProvider.OPENAI,
      apiKey: "placeholder-value",
      organization: "organization-b",
    });
    expect(f.credentials.encrypt).toHaveBeenCalledWith(
      newConnection.apiKey,
      "tenant-a",
      expect.any(String),
      AiProvider.OPENAI,
    );
    expect(f.prisma.aiConnection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "tenant-a", ...f.encrypted }),
      }),
    );
    expect(result.apiKeyMasked).toBe("masked-new");
    expect(JSON.stringify(result)).not.toContain("placeholder-value");
  });
  it("does not encrypt or persist an invalid new connection", async () => {
    const f = fixture();
    f.provider.validateCredential.mockRejectedValue(invalid());
    await expect(f.service.createConnection(newConnection, current)).rejects.toMatchObject({
      response: { code: "AI_PROVIDER_CREDENTIAL_INVALID" },
    });
    expect(f.credentials.encrypt).not.toHaveBeenCalled();
    expect(f.prisma.aiConnection.create).not.toHaveBeenCalled();
  });
  it("revalidates an omitted edit key without replacing encrypted bytes", async () => {
    const f = fixture();
    await f.service.updateConnection("connection-a", { name: "New name" }, current);
    expect(f.credentials.decrypt).toHaveBeenCalledExactlyOnceWith(
      f.connection,
      "tenant-a",
      "connection-a",
      AiProvider.OPENAI,
    );
    expect(f.provider.validateCredential).toHaveBeenCalledWith({
      provider: AiProvider.OPENAI,
      apiKey: "dummy-value",
      organization: "organization-a",
    });
    expect(f.credentials.encrypt).not.toHaveBeenCalled();
    expect(f.tx.aiConnection.update).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId: "tenant-a", id: "connection-a" } },
      data: { name: "New name" },
    });
    expect(f.prisma.aiConnection.update).not.toHaveBeenCalled();
  });
  it("validates a new organization with the existing stored key before editing", async () => {
    const f = fixture();
    await f.service.updateConnection("connection-a", { organization: " organization-b " }, current);
    expect(f.provider.validateCredential).toHaveBeenCalledWith({
      provider: AiProvider.OPENAI,
      apiKey: "dummy-value",
      organization: "organization-b",
    });
    expect(f.credentials.encrypt).not.toHaveBeenCalled();
  });
  it("does not replace an existing key or metadata when its replacement is invalid", async () => {
    const f = fixture();
    f.provider.validateCredential.mockRejectedValue(invalid());
    await expect(
      f.service.updateConnection(
        "connection-a",
        { apiKey: "invalid-value", name: "New name" },
        current,
      ),
    ).rejects.toThrow("Synthetic invalid key");
    expect(f.credentials.decrypt).not.toHaveBeenCalled();
    expect(f.credentials.encrypt).not.toHaveBeenCalled();
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    expect(f.tx.aiConnection.update).not.toHaveBeenCalled();
  });
  it("decrypts with the old provider but validates and re-encrypts for the newly selected provider", async () => {
    const f = fixture();
    await f.service.updateConnection("connection-a", { provider: AiProvider.GROQ }, current);
    expect(f.credentials.decrypt).toHaveBeenCalledWith(
      f.connection,
      "tenant-a",
      "connection-a",
      AiProvider.OPENAI,
    );
    expect(f.provider.validateCredential).toHaveBeenCalledWith({
      provider: AiProvider.GROQ,
      apiKey: "dummy-value",
      organization: "organization-a",
    });
    expect(f.credentials.encrypt).toHaveBeenCalledWith(
      "dummy-value",
      "tenant-a",
      "connection-a",
      AiProvider.GROQ,
    );
  });
  it("preserves the linked-agent restriction before exposing credentials to validation", async () => {
    const f = fixture();
    f.prisma.aiAgent.count.mockResolvedValue(1);
    await expect(
      f.service.updateConnection("connection-a", { provider: AiProvider.GROQ }, current),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.credentials.decrypt).not.toHaveBeenCalled();
    expect(f.provider.validateCredential).not.toHaveBeenCalled();
  });
  it("rechecks linked agents under the exclusive connection lock before a provider change", async () => {
    const f = fixture();
    f.tx.aiAgent.count.mockResolvedValue(1);
    await expect(
      f.service.updateConnection("connection-a", { provider: AiProvider.GROQ }, current),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.tx.$queryRaw).toHaveBeenCalledOnce();
    expect(f.tx.aiConnection.update).not.toHaveBeenCalled();
  });
  it.each(["create", "update"])(
    "validates the stored connection before %s agent transaction",
    async (operation) => {
      const f = fixture();
      f.provider.validateCredential.mockImplementation(async () => {
        expect(f.prisma.$transaction).not.toHaveBeenCalled();
      });
      if (operation === "create") await f.service.createAgent(newAgent, current);
      else await f.service.updateAgent("agent-a", { name: "New name" }, current);
      expect(f.provider.validateCredential).toHaveBeenCalledWith({
        provider: AiProvider.OPENAI,
        apiKey: "dummy-value",
        organization: "organization-a",
      });
      expect(f.tx.$queryRaw).toHaveBeenCalledTimes(operation === "create" ? 1 : 2);
      expect(f.tx.aiConnection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-a",
            id: "connection-a",
            archivedAt: null,
            credentialCiphertext: "old-cipher",
            credentialIv: "old-iv",
            credentialAuthTag: "old-tag",
          }),
        }),
      );
      expect(
        operation === "create" ? f.tx.aiAgent.create : f.tx.aiAgent.update,
      ).toHaveBeenCalledOnce();
    },
  );
  it.each(["create", "update"])(
    "does not write a %s agent when the stored key has become invalid",
    async (operation) => {
      const f = fixture();
      f.provider.validateCredential.mockRejectedValue(invalid());
      const request =
        operation === "create"
          ? f.service.createAgent(newAgent, current)
          : f.service.updateAgent("agent-a", { name: "New name" }, current);
      await expect(request).rejects.toMatchObject({
        response: { code: "AI_PROVIDER_CREDENTIAL_INVALID" },
      });
      expect(f.prisma.$transaction).not.toHaveBeenCalled();
      expect(f.tx.aiAgent.create).not.toHaveBeenCalled();
      expect(f.tx.aiAgent.update).not.toHaveBeenCalled();
    },
  );
  it.each(["connection", "agent-create", "agent-update"])(
    "rejects a stale validated credential snapshot before saving %s",
    async (operation) => {
      const f = fixture();
      f.tx.aiConnection.findFirst.mockResolvedValue(null);
      const request =
        operation === "connection"
          ? f.service.updateConnection("connection-a", { name: "New name" }, current)
          : operation === "agent-create"
            ? f.service.createAgent(newAgent, current)
            : f.service.updateAgent("agent-a", { name: "New name" }, current);
      await expect(request).rejects.toMatchObject({
        status: 409,
        response: { code: "AI_CONNECTION_CHANGED" },
      });
      expect(f.tx.aiConnection.update).not.toHaveBeenCalled();
      expect(f.tx.aiAgent.create).not.toHaveBeenCalled();
      expect(f.tx.aiAgent.update).not.toHaveBeenCalled();
    },
  );
  it("rejects an agent changed to another connection or model during validation before a partial update", async () => {
    const f = fixture();
    f.tx.aiAgent.findFirst.mockResolvedValue(null);
    await expect(
      f.service.updateAgent("agent-a", { name: "New name" }, current),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: "AI_AGENT_CHANGED" },
    });
    expect(f.provider.validateCredential).toHaveBeenCalledOnce();
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(f.tx.aiAgent.findFirst).toHaveBeenCalledWith({
      where: {
        id: "agent-a",
        tenantId: "tenant-a",
        archivedAt: null,
        updatedAt: f.agent.updatedAt,
        connectionId: "connection-a",
        model: "gpt-4o",
      },
      select: { id: true },
    });
    expect(f.tx.aiAgent.update).not.toHaveBeenCalled();
    expect(f.tx.aiAgentUsage.deleteMany).not.toHaveBeenCalled();
  });

  it("does not decrypt or validate a connection outside the authenticated tenant", async () => {
    const f = fixture();
    f.prisma.aiConnection.findFirst.mockResolvedValue(null);
    await expect(
      f.service.updateConnection("foreign-connection", { name: "New name" }, current),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      f.service.createAgent({ ...newAgent, connectionId: "foreign-connection" }, current),
    ).rejects.toMatchObject({ status: 404 });
    expect(f.prisma.aiConnection.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", id: "foreign-connection", archivedAt: null },
    });
    expect(f.credentials.decrypt).not.toHaveBeenCalled();
    expect(f.provider.validateCredential).not.toHaveBeenCalled();
  });
  it("does not decrypt or validate an agent outside the authenticated tenant", async () => {
    const f = fixture();
    f.prisma.aiAgent.findFirst.mockResolvedValue(null);
    await expect(
      f.service.updateAgent("foreign-agent", { name: "New name" }, current),
    ).rejects.toMatchObject({ status: 404 });
    expect(f.credentials.decrypt).not.toHaveBeenCalled();
    expect(f.provider.validateCredential).not.toHaveBeenCalled();
  });
  it("validates duplicates through the create-agent path without bypassing credentials", async () => {
    const f = fixture();
    f.prisma.aiAgent.findFirst.mockResolvedValueOnce(f.agent).mockResolvedValueOnce(null);
    await f.service.duplicateAgent("agent-a", current);
    expect(f.provider.validateCredential).toHaveBeenCalledOnce();
    expect(f.tx.aiAgent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ active: false, tenantId: "tenant-a" }),
      }),
    );
  });
});
