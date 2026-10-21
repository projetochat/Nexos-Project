import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TrixusApiError } from "@/lib/trixus-api";
import { connectionRemoveErrorMessage } from "@/lib/connection-remove-errors";
import {
  canEditInstance,
  instanceEditUnavailableReason,
  instanceNameAlreadyExists,
} from "@/lib/instance-validation";
import type { ApiMessagingConnection } from "@/lib/trixus-api";

function connection(overrides: Partial<ApiMessagingConnection>): ApiMessagingConnection {
  return {
    id: "connection-id",
    tenantId: "tenant-id",
    name: "WhatsApp",
    providerType: "evolution",
    status: "connected",
    externalReference: "whatsapp",
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("instancias removal UX", () => {
  it("requires the exact confirmation and explains the permanent deletion scope", () => {
    const source = readFileSync(new URL("./instancias.tsx", import.meta.url), "utf8");
    expect(source).toContain('confirmation !== "REMOVER"');
    expect(source).toContain("setConfirmation(event.target.value.toUpperCase())");
    expect(source).toContain('Digite "REMOVER" para confirmar');
    expect(source).not.toContain("removeConversationHistory");
    expect(source).toContain("serão excluídos permanentemente");
    expect(source).toContain("Contatos,");
    expect(source).toContain("departamentos e chamados serão preservados sem vínculo");
    expect(source).toContain("Esta ação não");
    expect(source).toContain("pode ser desfeita");
    expect(source).toContain("Excluir permanentemente");
    expect(source).toContain("trash-action h-8 rounded-lg sm:min-w-20");
    expect(source).toContain('className="h-8 rounded-lg sm:min-w-20"');
    expect(source).toContain("<AlertTriangle");
    expect(source).toContain("text-sm text-foreground");
    expect(source).toContain('className="mt-1 text-muted-foreground"');
    expect(source).toContain("const closeDestructiveFlow = () =>");
    expect(source.match(/onClose=\{closeDestructiveFlow\}/g)).toHaveLength(2);
  });

  it("shows a specific message for in-use connection conflicts", () => {
    expect(
      connectionRemoveErrorMessage(new TrixusApiError("Conflict", 409, "CONNECTION_IN_USE")),
    ).toContain("ainda está em uso");
  });

  it("shows degraded provider copy for Evolution temporary failures", () => {
    expect(
      connectionRemoveErrorMessage(
        new TrixusApiError("Unavailable", 503, "EVOLUTION_PROVIDER_UNAVAILABLE"),
      ),
    ).toContain("Evolution indisponível");
  });
});

describe("instâncias editáveis", () => {
  it("allows only connected or disconnected instances with a WhatsApp number", () => {
    expect(canEditInstance(connection({ ownerPhone: "5511999999999", status: "connected" }))).toBe(
      true,
    );
    expect(
      canEditInstance(connection({ ownerPhoneMasked: "(11) 99999-9999", status: "disconnected" })),
    ).toBe(true);
    expect(canEditInstance(connection({ status: "connecting" }))).toBe(false);
    expect(canEditInstance(connection({ status: "error", ownerPhone: "5511999999999" }))).toBe(
      false,
    );
    expect(canEditInstance(connection({ status: "connected" }))).toBe(false);
  });

  it("explains when the WhatsApp number is missing", () => {
    expect(instanceEditUnavailableReason(connection({ status: "connected" }))).toContain(
      "cadastrar o número",
    );
  });
});

describe("nomes de instâncias", () => {
  it("detecta duplicidade ignorando maiúsculas e espaços nas extremidades", () => {
    const connections = [connection({ id: "a", name: "Comercial" })];
    expect(instanceNameAlreadyExists("  COMERCIAL ", connections)).toBe(true);
    expect(instanceNameAlreadyExists("Suporte", connections)).toBe(false);
  });

  it("ignora a própria instância durante a edição", () => {
    const connections = [connection({ id: "a", name: "Comercial" })];
    expect(instanceNameAlreadyExists("Comercial", connections, "a")).toBe(false);
  });
});

describe("controles temporariamente ocultos", () => {
  it("mantém atendimento ativo e importação desabilitada na criação sem exibir os controles", () => {
    const source = readFileSync(new URL("./instancias.tsx", import.meta.url), "utf8");
    expect(source).toContain("const SHOW_INSTANCE_SERVICE_CONTROLS = false");
    expect(source).toContain("serviceEnabled,");
    expect(source).toContain("importHistoryEnabled: serviceEnabled && importHistory");
  });
});

describe("reconexão por QR Code", () => {
  it("mantém o modal aberto e consulta o QR assíncrono sem remover a instância", () => {
    const source = readFileSync(new URL("./instancias.tsx", import.meta.url), "utf8");
    expect(source).toContain("connectionsApi.qrStatus");
    expect(source).toContain("Gerando um novo QR Code");
    expect(source).toContain("todo o histórico estão preservados");
    expect(source).not.toContain("QR indisponivel");
  });

  it("interrompe a reconexão e orienta usar o número original quando outro número é lido", () => {
    const source = readFileSync(new URL("./instancias.tsx", import.meta.url), "utf8");
    expect(source).toContain('result.errorCode === "OWNER_PHONE_MISMATCH"');
    expect(source).toContain("Número diferente recusado");
    expect(source).toContain("Conecte o número original");
    expect(source).toContain("active && shouldPoll");
  });
});
