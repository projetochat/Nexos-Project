import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { AssignConversationDto } from "./assign-conversation.dto";

describe("AssignConversationDto", () => {
  it("accepts the deterministic default department id", async () => {
    const dto = plainToInstance(AssignConversationDto, {
      self: true,
      departmentId: "tenant-a:atendimento",
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it("keeps membership ids restricted to UUIDs", async () => {
    const dto = plainToInstance(AssignConversationDto, {
      membershipId: "tenant-a:tenant_admin",
      departmentId: "tenant-a:atendimento",
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === "membershipId")).toBe(true);
    expect(errors.some((error) => error.property === "departmentId")).toBe(false);
  });

  it("rejects empty department ids", async () => {
    const dto = plainToInstance(AssignConversationDto, { self: true, departmentId: "" });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === "departmentId")).toBe(true);
  });
});
