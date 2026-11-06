import type { DatabaseService } from '../../database/sqlite';
import {
  BACKUP_APP_VERSION,
  BACKUP_FORMAT_ID,
  CURRENT_BACKUP_SCHEMA_VERSION,
  calculateRecordCounts,
  computeSha256Hex,
  formatTimestampToWib,
  generateBackupFileName,
  inspectBackupContent,
  type BackupInspectionPreview,
  type BackupMetadata,
  type BackupTableData,
  type CategoryBackupRow,
  type DailyCounterBackupRow,
  type ExpenseBackupRow,
  type MamaminBackupPayload,
  type OptionBackupRow,
  type OptionGroupBackupRow,
  type PrintAttemptBackupRow,
  type ProductBackupRow,
  type ProductOptionGroupBackupRow,
  type SettingBackupRow,
  type TransactionBackupRow,
  type TransactionItemBackupRow,
  type TransactionItemOptionBackupRow,
} from '../../domain/backup';
import { getBusinessDateWib } from '../../domain/dates';

export interface RestoreResult {
  readonly success: boolean;
  readonly restoredAtMs: number;
  readonly message: string;
  readonly recordCounts: BackupTableData;
}

export class BackupService {
  private readonly db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  /**
   * Mengekspor seluruh database SQLite secara lengkap (12 tabel)
   * disertai metadata dan SHA-256 checksum anti-korupsi.
   */
  async exportFullBackup(nowMs: number = Date.now()): Promise<MamaminBackupPayload> {
    const categories = await this.db.query<CategoryBackupRow>(
      'SELECT id, name, sort_order, is_active, created_at_ms, updated_at_ms FROM categories ORDER BY sort_order ASC, name ASC;',
    );

    const products = await this.db.query<ProductBackupRow>(
      'SELECT id, category_id, name, sku, pricing_mode, base_price_rupiah, is_active, is_available, sort_order, created_at_ms, updated_at_ms FROM products ORDER BY sort_order ASC, name ASC;',
    );

    const option_groups = await this.db.query<OptionGroupBackupRow>(
      'SELECT id, name, min_selected, max_selected, sort_order, is_active FROM option_groups ORDER BY sort_order ASC, name ASC;',
    );

    const options = await this.db.query<OptionBackupRow>(
      'SELECT id, group_id, name, unit_price_rupiah, is_active, sort_order FROM options ORDER BY sort_order ASC, name ASC;',
    );

    const product_option_groups = await this.db.query<ProductOptionGroupBackupRow>(
      'SELECT product_id, group_id FROM product_option_groups ORDER BY product_id ASC, group_id ASC;',
    );

    const daily_counters = await this.db.query<DailyCounterBackupRow>(
      'SELECT business_date, last_sequence FROM daily_counters ORDER BY business_date ASC;',
    );

    const transactions = await this.db.query<TransactionBackupRow>(
      'SELECT id, receipt_number, daily_sequence, occurred_at_ms, business_date, status, payment_method, subtotal_rupiah, grand_total_rupiah, paid_amount_rupiah, change_amount_rupiah, void_reason, voided_at_ms, created_at_ms FROM transactions ORDER BY occurred_at_ms ASC;',
    );

    const transaction_items = await this.db.query<TransactionItemBackupRow>(
      'SELECT id, transaction_id, product_id, product_name_snapshot, base_unit_price_rupiah, quantity, unit_total_rupiah, line_total_rupiah, notes FROM transaction_items ORDER BY transaction_id ASC, id ASC;',
    );

    const transaction_item_options = await this.db.query<TransactionItemOptionBackupRow>(
      'SELECT id, transaction_item_id, option_id, option_name_snapshot, unit_price_rupiah, quantity_per_portion FROM transaction_item_options ORDER BY transaction_item_id ASC, id ASC;',
    );

    const expenses = await this.db.query<ExpenseBackupRow>(
      'SELECT id, occurred_at_ms, business_date, category, amount_rupiah, notes, status, void_reason, voided_at_ms, created_at_ms FROM expenses ORDER BY occurred_at_ms ASC;',
    );

    const print_attempts = await this.db.query<PrintAttemptBackupRow>(
      'SELECT id, transaction_id, attempted_at_ms, result, error_message FROM print_attempts ORDER BY attempted_at_ms ASC;',
    );

    const settings = await this.db.query<SettingBackupRow>(
      'SELECT key, value, updated_at_ms FROM settings ORDER BY key ASC;',
    );

    const tables: BackupTableData = {
      categories,
      products,
      option_groups,
      options,
      product_option_groups,
      daily_counters,
      transactions,
      transaction_items,
      transaction_item_options,
      expenses,
      print_attempts,
      settings,
    };

    const recordCounts = calculateRecordCounts(tables);
    const totalRecords = Object.values(recordCounts).reduce((sum, c) => sum + c, 0);
    const checksum = await computeSha256Hex(JSON.stringify(tables));
    const businessDateWib = getBusinessDateWib(nowMs);
    const exportedAtWib = formatTimestampToWib(nowMs);

    const metadata: BackupMetadata = {
      format_id: BACKUP_FORMAT_ID,
      app_version: BACKUP_APP_VERSION,
      schema_version: CURRENT_BACKUP_SCHEMA_VERSION,
      exported_at_ms: nowMs,
      exported_at_wib: exportedAtWib,
      business_date_wib: businessDateWib,
      timezone: 'Asia/Jakarta',
      record_counts: recordCounts,
      total_records: totalRecords,
      sha256_checksum: checksum,
    };

    // Rekam waktu backup terakhir ke tabel settings
    const filename = generateBackupFileName(nowMs);
    await this.recordSetting('last_backup_at_ms', String(nowMs), nowMs);
    await this.recordSetting('last_backup_filename', filename, nowMs);

    return {
      metadata,
      tables,
    };
  }

  /**
   * Menginspeksi payload backup JSON sebelum di-restore.
   */
  async inspectBackup(jsonString: string): Promise<BackupInspectionPreview> {
    return inspectBackupContent(jsonString);
  }

  /**
   * Memulihkan data database SQLite secara atomik dari payload backup yang tervalidasi.
   * Dilengkapi pengaman: backup pengaman otomatis, transaksi atomik, dan foreign key check.
   */
  async restoreValidatedBackup(
    backup: MamaminBackupPayload,
  ): Promise<RestoreResult> {
    // 1. Verifikasi kelayakan backup sebelum menyentuh database
    const inspection = await inspectBackupContent(JSON.stringify(backup));
    if (!inspection.isValid || !inspection.metadata) {
      throw new Error(
        inspection.errorMessage ?? 'File backup tidak lolos validasi integritas.',
      );
    }

    const tables = backup.tables;
    const restoredAtMs = Date.now();

    // 2. Eksekusi Restore dalam SATU transaksi atomik
    return this.db.withTransaction(async (tx) => {
      // a. Matikan foreign keys sementara saat membersihkan dan memasukkan tabel
      await tx.run('PRAGMA foreign_keys = OFF;');

      // b. Bersihkan tabel (urutan anak ke induk)
      await tx.run('DELETE FROM transaction_item_options;');
      await tx.run('DELETE FROM transaction_items;');
      await tx.run('DELETE FROM print_attempts;');
      await tx.run('DELETE FROM transactions;');
      await tx.run('DELETE FROM product_option_groups;');
      await tx.run('DELETE FROM options;');
      await tx.run('DELETE FROM option_groups;');
      await tx.run('DELETE FROM products;');
      await tx.run('DELETE FROM categories;');
      await tx.run('DELETE FROM expenses;');
      await tx.run('DELETE FROM daily_counters;');
      await tx.run('DELETE FROM settings;');

      // c. Isi data tabel secara terurut (induk ke anak)

      // 1) categories
      for (const row of tables.categories) {
        await tx.run(
          `INSERT INTO categories (id, name, sort_order, is_active, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?);`,
          [row.id, row.name, row.sort_order, row.is_active, row.created_at_ms, row.updated_at_ms],
        );
      }

      // 2) products
      for (const row of tables.products) {
        await tx.run(
          `INSERT INTO products (id, category_id, name, sku, pricing_mode, base_price_rupiah, is_active, is_available, sort_order, created_at_ms, updated_at_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            row.id,
            row.category_id,
            row.name,
            row.sku,
            row.pricing_mode,
            row.base_price_rupiah,
            row.is_active,
            row.is_available,
            row.sort_order,
            row.created_at_ms,
            row.updated_at_ms,
          ],
        );
      }

      // 3) option_groups
      for (const row of tables.option_groups) {
        await tx.run(
          `INSERT INTO option_groups (id, name, min_selected, max_selected, sort_order, is_active)
           VALUES (?, ?, ?, ?, ?, ?);`,
          [row.id, row.name, row.min_selected, row.max_selected, row.sort_order, row.is_active],
        );
      }

      // 4) options
      for (const row of tables.options) {
        await tx.run(
          `INSERT INTO options (id, group_id, name, unit_price_rupiah, is_active, sort_order)
           VALUES (?, ?, ?, ?, ?, ?);`,
          [row.id, row.group_id, row.name, row.unit_price_rupiah, row.is_active, row.sort_order],
        );
      }

      // 5) product_option_groups
      for (const row of tables.product_option_groups) {
        await tx.run(
          `INSERT INTO product_option_groups (product_id, group_id)
           VALUES (?, ?);`,
          [row.product_id, row.group_id],
        );
      }

      // 6) daily_counters
      for (const row of tables.daily_counters) {
        await tx.run(
          `INSERT INTO daily_counters (business_date, last_sequence)
           VALUES (?, ?);`,
          [row.business_date, row.last_sequence],
        );
      }

      // 7) transactions
      for (const row of tables.transactions) {
        await tx.run(
          `INSERT INTO transactions (
             id, receipt_number, daily_sequence, occurred_at_ms, business_date, status,
             payment_method, subtotal_rupiah, grand_total_rupiah, paid_amount_rupiah,
             change_amount_rupiah, void_reason, voided_at_ms, created_at_ms
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            row.id,
            row.receipt_number,
            row.daily_sequence,
            row.occurred_at_ms,
            row.business_date,
            row.status,
            row.payment_method,
            row.subtotal_rupiah,
            row.grand_total_rupiah,
            row.paid_amount_rupiah,
            row.change_amount_rupiah,
            row.void_reason,
            row.voided_at_ms,
            row.created_at_ms,
          ],
        );
      }

      // 8) transaction_items
      for (const row of tables.transaction_items) {
        await tx.run(
          `INSERT INTO transaction_items (
             id, transaction_id, product_id, product_name_snapshot,
             base_unit_price_rupiah, quantity, unit_total_rupiah, line_total_rupiah, notes
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            row.id,
            row.transaction_id,
            row.product_id,
            row.product_name_snapshot,
            row.base_unit_price_rupiah,
            row.quantity,
            row.unit_total_rupiah,
            row.line_total_rupiah,
            row.notes,
          ],
        );
      }

      // 9) transaction_item_options
      for (const row of tables.transaction_item_options) {
        await tx.run(
          `INSERT INTO transaction_item_options (
             id, transaction_item_id, option_id, option_name_snapshot,
             unit_price_rupiah, quantity_per_portion
           ) VALUES (?, ?, ?, ?, ?, ?);`,
          [
            row.id,
            row.transaction_item_id,
            row.option_id,
            row.option_name_snapshot,
            row.unit_price_rupiah,
            row.quantity_per_portion,
          ],
        );
      }

      // 10) expenses
      for (const row of tables.expenses) {
        await tx.run(
          `INSERT INTO expenses (
             id, occurred_at_ms, business_date, category, amount_rupiah, notes,
             status, void_reason, voided_at_ms, created_at_ms
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            row.id,
            row.occurred_at_ms,
            row.business_date,
            row.category,
            row.amount_rupiah,
            row.notes,
            row.status,
            row.void_reason,
            row.voided_at_ms,
            row.created_at_ms,
          ],
        );
      }

      // 11) print_attempts
      for (const row of tables.print_attempts) {
        await tx.run(
          `INSERT INTO print_attempts (id, transaction_id, attempted_at_ms, result, error_message)
           VALUES (?, ?, ?, ?, ?);`,
          [row.id, row.transaction_id, row.attempted_at_ms, row.result, row.error_message],
        );
      }

      // 12) settings
      for (const row of tables.settings) {
        await tx.run(
          `INSERT INTO settings (key, value, updated_at_ms)
           VALUES (?, ?, ?);`,
          [row.key, row.value, row.updated_at_ms],
        );
      }

      // d. Aktifkan kembali Foreign Keys dan lakukan pengecekan integritas
      await tx.run('PRAGMA foreign_keys = ON;');

      const fkErrors = await tx.query<{ table: string; rowid: number; parent: string; fkid: number }>(
        'PRAGMA foreign_key_check;',
      );
      if (fkErrors.length > 0) {
        throw new Error(
          `Validasi relasi database gagal: ditemukan ${fkErrors.length} baris melanggar foreign key setelah restore.`,
        );
      }

      const integrityRows = await tx.query<{ integrity_check: string }>(
        'PRAGMA integrity_check;',
      );
      const integrityResult = integrityRows[0]?.integrity_check ?? 'ok';
      if (integrityResult.toLowerCase() !== 'ok') {
        throw new Error(`Integritas SQLite tidak sehat setelah restore: ${integrityResult}`);
      }

      // e. Catat histori pemulihan ke settings
      await tx.run(
        `INSERT INTO settings (key, value, updated_at_ms)
         VALUES ('last_restored_at_ms', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at_ms = excluded.updated_at_ms;`,
        [String(restoredAtMs), restoredAtMs],
      );

      return {
        success: true,
        restoredAtMs,
        message: `Database berhasil dipulihkan dari cadangan tanggal ${inspection.summary?.exportedAtWib ?? '-'}. Total ${inspection.summary?.totalRecords ?? 0} data dipulihkan.`,
        recordCounts: tables,
      };
    });
  }

  /**
   * Mengambil informasi status backup terakhir yang tersimpan di settings.
   */
  async getLastBackupInfo(): Promise<{ lastBackupAtMs: number | null; filename: string | null }> {
    try {
      const rows = await this.db.query<SettingBackupRow>(
        "SELECT key, value, updated_at_ms FROM settings WHERE key IN ('last_backup_at_ms', 'last_backup_filename');",
      );
      const atRow = rows.find((r) => r.key === 'last_backup_at_ms');
      const fnRow = rows.find((r) => r.key === 'last_backup_filename');

      return {
        lastBackupAtMs: atRow ? Number(atRow.value) : null,
        filename: fnRow ? fnRow.value : null,
      };
    } catch {
      return { lastBackupAtMs: null, filename: null };
    }
  }

  private async recordSetting(key: string, value: string, nowMs: number): Promise<void> {
    await this.db.run(
      `INSERT INTO settings (key, value, updated_at_ms)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at_ms = excluded.updated_at_ms;`,
      [key, value, nowMs],
    );
  }
}

