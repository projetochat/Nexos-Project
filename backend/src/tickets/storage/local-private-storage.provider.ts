import { Injectable } from "@nestjs/common";
import { createReadStream, promises as fs } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { FileStorageProvider, StoredObject, UploadRequest } from "./file-storage.provider";

@Injectable()
export class LocalPrivateStorageProvider extends FileStorageProvider {
  readonly provider = "local" as const;
  private readonly root = resolve(process.env.NEXOS_STORAGE_LOCAL_PATH ?? ".nexos-storage");

  async createUpload(request: UploadRequest) {
    this.pathFor(request.objectKey);
    return { uploadUrl: "local://tickets/complete", objectKey: request.objectKey };
  }

  async completeUpload(request: UploadRequest & { body: Buffer }) {
    if (request.body.byteLength !== request.sizeBytes) {
      throw new Error("STORAGE_SIZE_MISMATCH");
    }
    const path = this.pathFor(request.objectKey);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs
      .writeFile(path, request.body, { flag: "wx" })
      .catch(async (error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
        await fs.writeFile(path, request.body);
      });
  }

  async getDownloadObject(objectKey: string): Promise<StoredObject> {
    const path = this.pathFor(objectKey);
    const body = await fs.readFile(path);
    return { body, mimeType: "application/octet-stream", sizeBytes: body.byteLength };
  }

  async getStream(objectKey: string) {
    return createReadStream(this.pathFor(objectKey));
  }

  async deleteObject(objectKey: string) {
    await fs.rm(this.pathFor(objectKey), { force: true });
  }

  async headObject(objectKey: string) {
    try {
      const stat = await fs.stat(this.pathFor(objectKey));
      return { exists: stat.isFile(), sizeBytes: stat.size };
    } catch {
      return { exists: false };
    }
  }

  private pathFor(objectKey: string) {
    if (objectKey.includes("..") || objectKey.includes("\\") || objectKey.startsWith("/")) {
      throw new Error("STORAGE_OBJECT_KEY_INVALID");
    }
    const path = resolve(this.root, objectKey);
    if (!path.startsWith(`${this.root}${sep}`) && path !== this.root) {
      throw new Error("STORAGE_OBJECT_KEY_INVALID");
    }
    return path;
  }
}
