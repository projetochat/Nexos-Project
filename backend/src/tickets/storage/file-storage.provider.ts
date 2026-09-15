export type UploadRequest = {
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
};

export type StoredObject = {
  body: Buffer;
  mimeType: string;
  sizeBytes: number;
};

export abstract class FileStorageProvider {
  abstract readonly provider: "local" | "r2";
  abstract createUpload(request: UploadRequest): Promise<{ uploadUrl: string; objectKey: string }>;
  abstract completeUpload(request: UploadRequest & { body: Buffer }): Promise<void>;
  abstract getDownloadObject(objectKey: string): Promise<StoredObject>;
  abstract deleteObject(objectKey: string): Promise<void>;
  abstract headObject(objectKey: string): Promise<{ exists: boolean; sizeBytes?: number }>;
}
