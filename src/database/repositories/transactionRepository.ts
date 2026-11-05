import { getBusinessDateWib } from '../../domain/dates';
import {
  assertNonNegativeIntegerRupiah,
  assertPositiveInteger,
} from '../../domain/money';
import { formatReceiptNumber } from '../../domain/receiptNumber';
import type {
  PaymentMethod,
  PrintAttemptRecord,
  PrintAttemptResultStatus,
  SavedTransaction,
  SavedTransactionItem,
  SavedTransactionItemOption,
  TransactionStatus,
} from '../../domain/types';
import type { DatabaseService } from '../sqlite';
import { DatabaseError, type SqlExecutor } from '../types';

export interface CreateSaleOptionInput {
  readonly id: string;
  readonly optionId: string | null;
  readonly optionNameSnapshot: string;
  readonly unitPriceRupiah: number;
  readonly quantityPerPortion: number;
}

export interface CreateSaleItemInput {
  readonly id: string;
  readonly productId: string | null;
  readonly productNameSnapshot: string;
  readonly baseUnitPriceRupiah: number;
  readonly quantity: number;
  readonly notes?: string | null;
  readonly options?: readonly CreateSaleOptionInput[];
}

export interface CreatePaidSaleInput {
  readonly id: string;
  readonly occurredAtMs: number;
  readonly createdAtMs?: number;
  readonly paymentMethod: PaymentMethod;
  readonly paidAmountRupiah?: number;
  readonly qrisConfirmedManually?: boolean;
  readonly items: readonly CreateSaleItemInput[];
  /**
   * 'DIAGNOSTIC_P1' mengisolasi counter & business_date ke namespace `DIAG-`
   * agar data uji P1 tidak pernah bercampur dengan omzet atau nomor struk produksi.
   */
  readonly namespace?: 'PRODUCTION' | 'DIAGNOSTIC_P1';
}

interface ValidatedOptionLine {
  readonly id: string;
  readonly optionId: string | null;
  readonly optionNameSnapshot: string;
  readonly unitPriceRupiah: number;
  readonly quantityPerPortion: number;
}

interface ValidatedItemLine {
  readonly id: string;
  readonly productId: string | null;
  readonly productNameSnapshot: string;
  readonly baseUnitPriceRupiah: number;
  readonly quantity: number;
  readonly unitTotalRupiah: number;
  readonly lineTotalRupiah: number;
  readonly notes: string | null;
  readonly options: readonly ValidatedOptionLine[];
}

interface TransactionHeaderRow extends Record<string, unknown> {
  readonly id: string;
  readonly receipt_number: string;
  readonly daily_sequence: number;
  readonly occurred_at_ms: number;
  readonly business_date: string;
  readonly status: TransactionStatus;
  readonly payment_method: PaymentMethod;
  readonly subtotal_rupiah: number;
  readonly grand_total_rupiah: number;
  readonly paid_amount_rupiah: number;
  readonly change_amount_rupiah: number;
  readonly void_reason: string | null;
  readonly voided_at_ms: number | null;
  readonly created_at_ms: number;
}

interface TransactionItemRow extends Record<string, unknown> {
  readonly id: string;
  readonly transaction_id: string;
  readonly product_id: string | null;
  readonly product_name_snapshot: string;
  readonly base_unit_price_rupiah: number;
  readonly quantity: number;
  readonly unit_total_rupiah: number;
  readonly line_total_rupiah: number;
  readonly notes: string | null;
}

interface TransactionItemOptionRow extends Record<string, unknown> {
  readonly id: string;
  readonly transaction_item_id: string;
  readonly option_id: string | null;
  readonly option_name_snapshot: string;
  readonly unit_price_rupiah: number;
  readonly quantity_per_portion: number;
}

export class TransactionRepository {
  private readonly db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  async createPaidSale(input: CreatePaidSaleInput): Promise<SavedTransaction> {
    if (!input.id.trim()) {
      throw new RangeError('ID transaksi wajib diisi.');
    }
    if (input.items.length === 0) {
      throw new RangeError('Transaksi harus memiliki minimal 1 item.');
    }

    const wibBusinessDate = getBusinessDateWib(input.occurredAtMs);
    const createdAtMs = input.createdAtMs ?? input.occurredAtMs;
    if (!Number.isSafeInteger(input.occurredAtMs) || !Number.isSafeInteger(createdAtMs)) {
      throw new RangeError('Timestamp transaksi harus berupa integer epoch milidetik UTC.');
    }

    const validatedItems: ValidatedItemLine[] = input.items.map((item) => {
      const trimmedProductName = item.productNameSnapshot.trim();
      if (!item.id.trim() || !trimmedProductName) {
        throw new RangeError('ID item dan nama snapshot produk wajib diisi.');
      }
      assertNonNegativeIntegerRupiah(
        item.baseUnitPriceRupiah,
        'baseUnitPriceRupiah',
      );
      assertPositiveInteger(item.quantity, 'quantity');

      const options: ValidatedOptionLine[] = (item.options ?? []).map((opt) => {
        const trimmedOptName = opt.optionNameSnapshot.trim();
        if (!opt.id.trim() || !trimmedOptName) {
          throw new RangeError('ID opsi dan nama snapshot opsi wajib diisi.');
        }
        assertNonNegativeIntegerRupiah(opt.unitPriceRupiah, 'unitPriceRupiah');
        assertPositiveInteger(opt.quantityPerPortion, 'quantityPerPortion');

        return {
          id: opt.id,
          optionId: opt.optionId,
          optionNameSnapshot: trimmedOptName,
          unitPriceRupiah: opt.unitPriceRupiah,
          quantityPerPortion: opt.quantityPerPortion,
        };
      });

      const optionsPerPortionTotal = options.reduce(
        (sum, opt) => sum + opt.unitPriceRupiah * opt.quantityPerPortion,
        0,
      );
      const unitTotalRupiah = item.baseUnitPriceRupiah + optionsPerPortionTotal;
      const lineTotalRupiah = unitTotalRupiah * item.quantity;

      assertNonNegativeIntegerRupiah(unitTotalRupiah, 'unitTotalRupiah');
      assertNonNegativeIntegerRupiah(lineTotalRupiah, 'lineTotalRupiah');

      return {
        id: item.id,
        productId: item.productId,
        productNameSnapshot: trimmedProductName,
        baseUnitPriceRupiah: item.baseUnitPriceRupiah,
        quantity: item.quantity,
        unitTotalRupiah,
        lineTotalRupiah,
        notes: item.notes?.trim() ? item.notes.trim() : null,
        options,
      };
    });

    const subtotalRupiah = validatedItems.reduce(
      (sum, item) => sum + item.lineTotalRupiah,
      0,
    );
    const grandTotalRupiah = subtotalRupiah;

    let paidAmountRupiah: number;
    let changeAmountRupiah: number;

    if (input.paymentMethod === 'QRIS') {
      if (input.qrisConfirmedManually !== true) {
        throw new RangeError(
          'Pembayaran QRIS wajib dikonfirmasi manual oleh kasir sebelum disimpan.',
        );
      }
      paidAmountRupiah = grandTotalRupiah;
      changeAmountRupiah = 0;
    } else {
      const cashReceived = input.paidAmountRupiah ?? -1;
      assertNonNegativeIntegerRupiah(cashReceived, 'paidAmountRupiah');
      if (cashReceived < grandTotalRupiah) {
        throw new RangeError(
          `Nominal bayar tunai (${String(cashReceived)}) kurang dari total (${String(grandTotalRupiah)}).`,
        );
      }
      paidAmountRupiah = cashReceived;
      changeAmountRupiah = cashReceived - grandTotalRupiah;
    }

    const isDiagnostic = input.namespace === 'DIAGNOSTIC_P1';
    const storedBusinessDate = isDiagnostic
      ? `DIAG-${wibBusinessDate}`
      : wibBusinessDate;
    const receiptPrefix = isDiagnostic ? 'DIAG-P1' : 'MM';

    return this.db.withTransaction(async (tx) => {
      // Idempotency check sesuai Blueprint §10.2
      const existing = await this.loadByIdWithExecutor(tx, input.id);
      if (existing) {
        return existing;
      }

      await tx.run(
        `INSERT INTO daily_counters (business_date, last_sequence)
         VALUES (?, 1)
         ON CONFLICT(business_date) DO UPDATE SET
           last_sequence = daily_counters.last_sequence + 1;`,
        [storedBusinessDate],
      );

      const counterRows = await tx.query<{ last_sequence: number }>(
        'SELECT last_sequence FROM daily_counters WHERE business_date = ?;',
        [storedBusinessDate],
      );
      const nextSequence = Number(counterRows[0]?.last_sequence ?? 0);
      assertPositiveInteger(nextSequence, 'dailySequence');

      const receiptNumber = formatReceiptNumber(
        wibBusinessDate,
        nextSequence,
        receiptPrefix,
      );

      await tx.run(
        `INSERT INTO transactions (
          id,
          receipt_number,
          daily_sequence,
          occurred_at_ms,
          business_date,
          status,
          payment_method,
          subtotal_rupiah,
          grand_total_rupiah,
          paid_amount_rupiah,
          change_amount_rupiah,
          void_reason,
          voided_at_ms,
          created_at_ms
        ) VALUES (?, ?, ?, ?, ?, 'PAID', ?, ?, ?, ?, ?, NULL, NULL, ?);`,
        [
          input.id,
          receiptNumber,
          nextSequence,
          input.occurredAtMs,
          storedBusinessDate,
          input.paymentMethod,
          subtotalRupiah,
          grandTotalRupiah,
          paidAmountRupiah,
          changeAmountRupiah,
          createdAtMs,
        ],
      );

      for (const item of validatedItems) {
        await tx.run(
          `INSERT INTO transaction_items (
            id,
            transaction_id,
            product_id,
            product_name_snapshot,
            base_unit_price_rupiah,
            quantity,
            unit_total_rupiah,
            line_total_rupiah,
            notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            item.id,
            input.id,
            item.productId,
            item.productNameSnapshot,
            item.baseUnitPriceRupiah,
            item.quantity,
            item.unitTotalRupiah,
            item.lineTotalRupiah,
            item.notes,
          ],
        );

        for (const opt of item.options) {
          await tx.run(
            `INSERT INTO transaction_item_options (
              id,
              transaction_item_id,
              option_id,
              option_name_snapshot,
              unit_price_rupiah,
              quantity_per_portion
            ) VALUES (?, ?, ?, ?, ?, ?);`,
            [
              opt.id,
              item.id,
              opt.optionId,
              opt.optionNameSnapshot,
              opt.unitPriceRupiah,
              opt.quantityPerPortion,
            ],
          );
        }
      }

      const saved = await this.loadByIdWithExecutor(tx, input.id);
      if (!saved) {
        throw new DatabaseError(
          'DB_TRANSACTION_FAILED',
          'Gagal membaca kembali transaksi yang baru disimpan.',
        );
      }
      return saved;
    });
  }

  async getById(id: string): Promise<SavedTransaction | null> {
    return this.loadByIdWithExecutor(this.db, id);
  }

  async voidTransaction(
    id: string,
    reason: string,
    voidedAtMs: number = Date.now(),
  ): Promise<SavedTransaction> {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new RangeError('Alasan pembatalan (VOID) wajib diisi.');
    }
    if (!Number.isSafeInteger(voidedAtMs)) {
      throw new RangeError('voidedAtMs harus berupa integer epoch milidetik.');
    }

    return this.db.withTransaction(async (tx) => {
      const existing = await this.loadByIdWithExecutor(tx, id);
      if (!existing) {
        throw new DatabaseError(
          'DB_QUERY_FAILED',
          'Transaksi tidak ditemukan untuk dibatalkan.',
        );
      }
      if (existing.status === 'VOID') {
        throw new DatabaseError(
          'DB_CONSTRAINT_FAILED',
          'Transaksi sudah berstatus VOID dan tidak dapat dibatalkan dua kali.',
        );
      }

      await tx.run(
        `UPDATE transactions
         SET status = 'VOID',
             void_reason = ?,
             voided_at_ms = ?
         WHERE id = ? AND status = 'PAID';`,
        [trimmedReason, voidedAtMs, id],
      );

      const updated = await this.loadByIdWithExecutor(tx, id);
      if (!updated) {
        throw new DatabaseError(
          'DB_TRANSACTION_FAILED',
          'Gagal memuat transaksi setelah status VOID disimpan.',
        );
      }
      return updated;
    });
  }

  async recordPrintAttemptBestEffort(input: {
    readonly id: string;
    readonly transactionId: string;
    readonly attemptedAtMs: number;
    readonly result: PrintAttemptResultStatus;
    readonly errorMessage?: string | null;
  }): Promise<boolean> {
    try {
      await this.db.run(
        `INSERT INTO print_attempts (
          id,
          transaction_id,
          attempted_at_ms,
          result,
          error_message
        ) VALUES (?, ?, ?, ?, ?);`,
        [
          input.id,
          input.transactionId,
          input.attemptedAtMs,
          input.result,
          input.errorMessage ?? null,
        ],
      );
      return true;
    } catch {
      // Sesuai Blueprint §9.3: kegagalan mencatat log print tidak boleh merusak transaksi PAID
      return false;
    }
  }

  async listPrintAttempts(
    transactionId: string,
  ): Promise<readonly PrintAttemptRecord[]> {
    const rows = await this.db.query<{
      id: string;
      transaction_id: string;
      attempted_at_ms: number;
      result: PrintAttemptResultStatus;
      error_message: string | null;
    }>(
      `SELECT id, transaction_id, attempted_at_ms, result, error_message
       FROM print_attempts
       WHERE transaction_id = ?
       ORDER BY attempted_at_ms DESC;`,
      [transactionId],
    );

    return rows.map((row) => ({
      id: row.id,
      transactionId: row.transaction_id,
      attemptedAtMs: Number(row.attempted_at_ms),
      result: row.result,
      errorMessage: row.error_message,
    }));
  }

  private async loadByIdWithExecutor(
    executor: SqlExecutor,
    id: string,
  ): Promise<SavedTransaction | null> {
    const headerRows = await executor.query<TransactionHeaderRow>(
      `SELECT
        id,
        receipt_number,
        daily_sequence,
        occurred_at_ms,
        business_date,
        status,
        payment_method,
        subtotal_rupiah,
        grand_total_rupiah,
        paid_amount_rupiah,
        change_amount_rupiah,
        void_reason,
        voided_at_ms,
        created_at_ms
       FROM transactions
       WHERE id = ?;`,
      [id],
    );

    const header = headerRows[0];
    if (!header) {
      return null;
    }

    const itemRows = await executor.query<TransactionItemRow>(
      `SELECT
        id,
        transaction_id,
        product_id,
        product_name_snapshot,
        base_unit_price_rupiah,
        quantity,
        unit_total_rupiah,
        line_total_rupiah,
        notes
       FROM transaction_items
       WHERE transaction_id = ?
       ORDER BY rowid ASC;`,
      [id],
    );

    const items: SavedTransactionItem[] = [];

    for (const itemRow of itemRows) {
      const optionRows = await executor.query<TransactionItemOptionRow>(
        `SELECT
          id,
          transaction_item_id,
          option_id,
          option_name_snapshot,
          unit_price_rupiah,
          quantity_per_portion
         FROM transaction_item_options
         WHERE transaction_item_id = ?
         ORDER BY rowid ASC;`,
        [itemRow.id],
      );

      const options: SavedTransactionItemOption[] = optionRows.map((opt) => ({
        id: opt.id,
        transactionItemId: opt.transaction_item_id,
        optionId: opt.option_id,
        optionNameSnapshot: opt.option_name_snapshot,
        unitPriceRupiah: Number(opt.unit_price_rupiah),
        quantityPerPortion: Number(opt.quantity_per_portion),
      }));

      items.push({
        id: itemRow.id,
        transactionId: itemRow.transaction_id,
        productId: itemRow.product_id,
        productNameSnapshot: itemRow.product_name_snapshot,
        baseUnitPriceRupiah: Number(itemRow.base_unit_price_rupiah),
        quantity: Number(itemRow.quantity),
        unitTotalRupiah: Number(itemRow.unit_total_rupiah),
        lineTotalRupiah: Number(itemRow.line_total_rupiah),
        notes: itemRow.notes,
        options,
      });
    }

    return {
      id: header.id,
      receiptNumber: header.receipt_number,
      dailySequence: Number(header.daily_sequence),
      occurredAtMs: Number(header.occurred_at_ms),
      businessDate: header.business_date,
      status: header.status,
      paymentMethod: header.payment_method,
      subtotalRupiah: Number(header.subtotal_rupiah),
      grandTotalRupiah: Number(header.grand_total_rupiah),
      paidAmountRupiah: Number(header.paid_amount_rupiah),
      changeAmountRupiah: Number(header.change_amount_rupiah),
      voidReason: header.void_reason,
      voidedAtMs:
        header.voided_at_ms === null ? null : Number(header.voided_at_ms),
      createdAtMs: Number(header.created_at_ms),
      items,
    };
  }
}

