import { describe, expect, it } from "vitest";
import { ConversationStatus } from "../generated/prisma";
import { assignmentSystemNote } from "./conversations.controller";

const base = {
  assignedMembershipId: null,
  protocol: "000328",
  status: ConversationStatus.ABERTA,
};

describe("assignmentSystemNote", () => {
  it("identifica o primeiro atendimento passivo", () => {
    expect(
      assignmentSystemNote(
        { ...base, protocol: null },
        { ...base, assignedMembershipId: "agent-1" },
        "Admin Trixus",
        true,
      ),
    ).toBe("Atendimento iniciado (passivo) - protocolo: 000328");
  });

  it("registra retomada quando um atendente assume uma conversa sem responsável", () => {
    expect(
      assignmentSystemNote(
        base,
        { ...base, assignedMembershipId: "agent-1", status: ConversationStatus.EM_ANDAMENTO },
        "Admin Trixus",
        true,
      ),
    ).toBe("Conversa retomada (Admin Trixus)");
  });

  it("preserva a semântica de transferência entre atendentes", () => {
    expect(
      assignmentSystemNote(
        { ...base, assignedMembershipId: "agent-1", status: ConversationStatus.EM_ANDAMENTO },
        { ...base, assignedMembershipId: "agent-2", status: ConversationStatus.EM_ANDAMENTO },
        "Maria",
        false,
      ),
    ).toBe("Conversa transferida para Maria");
  });

  it("registra a movimentação para a fila", () => {
    expect(
      assignmentSystemNote(
        { ...base, assignedMembershipId: "agent-1", status: ConversationStatus.EM_ANDAMENTO },
        base,
        null,
        false,
      ),
    ).toBe("Conversa movida para fila");
  });
});
