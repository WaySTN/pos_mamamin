import { ExpenseRepository } from '../database/repositories/expenseRepository';
import { ReportRepository } from '../database/repositories/reportRepository';
import { TransactionRepository } from '../database/repositories/transactionRepository';
import type { DatabaseService } from '../database/sqlite';
import {
  generateExpensesCsv,
  generateSummaryCsv,
  generateTransactionsCsv,
  getReportDateRange,
} from '../domain/reports';
import type {
  DailyReportRow,
  ReportDateRange,
  ReportPeriodType,
  SalesReportSummary,
  TopOptionSummary,
  TopProductSummary,
} from '../domain/types';

export interface FullReportData {
  readonly dateRange: ReportDateRange;
  readonly summary: SalesReportSummary;
  readonly dailyRows: readonly DailyReportRow[];
  readonly topProducts: readonly TopProductSummary[];
  readonly topOptions: readonly TopOptionSummary[];
}

export class ReportService {
  private readonly reportRepo: ReportRepository;
  private readonly txRepo: TransactionRepository;
  private readonly expenseRepo: ExpenseRepository;

  constructor(db: DatabaseService) {
    this.reportRepo = new ReportRepository(db);
    this.txRepo = new TransactionRepository(db);
    this.expenseRepo = new ExpenseRepository(db);
  }

  async getReportData(
    periodType: ReportPeriodType,
    customRange?: { startDate: string; endDate: string },
    nowMs: number = Date.now(),
  ): Promise<FullReportData> {
    const dateRange = getReportDateRange(periodType, customRange, nowMs);

    const [summary, dailyRows, topProducts, topOptions] = await Promise.all([
      this.reportRepo.getSalesReportSummary(
        dateRange.startDate,
        dateRange.endDate,
        dateRange.label,
      ),
      this.reportRepo.getDailyReportRows(
        dateRange.startDate,
        dateRange.endDate,
      ),
      this.reportRepo.getTopProducts(dateRange.startDate, dateRange.endDate, 10),
      this.reportRepo.getTopOptions(dateRange.startDate, dateRange.endDate, 10),
    ]);

    return {
      dateRange,
      summary,
      dailyRows,
      topProducts,
      topOptions,
    };
  }

  async exportSummaryCsv(
    periodType: ReportPeriodType,
    customRange?: { startDate: string; endDate: string },
    nowMs: number = Date.now(),
  ): Promise<string> {
    const data = await this.getReportData(periodType, customRange, nowMs);
    return generateSummaryCsv(data.summary, data.dailyRows, data.topProducts);
  }

  async exportTransactionsCsv(
    startDate: string,
    endDate: string,
  ): Promise<string> {
    const transactions = await this.txRepo.listTransactions({
      dateRange: { startDate, endDate },
      limit: 10_000,
    });
    return generateTransactionsCsv(transactions);
  }

  async exportExpensesCsv(
    startDate: string,
    endDate: string,
  ): Promise<string> {
    const expenses = await this.expenseRepo.listExpenses({
      startDate,
      endDate,
      limit: 10_000,
    });
    return generateExpensesCsv(expenses);
  }
}
