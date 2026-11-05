import type { SavedTransaction } from '../../domain/types';
import {
  EXPECTED_V1_INDEXES,
  EXPECTED_V1_TABLES,
  LATEST_SCHEMA_VERSION,
} from '../migrations/v1';
import type { DatabaseService } from '../sqlite';
import { DatabaseError } from '../types';
import { SettingsRepository } from './settingsRepository';
import { TransactionRepository } from './transactionRepository';

export const PERSISTENCE_PROBE_TX_ID = 'diag_p1_persist_tx' as const;
const BOOT_COUNT_SETTING_KEY = 'diag.p1.boot_count' as const;
const PROBE_CREATED_BOOT_KEY = 'diag.p1.probe_created_boot' as const;

export interface DiagnosticCheckItem {
  readonly id: string;
  readonly title: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface DiagnosticSuiteReport {
  readonly executedAtMs: number;
  readonly allPassed: boolean;
  readonly checks: readonly DiagnosticCheckItem[];
}

export interface PersistenceProbeState {
  readonly bootCount: number;
  readonly probeCreatedBoot: number | null;
  readonly survivedRestart: boolean;
  readonly persistedTransaction: SavedTransaction | null;
}

export class DiagnosticRepository {
  private readonly db: DatabaseService;
  private readonly settingsRepo: SettingsRepository;
  private readonly txRepo: TransactionRepository;

  constructor(db: DatabaseService) {
    this.db = db;
    this.settingsRepo = new SettingsRepository(db);
    this.txRepo = new TransactionRepository(db);
  }

  /**
   * Mencatat sesi cold-start pada tabel `settings` tanpa mereset data existing.
   */
  async recordBootSession(nowMs: number = Date.now()): Promise<number> {
    const current = await this.settingsRepo.getSetting(BOOT_COUNT_SETTING_KEY);
    const previousCount = current ? Number.parseInt(current.value, 10) || 0 : 0;
    const nextCount = previousCount + 1;
    await this.settingsRepo.setSetting(
      BOOT_COUNT_SETTING_KEY,
      String(nextCount),
      nowMs,
    );
    return nextCount;
  }

  async getPersistenceProbeState(): Promise<PersistenceProbeState> {
    const bootRow = await this.settingsRepo.getSetting(BOOT_COUNT_SETTING_KEY);
    const createdBootRow = await this.settingsRepo.getSetting(
      PROBE_CREATED_BOOT_KEY,
    );
    const persistedTransaction = await this.txRepo.getById(
      PERSISTENCE_PROBE_TX_ID,
    );

    const bootCount = bootRow ? Number.parseInt(bootRow.value, 10) || 0 : 0;
    const probeCreatedBoot = createdBootRow
      ? Number.parseInt(createdBootRow.value, 10) || null
      : null;

    const survivedRestart =
      persistedTransaction !== null &&
      probeCreatedBoot !== null &&
      bootCount > probeCreatedBoot;

    return {
      bootCount,
      probeCreatedBoot,
      survivedRestart,
      persistedTransaction,
    };
  }

  /**
   * Menyimpan (atau memuat ulang bila sudah ada) 1 transaksi uji berlabel `[UJI P1]`
   * di SQLite untuk menguji persistensi lintas restart/force-stop dan preview struk 58 mm.
   */
  async ensurePersistenceSampleSale(
    nowMs: number = Date.now(),
  ): Promise<PersistenceProbeState> {
    const existingTx = await this.txRepo.getById(PERSISTENCE_PROBE_TX_ID);
    if (existingTx) {
      return this.getPersistenceProbeState();
    }

    await this.seedIsolatedDiagnosticCatalog(nowMs);

    await this.txRepo.createPaidSale({
      id: PERSISTENCE_PROBE_TX_ID,
      occurredAtMs: nowMs,
      createdAtMs: nowMs,
      paymentMethod: 'CASH',
      paidAmountRupiah: 25_000,
      namespace: 'DIAGNOSTIC_P1',
      items: [
        {
          id: 'diag_p1_persist_item_1',
          productId: 'diag_p1_prod_noodle',
          productNameSnapshot: '[UJI P1] Menu Contoh Utama',
          baseUnitPriceRupiah: 12_000,
          quantity: 1,
          notes: 'Data uji P1 (bukan transaksi produksi)',
          options: [
            {
              id: 'diag_p1_persist_opt_1',
              optionId: 'diag_p1_opt_extra',
              optionNameSnapshot: '[UJI P1] Tambahan Contoh',
              unitPriceRupiah: 3_000,
              quantityPerPortion: 1,
            },
          ],
        },
        {
          id: 'diag_p1_persist_item_2',
          productId: 'diag_p1_prod_drink',
          productNameSnapshot: '[UJI P1] Minuman Contoh',
          baseUnitPriceRupiah: 4_000,
          quantity: 2,
        },
      ],
    });

    const bootRow = await this.settingsRepo.getSetting(BOOT_COUNT_SETTING_KEY);
    const currentBoot = bootRow ? Number.parseInt(bootRow.value, 10) || 1 : 1;
    await this.settingsRepo.setSetting(
      PROBE_CREATED_BOOT_KEY,
      String(currentBoot),
      nowMs,
    );

    return this.getPersistenceProbeState();
  }

  private async seedIsolatedDiagnosticCatalog(nowMs: number): Promise<void> {
    await this.db.withTransaction(async (tx) => {
      await tx.run(
        `INSERT INTO categories (id, name, sort_order, is_active, created_at_ms, updated_at_ms)
         VALUES ('diag_p1_cat', '[DIAGNOSTIK P1] Kategori Uji Nonaktif', 999, 0, ?, ?)
         ON CONFLICT(id) DO NOTHING;`,
        [nowMs, nowMs],
      );

      await tx.run(
        `INSERT INTO products (
          id, category_id, name, sku, pricing_mode, base_price_rupiah,
          is_active, is_available, sort_order, created_at_ms, updated_at_ms
        ) VALUES (
          'diag_p1_prod_noodle', 'diag_p1_cat', '[UJI P1] Menu Contoh Utama',
          'DIAG-P1-001', 'BASE_PLUS_OPTIONS', 12000, 0, 0, 999, ?, ?
        ) ON CONFLICT(id) DO NOTHING;`,
        [nowMs, nowMs],
      );

      await tx.run(
        `INSERT INTO products (
          id, category_id, name, sku, pricing_mode, base_price_rupiah,
          is_active, is_available, sort_order, created_at_ms, updated_at_ms
        ) VALUES (
          'diag_p1_prod_drink', 'diag_p1_cat', '[UJI P1] Minuman Contoh',
          'DIAG-P1-002', 'FIXED', 4000, 0, 0, 1000, ?, ?
        ) ON CONFLICT(id) DO NOTHING;`,
        [nowMs, nowMs],
      );

      await tx.run(
        `INSERT INTO option_groups (id, name, min_selected, max_selected, sort_order, is_active)
         VALUES ('diag_p1_grp', '[UJI P1] Grup Opsi Contoh', 0, 3, 999, 0)
         ON CONFLICT(id) DO NOTHING;`,
        [],
      );

      await tx.run(
        `INSERT INTO options (id, group_id, name, unit_price_rupiah, is_active, sort_order)
         VALUES ('diag_p1_opt_extra', 'diag_p1_grp', '[UJI P1] Tambahan Contoh', 3000, 0, 999)
         ON CONFLICT(id) DO NOTHING;`,
        [],
      );

      await tx.run(
        `INSERT INTO product_option_groups (product_id, group_id)
         VALUES ('diag_p1_prod_noodle', 'diag_p1_grp')
         ON CONFLICT(product_id, group_id) DO NOTHING;`,
        [],
      );
    });
  }

  /**
   * Menjalankan rangkaian uji diagnostik SQLite v1 (koneksi, skema, CRUD, snapshot,
   * constraint/FK, rollback atomik, dan re-inisialisasi aman).
   */
  async runDiagnosticSuite(
    nowMs: number = Date.now(),
  ): Promise<DiagnosticSuiteReport> {
    const checks: DiagnosticCheckItem[] = [];
    const crudTxId = `diag_p1_crud_tx_${String(nowMs)}`;
    const crudSettingKey = `diag.p1.temp.${String(nowMs)}`;

    // 1 & 2: Koneksi Native, Foreign Keys, Versi Skema, Tabel & Indeks v1
    const health = await this.db.verifyHealth();
    checks.push({
      id: 'conn_fk',
      title: '1. Koneksi SQLite & Foreign Key Enforcement',
      passed: health.isReady && health.foreignKeysEnabled,
      detail: health.isReady
        ? `Driver ${health.driverName}, PRAGMA foreign_keys=${health.foreignKeysEnabled ? 'ON (1)' : 'OFF'}`
        : (health.errorMessage ?? 'Koneksi belum siap'),
    });

    const missingTables = EXPECTED_V1_TABLES.filter(
      (t) => !health.tables.includes(t),
    );
    const missingIndexes = EXPECTED_V1_INDEXES.filter(
      (idx) => !health.indexes.includes(idx),
    );
    checks.push({
      id: 'schema_v1',
      title: '2. Migrasi Skema v1 (12 Tabel & 7 Indeks)',
      passed:
        health.schemaVersion === LATEST_SCHEMA_VERSION &&
        missingTables.length === 0 &&
        missingIndexes.length === 0,
      detail:
        missingTables.length === 0 && missingIndexes.length === 0
          ? `schemaVersion=${String(health.schemaVersion)}, ${String(health.tables.length)} tabel, ${String(health.indexes.length)} indeks tervalidasi`
          : `Tabel kurang: [${missingTables.join(', ')}], Indeks kurang: [${missingIndexes.join(', ')}]`,
    });

    if (!health.isReady) {
      return {
        executedAtMs: nowMs,
        allPassed: false,
        checks,
      };
    }

    // 3: CREATE (Simpan data percobaan terisolasi)
    let createdTx: SavedTransaction | null = null;
    try {
      await this.seedIsolatedDiagnosticCatalog(nowMs);
      await this.settingsRepo.setSetting(crudSettingKey, 'nilai-awal', nowMs);
      createdTx = await this.txRepo.createPaidSale({
        id: crudTxId,
        occurredAtMs: nowMs,
        createdAtMs: nowMs,
        paymentMethod: 'QRIS',
        qrisConfirmedManually: true,
        namespace: 'DIAGNOSTIC_P1',
        items: [
          {
            id: `${crudTxId}_item_1`,
            productId: 'diag_p1_prod_noodle',
            productNameSnapshot: '[UJI P1] Menu Contoh Utama',
            baseUnitPriceRupiah: 12_000,
            quantity: 1,
            options: [
              {
                id: `${crudTxId}_opt_1`,
                optionId: 'diag_p1_opt_extra',
                optionNameSnapshot: '[UJI P1] Tambahan Contoh',
                unitPriceRupiah: 3_000,
                quantityPerPortion: 1,
              },
            ],
          },
        ],
      });

      checks.push({
        id: 'crud_create',
        title: '3. Simpan Data Uji Atomik (CREATE)',
        passed: createdTx.grandTotalRupiah === 15_000,
        detail: `Tersimpan ${createdTx.receiptNumber} (QRIS manual, total Rp15.000, 1 item + 1 opsi)`,
      });
    } catch (error) {
      checks.push({
        id: 'crud_create',
        title: '3. Simpan Data Uji Atomik (CREATE)',
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    // 4: READ (Baca kembali snapshot header + item + opsi + setting)
    try {
      const readBackTx = await this.txRepo.getById(crudTxId);
      const readSetting = await this.settingsRepo.getSetting(crudSettingKey);
      const readOk =
        readBackTx !== null &&
        readBackTx.grandTotalRupiah === 15_000 &&
        readBackTx.items.length === 1 &&
        readBackTx.items[0]?.options.length === 1 &&
        readSetting?.value === 'nilai-awal';

      checks.push({
        id: 'crud_read',
        title: '4. Baca Kembali Data & Relasi (READ)',
        passed: readOk,
        detail: readOk
          ? `Header, item, opsi snapshot, dan settings terbaca akurat (${readBackTx.receiptNumber})`
          : 'Data yang dibaca tidak cocok dengan yang disimpan',
      });
    } catch (error) {
      checks.push({
        id: 'crud_read',
        title: '4. Baca Kembali Data & Relasi (READ)',
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    // 5: UPDATE (Perbarui master produk + VOID transaksi uji, pastikan snapshot harga tetap utuh)
    try {
      await this.db.run(
        `UPDATE products
         SET base_price_rupiah = ?, updated_at_ms = ?
         WHERE id = 'diag_p1_prod_noodle';`,
        [14_000, nowMs + 1],
      );
      await this.settingsRepo.setSetting(
        crudSettingKey,
        'nilai-diperbarui',
        nowMs + 1,
      );
      const voidedTx = await this.txRepo.voidTransaction(
        crudTxId,
        'Uji diagnostik pembatalan P1',
        nowMs + 2,
      );

      // Kembalikan harga master produk uji ke 12.000
      await this.db.run(
        `UPDATE products
         SET base_price_rupiah = ?, updated_at_ms = ?
         WHERE id = 'diag_p1_prod_noodle';`,
        [12_000, nowMs + 3],
      );

      const updatedSetting = await this.settingsRepo.getSetting(crudSettingKey);
      const snapshotUntouched =
        voidedTx.items[0]?.baseUnitPriceRupiah === 12_000 &&
        voidedTx.grandTotalRupiah === 15_000;
      const updateOk =
        voidedTx.status === 'VOID' &&
        voidedTx.voidReason === 'Uji diagnostik pembatalan P1' &&
        updatedSetting?.value === 'nilai-diperbarui' &&
        snapshotUntouched;

      checks.push({
        id: 'crud_update',
        title: '5. Perbarui Data & Imutabilitas Snapshot (UPDATE)',
        passed: updateOk,
        detail: updateOk
          ? 'Status PAID->VOID & settings diperbarui; snapshot harga lama tetap Rp12.000 saat master diubah'
          : 'Validasi update atau imutabilitas snapshot gagal',
      });
    } catch (error) {
      checks.push({
        id: 'crud_update',
        title: '5. Perbarui Data & Imutabilitas Snapshot (UPDATE)',
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    // 6: DELETE (Hapus record sementara uji CRUD tanpa menyentuh transaksi produksi)
    try {
      await this.db.withTransaction(async (tx) => {
        await tx.run(
          'DELETE FROM transaction_item_options WHERE transaction_item_id = ?;',
          [`${crudTxId}_item_1`],
        );
        await tx.run(
          'DELETE FROM transaction_items WHERE transaction_id = ?;',
          [crudTxId],
        );
        await tx.run('DELETE FROM transactions WHERE id = ?;', [crudTxId]);
      });
      const deletedSettingChanges =
        await this.settingsRepo.deleteSetting(crudSettingKey);
      const verifyGoneTx = await this.txRepo.getById(crudTxId);
      const verifyGoneSetting =
        await this.settingsRepo.getSetting(crudSettingKey);

      const deleteOk =
        deletedSettingChanges === 1 &&
        verifyGoneTx === null &&
        verifyGoneSetting === null;

      checks.push({
        id: 'crud_delete',
        title: '6. Hapus Data Uji Sementara (DELETE)',
        passed: deleteOk,
        detail: deleteOk
          ? 'Record sementara CRUD berhasil dihapus bersih dan terverifikasi NULL'
          : 'Penghapusan data uji sementara belum bersih',
      });
    } catch (error) {
      checks.push({
        id: 'crud_delete',
        title: '6. Hapus Data Uji Sementara (DELETE)',
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    // 7: Constraint CHECK, Foreign Key, & Rollback Transaksi Atomik
    try {
      const fkRejected = await this.expectConstraintFailure(() =>
        this.db.run(
          `INSERT INTO products (
            id, category_id, name, pricing_mode, base_price_rupiah,
            is_active, is_available, sort_order, created_at_ms, updated_at_ms
          ) VALUES (?, 'kategori_tidak_ada', 'Produk Invalid FK', 'FIXED', 5000, 0, 0, 1, ?, ?);`,
          [`diag_fk_fail_${String(nowMs)}`, nowMs, nowMs],
        ),
      );

      const negativeMoneyRejected = await this.expectConstraintFailure(() =>
        this.db.run(
          `INSERT INTO products (
            id, category_id, name, pricing_mode, base_price_rupiah,
            is_active, is_available, sort_order, created_at_ms, updated_at_ms
          ) VALUES (?, 'diag_p1_cat', 'Harga Negatif', 'FIXED', -1000, 0, 0, 1, ?, ?);`,
          [`diag_chk_fail_${String(nowMs)}`, nowMs, nowMs],
        ),
      );

      const rollbackMarkerKey = `diag.p1.rollback.${String(nowMs)}`;
      const txRolledBack = await this.expectConstraintFailure(() =>
        this.db.withTransaction(async (tx) => {
          await tx.run(
            'INSERT INTO settings (key, value, updated_at_ms) VALUES (?, ?, ?);',
            [rollbackMarkerKey, 'harus-ikut-batal', nowMs],
          );
          // Sengaja langgar CHECK (amount_rupiah > 0) pada expenses
          await tx.run(
            `INSERT INTO expenses (
              id, occurred_at_ms, business_date, category, amount_rupiah,
              notes, status, created_at_ms
            ) VALUES (?, ?, 'DIAG-2026-11-06', 'Uji', 0, 'Invalid 0', 'ACTIVE', ?);`,
            [`diag_exp_fail_${String(nowMs)}`, nowMs, nowMs],
          );
        }),
      );
      const markerAfterRollback =
        await this.settingsRepo.getSetting(rollbackMarkerKey);

      const constraintsOk =
        fkRejected &&
        negativeMoneyRejected &&
        txRolledBack &&
        markerAfterRollback === null;

      checks.push({
        id: 'constraints_and_rollback',
        title: '7. Penegakan Foreign Key, CHECK, & Rollback Atomik',
        passed: constraintsOk,
        detail: constraintsOk
          ? 'FK invalid ditolak, harga negatif ditolak, dan kegagalan query ke-2 membatalkan (rollback) query ke-1'
          : 'Salah satu validasi FK/CHECK/rollback tidak bekerja sesuai ekspektasi',
      });
    } catch (error) {
      checks.push({
        id: 'constraints_and_rollback',
        title: '7. Penegakan Foreign Key, CHECK, & Rollback Atomik',
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    // 8: Re-inisialisasi tidak mereset database
    try {
      const countBeforeRows = await this.db.query<{ total: number }>(
        'SELECT COUNT(*) AS total FROM settings;',
      );
      const beforeTotal = Number(countBeforeRows[0]?.total ?? 0);

      const reinitHealth = await this.db.initialize();

      const countAfterRows = await this.db.query<{ total: number }>(
        'SELECT COUNT(*) AS total FROM settings;',
      );
      const afterTotal = Number(countAfterRows[0]?.total ?? 0);

      const reinitSafe =
        reinitHealth.isReady &&
        reinitHealth.schemaVersion === LATEST_SCHEMA_VERSION &&
        beforeTotal === afterTotal;

      checks.push({
        id: 'reinit_idempotent',
        title: '8. Inisialisasi Ulang Tidak Mereset Database',
        passed: reinitSafe,
        detail: reinitSafe
          ? `initialize() ulang aman: schemaVersion=${String(reinitHealth.schemaVersion)}, jumlah baris settings tetap (${String(afterTotal)})`
          : 'Jumlah data berubah setelah initialize() ulang',
      });
    } catch (error) {
      checks.push({
        id: 'reinit_idempotent',
        title: '8. Inisialisasi Ulang Tidak Mereset Database',
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      executedAtMs: nowMs,
      allPassed: checks.every((item) => item.passed),
      checks,
    };
  }

  private async expectConstraintFailure(
    operation: () => Promise<unknown>,
  ): Promise<boolean> {
    try {
      await operation();
      return false;
    } catch (error) {
      if (error instanceof DatabaseError) {
        return (
          error.code === 'DB_CONSTRAINT_FAILED' ||
          error.code === 'DB_TRANSACTION_FAILED'
        );
      }
      return true;
    }
  }

  /**
   * Menghapus seluruh data uji berlabel `diag_p1_*` / `DIAG-%` / `diag.p1.%`
   * tanpa pernah menyentuh data non-diagnostik.
   */
  async clearDiagnosticData(): Promise<void> {
    await this.db.withTransaction(async (tx) => {
      await tx.run(
        `DELETE FROM print_attempts
         WHERE transaction_id LIKE 'diag_p1_%';`,
      );
      await tx.run(
        `DELETE FROM transaction_item_options
         WHERE transaction_item_id IN (
           SELECT id FROM transaction_items WHERE transaction_id LIKE 'diag_p1_%'
         );`,
      );
      await tx.run(
        `DELETE FROM transaction_items
         WHERE transaction_id LIKE 'diag_p1_%';`,
      );
      await tx.run(
        `DELETE FROM transactions
         WHERE id LIKE 'diag_p1_%';`,
      );
      await tx.run(
        `DELETE FROM daily_counters
         WHERE business_date LIKE 'DIAG-%';`,
      );
      await tx.run(
        `DELETE FROM product_option_groups
         WHERE product_id LIKE 'diag_p1_%' OR group_id LIKE 'diag_p1_%';`,
      );
      await tx.run(
        `DELETE FROM options
         WHERE id LIKE 'diag_p1_%';`,
      );
      await tx.run(
        `DELETE FROM option_groups
         WHERE id LIKE 'diag_p1_%';`,
      );
      await tx.run(
        `DELETE FROM products
         WHERE id LIKE 'diag_p1_%';`,
      );
      await tx.run(
        `DELETE FROM categories
         WHERE id LIKE 'diag_p1_%';`,
      );
      await tx.run(
        `DELETE FROM settings
         WHERE key LIKE 'diag.p1.%' AND key <> ?;`,
        [BOOT_COUNT_SETTING_KEY],
      );
    });
  }
}

