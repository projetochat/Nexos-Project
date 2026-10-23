import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedCredential = {
  credentialCiphertext: string;
  credentialIv: string;
  credentialAuthTag: string;
  credentialKeyVersion: number;
  credentialMasked: string;
};

@Injectable()
export class AiCredentialEncryptionService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  encrypt(
    value: string,
    tenantId: string,
    connectionId: string,
    provider: string,
  ): EncryptedCredential {
    const credential = value.trim();
    if (!credential) throw new ServiceUnavailableException("Credencial de IA não informada.");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    cipher.setAAD(Buffer.from(this.aad(tenantId, connectionId, provider)));
    const ciphertext = Buffer.concat([cipher.update(credential, "utf8"), cipher.final()]);
    return {
      credentialCiphertext: ciphertext.toString("base64"),
      credentialIv: iv.toString("base64"),
      credentialAuthTag: cipher.getAuthTag().toString("base64"),
      credentialKeyVersion: 1,
      credentialMasked: maskCredential(credential),
    };
  }

  decrypt(
    encrypted: Pick<
      EncryptedCredential,
      "credentialCiphertext" | "credentialIv" | "credentialAuthTag"
    >,
    tenantId: string,
    connectionId: string,
    provider: string,
  ) {
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key(),
        Buffer.from(encrypted.credentialIv, "base64"),
      );
      decipher.setAAD(Buffer.from(this.aad(tenantId, connectionId, provider)));
      decipher.setAuthTag(Buffer.from(encrypted.credentialAuthTag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted.credentialCiphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new ServiceUnavailableException("Não foi possível acessar a credencial de IA.");
    }
  }

  private key() {
    const raw = this.config.get<string>("AI_CREDENTIALS_ENCRYPTION_KEY")?.trim() ?? "";
    const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (key.byteLength !== 32) {
      throw new ServiceUnavailableException("Criptografia das credenciais de IA não configurada.");
    }
    return key;
  }

  private aad(tenantId: string, connectionId: string, provider: string) {
    return `trixus:ai:v1:${tenantId}:${connectionId}:${provider}`;
  }
}

export function maskCredential(value: string) {
  const suffix = value.slice(-4);
  return `${value.slice(0, Math.min(3, Math.max(0, value.length - 4)))}${"•".repeat(12)}${suffix}`;
}
