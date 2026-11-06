import {
  calculateEstimatedCashDrawer,
  calculateNetOperatingCash,
} from '../../domain/reports';
import type {
  DailyReportRow,
  SalesReportSummary,
  TopOptionSummary,
  TopProductSummary,
} from '../../domain/types';
import type { DatabaseService } from '../sqlite';
import type { SqlExecutor } from '../types';

export class ReportRepository {
  private readonly db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  async getSalesReportSummary(
    startDate: string,
    endDate: string,
    periodLabel: string,
    executor: SqlExecutor = this.db,
  ): Promise<SalesReportSummary> {
    const salesRows = await executor.query<{
      paid_count: number;
      total_omzet: number;
      cash_revenue: number;
      cash_count: number;
      qris_revenue: number;
      qris_count: number;
    }>(
      `SELECT
        COUNT(*) as paid_count,
        COALESCE(SUM(grand_total_rupiah), 0) as total_omzet,
        COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN grand_total_rupiah ELSE 0 END), 0) as cash_revenue,
        COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN 1 ELSE 0 END), 0) as cash_count,
        COALESCE(SUM(CASE WHEN payment_method = 'QRIS' THEN grand_total_rupiah ELSE 0 END), 0) as qris_revenue,
        COALESCE(SUM(CASE WHEN payment_method = 'QRIS' THEN 1 ELSE 0 END), 0) as qris_count
       FROM transactions
       WHERE business_date >= ? AND business_date <= ? AND status = 'PAID';`,
      [startDate, endDate],
    );

    const voidSalesRows = await executor.query<{ void_count: number }>(
      `SELECT COUNT(*) as void_count
       FROM transactions
       WHERE business_date >= ? AND business_date <= ? AND status = 'VOID';`,
      [startDate, endDate],
    );

    const expenseRows = await executor.query<{
      active_count: number;
      total_expense: number;
    }>(
      `SELECT
        COUNT(*) as active_count,
        COALESCE(SUM(amount_rupiah), 0) as total_expense
       FROM expenses
       WHERE business_date >= ? AND business_date <= ? AND status = 'ACTIVE';`,
      [startDate, endDate],
    );

    const voidExpenseRows = await executor.query<{ void_count: number }>(
      `SELECT COUNT(*) as void_count
       FROM expenses
       WHERE business_date >= ? AND business_date <= ? AND status = 'VOID';`,
      [startDate, endDate],
    );

    const sales = salesRows[0] ?? {
      paid_count: 0,
      total_omzet: 0,
      cash_revenue: 0,
      cash_count: 0,
      qris_revenue: 0,
      qris_count: 0,
    };

    const voidSales = voidSalesRows[0]?.void_count ?? 0;
    const expenses = expenseRows[0] ?? { active_count: 0, total_expense: 0 };
    const voidExpenses = voidExpenseRows[0]?.void_count ?? 0;

    const totalGrossOmzetRupiah = Number(sales.total_omzet);
    const activeExpenseTotalRupiah = Number(expenses.total_expense);
    const cashRevenueRupiah = Number(sales.cash_revenue);

    const netOperatingCashRupiah = calculateNetOperatingCash(
      totalGrossOmzetRupiah,
      activeExpenseTotalRupiah,
    );

    const estimatedCashDrawerRupiah = calculateEstimatedCashDrawer(
      cashRevenueRupiah,
      activeExpenseTotalRupiah,
    );

    return {
      periodLabel,
      startDate,
      endDate,
      totalGrossOmzetRupiah,
      paidTransactionCount: Number(sales.paid_count),
      voidTransactionCount: Number(voidSales),
      cashRevenueRupiah,
      cashTransactionCount: Number(sales.cash_count),
      qrisRevenueRupiah: Number(sales.qris_revenue),
      qrisTransactionCount: Number(sales.qris_count),
      activeExpenseTotalRupiah,
      activeExpenseCount: Number(expenses.active_count),
      voidExpenseCount: Number(voidExpenses),
      netOperatingCashRupiah,
      estimatedCashDrawerRupiah,
    };
  }

  async getTopProducts(
    startDate: string,
    endDate: string,
    limit: number = 10,
    executor: SqlExecutor = this.db,
  ): Promise<readonly TopProductSummary[]> {
    const rows = await executor.query<{
      product_name: string;
      total_quantity: number;
      total_sales: number;
    }>(
      `SELECT
        ti.product_name_snapshot as product_name,
        COALESCE(SUM(ti.quantity), 0) as total_quantity,
        COALESCE(SUM(ti.line_total_rupiah), 0) as total_sales
       FROM transaction_items ti
       JOIN transactions t ON t.id = ti.transaction_id
       WHERE t.business_date >= ? AND t.business_date <= ? AND t.status = 'PAID'
       GROUP BY ti.product_name_snapshot
       ORDER BY total_quantity DESC, total_sales DESC
       LIMIT ?;`,
      [startDate, endDate, limit],
    );

    return rows.map((r) => ({
      productName: r.product_name,
      totalQuantity: Number(r.total_quantity),
      totalSalesRupiah: Number(r.total_sales),
    }));
  }

  async getTopOptions(
    startDate: string,
    endDate: string,
    limit: number = 10,
    executor: SqlExecutor = this.db,
  ): Promise<readonly TopOptionSummary[]> {
    const rows = await executor.query<{
      option_name: string;
      total_quantity: number;
      total_sales: number;
    }>(
      `SELECT
        tio.option_name_snapshot as option_name,
        COALESCE(SUM(tio.quantity_per_portion * ti.quantity), 0) as total_quantity,
        COALESCE(SUM(tio.unit_price_rupiah * tio.quantity_per_portion * ti.quantity), 0) as total_sales
       FROM transaction_item_options tio
       JOIN transaction_items ti ON ti.id = tio.transaction_item_id
       JOIN transactions t ON t.id = ti.transaction_id
       WHERE t.business_date >= ? AND t.business_date <= ? AND t.status = 'PAID'
       GROUP BY tio.option_name_snapshot
       ORDER BY total_quantity DESC, total_sales DESC
       LIMIT ?;`,
      [startDate, endDate, limit],
    );

    return rows.map((r) => ({
      optionName: r.option_name,
      totalQuantity: Number(r.total_quantity),
      totalSalesRupiah: Number(r.total_sales),
    }));
  }

  async getDailyReportRows(
    startDate: string,
    endDate: string,
    executor: SqlExecutor = this.db,
  ): Promise<readonly DailyReportRow[]> {
    const salesDaily = await executor.query<{
      business_date: string;
      paid_count: number;
      omzet: number;
      cash_omzet: number;
      qris_omzet: number;
    }>(
      `SELECT
        business_date,
        COUNT(*) as paid_count,
        COALESCE(SUM(grand_total_rupiah), 0) as omzet,
        COALESCE(SUM(CASE WHEN payment_method = 'CASH' THEN grand_total_rupiah ELSE 0 END), 0) as cash_omzet,
        COALESCE(SUM(CASE WHEN payment_method = 'QRIS' THEN grand_total_rupiah ELSE 0 END), 0) as qris_omzet
       FROM transactions
       WHERE business_date >= ? AND business_date <= ? AND status = 'PAID'
       GROUP BY business_date;`,
      [startDate, endDate],
    );

    const expenseDaily = await executor.query<{
      business_date: string;
      expense: number;
    }>(
      `SELECT
        business_date,
        COALESCE(SUM(amount_rupiah), 0) as expense
       FROM expenses
       WHERE business_date >= ? AND business_date <= ? AND status = 'ACTIVE'
       GROUP BY business_date;`,
      [startDate, endDate],
    );

    const map = new Map<
      string,
      {
        paid_count: number;
        omzet: number;
        cash_omzet: number;
        qris_omzet: number;
        expense: number;
      }
    >();

    for (const s of salesDaily) {
      map.set(s.business_date, {
        paid_count: Number(s.paid_count),
        omzet: Number(s.omzet),
        cash_omzet: Number(s.cash_omzet),
        qris_omzet: Number(s.qris_omzet),
        expense: 0,
      });
    }

    for (const e of expenseDaily) {
      const existing = map.get(e.business_date);
      if (existing) {
        existing.expense = Number(e.expense);
      } else {
        map.set(e.business_date, {
          paid_count: 0,
          omzet: 0,
          cash_omzet: 0,
          qris_omzet: 0,
          expense: Number(e.expense),
        });
      }
    }

    // Urutkan tanggal secara descending (terbaru di atas)
    const sortedDates = Array.from(map.keys()).sort().reverse();

    return sortedDates.map((date) => {
      const data = map.get(date)!;
      return {
        businessDate: date,
        paidTransactionsCount: data.paid_count,
        omzetRupiah: data.omzet,
        cashRupiah: data.cash_omzet,
        qrisRupiah: data.qris_omzet,
        expenseRupiah: data.expense,
        netCashRupiah: data.omzet - data.expense,
      };
    });
  }
}
