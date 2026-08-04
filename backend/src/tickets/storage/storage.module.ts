import { Module } from "@nestjs/common";
import { FileStorageProvider } from "./file-storage.provider";
import { LocalPrivateStorageProvider } from "./local-private-storage.provider";
import { R2StorageProvider } from "./r2-storage.provider";

@Module({
  providers: [
    LocalPrivateStorageProvider,
    R2StorageProvider,
    {
      provide: FileStorageProvider,
      inject: [LocalPrivateStorageProvider, R2StorageProvider],
      useFactory: (local: LocalPrivateStorageProvider, r2: R2StorageProvider) =>
        process.env.NEXOS_STORAGE_PROVIDER === "r2" ? r2 : local,
    },
  ],
  exports: [FileStorageProvider],
})
export class StorageModule {}
