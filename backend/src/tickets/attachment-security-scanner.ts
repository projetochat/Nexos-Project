import { Injectable } from "@nestjs/common";

@Injectable()
export class AttachmentSecurityScanner {
  async scan() {
    return "NOT_SCANNED" as const;
  }
}
