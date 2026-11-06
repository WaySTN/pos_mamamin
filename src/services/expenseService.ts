import {
  type ExpenseFilter,
  ExpenseRepository,
} from '../database/repositories/expenseRepository';
import type { DatabaseService } from '../database/sqlite';
import type { CreateExpenseInput } from '../domain/expenses';
import type { CategoryExpenseSummary, ExpenseRecord } from '../domain/types';

export class ExpenseService {
  private readonly repo: ExpenseRepository;

  constructor(db: DatabaseService) {
    this.repo = new ExpenseRepository(db);
  }

  async createExpense(input: CreateExpenseInput): Promise<ExpenseRecord> {
    return this.repo.createExpense(input);
  }

  async listExpenses(
    filter: ExpenseFilter = {},
  ): Promise<readonly ExpenseRecord[]> {
    return this.repo.listExpenses(filter);
  }

  async voidExpense(id: string, reason: string): Promise<ExpenseRecord> {
    return this.repo.voidExpense(id, reason);
  }

  async getExpenseSummary(
    range?: { startDate: string; endDate: string } | string,
  ): Promise<{
    readonly totalActiveRupiah: number;
    readonly categoryBreakdown: readonly CategoryExpenseSummary[];
  }> {
    const [totalActiveRupiah, categoryBreakdown] = await Promise.all([
      this.repo.getTotalActiveExpenses(range),
      this.repo.getCategorySummary(range),
    ]);

    return {
      totalActiveRupiah,
      categoryBreakdown,
    };
  }
}
