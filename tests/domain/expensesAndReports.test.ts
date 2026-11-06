import { describe, expect, it } from 'vitest';
import {
  calculateTotalActiveExpenses,
  DEFAULT_EXPENSE_CATEGORIES,
  validateExpenseInput,
  validateVoidExpenseReason,
} from '../../src/domain/expenses';
import {
  calculateEstimatedCashDrawer,
  calculateNetOperatingCash,
  CSV_UTF8_BOM,
  generateExpensesCsv,
  generateSummaryCsv,
  generateTransactionsCsv,
  getReportDateRange,
  sanitizeCsvCell,
} from '../../src/domain/reports';
import type {
  DailyReportRow,
  ExpenseRecord,
  SalesReportSummary,
  SavedTransaction,
  TopProductSummary,
} from '../../src/domain/types';

describe('Domain: Expenses & Reports Logic', () => {
  describe('validateExpenseInput', () => {
    it('menyediakan kategori pengeluaran default kedai MamaMin', () => {
      expect(DEFAULT_EXPENSE_CATEGORIES).toContain('Bahan Baku & Pasar');
      expect(DEFAULT_EXPENSE_CATEGORIES).toContain('Gas & Minyak Goreng');
      expect(DEFAULT_EXPENSE_CATEGORIES).toContain('Kemasan & Kantong Plastik');
      expect(DEFAULT_EXPENSE_CATEGORIES.length).toBeGreaterThanOrEqual(5);
    });

    it('menerima input pengeluaran valid dan menghasilkan record ACTIVE', () => {
      const res = validateExpenseInput({
        category: 'Bahan Baku & Pasar',
        amountRupiah: 25_000,
        notes: 'Beli sawi hijau 2 ikat & bumbu dapur',
        businessDate: '2026-11-06',
        occurredAtMs: 1762410000000,
      });

      expect(res.category).toBe('Bahan Baku & Pasar');
      expect(res.amountRupiah).toBe(25_000);
      expect(res.notes).toBe('Beli sawi hijau 2 ikat & bumbu dapur');
      expect(res.businessDate).toBe('2026-11-06');
      expect(res.status).toBe('ACTIVE');
      expect(res.voidReason).toBeNull();
      expect(res.voidedAtMs).toBeNull();
      expect(res.id).toBeTruthy();
    });

    it('menolak nominal pengeluaran 0 atau negatif', () => {
      expect(() =>
        validateExpenseInput({
          category: 'Operasional',
          amountRupiah: 0,
          notes: 'Test nol',
          businessDate: '2026-11-06',
        }),
      ).toThrowError(/amountRupiah harus berupa integer positif/i);

      expect(() =>
        validateExpenseInput({
          category: 'Operasional',
          amountRupiah: -5_000,
          notes: 'Test negatif',
          businessDate: '2026-11-06',
        }),
      ).toThrowError(/amountRupiah harus berupa integer positif/i);
    });

    it('menolak kategori kosong atau kurang dari 2 karakter', () => {
      expect(() =>
        validateExpenseInput({
          category: '  ',
          amountRupiah: 10_000,
          notes: 'Keterangan cukup',
          businessDate: '2026-11-06',
        }),
      ).toThrowError(/kategori pengeluaran wajib diisi/i);
    });

    it('menolak keterangan kosong atau kurang dari 2 karakter', () => {
      expect(() =>
        validateExpenseInput({
          category: 'Bahan Baku',
          amountRupiah: 10_000,
          notes: ' ',
          businessDate: '2026-11-06',
        }),
      ).toThrowError(/keterangan pengeluaran wajib diisi/i);
    });

    it('menolak format tanggal bisnis yang tidak valid', () => {
      expect(() =>
        validateExpenseInput({
          category: 'Bahan Baku',
          amountRupiah: 10_000,
          notes: 'Beli cabai',
          businessDate: '06-11-2026',
        }),
      ).toThrowError(/businessDate harus berformat YYYY-MM-DD/i);
    });
  });

  describe('validateVoidExpenseReason', () => {
    it('menerima alasan void yang valid (min 3 karakter)', () => {
      expect(validateVoidExpenseReason('Salah input')).toBe('Salah input');
    });

    it('menolak alasan void yang kosong atau terlalu pendek', () => {
      expect(() => validateVoidExpenseReason('  ')).toThrowError(
        /alasan pembatalan/i,
      );
      expect(() => validateVoidExpenseReason('ok')).toThrowError(
        /alasan pembatalan/i,
      );
    });
  });

  describe('calculateTotalActiveExpenses', () => {
    it('hanya menjumlahkan pengeluaran berstatus ACTIVE dan mengabaikan VOID', () => {
      const list: ExpenseRecord[] = [
        {
          id: 'e1',
          occurredAtMs: 100,
          businessDate: '2026-11-06',
          category: 'Bahan Baku',
          amountRupiah: 15_000,
          notes: 'Beli mie',
          status: 'ACTIVE',
          voidReason: null,
          voidedAtMs: null,
          createdAtMs: 100,
        },
        {
          id: 'e2',
          occurredAtMs: 200,
          businessDate: '2026-11-06',
          category: 'Gas',
          amountRupiah: 22_000,
          notes: 'Beli tabung 3kg',
          status: 'VOID',
          voidReason: 'Salah nota',
          voidedAtMs: 250,
          createdAtMs: 200,
        },
        {
          id: 'e3',
          occurredAtMs: 300,
          businessDate: '2026-11-06',
          category: 'Kemasan',
          amountRupiah: 8_000,
          notes: 'Beli kresek',
          status: 'ACTIVE',
          voidReason: null,
          voidedAtMs: null,
          createdAtMs: 300,
        },
      ];

      expect(calculateTotalActiveExpenses(list)).toBe(23_000); // 15.000 + 8.000
    });
  });

  describe('getReportDateRange', () => {
    const fixedNowMs = new Date('2026-11-06T10:00:00+07:00').getTime();

    it('menghitung rentang TODAY dengan benar', () => {
      const res = getReportDateRange('TODAY', undefined, fixedNowMs);
      expect(res.startDate).toBe('2026-11-06');
      expect(res.endDate).toBe('2026-11-06');
      expect(res.label).toContain('2026-11-06');
    });

    it('menghitung rentang YESTERDAY dengan benar', () => {
      const res = getReportDateRange('YESTERDAY', undefined, fixedNowMs);
      expect(res.startDate).toBe('2026-11-05');
      expect(res.endDate).toBe('2026-11-05');
    });

    it('menghitung rentang LAST_7_DAYS dengan benar', () => {
      const res = getReportDateRange('LAST_7_DAYS', undefined, fixedNowMs);
      expect(res.startDate).toBe('2026-10-31');
      expect(res.endDate).toBe('2026-11-06');
    });

    it('menghitung rentang THIS_MONTH dengan benar', () => {
      const res = getReportDateRange('THIS_MONTH', undefined, fixedNowMs);
      expect(res.startDate).toBe('2026-11-01');
      expect(res.endDate).toBe('2026-11-06');
    });

    it('menangani CUSTOM range dan membalik urutan bila start > end', () => {
      const res = getReportDateRange(
        'CUSTOM',
        { startDate: '2026-11-08', endDate: '2026-11-02' },
        fixedNowMs,
      );
      expect(res.startDate).toBe('2026-11-02');
      expect(res.endDate).toBe('2026-11-08');
    });
  });

  describe('calculateNetOperatingCash & calculateEstimatedCashDrawer', () => {
    it('menghitung selisih kas operasional (Omzet - Pengeluaran)', () => {
      expect(calculateNetOperatingCash(29_000, 5_000)).toBe(24_000);
      expect(calculateNetOperatingCash(10_000, 15_000)).toBe(-5_000);
    });

    it('menghitung estimasi kas fisik di laci (Tunai Masuk - Pengeluaran Kas)', () => {
      expect(calculateEstimatedCashDrawer(16_000, 5_000)).toBe(11_000);
    });
  });

  describe('CSV Injection Mitigation (sanitizeCsvCell)', () => {
    it('mengamankan karakter awal formula =, +, -, @ dengan awalan petik tunggal', () => {
      expect(sanitizeCsvCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(sanitizeCsvCell('+cmd|/c calc')).toBe("'+cmd|/c calc");
      expect(sanitizeCsvCell('-100')).toBe("'-100");
      expect(sanitizeCsvCell('@danger')).toBe("'@danger");
    });

    it('membungkus teks yang mengandung koma atau kutip ganda dalam quotes standar CSV', () => {
      expect(sanitizeCsvCell('Mie Ayam, Bakso')).toBe('"Mie Ayam, Bakso"');
      expect(sanitizeCsvCell('Ukuran "Jumbo"')).toBe('"Ukuran ""Jumbo"""');
    });

    it('mengubah tab dan carriage return menjadi spasi', () => {
      expect(sanitizeCsvCell("Baris1\tBaris2\r")).toBe('Baris1 Baris2 ');
    });
  });

  describe('CSV Generators', () => {
    it('generateSummaryCsv menyertakan BOM UTF-8 dan format baris rapi', () => {
      const summary: SalesReportSummary = {
        periodLabel: 'Hari Ini (2026-11-06)',
        startDate: '2026-11-06',
        endDate: '2026-11-06',
        totalGrossOmzetRupiah: 29_000,
        paidTransactionCount: 2,
        voidTransactionCount: 1,
        cashRevenueRupiah: 16_000,
        cashTransactionCount: 1,
        qrisRevenueRupiah: 13_000,
        qrisTransactionCount: 1,
        activeExpenseTotalRupiah: 5_000,
        activeExpenseCount: 1,
        voidExpenseCount: 1,
        netOperatingCashRupiah: 24_000,
        estimatedCashDrawerRupiah: 11_000,
      };

      const dailyRows: DailyReportRow[] = [
        {
          businessDate: '2026-11-06',
          paidTransactionsCount: 2,
          omzetRupiah: 29_000,
          cashRupiah: 16_000,
          qrisRupiah: 13_000,
          expenseRupiah: 5_000,
          netCashRupiah: 24_000,
        },
      ];

      const topProducts: TopProductSummary[] = [
        {
          productName: 'Mie Ayam Original',
          totalQuantity: 2,
          totalSalesRupiah: 20_000,
        },
      ];

      const csv = generateSummaryCsv(summary, dailyRows, topProducts);
      expect(csv.startsWith(CSV_UTF8_BOM)).toBe(true);
      expect(csv).toContain('LAPORAN PENJUALAN & KEUANGAN SEDERHANA');
      expect(csv).toContain('29000');
      expect(csv).toContain('Mie Ayam Original');
    });

    it('generateTransactionsCsv menyertakan status dan alasan void', () => {
      const mockTx: SavedTransaction = {
        id: 'tx-1',
        receiptNumber: 'MM-20261106-0001',
        dailySequence: 1,
        occurredAtMs: 1762410000000,
        businessDate: '2026-11-06',
        status: 'VOID',
        paymentMethod: 'CASH',
        subtotalRupiah: 10_000,
        grandTotalRupiah: 10_000,
        paidAmountRupiah: 20_000,
        changeAmountRupiah: 10_000,
        voidReason: 'Salah input menu',
        voidedAtMs: 1762410050000,
        createdAtMs: 1762410000000,
        items: [],
      };

      const csv = generateTransactionsCsv([mockTx]);
      expect(csv.startsWith(CSV_UTF8_BOM)).toBe(true);
      expect(csv).toContain('MM-20261106-0001');
      expect(csv).toContain('VOID: Salah input menu');
    });

    it('generateExpensesCsv menyertakan nominal dan kategori', () => {
      const mockExp: ExpenseRecord = {
        id: 'exp-1',
        occurredAtMs: 1762410000000,
        businessDate: '2026-11-06',
        category: 'Gas & Minyak Goreng',
        amountRupiah: 22_000,
        notes: 'Beli tabung gas 3kg',
        status: 'ACTIVE',
        voidReason: null,
        voidedAtMs: null,
        createdAtMs: 1762410000000,
      };

      const csv = generateExpensesCsv([mockExp]);
      expect(csv.startsWith(CSV_UTF8_BOM)).toBe(true);
      expect(csv).toContain('Gas & Minyak Goreng');
      expect(csv).toContain('22000');
      expect(csv).toContain('Beli tabung gas 3kg');
    });
  });
});
