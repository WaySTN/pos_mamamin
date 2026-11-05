import type { StoreIdentitySettings } from '../../domain/types';
import type { SqlExecutor } from '../types';

export interface SettingRow {
  readonly key: string;
  readonly value: string;
  readonly updatedAtMs: number;
}

const DEFAULT_STORE_IDENTITY: StoreIdentitySettings = {
  storeName: 'MamaMin',
  storeAddress: null,
  footerNote: 'Terima kasih!',
};

export class SettingsRepository {
  private readonly db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.db = db;
  }

  async getSetting(key: string): Promise<SettingRow | null> {
    const rows = await this.db.query<{
      key: string;
      value: string;
      updated_at_ms: number;
    }>('SELECT key, value, updated_at_ms FROM settings WHERE key = ?;', [key]);

    const first = rows[0];
    if (!first) {
      return null;
    }

    return {
      key: first.key,
      value: first.value,
      updatedAtMs: Number(first.updated_at_ms),
    };
  }

  async setSetting(
    key: string,
    value: string,
    updatedAtMs: number = Date.now(),
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO settings (key, value, updated_at_ms)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at_ms = excluded.updated_at_ms;`,
      [key, value, updatedAtMs],
    );
  }

  async deleteSetting(key: string): Promise<number> {
    const res = await this.db.run('DELETE FROM settings WHERE key = ?;', [key]);
    return res.changes;
  }

  async getStoreIdentity(): Promise<StoreIdentitySettings> {
    const rows = await this.db.query<{ key: string; value: string }>(
      `SELECT key, value
       FROM settings
       WHERE key IN ('store.name', 'store.address', 'store.footer_note');`,
    );

    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.key, row.value);
    }

    const customName = map.get('store.name')?.trim();
    const customAddress = map.get('store.address')?.trim();
    const customFooter = map.get('store.footer_note')?.trim();

    return {
      storeName:
        customName && customName.length > 0
          ? customName
          : DEFAULT_STORE_IDENTITY.storeName,
      storeAddress:
        customAddress && customAddress.length > 0 ? customAddress : null,
      footerNote:
        customFooter && customFooter.length > 0
          ? customFooter
          : DEFAULT_STORE_IDENTITY.footerNote,
    };
  }
}

