import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseService } from '../../src/database/sqlite';
import { ExpenseService } from '../../src/services/expenseService';
import { ReportService } from '../../src/services/reportService';
import { TransactionService } from '../../src/services/transactionService';
import type { CartLineItem } from '../../src/domain/types';
import { NodeSqliteTestDriver } from '../helpers/nodeSqliteTestDriver';

describe('ExpenseService & ReportService Integration (P4)', () => {
  let activeDb: DatabaseService | null = null;

  afterEach(async () => {
    if (activeDb) {
      await activeDb.close();
      activeDb = null;
    }
  });

  async function createInitializedTestDb(): Promise<DatabaseService> {
    const db = new DatabaseService(new NodeSqliteTestDriver(':memory:'), {
      isNativePlatformOverride: true,
    });
    activeDb = db;
    await db.initialize();

    // Seed master catalog
    await db.run(
      `INSERT INTO categories (id, name, sort_order, is_active, created_at_ms, updated_at_ms)
       VALUES ('cat_food', 'Makanan', 1, 1, 1000, 1000);`,
    );

    await db.run(
      `INSERT INTO products (id, category_id, name, pricing_mode, base_price_rupiah, is_active, is_available, sort_order, created_at_ms, updated_at_ms)
       VALUES
         ('prod_mie_01', 'cat_food', 'Mie Ayam Spesial', 'FIXED', 16000, 1, 1, 1, 1000, 1000),
         ('prod_es_01', 'cat_food', 'Es Jeruk', 'FIXED', 13000, 1, 1, 2, 1000, 1000),
         ('prod_batal_01', 'cat_food', 'Bakso Cuanki', 'FIXED', 10000, 1, 1, 3, 1000, 1000);`,
    );

    await db.run(
      `INSERT INTO option_groups (id, name, min_selected, max_selected, sort_order, is_active)
       VALUES ('grp_top_01', 'Topping Ekstra', 0, 5, 1, 1);`,
    );

    await db.run(
      `INSERT INTO options (id, group_id, name, unit_price_rupiah, is_active, sort_order)
       VALUES ('opt_pangsit_01', 'grp_top_01', 'Pangsit Goreng', 2000, 1, 1);`,
    );

    return db;
  }

  describe('ExpenseService CRUD & Voiding', () => {
    it('dapat mencatat pengeluaran aktif baru dan menampilkannya dalam daftar', async () => {
      const db = await createInitializedTestDb();
      const expenseService = new ExpenseService(db);

      const exp1 = await expenseService.createExpense({
        category: 'Bahan Baku & Pasar',
        amountRupiah: 35_000,
        notes: 'Beli sawi, daun bawang, dan bumbu halus',
        businessDate: '2026-11-06',
      });

      expect(exp1.id).toBeTruthy();
      expect(exp1.status).toBe('ACTIVE');
      expect(exp1.amountRupiah).toBe(35_000);

      const list = await expenseService.listExpenses({ businessDate: '2026-11-06' });
      expect(list).toHaveLength(1);
      expect(list[0]?.category).toBe('Bahan Baku & Pasar');
      expect(list[0]?.notes).toBe('Beli sawi, daun bawang, dan bumbu halus');
    });

    it('dapat membatalkan (VOID) pengeluaran dengan alasan wajib', async () => {
      const db = await createInitializedTestDb();
      const expenseService = new ExpenseService(db);

      const exp = await expenseService.createExpense({
        category: 'Gas & Minyak Goreng',
        amountRupiah: 22_000,
        notes: 'Tabung gas melon 3kg',
        businessDate: '2026-11-06',
      });

      const voided = await expenseService.voidExpense(
        exp.id,
        'Salah catat nota, tabung belum dibeli',
      );

      expect(voided.status).toBe('VOID');
      expect(voided.voidReason).toBe('Salah catat nota, tabung belum dibeli');
      expect(voided.voidedAtMs).toBeTypeOf('number');

      // Tidak dapat dibatalkan 2x
      await expect(
        expenseService.voidExpense(exp.id, 'Coba batalkan lagi'),
      ).rejects.toThrowError(/sudah berstatus VOID/i);
    });

    it('menolak pembatalan pengeluaran jika alasan kosong', async () => {
      const db = await createInitializedTestDb();
      const expenseService = new ExpenseService(db);

      const exp = await expenseService.createExpense({
        category: 'Kebersihan',
        amountRupiah: 5_000,
        notes: 'Beli sabun cuci piring',
        businessDate: '2026-11-06',
      });

      await expect(expenseService.voidExpense(exp.id, '  ')).rejects.toThrowError(
        /alasan pembatalan/i,
      );
    });

    it('menghitung rekap kategori pengeluaran hanya untuk yang ACTIVE', async () => {
      const db = await createInitializedTestDb();
      const expenseService = new ExpenseService(db);

      await expenseService.createExpense({
        category: 'Bahan Baku & Pasar',
        amountRupiah: 30_000,
        notes: 'Ayam giling',
        businessDate: '2026-11-06',
      });

      await expenseService.createExpense({
        category: 'Bahan Baku & Pasar',
        amountRupiah: 15_000,
        notes: 'Sawi dan daun bawang',
        businessDate: '2026-11-06',
      });

      const gasExp = await expenseService.createExpense({
        category: 'Gas & Minyak',
        amountRupiah: 25_000,
        notes: 'Minyak goreng 2 liter',
        businessDate: '2026-11-06',
      });

      // Void minyak goreng
      await expenseService.voidExpense(gasExp.id, 'Dibatalkan warung tutup');

      const summary = await expenseService.getExpenseSummary('2026-11-06');
      expect(summary.totalActiveRupiah).toBe(45_000); // 30k + 15k
      expect(summary.categoryBreakdown).toHaveLength(1);
      expect(summary.categoryBreakdown[0]?.category).toBe('Bahan Baku & Pasar');
      expect(summary.categoryBreakdown[0]?.count).toBe(2);
      expect(summary.categoryBreakdown[0]?.totalAmountRupiah).toBe(45_000);
    });
  });

  describe('ReportService & Skenario Akurasi Referensi §11.4', () => {
    it('memverifikasi akurasi dataset referensi Blueprint §11.4', async () => {
      const db = await createInitializedTestDb();
      const txService = new TransactionService(db);
      const expenseService = new ExpenseService(db);
      const reportService = new ReportService(db);

      const targetDate = '2026-11-06';
      const fixedEpoch = new Date('2026-11-06T12:00:00+07:00').getTime();

      // Transaksi A: CASH Rp16.000 (PAID)
      const itemA: CartLineItem = {
        lineId: 'line_a',
        productId: 'prod_mie_01',
        productName: 'Mie Ayam Spesial',
        baseUnitPriceRupiah: 16_000,
        quantity: 1,
        options: [],
        unitTotalRupiah: 16_000,
        lineTotalRupiah: 16_000,
        notes: null,
      };
      await txService.checkoutFromCart({
        paymentMethod: 'CASH',
        paidAmountRupiah: 20_000,
        items: [itemA],
        occurredAtMs: fixedEpoch,
      });

      // Transaksi B: QRIS Rp13.000 (PAID)
      const itemB: CartLineItem = {
        lineId: 'line_b',
        productId: 'prod_es_01',
        productName: 'Es Jeruk',
        baseUnitPriceRupiah: 13_000,
        quantity: 1,
        options: [],
        unitTotalRupiah: 13_000,
        lineTotalRupiah: 13_000,
        notes: null,
      };
      await txService.checkoutFromCart({
        paymentMethod: 'QRIS',
        qrisConfirmedManually: true,
        items: [itemB],
        occurredAtMs: fixedEpoch + 1000,
      });

      // Transaksi C: CASH Rp10.000 lalu di-VOID (VOID)
      const itemC: CartLineItem = {
        lineId: 'line_c',
        productId: 'prod_batal_01',
        productName: 'Bakso Cuanki',
        baseUnitPriceRupiah: 10_000,
        quantity: 1,
        options: [],
        unitTotalRupiah: 10_000,
        lineTotalRupiah: 10_000,
        notes: null,
      };
      const resC = await txService.checkoutFromCart({
        paymentMethod: 'CASH',
        paidAmountRupiah: 10_000,
        items: [itemC],
        occurredAtMs: fixedEpoch + 2000,
      });
      await txService.voidTransaction(resC.id, 'Pelanggan membatalkan pesanan');

      // Pengeluaran 1: ACTIVE Rp5.000
      await expenseService.createExpense({
        category: 'Kebersihan & Kantong',
        amountRupiah: 5_000,
        notes: 'Beli sabun cuci piring',
        businessDate: targetDate,
        occurredAtMs: fixedEpoch + 3000,
      });

      // Pengeluaran 2: Rp2.000 lalu di-VOID
      const expVoid = await expenseService.createExpense({
        category: 'Lain-lain',
        amountRupiah: 2_000,
        notes: 'Beli paku dinding',
        businessDate: targetDate,
        occurredAtMs: fixedEpoch + 4000,
      });
      await expenseService.voidExpense(expVoid.id, 'Paku tidak jadi dibeli');

      // Eksekusi Laporan Penjualan & Keuangan Sederhana untuk hari tersebut
      const report = await reportService.getReportData('TODAY', undefined, fixedEpoch);
      const summary = report.summary;

      // Assertions sesuai spesifikasi ketat Blueprint §11.4:
      // Omzet Rp29.000, jumlah transaksi 2, CASH Rp16.000, QRIS Rp13.000, pengeluaran Rp5.000, selisih sederhana Rp24.000.
      expect(summary.totalGrossOmzetRupiah).toBe(29_000);
      expect(summary.paidTransactionCount).toBe(2);
      expect(summary.voidTransactionCount).toBe(1);
      expect(summary.cashRevenueRupiah).toBe(16_000);
      expect(summary.cashTransactionCount).toBe(1);
      expect(summary.qrisRevenueRupiah).toBe(13_000);
      expect(summary.qrisTransactionCount).toBe(1);
      expect(summary.activeExpenseTotalRupiah).toBe(5_000);
      expect(summary.activeExpenseCount).toBe(1);
      expect(summary.voidExpenseCount).toBe(1);
      expect(summary.netOperatingCashRupiah).toBe(24_000); // 29.000 - 5.000
      expect(summary.estimatedCashDrawerRupiah).toBe(11_000); // 16.000 - 5.000

      // Invarian: Cash + QRIS = Omzet
      expect(summary.cashRevenueRupiah + summary.qrisRevenueRupiah).toBe(
        summary.totalGrossOmzetRupiah,
      );

      // Verifikasi Top Menu (Hanya transaksi PAID, Bakso Cuanki yang VOID tidak masuk)
      expect(report.topProducts).toHaveLength(2);
      expect(report.topProducts[0]?.productName).toBe('Mie Ayam Spesial');
      expect(report.topProducts[0]?.totalQuantity).toBe(1);
      expect(report.topProducts[0]?.totalSalesRupiah).toBe(16_000);
      expect(report.topProducts[1]?.productName).toBe('Es Jeruk');
      expect(report.topProducts[1]?.totalQuantity).toBe(1);
      expect(report.topProducts[1]?.totalSalesRupiah).toBe(13_000);

      // Verifikasi Rincian Harian
      expect(report.dailyRows).toHaveLength(1);
      expect(report.dailyRows[0]?.businessDate).toBe(targetDate);
      expect(report.dailyRows[0]?.omzetRupiah).toBe(29_000);
      expect(report.dailyRows[0]?.expenseRupiah).toBe(5_000);
      expect(report.dailyRows[0]?.netCashRupiah).toBe(24_000);

      // Verifikasi Ekspor CSV
      const summaryCsv = await reportService.exportSummaryCsv('TODAY', undefined, fixedEpoch);
      expect(summaryCsv).toContain('29000');
      expect(summaryCsv).toContain('24000');

      const txCsv = await reportService.exportTransactionsCsv(targetDate, targetDate);
      expect(txCsv).toContain('MM-20261106-0001');
      expect(txCsv).toContain('MM-20261106-0002');
      expect(txCsv).toContain('MM-20261106-0003');
      expect(txCsv).toContain('VOID: Pelanggan membatalkan pesanan');

      const expCsv = await reportService.exportExpensesCsv(targetDate, targetDate);
      expect(expCsv).toContain('5000');
      expect(expCsv).toContain('Kebersihan & Kantong');
      expect(expCsv).toContain('2000');
      expect(expCsv).toContain('VOID');
    });
  });
});
