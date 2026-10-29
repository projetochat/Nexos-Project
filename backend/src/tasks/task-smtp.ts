import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP, Socket, connect as netConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";
import type { TaskSmtpInput } from "./task-contract";
export type TaskEncryptedPassword = {
  ciphertext: string;
  iv: string;
  tag: string;
  connectionFingerprint?: string;
  lastTestAcceptedAt?: string;
  lastTestReference?: string;
  lastTestMessageId?: string;
  lastTestFingerprint?: string;
};
export function taskSmtpConfigurationFingerprint(
  account: TaskSmtpInput,
  credential: TaskEncryptedPassword,
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        account.name,
        account.host,
        account.port,
        account.secure,
        account.username,
        account.fromAddress,
        account.fromName,
        credential.ciphertext,
        credential.iv,
        credential.tag,
      ]),
    )
    .digest("hex");
}
export function taskSmtpCredentialBase(value: TaskEncryptedPassword): TaskEncryptedPassword {
  return { ciphertext: value.ciphertext, iv: value.iv, tag: value.tag };
}
export class TaskSmtpFailure extends Error {
  constructor(readonly ambiguous: boolean) {
    super(
      ambiguous
        ? "Resultado SMTP incerto; não reenviar automaticamente."
        : "Não foi possível concluir a operação SMTP.",
    );
  }
}
export function isPublicSmtpAddress(ip: string) {
  if (isIP(ip) === 4) {
    const n = ip.split(".").map(Number);
    return !(
      n[0] === 0 ||
      n[0] === 10 ||
      n[0] === 127 ||
      n[0] >= 224 ||
      (n[0] === 169 && n[1] === 254) ||
      (n[0] === 172 && n[1] >= 16 && n[1] <= 31) ||
      (n[0] === 192 && (n[1] === 168 || n[1] === 0 || (n[1] === 88 && n[2] === 99))) ||
      (n[0] === 198 && n[1] === 51 && n[2] === 100) ||
      (n[0] === 203 && n[1] === 0 && n[2] === 113) ||
      (n[0] === 100 && n[1] >= 64 && n[1] <= 127) ||
      (n[0] === 198 && (n[1] === 18 || n[1] === 19))
    );
  }
  if (isIP(ip) === 6) {
    const value = ip.toLowerCase();
    if (
      !/^[23][0-9a-f]{3}:/i.test(value) ||
      value.startsWith("2002:") ||
      value.startsWith("3fff:") ||
      (value.startsWith("2001:") && parseInt(value.split(":")[1] || "0", 16) < 0x200) ||
      value.startsWith("2001:db8:") ||
      value.startsWith("2001:0:")
    )
      return false;
    return !(
      value === "::" ||
      value === "::1" ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      value.startsWith("fe8") ||
      value.startsWith("fe9") ||
      value.startsWith("fea") ||
      value.startsWith("feb") ||
      value.startsWith("ff") ||
      value.startsWith("::ffff:")
    );
  }
  return false;
}
@Injectable()
export class TaskSmtpService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}
  configured() {
    try {
      this.key();
      return true;
    } catch {
      return false;
    }
  }
  private key() {
    const raw = this.config.get<string>("TASKS_SMTP_ENCRYPTION_KEY") ?? "";
    const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (key.length !== 32)
      throw new ServiceUnavailableException("Criptografia SMTP não configurada.");
    return key;
  }
  encrypt(password: string, tenantId: string, id: string): TaskEncryptedPassword {
    if (!password || password.length > 4096) throw new BadRequestException("Senha SMTP inválida.");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    cipher.setAAD(Buffer.from(`trixus:tasks:smtp:v1:${tenantId}:${id}`));
    return {
      ciphertext: Buffer.concat([cipher.update(password, "utf8"), cipher.final()]).toString(
        "base64",
      ),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
    };
  }
  decrypt(value: TaskEncryptedPassword, tenantId: string, id: string) {
    try {
      const cipher = createDecipheriv("aes-256-gcm", this.key(), Buffer.from(value.iv, "base64"));
      cipher.setAAD(Buffer.from(`trixus:tasks:smtp:v1:${tenantId}:${id}`));
      cipher.setAuthTag(Buffer.from(value.tag, "base64"));
      return Buffer.concat([
        cipher.update(Buffer.from(value.ciphertext, "base64")),
        cipher.final(),
      ]).toString("utf8");
    } catch {
      throw new ServiceUnavailableException("Não foi possível acessar a credencial SMTP.");
    }
  }
  async verify(account: TaskSmtpInput, password: string) {
    const session = await this.open(account, password);
    try {
      await session.command("QUIT", [221]);
      return { verified: true };
    } finally {
      session.close();
    }
  }
  async send(
    account: TaskSmtpInput,
    password: string,
    input: { to: string; subject: string; body: string; deliveryId: string },
  ) {
    let session: SmtpSession | undefined;
    let dataStarted = false;
    try {
      session = await this.open(account, password);
      await session.command(`MAIL FROM:<${account.fromAddress}>`, [250]);
      await session.command(`RCPT TO:<${email(input.to)}>`, [250, 251]);
      await session.command("DATA", [354]);
      const encoded = (text: string) => `=?UTF-8?B?${Buffer.from(text).toString("base64")}?=`;
      const body = [
        `From: ${encoded(account.fromName || account.name)} <${email(account.fromAddress)}>`,
        `To: <${email(input.to)}>`,
        `Subject: ${encoded(input.subject)}`,
        `Message-ID: <${input.deliveryId}@trixus.invalid>`,
        `Date: ${new Date().toUTCString()}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(input.body)
          .toString("base64")
          .match(/.{1,76}/g)
          ?.join("\r\n") ?? "",
      ].join("\r\n");
      dataStarted = true;
      await session.command(body + "\r\n.", [250]);
      dataStarted = false;
      return {
        sent: true as const,
        accepted: true as const,
        messageId: `<${input.deliveryId}@trixus.invalid>`,
      };
    } catch (error) {
      throw new TaskSmtpFailure(dataStarted && !(error instanceof SmtpRejected));
    } finally {
      session?.close();
    }
  }
  private async open(account: TaskSmtpInput, password: string) {
    const host = account.host.toLowerCase().trim();
    const allowed = (this.config.get<string>("TRIXUS_TASKS_SMTP_ALLOWED_HOSTS") ?? "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    if (
      !allowed.includes(host) ||
      !/^([a-z0-9-]+\.)+[a-z0-9-]+$/i.test(host) ||
      ![465, 587, 2525].includes(account.port)
    )
      throw new BadRequestException("Servidor SMTP não autorizado na configuração da plataforma.");
    email(account.fromAddress);
    if (/[\r\n\0]/.test(account.username)) throw new BadRequestException("Usuário SMTP inválido.");
    let dnsTimer: ReturnType<typeof setTimeout> | undefined;
    const addresses = await Promise.race([
      lookup(host, { all: true }),
      new Promise<never>((_, reject) => {
        dnsTimer = setTimeout(() => reject(new TaskSmtpFailure(false)), 10000);
      }),
    ]).finally(() => clearTimeout(dnsTimer));
    if (!addresses.length || addresses.some((item) => !isPublicSmtpAddress(item.address)))
      throw new BadRequestException("Servidor SMTP deve resolver apenas endereços públicos.");
    const session = await SmtpSession.open(
      host,
      addresses[0].address,
      account.port,
      account.secure,
    );
    try {
      await session.greeting();
      let capabilities = await session.command("EHLO trixus.invalid", [250]);
      if (!account.secure) {
        if (!capabilities.toUpperCase().includes("STARTTLS")) throw new SmtpRejected();
        await session.command("STARTTLS", [220]);
        await session.upgrade(host);
        capabilities = await session.command("EHLO trixus.invalid", [250]);
      }
      if (!/AUTH[^\r\n]*PLAIN/i.test(capabilities)) throw new SmtpRejected();
      await session.command(
        `AUTH PLAIN ${Buffer.from(`\0${account.username}\0${password}`).toString("base64")}`,
        [235],
      );
      return session;
    } catch {
      session.close();
      throw new TaskSmtpFailure(false);
    }
  }
}
export function email(value: string) {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[^\s<>@\r\n]+@[^\s<>@\r\n]+\.[^\s<>@\r\n]+$/.test(value)
  )
    throw new BadRequestException("E-mail inválido.");
  return value;
}
class SmtpRejected extends Error {}
class SmtpSession {
  private received = 0;
  private buffer = "";
  private replyLines: string[] = [];
  private replies: string[] = [];
  private waiters: Array<{ resolve: (reply: string) => void; reject: (error: Error) => void }> = [];
  private failed: Error | null = null;
  private constructor(private socket: Socket) {
    this.attach();
  }
  static async open(host: string, address: string, port: number, secure: boolean) {
    const socket = secure
      ? tlsConnect({ host: address, port, servername: host, rejectUnauthorized: true })
      : netConnect({ host: address, port });
    const session = new SmtpSession(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once(secure ? "secureConnect" : "connect", resolve);
      socket.once("error", reject);
    });
    return session;
  }
  private attach() {
    this.socket.setTimeout(10000, () => this.socket.destroy(new Error("SMTP timeout")));
    this.socket.on("data", this.onData);
    this.socket.on("error", this.onError);
    this.socket.on("close", this.onClose);
  }
  private onError = (error: Error) => {
    this.failed = error;
    for (const waiter of this.waiters.splice(0)) waiter.reject(new TaskSmtpFailure(false));
  };
  private onClose = () => this.onError(new Error("SMTP closed"));
  private onData = (chunk: Buffer) => {
    this.received += chunk.length;
    if (this.received > 65536) {
      this.socket.destroy(new Error("SMTP response too large"));
      return;
    }
    this.buffer += chunk.toString("utf8");
    if (this.buffer.length + this.replyLines.join("").length > 65536) {
      this.socket.destroy(new Error("SMTP response too large"));
      return;
    }
    let newline;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      this.replyLines.push(line);
      if (/^\d{3} /.test(line)) {
        const reply = this.replyLines.join("\n");
        this.replyLines = [];
        const waiter = this.waiters.shift();
        if (waiter) waiter.resolve(reply);
        else this.replies.push(reply);
      }
    }
  };
  private read() {
    if (this.failed) return Promise.reject(new TaskSmtpFailure(false));
    const reply = this.replies.shift();
    if (reply) return Promise.resolve(reply);
    return new Promise<string>((resolve, reject) => this.waiters.push({ resolve, reject }));
  }
  private async accept(codes: number[]) {
    const reply = await this.read();
    if (!codes.includes(Number(reply.slice(0, 3)))) throw new SmtpRejected();
    return reply;
  }
  greeting() {
    return this.accept([220]);
  }
  command(value: string, codes: number[]) {
    this.socket.write(value + "\r\n");
    return this.accept(codes);
  }
  async upgrade(host: string) {
    this.buffer = "";
    this.replyLines = [];
    this.replies = [];
    this.socket.off("data", this.onData);
    this.socket.off("error", this.onError);
    this.socket.off("close", this.onClose);
    const socket = tlsConnect({ socket: this.socket, servername: host, rejectUnauthorized: true });
    this.socket = socket;
    this.attach();
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
    });
  }
  close() {
    this.socket.destroy();
  }
}
