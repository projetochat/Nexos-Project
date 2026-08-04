import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { FileStorageProvider, UploadRequest } from "./file-storage.provider";

@Injectable()
export class R2StorageProvider extends FileStorageProvider {
  readonly provider = "r2" as const;

  async createUpload(request: UploadRequest) {
    if (!process.env.R2_BUCKET)
      throw new ServiceUnavailableException("Storage R2 nao configurado.");
    return {
      uploadUrl: `r2://${process.env.R2_BUCKET}/${request.objectKey}`,
      objectKey: request.objectKey,
    };
  }

  async completeUpload(): Promise<void> {
    throw new ServiceUnavailableException(
      "Upload direto para R2 deve ser confirmado por metadata.",
    );
  }

  async getDownloadObject(): Promise<never> {
    throw new ServiceUnavailableException("Download R2 indisponivel nesta instalacao.");
  }

  async deleteObject(): Promise<void> {
    if (!process.env.R2_BUCKET)
      throw new ServiceUnavailableException("Storage R2 nao configurado.");
  }

  async headObject() {
    if (!process.env.R2_BUCKET) return { exists: false };
    return { exists: true };
  }
}
