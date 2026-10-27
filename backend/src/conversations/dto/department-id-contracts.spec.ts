import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreateConversationDto } from "./create-conversation.dto";
import { TransferDepartmentDto } from "./transfer-department.dto";
import { ListConversationsQueryDto } from "./list-conversations-query.dto";
import { BulkStartConversationsDto, BulkTransferConversationsDto } from "./bulk-conversations.dto";
import { DepartmentMigrationTargetDto } from "../../departments/dto/deactivate-department.dto";

const uuid = "2c499854-91a4-4bd1-b7a4-59db2ed9e551";
const contracts = [
  ["create", CreateConversationDto, { contactId: uuid }],
  ["transfer", TransferDepartmentDto, {}],
  ["list", ListConversationsQueryDto, {}],
  ["bulk start", BulkStartConversationsDto, {}],
  ["deactivation migration", DepartmentMigrationTargetDto, {}],
] as const;

describe("department ID contracts", () => {
  for (const [name, ctor, base] of contracts) {
    it(`accepts deterministic and UUID department IDs in ${name}`, async () => {
      for (const departmentId of ["tenant-a:atendimento", uuid, "x".repeat(191)]) {
        expect(
          await validate(plainToInstance(ctor as new () => object, { ...base, departmentId })),
        ).toEqual([]);
      }
    });
    it(`rejects malformed department IDs in ${name}`, async () => {
      for (const departmentId of ["", "x".repeat(192), 42, {}, []]) {
        const errors = await validate(
          plainToInstance(ctor as new () => object, { ...base, departmentId }),
        );
        expect(errors.some((error) => error.property === "departmentId")).toBe(true);
      }
    });
  }

  it("accepts deterministic bulk targets only for department transfers", async () => {
    expect(
      await validate(
        plainToInstance(BulkTransferConversationsDto, {
          mode: "department",
          targetId: "tenant-a:atendimento",
        }),
      ),
    ).toEqual([]);
    for (const mode of ["agent", "status"]) {
      const errors = await validate(
        plainToInstance(BulkTransferConversationsDto, {
          mode,
          targetId: "tenant-a:atendimento",
        }),
      );
      expect(errors.some((error) => error.property === "targetId")).toBe(true);
    }
    expect(
      await validate(
        plainToInstance(BulkTransferConversationsDto, { mode: "agent", targetId: uuid }),
      ),
    ).toEqual([]);
  });

  it("rejects malformed bulk department targets", async () => {
    for (const targetId of ["", "x".repeat(192), 42, {}, []]) {
      const errors = await validate(
        plainToInstance(BulkTransferConversationsDto, { mode: "department", targetId }),
      );
      expect(errors.some((error) => error.property === "targetId")).toBe(true);
    }
  });

  it("preserves UUID checks for other identities", async () => {
    const cases = [
      [
        CreateConversationDto,
        { contactId: "contact", connectionId: "connection", sourceGroupConversationId: "group" },
        ["contactId", "connectionId", "sourceGroupConversationId"],
      ],
      [
        ListConversationsQueryDto,
        { contactId: "contact", customerId: "customer" },
        ["contactId", "customerId"],
      ],
      [
        BulkStartConversationsDto,
        { conversationIds: ["conversation"], customerIds: ["customer"] },
        ["conversationIds", "customerIds"],
      ],
      [
        DepartmentMigrationTargetDto,
        { departmentId: "tenant-a:atendimento", connectionId: "connection" },
        ["connectionId"],
      ],
    ] as const;
    for (const [ctor, payload, properties] of cases) {
      const errors = await validate(plainToInstance(ctor as new () => object, payload));
      for (const property of properties)
        expect(errors.some((error) => error.property === property)).toBe(true);
    }
  });
});
