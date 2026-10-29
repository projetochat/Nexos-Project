import { expect, it, vi } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("./trixus-api", () => ({ apiRequest: request }));
import { taskManagementApi } from "./task-management";
it("uses the authenticated backend route with an explicit confirmation and one recipient", async () => {
  request.mockResolvedValue({ accepted: true });
  await taskManagementApi.verifySmtp("smtp/id", "recipient@example.invalid");
  expect(request).toHaveBeenCalledExactlyOnceWith("/tasks/smtp/smtp%2Fid/verify", {
    method: "POST",
    body: JSON.stringify({ confirm: true, recipient: "recipient@example.invalid" }),
  });
});
