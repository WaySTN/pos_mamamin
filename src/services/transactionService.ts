import {
  prepareSaleItemsFromCart,
  validateCashPayment,
  validateQrisPayment,
} from '../domain/checkout';
import { calculateCartTotals } from '../domain/cart';
import type {
  CartLineItem,
  PaymentMethod,
  SavedTransaction,
  TransactionStatus,
} from '../domain/types';
import {
  TransactionRepository,
} from '../database/repositories/transactionRepository';
import { databaseService, type DatabaseService } from '../database/sqlite';
import {
  ReceiptService,
  type PrintTransactionOutcome,
  type ReceiptPreviewResult,
} from './printer/receiptService';
import { MockPrinterAdapter } from './printer/mockPrinterAdapter';

export interface CheckoutFromCartInput {
  readonly transactionId?: string;
  readonly items: readonly CartLineItem[];
  readonly paymentMethod: PaymentMethod;
  readonly paidAmountRupiah?: number;
  readonly qrisConfirmedManually?: boolean;
  readonly occurredAtMs?: number;
  readonly namespace?: 'PRODUCTION' | 'DIAGNOSTIC_P1';
}

export interface ListTransactionsServiceFilter {
  readonly dateFilter?: 'TODAY' | 'LAST_7_DAYS' | 'ALL';
  readonly specificBusinessDate?: string;
  readonly status?: TransactionStatus;
  readonly searchReceipt?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly includeDiagnostics?: boolean;
}

export class TransactionService {
  private readonly txRepo: TransactionRepository;
  private readonly receiptService: ReceiptService;
  private isProcessingCheckout = false;

  constructor(
    db: DatabaseService = databaseService,
    receiptService?: ReceiptService,
  ) {
    this.txRepo = new TransactionRepository(db);
    this.receiptService =
      receiptService ??
      new ReceiptService(db, new MockPrinterAdapter());
  }

  /**
   * Menjalankan proses checkout dari keranjang kasir ke SQLite:
   * 1. Perlindungan double-submit via memory-lock `isProcessingCheckout`.
   * 2. Validasi keranjang tidak kosong.
   * 3. Validasi aturan pembayaran (CASH vs QRIS).
   * 4. Pembuatan snapshot item & opsi beku.
   * 5. Eksekusi transaksi SQLite atomik via TransactionRepository.
   */
  async checkoutFromCart(input: CheckoutFromCartInput): Promise<SavedTransaction> {
    if (this.isProcessingCheckout) {
      throw new Error(
        'Transaksi sedang diproses. Mohon tunggu hingga proses selesai untuk mencegah transaksi ganda.',
      );
    }

    if (!input.items || input.items.length === 0) {
      throw new RangeError('Keranjang belanja kosong. Tidak dapat melakukan checkout.');
    }

    this.isProcessingCheckout = true;
    try {
      const totals = calculateCartTotals(input.items);
      const grandTotalRupiah = totals.grandTotalRupiah;

      let paidAmountRupiah: number;
      let qrisConfirmed = false;

      if (input.paymentMethod === 'CASH') {
        const cashTendered = input.paidAmountRupiah ?? 0;
        const validation = validateCashPayment(grandTotalRupiah, cashTendered);
        if (!validation.isValid) {
          throw new RangeError(
            validation.errorMessage ?? 'Nominal pembayaran tunai tidak mencukupi.',
          );
        }
        paidAmountRupiah = cashTendered;
      } else if (input.paymentMethod === 'QRIS') {
        const validation = validateQrisPayment(input.qrisConfirmedManually === true);
        if (!validation.isValid) {
          throw new RangeError(
            validation.errorMessage ??
              'Pembayaran QRIS wajib dikonfirmasi manual oleh kasir.',
          );
        }
        paidAmountRupiah = grandTotalRupiah;
        qrisConfirmed = true;
      } else {
        throw new RangeError(`Metode pembayaran tidak didukung: ${String(input.paymentMethod)}`);
      }

      const txId =
        input.transactionId?.trim() ||
        `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const occurredAtMs = input.occurredAtMs ?? Date.now();

      const saleItems = prepareSaleItemsFromCart(input.items, txId);

      const saved = await this.txRepo.createPaidSale({
        id: txId,
        occurredAtMs,
        paymentMethod: input.paymentMethod,
        paidAmountRupiah,
        qrisConfirmedManually: qrisConfirmed,
        items: saleItems,
        namespace: input.namespace ?? 'PRODUCTION',
      });

      return saved;
    } finally {
      this.isProcessingCheckout = false;
    }
  }

  async getTransactionById(id: string): Promise<SavedTransaction | null> {
    return this.txRepo.getById(id);
  }

  async listTransactions(
    filter: ListTransactionsServiceFilter = {},
  ): Promise<readonly SavedTransaction[]> {
    return this.txRepo.listTransactions(filter);
  }

  async voidTransaction(
    id: string,
    reason: string,
    voidedAtMs: number = Date.now(),
  ): Promise<SavedTransaction> {
    const trimmed = reason.trim();
    if (!trimmed) {
      throw new RangeError('Alasan pembatalan (VOID) wajib diisi.');
    }
    return this.txRepo.voidTransaction(id, trimmed, voidedAtMs);
  }

  async printReceipt(
    transactionId: string,
    options: { readonly isReprint?: boolean } = {},
  ): Promise<PrintTransactionOutcome> {
    return this.receiptService.printSavedTransaction(transactionId, {
      isReprint: options.isReprint ?? false,
    });
  }

  async getReceiptPreview(
    transactionId: string,
    options: { readonly isReprint?: boolean } = {},
  ): Promise<ReceiptPreviewResult> {
    return this.receiptService.buildReceiptPreview(transactionId, {
      isReprint: options.isReprint ?? false,
    });
  }
}

export const defaultTransactionService = new TransactionService();

