import { SettingsRepository } from '../../database/repositories/settingsRepository';
import { TransactionRepository } from '../../database/repositories/transactionRepository';
import type { DatabaseService } from '../../database/sqlite';
import { DatabaseError } from '../../database/types';
import type {
  PrintAttemptResultStatus,
  SavedTransaction,
} from '../../domain/types';
import type {
  PrintExecutionResult,
  PrinterAdapter,
} from './printerAdapter';
import {
  DEFAULT_58MM_CHAR_COLUMNS,
  formatPrinterTestPage,
  formatTransactionReceipt,
  type FormattedReceiptDocument,
} from './receiptFormatter';

export interface ReceiptPreviewResult {
  readonly transaction: SavedTransaction;
  readonly formatted: FormattedReceiptDocument;
}

export interface PrintTransactionOptions {
  readonly isReprint?: boolean;
  readonly columns?: number;
  readonly nowMs?: number;
}

export interface PrintTransactionOutcome {
  readonly transaction: SavedTransaction;
  readonly formatted: FormattedReceiptDocument;
  readonly transmission: PrintExecutionResult;
  readonly auditLogged: boolean;
}

/**
 * Layanan orkestrasi struk: membaca `SavedTransaction` yang sudah tersimpan
 * di SQLite, memformat struk 58 mm, memanggil `PrinterAdapter`, dan mencatat
 * log percobaan cetak secara best-effort tanpa pernah menduplikasi transaksi.
 */
export class ReceiptService {
  private readonly txRepo: TransactionRepository;
  private readonly settingsRepo: SettingsRepository;
  private readonly printerAdapter: PrinterAdapter;

  constructor(db: DatabaseService, printerAdapter: PrinterAdapter) {
    this.txRepo = new TransactionRepository(db);
    this.settingsRepo = new SettingsRepository(db);
    this.printerAdapter = printerAdapter;
  }

  getPrinterAdapter(): PrinterAdapter {
    return this.printerAdapter;
  }

  async buildReceiptPreview(
    transactionId: string,
    options: { readonly isReprint?: boolean; readonly columns?: number } = {},
  ): Promise<ReceiptPreviewResult> {
    const transaction = await this.txRepo.getById(transactionId);
    if (!transaction) {
      throw new DatabaseError(
        'DB_QUERY_FAILED',
        `Transaksi ${transactionId} tidak ditemukan di SQLite untuk preview struk.`,
      );
    }

    const store = await this.settingsRepo.getStoreIdentity();
    const formatted = formatTransactionReceipt(transaction, {
      store,
      isReprint: options.isReprint,
      columns: options.columns ?? DEFAULT_58MM_CHAR_COLUMNS,
    });

    return {
      transaction,
      formatted,
    };
  }

  async printSavedTransaction(
    transactionId: string,
    options: PrintTransactionOptions = {},
  ): Promise<PrintTransactionOutcome> {
    const preview = await this.buildReceiptPreview(transactionId, {
      isReprint: options.isReprint,
      columns: options.columns,
    });

    const transmission = await this.printerAdapter.sendRawPayload({
      jobKind: 'TRANSACTION_RECEIPT',
      referenceNumber: preview.transaction.receiptNumber,
      paperWidthMm: 58,
      characterColumns: preview.formatted.columns,
      plainTextPreview: preview.formatted.plainText,
      escPosBytes: preview.formatted.escPosBytes,
    });

    const nowMs = options.nowMs ?? transmission.attemptedAtMs;
    const mappedAuditStatus: PrintAttemptResultStatus = transmission.isSimulated
      ? transmission.outcome === 'FAILED'
        ? 'FAILED'
        : 'UNKNOWN'
      : transmission.outcome;

    const auditNote = transmission.isSimulated
      ? `[MOCK_DEV] ${transmission.userMessage}`
      : transmission.errorCode
        ? `${transmission.errorCode}: ${transmission.userMessage}`
        : null;

    const attemptId = `${preview.transaction.id}_prt_${String(nowMs)}_${Math.random().toString(36).slice(2, 7)}`;
    const auditLogged = await this.txRepo.recordPrintAttemptBestEffort({
      id: attemptId,
      transactionId: preview.transaction.id,
      attemptedAtMs: nowMs,
      result: mappedAuditStatus,
      errorMessage: auditNote,
    });

    return {
      transaction: preview.transaction,
      formatted: preview.formatted,
      transmission,
      auditLogged,
    };
  }

  /**
   * Menjalankan Cetak Uji 58 mm tanpa membuat atau mengubah data transaksi penjualan.
   */
  async printTestPage(nowMs: number = Date.now()): Promise<{
    readonly formatted: FormattedReceiptDocument;
    readonly transmission: PrintExecutionResult;
  }> {
    const store = await this.settingsRepo.getStoreIdentity();
    const formatted = formatPrinterTestPage(
      store,
      nowMs,
      DEFAULT_58MM_CHAR_COLUMNS,
    );

    const transmission = await this.printerAdapter.sendRawPayload({
      jobKind: 'TEST_PAGE',
      referenceNumber: null,
      paperWidthMm: 58,
      characterColumns: formatted.columns,
      plainTextPreview: formatted.plainText,
      escPosBytes: formatted.escPosBytes,
    });

    return {
      formatted,
      transmission,
    };
  }
}

