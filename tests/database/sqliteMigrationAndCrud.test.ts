import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ALL_SCHEMA_MIGRATIONS,
  EXPECTED_V1_INDEXES,
  EXPECTED_V1_TABLES,
  LATEST_SCHEMA_VERSION,
} from '../../src/database/migrations/v1';
import { DiagnosticRepository } from '../../src/database/repositories/diagnosticRepository';
import { SettingsRepository } from '../../src/database/repositories/settingsRepository';
import { TransactionRepository } from '../../src/database/repositories/transactionRepository';
import {
  CapacitorSqliteDriver,
  DatabaseService,
} from '../../src/database/sqlite';
import { DatabaseError, type SchemaMigration } from '../../src/database/types';
import { NodeSqliteTestDriver } from '../helpers/nodeSqliteTestDriver';

describe('DatabaseService, Migration v1, Constraints, & Repositories', () => {
  let activeDb: DatabaseService | null = null;
  let tempDirToClean: string | null = null;

  afterEach(async () => {
    if (activeDb) {
      await activeDb.close();
      activeDb = null;
    }
    if (tempDirToClean) {
      rmSync(tempDirToClean, { recursive: true, force: true });
      tempDirToClean = null;
    }
  });

  function createIsolatedMemoryDb(): DatabaseService {
    const db = new DatabaseService(new NodeSqliteTestDriver(':memory:'), {
      isNativePlatformOverride: true,
    });
    activeDb = db;
    return db;
  }

  it('rejects non-native browser initialization on CapacitorSqliteDriver without using localStorage', async () => {
    const webDb = new DatabaseService(new CapacitorSqliteDriver(), {
      isNativePlatformOverride: false,
    });
    const health = await webDb.initialize();

    expect(health.isReady).toBe(false);
    expect(health.errorCode).toBe('DB_NOT_SUPPORTED_ON_WEB');
  });

  it('initializes v1 schema, enables foreign keys, and deduplicates concurrent initialize() calls', async () => {
    const db = createIsolatedMemoryDb();
    const [healthA, healthB] = await Promise.all([
      db.initialize(),
      db.initialize(),
    ]);

    expect(healthA.isReady).toBe(true);
    expect(healthB.isReady).toBe(true);
    expect(healthA.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(healthA.foreignKeysEnabled).toBe(true);
    expect(healthA.tables).toEqual([...EXPECTED_V1_TABLES].sort());
    expect(healthA.indexes).toEqual([...EXPECTED_V1_INDEXES].sort());
  });

  it('preserves existing data across close/reopen and supports forward v1->v2 migration without data loss (T30)', async () => {
    tempDirToClean = mkdtempSync(join(tmpdir(), 'mamamin-p1-test-'));
    const dbFilePath = join(tempDirToClean, 'test_persist.db');

    const firstSessionDb = new DatabaseService(
      new NodeSqliteTestDriver(dbFilePath),
      { isNativePlatformOverride: true },
    );
    await firstSessionDb.initialize();

    const txRepoSession1 = new TransactionRepository(firstSessionDb);
    const sampleTimestamp = Date.UTC(2026, 10, 5, 12, 0, 0); // 2026-11-05 19:00 WIB
    await txRepoSession1.createPaidSale({
      id: 'tx_persist_001',
      occurredAtMs: sampleTimestamp,
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
      items: [
        {
          id: 'item_001',
          productId: null,
          productNameSnapshot: 'Menu Uji Persistensi',
          baseUnitPriceRupiah: 16_000,
          quantity: 1,
        },
      ],
    });
    await firstSessionDb.close();

    // Sesi ke-2: buka ulang file yang sama + simulasi migrasi ke v2
    const simulatedV2Migration: SchemaMigration = {
      toVersion: 2,
      description: 'Simulasi kolom tambahan v2 tanpa merusak data v1',
      statements: [
        'ALTER TABLE expenses ADD COLUMN attachment_ref TEXT;',
      ],
    };

    const secondSessionDb = new DatabaseService(
      new NodeSqliteTestDriver(dbFilePath),
      {
        targetSchemaVersion: 2,
        migrations: [...ALL_SCHEMA_MIGRATIONS, simulatedV2Migration],
        isNativePlatformOverride: true,
      },
    );
    activeDb = secondSessionDb;

    const healthV2 = await secondSessionDb.initialize();
    expect(healthV2.isReady).toBe(true);
    expect(healthV2.schemaVersion).toBe(2);

    const txRepoSession2 = new TransactionRepository(secondSessionDb);
    const reloaded = await txRepoSession2.getById('tx_persist_001');
    expect(reloaded).not.toBeNull();
    expect(reloaded?.receiptNumber).toBe('MM-20261105-0001');
    expect(reloaded?.grandTotalRupiah).toBe(16_000);
    expect(reloaded?.changeAmountRupiah).toBe(4_000);
  });

  it('enforces atomic checkout, idempotency (T09), CASH/QRIS rules (T04-T07), snapshot immutability (T14), and VOID rules (T16)', async () => {
    const db = createIsolatedMemoryDb();
    await db.initialize();

    const nowMs = Date.UTC(2026, 10, 5, 13, 0, 0);
    await db.run(
      `INSERT INTO categories (id, name, sort_order, is_active, created_at_ms, updated_at_ms)
       VALUES ('cat_1', 'Kategori Uji', 1, 1, ?, ?);`,
      [nowMs, nowMs],
    );
    await db.run(
      `INSERT INTO products (
        id, category_id, name, sku, pricing_mode, base_price_rupiah,
        is_active, is_available, sort_order, created_at_ms, updated_at_ms
      ) VALUES ('prod_1', 'cat_1', 'Produk Uji', 'SKU-UJI-1', 'BASE_PLUS_OPTIONS', 10000, 1, 1, 1, ?, ?);`,
      [nowMs, nowMs],
    );
    await db.run(
      `INSERT INTO option_groups (id, name, min_selected, max_selected, sort_order, is_active)
       VALUES ('grp_1', 'Topping Uji', 0, 5, 1, 1);`,
    );
    await db.run(
      `INSERT INTO options (id, group_id, name, unit_price_rupiah, is_active, sort_order)
       VALUES ('opt_1', 'grp_1', 'Ekstra Uji', 2000, 1, 1);`,
    );

    const txRepo = new TransactionRepository(db);

    // T05: Tunai kurang dari total wajib ditolak
    await expect(
      txRepo.createPaidSale({
        id: 'tx_underpaid',
        occurredAtMs: nowMs,
        paymentMethod: 'CASH',
        paidAmountRupiah: 10_000,
        items: [
          {
            id: 'i_under',
            productId: 'prod_1',
            productNameSnapshot: 'Produk Uji',
            baseUnitPriceRupiah: 10_000,
            quantity: 2,
          },
        ],
      }),
    ).rejects.toThrow(RangeError);

    // T06: QRIS tanpa konfirmasi manual wajib ditolak
    await expect(
      txRepo.createPaidSale({
        id: 'tx_qris_unconfirmed',
        occurredAtMs: nowMs,
        paymentMethod: 'QRIS',
        qrisConfirmedManually: false,
        items: [
          {
            id: 'i_qris',
            productId: 'prod_1',
            productNameSnapshot: 'Produk Uji',
            baseUnitPriceRupiah: 10_000,
            quantity: 1,
          },
        ],
      }),
    ).rejects.toThrow(RangeError);

    // T04 & T09: CASH valid + idempotent bila dipanggil dua kali dengan ID sama
    const saleInput = {
      id: 'tx_cash_valid',
      occurredAtMs: nowMs,
      paymentMethod: 'CASH' as const,
      paidAmountRupiah: 30_000,
      items: [
        {
          id: 'item_valid_1',
          productId: 'prod_1',
          productNameSnapshot: 'Produk Uji',
          baseUnitPriceRupiah: 10_000,
          quantity: 2,
          options: [
            {
              id: 'opt_valid_1',
              optionId: 'opt_1',
              optionNameSnapshot: 'Ekstra Uji',
              unitPriceRupiah: 2_000,
              quantityPerPortion: 1,
            },
          ],
        },
      ],
    };

    const firstSave = await txRepo.createPaidSale(saleInput);
    const duplicateRetry = await txRepo.createPaidSale(saleInput);

    expect(firstSave.receiptNumber).toBe('MM-20261105-0001');
    expect(duplicateRetry.receiptNumber).toBe('MM-20261105-0001');
    expect(firstSave.grandTotalRupiah).toBe(24_000);
    expect(firstSave.changeAmountRupiah).toBe(6_000);

    // T07: QRIS dikonfirmasi manual menghasilkan sequence berikutnya (0002) dan kembalian 0
    const qrisSave = await txRepo.createPaidSale({
      id: 'tx_qris_valid',
      occurredAtMs: nowMs + 1_000,
      paymentMethod: 'QRIS',
      qrisConfirmedManually: true,
      items: [
        {
          id: 'item_qris_1',
          productId: 'prod_1',
          productNameSnapshot: 'Produk Uji',
          baseUnitPriceRupiah: 10_000,
          quantity: 1,
        },
      ],
    });
    expect(qrisSave.receiptNumber).toBe('MM-20261105-0002');
    expect(qrisSave.changeAmountRupiah).toBe(0);

    // T14: Perubahan harga katalog tidak mengubah transaksi historis
    await db.run(
      `UPDATE products SET base_price_rupiah = 15000 WHERE id = 'prod_1';`,
    );
    const historicalAfterPriceEdit = await txRepo.getById('tx_cash_valid');
    expect(historicalAfterPriceEdit?.items[0]?.baseUnitPriceRupiah).toBe(10_000);
    expect(historicalAfterPriceEdit?.grandTotalRupiah).toBe(24_000);

    // T16: VOID wajib beralasan dan tidak boleh dua kali
    await expect(txRepo.voidTransaction('tx_cash_valid', '   ')).rejects.toThrow(
      RangeError,
    );
    const voided = await txRepo.voidTransaction(
      'tx_cash_valid',
      'Salah input pesanan',
      nowMs + 5_000,
    );
    expect(voided.status).toBe('VOID');
    expect(voided.voidReason).toBe('Salah input pesanan');

    await expect(
      txRepo.voidTransaction('tx_cash_valid', 'Batal lagi'),
    ).rejects.toThrow(DatabaseError);
  });

  it('enforces SQLite FK, CHECK constraints, and rolls back multi-query transactions on partial failure (T10)', async () => {
    const db = createIsolatedMemoryDb();
    await db.initialize();
    const settingsRepo = new SettingsRepository(db);

    // FK violation: produk merujuk kategori yang tidak ada
    await expect(
      db.run(
        `INSERT INTO products (
          id, category_id, name, pricing_mode, base_price_rupiah,
          is_active, is_available, sort_order, created_at_ms, updated_at_ms
        ) VALUES ('p_bad_fk', 'missing_cat', 'Bad FK', 'FIXED', 5000, 1, 1, 0, 1, 1);`,
      ),
    ).rejects.toMatchObject({ code: 'DB_CONSTRAINT_FAILED' });

    // CHECK violation: VOID tanpa void_reason di tabel transactions
    await expect(
      db.run(
        `INSERT INTO transactions (
          id, receipt_number, daily_sequence, occurred_at_ms, business_date,
          status, payment_method, subtotal_rupiah, grand_total_rupiah,
          paid_amount_rupiah, change_amount_rupiah, void_reason, voided_at_ms, created_at_ms
        ) VALUES (
          'tx_bad_void', 'MM-20261105-9999', 9999, 1000, '2026-11-05',
          'VOID', 'CASH', 10000, 10000, 10000, 0, NULL, NULL, 1000
        );`,
      ),
    ).rejects.toMatchObject({ code: 'DB_CONSTRAINT_FAILED' });

    // T10: Kegagalan statement ke-2 membatalkan (rollback) statement ke-1 secara atomik
    await expect(
      db.withTransaction(async (tx) => {
        await tx.run(
          `INSERT INTO settings (key, value, updated_at_ms)
           VALUES ('marker.should.rollback', 'aktif', 1000);`,
        );
        // Melanggar CHECK (change_amount_rupiah = 0) untuk QRIS
        await tx.run(
          `INSERT INTO transactions (
            id, receipt_number, daily_sequence, occurred_at_ms, business_date,
            status, payment_method, subtotal_rupiah, grand_total_rupiah,
            paid_amount_rupiah, change_amount_rupiah, created_at_ms
          ) VALUES (
            'tx_bad_qris', 'MM-20261105-8888', 8888, 1000, '2026-11-05',
            'PAID', 'QRIS', 10000, 10000, 15000, 5000, 1000
          );`,
        );
      }),
    ).rejects.toBeInstanceOf(DatabaseError);

    const rolledBackSetting = await settingsRepo.getSetting(
      'marker.should.rollback',
    );
    expect(rolledBackSetting).toBeNull();
  });

  it('runs the full P1 DiagnosticRepository suite cleanly without polluting production counters', async () => {
    const db = createIsolatedMemoryDb();
    await db.initialize();

    const diagRepo = new DiagnosticRepository(db);
    await diagRepo.recordBootSession(1_000);

    const report = await diagRepo.runDiagnosticSuite(2_000);
    expect(report.allPassed).toBe(true);
    expect(report.checks).toHaveLength(8);

    const probeBoot1 = await diagRepo.ensurePersistenceSampleSale(3_000);
    expect(probeBoot1.persistedTransaction?.receiptNumber).toMatch(/^DIAG-P1-/);
    expect(probeBoot1.survivedRestart).toBe(false);

    // Simulasi boot berikutnya
    await diagRepo.recordBootSession(4_000);
    const probeBoot2 = await diagRepo.getPersistenceProbeState();
    expect(probeBoot2.survivedRestart).toBe(true);

    // Pastikan counter produksi (tanpa prefix DIAG-) tetap kosong
    const prodCounters = await db.query<{ business_date: string }>(
      `SELECT business_date FROM daily_counters WHERE business_date NOT LIKE 'DIAG-%';`,
    );
    expect(prodCounters).toHaveLength(0);

    await diagRepo.clearDiagnosticData();
    const afterClear = await diagRepo.getPersistenceProbeState();
    expect(afterClear.persistedTransaction).toBeNull();
  });
});

