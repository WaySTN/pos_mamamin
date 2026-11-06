import {
  type CreateExpenseInput,
  validateExpenseInput,
  validateVoidExpenseReason,
} from '../../domain/expenses';
import type {
  CategoryExpenseSummary,
  ExpenseRecord,
  ExpenseStatus,
} from '../../domain/types';
import type { DatabaseService } from '../sqlite';
import { DatabaseError, type SqlExecutor, type SqlValue } from '../types';

export interface ExpenseFilter {
  readonly businessDate?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly status?: ExpenseStatus | 'ALL';
  readonly category?: string;
  readonly limit?: number;
  readonly offset?: number;
}

interface ExpenseRow extends Record<string, unknown> {
  readonly id: string;
  readonly occurred_at_ms: number;
  readonly business_date: string;
  readonly category: string;
  readonly amount_rupiah: number;
  readonly notes: string;
  readonly status: ExpenseStatus;
  readonly void_reason: string | null;
  readonly voided_at_ms: number | null;
  readonly created_at_ms: number;
}

export class ExpenseRepository {
  private readonly db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  async createExpense(
    input: CreateExpenseInput,
    executor: SqlExecutor = this.db,
  ): Promise<ExpenseRecord> {
    const validated = validateExpenseInput(input);

    await executor.run(
      `INSERT INTO expenses (
        id,
        occurred_at_ms,
        business_date,
        category,
        amount_rupiah,
        notes,
        status,
        void_reason,
        voided_at_ms,
        created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        validated.id,
        validated.occurredAtMs,
        validated.businessDate,
        validated.category,
        validated.amountRupiah,
        validated.notes,
        validated.status,
        validated.voidReason,
        validated.voidedAtMs,
        validated.createdAtMs,
      ],
    );

    const saved = await this.getById(validated.id, executor);
    if (!saved) {
      throw new DatabaseError(
        'DB_TRANSACTION_FAILED',
        'Gagal memverifikasi penyimpanan data pengeluaran.',
      );
    }
    return saved;
  }

  async getById(
    id: string,
    executor: SqlExecutor = this.db,
  ): Promise<ExpenseRecord | null> {
    const rows = await executor.query<ExpenseRow>(
      `SELECT
        id,
        occurred_at_ms,
        business_date,
        category,
        amount_rupiah,
        notes,
        status,
        void_reason,
        voided_at_ms,
        created_at_ms
       FROM expenses
       WHERE id = ?;`,
      [id],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return this.mapRowToRecord(row);
  }

  async listExpenses(
    filter: ExpenseFilter = {},
    executor: SqlExecutor = this.db,
  ): Promise<readonly ExpenseRecord[]> {
    const conditions: string[] = [];
    const params: SqlValue[] = [];

    if (filter.businessDate) {
      conditions.push('business_date = ?');
      params.push(filter.businessDate);
    } else if (filter.startDate && filter.endDate) {
      conditions.push('business_date >= ? AND business_date <= ?');
      params.push(filter.startDate, filter.endDate);
    } else if (filter.startDate) {
      conditions.push('business_date >= ?');
      params.push(filter.startDate);
    } else if (filter.endDate) {
      conditions.push('business_date <= ?');
      params.push(filter.endDate);
    }

    if (filter.status && filter.status !== 'ALL') {
      conditions.push('status = ?');
      params.push(filter.status);
    }

    if (filter.category?.trim()) {
      conditions.push('category = ?');
      params.push(filter.category.trim());
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;
    params.push(limit, offset);

    const rows = await executor.query<ExpenseRow>(
      `SELECT
        id,
        occurred_at_ms,
        business_date,
        category,
        amount_rupiah,
        notes,
        status,
        void_reason,
        voided_at_ms,
        created_at_ms
       FROM expenses
       ${whereClause}
       ORDER BY occurred_at_ms DESC
       LIMIT ? OFFSET ?;`,
      params,
    );

    return rows.map((r) => this.mapRowToRecord(r));
  }

  async voidExpense(
    id: string,
    reason: string,
    voidedAtMs: number = Date.now(),
    executor?: SqlExecutor,
  ): Promise<ExpenseRecord> {
    const validatedReason = validateVoidExpenseReason(reason);

    const runVoid = async (tx: SqlExecutor) => {
      const existing = await this.getById(id, tx);
      if (!existing) {
        throw new DatabaseError(
          'DB_QUERY_FAILED',
          'Pengeluaran tidak ditemukan untuk dibatalkan.',
        );
      }
      if (existing.status === 'VOID') {
        throw new DatabaseError(
          'DB_CONSTRAINT_FAILED',
          'Pengeluaran sudah berstatus VOID dan tidak dapat dibatalkan dua kali.',
        );
      }

      await tx.run(
        `UPDATE expenses
         SET status = 'VOID',
             void_reason = ?,
             voided_at_ms = ?
         WHERE id = ? AND status = 'ACTIVE';`,
        [validatedReason, voidedAtMs, id],
      );

      const updated = await this.getById(id, tx);
      if (!updated) {
        throw new DatabaseError(
          'DB_TRANSACTION_FAILED',
          'Gagal memuat pengeluaran setelah status VOID disimpan.',
        );
      }
      return updated;
    };

    if (executor) {
      return runVoid(executor);
    }
    return this.db.withTransaction(runVoid);
  }

  async getTotalActiveExpenses(
    range?: { startDate: string; endDate: string } | string,
    executor: SqlExecutor = this.db,
  ): Promise<number> {
    let whereClause = "WHERE status = 'ACTIVE'";
    const params: SqlValue[] = [];

    if (typeof range === 'string') {
      whereClause += ' AND business_date = ?';
      params.push(range);
    } else if (range) {
      whereClause += ' AND business_date >= ? AND business_date <= ?';
      params.push(range.startDate, range.endDate);
    }

    const rows = await executor.query<{ total: number | null }>(
      `SELECT COALESCE(SUM(amount_rupiah), 0) as total FROM expenses ${whereClause};`,
      params,
    );

    return Number(rows[0]?.total ?? 0);
  }

  async getCategorySummary(
    range?: { startDate: string; endDate: string } | string,
    executor: SqlExecutor = this.db,
  ): Promise<readonly CategoryExpenseSummary[]> {
    let whereClause = "WHERE status = 'ACTIVE'";
    const params: SqlValue[] = [];

    if (typeof range === 'string') {
      whereClause += ' AND business_date = ?';
      params.push(range);
    } else if (range) {
      whereClause += ' AND business_date >= ? AND business_date <= ?';
      params.push(range.startDate, range.endDate);
    }

    const rows = await executor.query<{
      category: string;
      count: number;
      total_amount: number;
    }>(
      `SELECT
        category,
        COUNT(*) as count,
        COALESCE(SUM(amount_rupiah), 0) as total_amount
       FROM expenses
       ${whereClause}
       GROUP BY category
       ORDER BY total_amount DESC;`,
      params,
    );

    return rows.map((r) => ({
      category: r.category,
      count: Number(r.count),
      totalAmountRupiah: Number(r.total_amount),
    }));
  }

  private mapRowToRecord(row: ExpenseRow): ExpenseRecord {
    return {
      id: row.id,
      occurredAtMs: Number(row.occurred_at_ms),
      businessDate: row.business_date,
      category: row.category,
      amountRupiah: Number(row.amount_rupiah),
      notes: row.notes,
      status: row.status,
      voidReason: row.void_reason,
      voidedAtMs: row.voided_at_ms === null ? null : Number(row.voided_at_ms),
      createdAtMs: Number(row.created_at_ms),
    };
  }
}
