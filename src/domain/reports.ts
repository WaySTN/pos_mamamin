import {
  assertValidBusinessDate,
  formatDateTimeWib,
  getBusinessDateWib,
  WIB_TIMEZONE,
} from './dates';
import type {
  DailyReportRow,
  ExpenseRecord,
  ReportDateRange,
  ReportPeriodType,
  SalesReportSummary,
  SavedTransaction,
  TopProductSummary,
} from './types';

const MS_PER_DAY = 86_400_000;

/**
 * Menghitung rentang tanggal bisnis WIB berdasarkan tipe periode.
 */
export function getReportDateRange(
  periodType: ReportPeriodType,
  customRange?: { startDate: string; endDate: string },
  nowMs: number = Date.now(),
): ReportDateRange {
  const todayWib = getBusinessDateWib(nowMs);

  switch (periodType) {
    case 'TODAY':
      return {
        startDate: todayWib,
        endDate: todayWib,
        label: `Hari Ini (${todayWib})`,
      };

    case 'YESTERDAY': {
      const yesterdayWib = getBusinessDateWib(nowMs - MS_PER_DAY);
      return {
        startDate: yesterdayWib,
        endDate: yesterdayWib,
        label: `Kemarin (${yesterdayWib})`,
      };
    }

    case 'LAST_7_DAYS': {
      // 6 hari lalu s/d hari ini = 7 hari kalender
      const sevenDaysAgoWib = getBusinessDateWib(nowMs - 6 * MS_PER_DAY);
      return {
        startDate: sevenDaysAgoWib,
        endDate: todayWib,
        label: `7 Hari Terakhir (${sevenDaysAgoWib} s/d ${todayWib})`,
      };
    }

    case 'THIS_MONTH': {
      // Ambil YYYY-MM dari tanggal hari ini WIB
      const yearMonth = todayWib.slice(0, 7);
      const firstDay = `${yearMonth}-01`;
      return {
        startDate: firstDay,
        endDate: todayWib,
        label: `Bulan Ini (${yearMonth})`,
      };
    }

    case 'CUSTOM': {
      if (!customRange) {
        return {
          startDate: todayWib,
          endDate: todayWib,
          label: `Kustom (${todayWib})`,
        };
      }
      assertValidBusinessDate(customRange.startDate);
      assertValidBusinessDate(customRange.endDate);
      const [start, end] =
        customRange.startDate <= customRange.endDate
          ? [customRange.startDate, customRange.endDate]
          : [customRange.endDate, customRange.startDate];
      return {
        startDate: start,
        endDate: end,
        label: `Rentang ${start} s/d ${end}`,
      };
    }
  }
}

/**
 * Menghitung selisih sederhana kas operasional (Omzet - Pengeluaran).
 * Sesuai AGENTS.md §1 & Blueprint §11: Ini BUKAN laba bersih akuntansi.
 */
export function calculateNetOperatingCash(
  grossOmzetRupiah: number,
  activeExpensesRupiah: number,
): number {
  return grossOmzetRupiah - activeExpensesRupiah;
}

/**
 * Menghitung estimasi saldo kas tunai di laci kasir (Tunai Masuk - Pengeluaran Kas).
 */
export function calculateEstimatedCashDrawer(
  cashRevenueRupiah: number,
  activeExpensesRupiah: number,
): number {
  return cashRevenueRupiah - activeExpensesRupiah;
}

/**
 * Sanitasi string sel CSV untuk mencegah Formula Injection (CSV Injection).
 * Karakter berbahaya: '=', '+', '-', '@', '\t', '\r' di awal sel.
 * Sesuai Blueprint §11.3: Gunakan mitigasi formula injection untuk field teks user.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let text = String(value);

  // Bersihkan karakter kontrol tak kasat mata
  text = text.replace(/[\r\t]/g, ' ');

  // Periksa apakah diawali karakter formula spreadsheet
  const firstChar = text.charAt(0);
  if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@') {
    // Beri tanda petik tunggal di depan agar Excel & Spreadsheet membacanya murni sebagai teks
    text = `'${text}`;
  }

  // Jika mengandung koma, kutip ganda, atau baris baru, bungkus dengan tanda kutip ganda
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    text = `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

/**
 * Prefix UTF-8 BOM agar Excel menampilkan aksen, karakter non-ASCII, dan format dengan benar.
 */
export const CSV_UTF8_BOM = '\uFEFF';

/**
 * Generator CSV Rekapitulasi Laporan Penjualan & Keuangan Kasir
 */
export function generateSummaryCsv(
  summary: SalesReportSummary,
  dailyRows: readonly DailyReportRow[],
  topProducts: readonly TopProductSummary[],
): string {
  const lines: string[] = [];

  // Header Ringkasan
  lines.push('LAPORAN PENJUALAN & KEUANGAN SEDERHANA - KEDAI MAMAMIN');
  lines.push(`Periode,${sanitizeCsvCell(summary.periodLabel)}`);
  lines.push(`Rentang Tanggal,${sanitizeCsvCell(summary.startDate)} s/d ${sanitizeCsvCell(summary.endDate)}`);
  lines.push(`Zona Waktu,${WIB_TIMEZONE}`);
  lines.push('');

  // Metrik Utama
  lines.push('METRIK UTAMA,NILAI (RUPIAH / JUMLAH),KETERANGAN');
  lines.push(`Total Omzet Penjualan (PAID),${summary.totalGrossOmzetRupiah},Transaksi berstatus PAID`);
  lines.push(`Jumlah Transaksi Berhasil,${summary.paidTransactionCount},Transaksi PAID`);
  lines.push(`Jumlah Transaksi Dibatalkan (VOID),${summary.voidTransactionCount},Dikeluarkan dari omzet`);
  lines.push(`Pendapatan Tunai (CASH),${summary.cashRevenueRupiah},${summary.cashTransactionCount} transaksi`);
  lines.push(`Pendapatan QRIS Manual,${summary.qrisRevenueRupiah},${summary.qrisTransactionCount} transaksi`);
  lines.push(`Total Pengeluaran Kas Kecil (ACTIVE),${summary.activeExpenseTotalRupiah},${summary.activeExpenseCount} pengeluaran aktif`);
  lines.push(`Pengeluaran Dibatalkan (VOID),-,${summary.voidExpenseCount} pengeluaran VOID`);
  lines.push(`Selisih Kas Operasional (Omzet - Pengeluaran),${summary.netOperatingCashRupiah},Arus kas operasional (Bukan laba bersih akuntansi)`);
  lines.push(`Estimasi Kas Laci (Tunai - Pengeluaran),${summary.estimatedCashDrawerRupiah},Estimasi uang fisik di laci kasir`);
  lines.push('');

  // Rincian Harian
  if (dailyRows.length > 0) {
    lines.push('RINCIAN HARIAN PENJUALAN & PENGELUARAN');
    lines.push('Tanggal,Trx Berhasil,Omzet (Rp),Tunai (Rp),QRIS (Rp),Pengeluaran (Rp),Selisih Kas (Rp)');
    for (const row of dailyRows) {
      lines.push([
        sanitizeCsvCell(row.businessDate),
        row.paidTransactionsCount,
        row.omzetRupiah,
        row.cashRupiah,
        row.qrisRupiah,
        row.expenseRupiah,
        row.netCashRupiah,
      ].join(','));
    }
    lines.push('');
  }

  // Menu Terlaris
  if (topProducts.length > 0) {
    lines.push('MENU TERLARIS');
    lines.push('Peringkat,Nama Menu,Kuantitas Terjual (Porsi),Kontribusi Omzet (Rp)');
    topProducts.forEach((prod, index) => {
      lines.push([
        index + 1,
        sanitizeCsvCell(prod.productName),
        prod.totalQuantity,
        prod.totalSalesRupiah,
      ].join(','));
    });
  }

  return CSV_UTF8_BOM + lines.join('\r\n');
}

/**
 * Generator CSV Rincian Transaksi Penjualan
 */
export function generateTransactionsCsv(
  transactions: readonly SavedTransaction[],
): string {
  const lines: string[] = [];

  lines.push('RINCIAN TRANSAKSI PENJUALAN - KEDAI MAMAMIN');
  lines.push('No Struk,Tanggal Bisnis,Waktu Transaksi WIB,Status,Metode Bayar,Total (Rp),Bayar (Rp),Kembalian (Rp),Keterangan / Alasan Void');

  for (const tx of transactions) {
    const waktuWib = formatDateTimeWib(tx.occurredAtMs);
    const keterangan = tx.status === 'VOID' ? `VOID: ${tx.voidReason ?? '-'}` : 'Sukses';
    lines.push([
      sanitizeCsvCell(tx.receiptNumber),
      sanitizeCsvCell(tx.businessDate),
      sanitizeCsvCell(waktuWib),
      sanitizeCsvCell(tx.status),
      sanitizeCsvCell(tx.paymentMethod),
      tx.grandTotalRupiah,
      tx.paidAmountRupiah,
      tx.changeAmountRupiah,
      sanitizeCsvCell(keterangan),
    ].join(','));
  }

  return CSV_UTF8_BOM + lines.join('\r\n');
}

/**
 * Generator CSV Rincian Pengeluaran Kas Kecil
 */
export function generateExpensesCsv(
  expenses: readonly ExpenseRecord[],
): string {
  const lines: string[] = [];

  lines.push('RINCIAN PENGELUARAN KAS KECIL - KEDAI MAMAMIN');
  lines.push('ID Pengeluaran,Tanggal Bisnis,Waktu WIB,Kategori,Nominal (Rp),Keterangan,Status,Alasan Void');

  for (const exp of expenses) {
    const waktuWib = formatDateTimeWib(exp.occurredAtMs);
    lines.push([
      sanitizeCsvCell(exp.id),
      sanitizeCsvCell(exp.businessDate),
      sanitizeCsvCell(waktuWib),
      sanitizeCsvCell(exp.category),
      exp.amountRupiah,
      sanitizeCsvCell(exp.notes),
      sanitizeCsvCell(exp.status),
      sanitizeCsvCell(exp.voidReason ?? '-'),
    ].join(','));
  }

  return CSV_UTF8_BOM + lines.join('\r\n');
}
