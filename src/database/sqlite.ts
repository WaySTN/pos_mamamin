import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import {
  ALL_SCHEMA_MIGRATIONS,
  DATABASE_NAME,
  LATEST_SCHEMA_VERSION,
} from './migrations/v1';
import {
  DatabaseError,
  type DatabaseHealthInfo,
  type RunResult,
  type SchemaMigration,
  type SqlDriver,
  type SqlExecutor,
  type SqlValue,
} from './types';

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function classifySqlError(
  error: unknown,
  fallbackMessage: string,
  fallbackCode: 'DB_QUERY_FAILED' | 'DB_TRANSACTION_FAILED' = 'DB_QUERY_FAILED',
): DatabaseError {
  if (error instanceof DatabaseError) {
    return error;
  }

  const rawDetail = extractErrorMessage(error);
  const normalized = rawDetail.toUpperCase();

  if (
    normalized.includes('CONSTRAINT') ||
    normalized.includes('FOREIGN KEY') ||
    normalized.includes('UNIQUE') ||
    normalized.includes('NOT NULL')
  ) {
    return new DatabaseError(
      'DB_CONSTRAINT_FAILED',
      'Operasi ditolak oleh aturan integritas database (constraint/foreign key).',
      rawDetail,
    );
  }

  return new DatabaseError(fallbackCode, fallbackMessage, rawDetail);
}

/**
 * Antrean mutex sederhana agar transaksi/operasi SQL pada satu koneksi native
 * tidak pernah saling bertumpuk (menghindari "Already in transaction" / race condition).
 */
class AsyncOperationQueue {
  private tail: Promise<void> = Promise.resolve();

  runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const execution = this.tail.then(task, task);
    this.tail = execution.then(
      () => undefined,
      () => undefined,
    );
    return execution;
  }
}

/**
 * Driver produksi untuk Android Native melalui `@capacitor-community/sqlite`.
 * Tidak menggunakan localStorage / IndexedDB sebagai fallback transaksi semu di browser.
 */
export class CapacitorSqliteDriver implements SqlDriver {
  readonly driverName = 'capacitor-sqlite-native';
  readonly isNativeStorage = true;

  private sqliteConnection: SQLiteConnection | null = null;
  private db: SQLiteDBConnection | null = null;
  private readonly operationQueue = new AsyncOperationQueue();

  async open(
    databaseName: string,
    targetVersion: number,
    migrations: readonly SchemaMigration[],
  ): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      throw new DatabaseError(
        'DB_NOT_SUPPORTED_ON_WEB',
        'SQLite native hanya berjalan pada APK Android. Browser dev tidak memakai fallback localStorage.',
      );
    }

    if (this.db) {
      const opened = await this.db.isDBOpen();
      if (opened.result === true) {
        await this.ensureForeignKeysEnabled(this.db);
        return;
      }
    }

    if (!this.sqliteConnection) {
      this.sqliteConnection = new SQLiteConnection(CapacitorSQLite);
    }

    const sqlite = this.sqliteConnection;

    await sqlite.addUpgradeStatement(
      databaseName,
      migrations.map((migration) => ({
        toVersion: migration.toVersion,
        statements: [...migration.statements],
      })),
    );

    const consistency = await sqlite.checkConnectionsConsistency();
    const hasExistingConn = await sqlite.isConnection(databaseName, false);

    const connection =
      consistency.result === true && hasExistingConn.result === true
        ? await sqlite.retrieveConnection(databaseName, false)
        : await sqlite.createConnection(
            databaseName,
            false,
            'no-encryption',
            targetVersion,
            false,
          );

    const alreadyOpen = await connection.isDBOpen();
    if (alreadyOpen.result !== true) {
      await connection.open();
    }

    await this.ensureForeignKeysEnabled(connection);
    this.db = connection;
  }

  private async ensureForeignKeysEnabled(
    connection: SQLiteDBConnection,
  ): Promise<void> {
    await connection.execute('PRAGMA foreign_keys = ON;', false);
    const fkResult = await connection.query('PRAGMA foreign_keys;');
    const firstRow = (fkResult.values?.[0] ?? undefined) as
      | Record<string, unknown>
      | undefined;
    const fkValue = Number(firstRow?.foreign_keys ?? 0);

    if (fkValue !== 1) {
      throw new DatabaseError(
        'DB_INIT_FAILED',
        'Gagal mengaktifkan PRAGMA foreign_keys = ON pada SQLite native.',
      );
    }
  }

  private requireDb(): SQLiteDBConnection {
    if (!this.db) {
      throw new DatabaseError(
        'DB_NOT_INITIALIZED',
        'Koneksi SQLite belum diinisialisasi.',
      );
    }
    return this.db;
  }

  async isOpen(): Promise<boolean> {
    if (!this.db) {
      return false;
    }
    const status = await this.db.isDBOpen();
    return status.result === true;
  }

  async getSchemaVersion(): Promise<number> {
    const db = this.requireDb();
    const versionResult = await db.getVersion();
    if (typeof versionResult.version === 'number') {
      return versionResult.version;
    }

    const pragmaRows = await this.query<{ user_version?: number }>(
      'PRAGMA user_version;',
    );
    return Number(pragmaRows[0]?.user_version ?? 0);
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    statement: string,
    values: readonly SqlValue[] = [],
  ): Promise<readonly T[]> {
    return this.operationQueue.runExclusive(async () =>
      this.executeQueryInternal<T>(statement, values),
    );
  }

  async run(
    statement: string,
    values: readonly SqlValue[] = [],
  ): Promise<RunResult> {
    return this.operationQueue.runExclusive(async () =>
      this.executeRunInternal(statement, values, true),
    );
  }

  async withTransaction<T>(
    work: (tx: SqlExecutor) => Promise<T>,
  ): Promise<T> {
    return this.operationQueue.runExclusive(async () => {
      const db = this.requireDb();
      await db.beginTransaction();

      const txExecutor: SqlExecutor = {
        query: <R extends Record<string, unknown> = Record<string, unknown>>(
          statement: string,
          values: readonly SqlValue[] = [],
        ): Promise<readonly R[]> =>
          this.executeQueryInternal<R>(statement, values),
        run: (
          statement: string,
          values: readonly SqlValue[] = [],
        ): Promise<RunResult> =>
          this.executeRunInternal(statement, values, false),
      };

      try {
        const result = await work(txExecutor);
        await db.commitTransaction();
        return result;
      } catch (error) {
        try {
          await db.rollbackTransaction();
        } catch {
          // Abaikan error sekunder saat rollback agar kausa utama tetap utuh
        }
        throw classifySqlError(
          error,
          'Transaksi SQLite dibatalkan (rollback) karena terjadi kegagalan.',
          'DB_TRANSACTION_FAILED',
        );
      }
    });
  }

  private async executeQueryInternal<T extends Record<string, unknown>>(
    statement: string,
    values: readonly SqlValue[],
  ): Promise<readonly T[]> {
    const db = this.requireDb();
    try {
      const response = await db.query(statement, [...values]);
      return (response.values ?? []) as T[];
    } catch (error) {
      throw classifySqlError(error, 'Gagal membaca data dari SQLite lokal.');
    }
  }

  private async executeRunInternal(
    statement: string,
    values: readonly SqlValue[],
    autoTransaction: boolean,
  ): Promise<RunResult> {
    const db = this.requireDb();
    try {
      const response = await db.run(statement, [...values], autoTransaction);
      const changesCount = response.changes?.changes ?? 0;
      const rawLastId = response.changes?.lastId;
      return {
        changes: changesCount,
        lastId: typeof rawLastId === 'number' && rawLastId >= 0 ? rawLastId : null,
      };
    } catch (error) {
      throw classifySqlError(error, 'Gagal menyimpan perubahan ke SQLite lokal.');
    }
  }

  async close(): Promise<void> {
    await this.operationQueue.runExclusive(async () => {
      if (this.db && this.sqliteConnection) {
        const dbName = this.db.getConnectionDBName();
        const opened = await this.db.isDBOpen();
        if (opened.result === true) {
          await this.db.close();
        }
        await this.sqliteConnection.closeConnection(dbName, false);
        this.db = null;
      }
    });
  }
}

export interface DatabaseServiceOptions {
  readonly databaseName?: string;
  readonly targetSchemaVersion?: number;
  readonly migrations?: readonly SchemaMigration[];
  readonly isNativePlatformOverride?: boolean;
}

/**
 * Pengelola tunggal lifecycle SQLite, migrasi versi, dan eksekusi transaksi.
 * Tidak pernah mereset/menghapus database secara otomatis ketika startup.
 */
export class DatabaseService implements SqlExecutor {
  private readonly driver: SqlDriver;
  private readonly databaseName: string;
  private readonly targetSchemaVersion: number;
  private readonly migrations: readonly SchemaMigration[];
  private readonly isNativePlatformOverride?: boolean;
  private initPromise: Promise<DatabaseHealthInfo> | null = null;
  private lastHealth: DatabaseHealthInfo | null = null;

  constructor(driver: SqlDriver, options: DatabaseServiceOptions = {}) {
    this.driver = driver;
    this.databaseName = options.databaseName ?? DATABASE_NAME;
    this.targetSchemaVersion =
      options.targetSchemaVersion ?? LATEST_SCHEMA_VERSION;
    this.migrations = options.migrations ?? ALL_SCHEMA_MIGRATIONS;
    this.isNativePlatformOverride = options.isNativePlatformOverride;
  }

  getCachedHealth(): DatabaseHealthInfo | null {
    return this.lastHealth;
  }

  async initialize(): Promise<DatabaseHealthInfo> {
    if (this.initPromise) {
      return this.initPromise;
    }

    const task = this.performInitialize().finally(() => {
      this.initPromise = null;
    });
    this.initPromise = task;
    return task;
  }

  private async performInitialize(): Promise<DatabaseHealthInfo> {
    const isNativePlatform =
      this.isNativePlatformOverride ?? Capacitor.isNativePlatform();

    try {
      await this.driver.open(
        this.databaseName,
        this.targetSchemaVersion,
        this.migrations,
      );
      const health = await this.inspectHealth(isNativePlatform);
      this.lastHealth = health;
      return health;
    } catch (error) {
      const classified =
        error instanceof DatabaseError
          ? error
          : new DatabaseError(
              'DB_INIT_FAILED',
              'Gagal membuka atau memigrasikan database SQLite lokal.',
              extractErrorMessage(error),
            );

      const failedHealth: DatabaseHealthInfo = {
        isReady: false,
        isNativePlatform,
        isNativeStorage: this.driver.isNativeStorage,
        driverName: this.driver.driverName,
        databaseName: this.databaseName,
        schemaVersion: 0,
        foreignKeysEnabled: false,
        tables: [],
        indexes: [],
        errorCode: classified.code,
        errorMessage: classified.technicalDetail
          ? `${classified.message} (${classified.technicalDetail})`
          : classified.message,
      };
      this.lastHealth = failedHealth;
      return failedHealth;
    }
  }

  async verifyHealth(): Promise<DatabaseHealthInfo> {
    const isNativePlatform =
      this.isNativePlatformOverride ?? Capacitor.isNativePlatform();
    const opened = await this.driver.isOpen();

    if (!opened) {
      return this.initialize();
    }

    const health = await this.inspectHealth(isNativePlatform);
    this.lastHealth = health;
    return health;
  }

  private async inspectHealth(
    isNativePlatform: boolean,
  ): Promise<DatabaseHealthInfo> {
    const schemaVersion = await this.driver.getSchemaVersion();
    const fkRows = await this.driver.query<{ foreign_keys?: number }>(
      'PRAGMA foreign_keys;',
    );
    const foreignKeysEnabled = Number(fkRows[0]?.foreign_keys ?? 0) === 1;

    const masterRows = await this.driver.query<{
      type: string;
      name: string;
    }>(
      `SELECT type, name
       FROM sqlite_master
       WHERE type IN ('table', 'index')
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE 'android_%'
       ORDER BY type ASC, name ASC;`,
    );

    const tables = masterRows
      .filter((row) => row.type === 'table')
      .map((row) => row.name);
    const indexes = masterRows
      .filter((row) => row.type === 'index')
      .map((row) => row.name);

    return {
      isReady: true,
      isNativePlatform,
      isNativeStorage: this.driver.isNativeStorage,
      driverName: this.driver.driverName,
      databaseName: this.databaseName,
      schemaVersion,
      foreignKeysEnabled,
      tables,
      indexes,
      errorCode: null,
      errorMessage: null,
    };
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    statement: string,
    values: readonly SqlValue[] = [],
  ): Promise<readonly T[]> {
    await this.ensureOpen();
    return this.driver.query<T>(statement, values);
  }

  async run(
    statement: string,
    values: readonly SqlValue[] = [],
  ): Promise<RunResult> {
    await this.ensureOpen();
    return this.driver.run(statement, values);
  }

  async withTransaction<T>(
    work: (tx: SqlExecutor) => Promise<T>,
  ): Promise<T> {
    await this.ensureOpen();
    return this.driver.withTransaction(work);
  }

  async close(): Promise<void> {
    await this.driver.close();
    this.lastHealth = null;
  }

  private async ensureOpen(): Promise<void> {
    const opened = await this.driver.isOpen();
    if (!opened) {
      const health = await this.initialize();
      if (!health.isReady) {
        throw new DatabaseError(
          health.errorCode ?? 'DB_NOT_INITIALIZED',
          health.errorMessage ?? 'Database SQLite belum siap.',
        );
      }
    }
  }
}

export const databaseService = new DatabaseService(new CapacitorSqliteDriver());

