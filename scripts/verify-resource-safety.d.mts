export type DisposableVerifyDatabaseInput = {
  databaseUrl?: string;
  nodeEnv?: string;
  confirmation?: string;
};

export type DisposableVerifyDatabase = {
  databaseUrl: string;
  databaseName: string;
};

export function assertDisposableVerifyDatabase(
  input: DisposableVerifyDatabaseInput,
): DisposableVerifyDatabase;

export type DisposableVerifyRedisInput = {
  redisUrl?: string;
  nodeEnv?: string;
  confirmation?: string;
};

export function assertDisposableVerifyRedis(input: DisposableVerifyRedisInput): {
  redisUrl: string;
};
