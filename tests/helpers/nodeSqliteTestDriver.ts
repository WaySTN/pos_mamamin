import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { classifySqlError } from '../../src/database/sqlite';
import type {
  RunResult,
  SchemaMigration,
  SqlDriver,
  SqlExecutor,
  SqlValue,
} from '../../src/database/types';

/**
 * Driver SQLite nyata berbasis `node:sqlite` khusus lingkungan automated test (Vitest).
 * Menjalankan engine C SQLite asli untuk menguji DDL v1, CHECK, FK, UNIQUE, dan transaksi,
 * terpisah dari pengujian plugin Android `@capacitor-community/sqlite` di HP fisik.
 */
export class NodeSqliteTestDriver implements SqlDriver {
  readonly driverName = 'node-sqlite-test';
  readonly isNativeStorage = false;

  private readonly storagePath: string;
  private db: DatabaseSync | null = null;
  private queueTail: Promise<void> = Promise.resolve();

  constructor(storagePath = ':memory:') {
    this.storagePath = storagePath;
  }

  private runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queueTail.then(task, task);
    this.queueTail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async open(
    _databaseName: string,
    targetVersion: number,
    migrations: readonly SchemaMigration[],
  ): Promise<void> {
    if (!this.db) {
      this.db = new DatabaseSync(this.storagePath, {
        enableForeignKeyConstraints: true,
      });
    }

    this.db.exec('PRAGMA foreign_keys = ON;');
    const versionRow = this.db
      .prepare('PRAGMA user_version;')
      .get() as { user_version?: number } | undefined;
    const currentVersion = Number(versionRow?.user_version ?? 0);

    if (targetVersion > currentVersion) {
      const sorted = [...migrations].sort((a, b) => a.toVersion - b.toVersion);
      for (const migration of sorted) {
        if (
          migration.toVersion > currentVersion &&
          migration.toVersion <= targetVersion
        ) {
          this.db.exec('BEGIN;');
          try {
            for (const stmt of migration.statements) {
              this.db.exec(stmt);
            }
            this.db.exec(`PRAGMA user_version = ${String(migration.toVersion)};`);
            this.db.exec('COMMIT;');
          } catch (error) {
            this.db.exec('ROLLBACK;');
            throw error;
          }
        }
      }
    }
  }

  async close(): Promise<void> {
    await this.runExclusive(async () => {
      if (this.db) {
        this.db.close();
        this.db = null;
      }
    });
  }

  async isOpen(): Promise<boolean> {
    return this.db !== null;
  }

  async getSchemaVersion(): Promise<number> {
    const db = this.requireDb();
    const row = db.prepare('PRAGMA user_version;').get() as
      | { user_version?: number }
      | undefined;
    return Number(row?.user_version ?? 0);
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    statement: string,
    values: readonly SqlValue[] = [],
  ): Promise<readonly T[]> {
    return this.runExclusive(async () => this.querySync<T>(statement, values));
  }

  async run(
    statement: string,
    values: readonly SqlValue[] = [],
  ): Promise<RunResult> {
    return this.runExclusive(async () => this.runSync(statement, values));
  }

  async withTransaction<T>(
    work: (tx: SqlExecutor) => Promise<T>,
  ): Promise<T> {
    return this.runExclusive(async () => {
      const db = this.requireDb();
      db.exec('BEGIN;');

      const txExecutor: SqlExecutor = {
        query: async <R extends Record<string, unknown> = Record<string, unknown>>(
          statement: string,
          values: readonly SqlValue[] = [],
        ): Promise<readonly R[]> => this.querySync<R>(statement, values),
        run: async (
          statement: string,
          values: readonly SqlValue[] = [],
        ): Promise<RunResult> => this.runSync(statement, values),
      };

      try {
        const result = await work(txExecutor);
        db.exec('COMMIT;');
        return result;
      } catch (error) {
        try {
          db.exec('ROLLBACK;');
        } catch {
          // Abaikan error sekunder saat rollback
        }
        throw classifySqlError(
          error,
          'Transaksi SQLite pengujian dibatalkan (rollback).',
          'DB_TRANSACTION_FAILED',
        );
      }
    });
  }

  private querySync<T extends Record<string, unknown>>(
    statement: string,
    values: readonly SqlValue[],
  ): readonly T[] {
    const db = this.requireDb();
    try {
      const stmt = db.prepare(statement);
      const rows = stmt.all(...(values as SQLInputValue[])) as Record<
        string,
        unknown
      >[];
      return rows.map((row) => ({ ...row }) as T);
    } catch (error) {
      throw classifySqlError(error, 'Gagal menjalankan query SQLite pengujian.');
    }
  }

  private runSync(
    statement: string,
    values: readonly SqlValue[],
  ): RunResult {
    const db = this.requireDb();
    try {
      const stmt = db.prepare(statement);
      const res = stmt.run(...(values as SQLInputValue[]));
      return {
        changes: Number(res.changes),
        lastId: Number(res.lastInsertRowid),
      };
    } catch (error) {
      throw classifySqlError(error, 'Gagal menjalankan run SQLite pengujian.');
    }
  }

  private requireDb(): DatabaseSync {
    if (!this.db) {
      throw new Error('NodeSqliteTestDriver belum dibuka.');
    }
    return this.db;
  }
}

