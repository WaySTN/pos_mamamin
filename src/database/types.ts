export type SqlValue = string | number | null;

export interface RunResult {
  readonly changes: number;
  readonly lastId: number | null;
}

export interface SqlExecutor {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    statement: string,
    values?: readonly SqlValue[],
  ): Promise<readonly T[]>;
  run(
    statement: string,
    values?: readonly SqlValue[],
  ): Promise<RunResult>;
}

export interface SchemaMigration {
  readonly toVersion: number;
  readonly description: string;
  readonly statements: readonly string[];
}

export interface SqlDriver extends SqlExecutor {
  readonly driverName: string;
  readonly isNativeStorage: boolean;
  open(
    databaseName: string,
    targetVersion: number,
    migrations: readonly SchemaMigration[],
  ): Promise<void>;
  close(): Promise<void>;
  isOpen(): Promise<boolean>;
  getSchemaVersion(): Promise<number>;
  withTransaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export type DatabaseErrorCode =
  | 'DB_NOT_SUPPORTED_ON_WEB'
  | 'DB_INIT_FAILED'
  | 'DB_NOT_INITIALIZED'
  | 'DB_QUERY_FAILED'
  | 'DB_CONSTRAINT_FAILED'
  | 'DB_TRANSACTION_FAILED';

export class DatabaseError extends Error {
  readonly code: DatabaseErrorCode;
  readonly technicalDetail?: string;

  constructor(
    code: DatabaseErrorCode,
    message: string,
    technicalDetail?: string,
  ) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.technicalDetail = technicalDetail;
  }
}

export interface DatabaseHealthInfo {
  readonly isReady: boolean;
  readonly isNativePlatform: boolean;
  readonly isNativeStorage: boolean;
  readonly driverName: string;
  readonly databaseName: string;
  readonly schemaVersion: number;
  readonly foreignKeysEnabled: boolean;
  readonly tables: readonly string[];
  readonly indexes: readonly string[];
  readonly errorCode: DatabaseErrorCode | null;
  readonly errorMessage: string | null;
}

