import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { AiCredentialEncryptionService } from "./ai-credential-encryption.service";

describe("AiCredentialEncryptionService", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const service = new AiCredentialEncryptionService({ get: () => key } as ConfigService);
  const credential = ["sk", "private", "example", "value"].join("-");

  it("encrypts with tenant-bound authenticated data and never stores plaintext", () => {
    const encrypted = service.encrypt(credential, "tenant-a", "connection-a", "OPENAI");
    expect(encrypted.credentialCiphertext).not.toContain(credential);
    expect(encrypted.credentialMasked).not.toContain(credential);
    expect(service.decrypt(encrypted, "tenant-a", "connection-a", "OPENAI")).toBe(credential);
  });

  it("rejects decrypting a credential in another tenant", () => {
    const encrypted = service.encrypt(credential, "tenant-a", "connection-a", "OPENAI");
    expect(() => service.decrypt(encrypted, "tenant-b", "connection-a", "OPENAI")).toThrow(
      "Não foi possível acessar a credencial de IA.",
    );
  });
});
