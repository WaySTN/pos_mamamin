import { getBusinessDateWib } from './dates';

export const BACKUP_FORMAT_ID = 'mamamin-backup-v1' as const;
export const CURRENT_BACKUP_SCHEMA_VERSION = 1 as const;
export const BACKUP_APP_VERSION = '0.1.0' as const;

export interface CategoryBackupRow extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
  readonly sort_order: number;
  readonly is_active: number;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
}

export interface ProductBackupRow extends Record<string, unknown> {
  readonly id: string;
  readonly category_id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly pricing_mode: string;
  readonly base_price_rupiah: number;
  readonly is_active: number;
  readonly is_available: number;
  readonly sort_order: number;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
}

export interface OptionGroupBackupRow extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
  readonly min_selected: number;
  readonly max_selected: number | null;
  readonly sort_order: number;
  readonly is_active: number;
}

export interface OptionBackupRow extends Record<string, unknown> {
  readonly id: string;
  readonly group_id: string;
  readonly name: string;
  readonly unit_price_rupiah: number;
  readonly is_active: number;
  readonly sort_order: number;
}

export interface ProductOptionGroupBackupRow extends Record<string, unknown> {
  readonly product_id: string;
  readonly group_id: string;
}

export interface DailyCounterBackupRow extends Record<string, unknown> {
  readonly business_date: string;
  readonly last_sequence: number;
}

export interface TransactionBackupRow extends Record<string, unknown> {
  readonly id: string;
  readonly receipt_number: string;
  readonly daily_sequence: number;
  readonly occurred_at_ms: number;
  readonly business_date: string;
  readonly status: string;
  readonly payment_method: string;
  readonly subtotal_rupiah: number;
  readonly grand_total_rupiah: number;
  readonly paid_amount_rupiah: number;
  readonly change_amount_rupiah: number;
  readonly void_reason: string | null;
  readonly voided_at_ms: number | null;
  readonly created_at_ms: number;
}

export interface TransactionItemBackupRow extends Record<string, unknown> {
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

export interface TransactionItemOptionBackupRow extends Record<string, unknown> {
  readonly id: string;
  readonly transaction_item_id: string;
  readonly option_id: string | null;
  readonly option_name_snapshot: string;
  readonly unit_price_rupiah: number;
  readonly quantity_per_portion: number;
}

export interface ExpenseBackupRow extends Record<string, unknown> {
  readonly id: string;
  readonly occurred_at_ms: number;
  readonly business_date: string;
  readonly category: string;
  readonly amount_rupiah: number;
  readonly notes: string;
  readonly status: string;
  readonly void_reason: string | null;
  readonly voided_at_ms: number | null;
  readonly created_at_ms: number;
}

export interface PrintAttemptBackupRow extends Record<string, unknown> {
  readonly id: string;
  readonly transaction_id: string;
  readonly attempted_at_ms: number;
  readonly result: string;
  readonly error_message: string | null;
}

export interface SettingBackupRow extends Record<string, unknown> {
  readonly key: string;
  readonly value: string;
  readonly updated_at_ms: number;
}

export interface BackupTableData {
  readonly categories: readonly CategoryBackupRow[];
  readonly products: readonly ProductBackupRow[];
  readonly option_groups: readonly OptionGroupBackupRow[];
  readonly options: readonly OptionBackupRow[];
  readonly product_option_groups: readonly ProductOptionGroupBackupRow[];
  readonly daily_counters: readonly DailyCounterBackupRow[];
  readonly transactions: readonly TransactionBackupRow[];
  readonly transaction_items: readonly TransactionItemBackupRow[];
  readonly transaction_item_options: readonly TransactionItemOptionBackupRow[];
  readonly expenses: readonly ExpenseBackupRow[];
  readonly print_attempts: readonly PrintAttemptBackupRow[];
  readonly settings: readonly SettingBackupRow[];
}

export interface BackupRecordCounts {
  readonly categories: number;
  readonly products: number;
  readonly option_groups: number;
  readonly options: number;
  readonly product_option_groups: number;
  readonly daily_counters: number;
  readonly transactions: number;
  readonly transaction_items: number;
  readonly transaction_item_options: number;
  readonly expenses: number;
  readonly print_attempts: number;
  readonly settings: number;
}

export interface BackupMetadata {
  readonly format_id: typeof BACKUP_FORMAT_ID;
  readonly app_version: string;
  readonly schema_version: number;
  readonly exported_at_ms: number;
  readonly exported_at_wib: string;
  readonly business_date_wib: string;
  readonly timezone: 'Asia/Jakarta';
  readonly record_counts: BackupRecordCounts;
  readonly total_records: number;
  readonly sha256_checksum: string;
}

export interface MamaminBackupPayload {
  readonly metadata: BackupMetadata;
  readonly tables: BackupTableData;
}

export interface BackupInspectionPreview {
  readonly isValid: boolean;
  readonly errorMessage: string | null;
  readonly metadata: BackupMetadata | null;
  readonly summary: {
    readonly paidTransactionsCount: number;
    readonly voidTransactionsCount: number;
    readonly totalTransactionsCount: number;
    readonly totalPaidOmzetRupiah: number;
    readonly activeExpensesCount: number;
    readonly totalActiveExpensesRupiah: number;
    readonly categoriesCount: number;
    readonly productsCount: number;
    readonly totalRecords: number;
    readonly exportedAtWib: string;
  } | null;
}

/**
 * Menghitung checksum SHA-256 dari string payload secara aman.
 */
export async function computeSha256Hex(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Memformat timestamp ke string representasi WIB Asia/Jakarta
 * Contoh: "06/11/2026, 09.30.00 WIB"
 */
export function formatTimestampToWib(epochMs: number): string {
  const d = new Date(epochMs);
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
  return `${parts} WIB`;
}

/**
 * Menghasilkan nama file backup unik berbasis waktu WIB.
 * Contoh: "mamamin-backup-2026-11-06-0930.json"
 */
export function generateBackupFileName(occurredAtMs: number = Date.now()): string {
  const businessDate = getBusinessDateWib(occurredAtMs);
  const d = new Date(occurredAtMs);
  const hours = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    hour12: false,
  }).format(d).padStart(2, '0');
  const minutes = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    minute: '2-digit',
    hour12: false,
  }).format(d).padStart(2, '0');

  return `mamamin-backup-${businessDate}-${hours}${minutes}.json`;
}

/**
 * Menghitung jumlah record per tabel secara deterministik.
 */
export function calculateRecordCounts(tables: BackupTableData): BackupRecordCounts {
  return {
    categories: tables.categories.length,
    products: tables.products.length,
    option_groups: tables.option_groups.length,
    options: tables.options.length,
    product_option_groups: tables.product_option_groups.length,
    daily_counters: tables.daily_counters.length,
    transactions: tables.transactions.length,
    transaction_items: tables.transaction_items.length,
    transaction_item_options: tables.transaction_item_options.length,
    expenses: tables.expenses.length,
    print_attempts: tables.print_attempts.length,
    settings: tables.settings.length,
  };
}

/**
 * Menginspeksi dan memvalidasi string file backup JSON secara komprehensif.
 * Memeriksa format ID, schema version, keutuhan checksum SHA-256, dan konsistensi hitungan tabel.
 */
export async function inspectBackupContent(
  jsonString: string,
): Promise<BackupInspectionPreview> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return {
      isValid: false,
      errorMessage: 'Format file tidak valid (bukan JSON yang sah).',
      metadata: null,
      summary: null,
    };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      isValid: false,
      errorMessage: 'Isi file backup kosong atau tidak berstruktur objek.',
      metadata: null,
      summary: null,
    };
  }

  const file = parsed as Partial<MamaminBackupPayload>;
  if (!file.metadata || !file.tables) {
    return {
      isValid: false,
      errorMessage: 'File backup tidak memiliki bagian metadata atau data tabel.',
      metadata: null,
      summary: null,
    };
  }

  const { metadata, tables } = file;

  // 1. Validasi Format ID
  if (metadata.format_id !== BACKUP_FORMAT_ID) {
    return {
      isValid: false,
      errorMessage: `Format backup tidak dikenal: "${String(metadata.format_id)}". Hanya format "${BACKUP_FORMAT_ID}" yang didukung.`,
      metadata: null,
      summary: null,
    };
  }

  // 2. Validasi Schema Version
  if (metadata.schema_version !== CURRENT_BACKUP_SCHEMA_VERSION) {
    return {
      isValid: false,
      errorMessage: `Versi skema database backup (${String(metadata.schema_version)}) tidak cocok dengan versi aplikasi ini (${String(CURRENT_BACKUP_SCHEMA_VERSION)}).`,
      metadata: null,
      summary: null,
    };
  }

  // 3. Validasi Checksum SHA-256
  const computedChecksum = await computeSha256Hex(JSON.stringify(tables));
  if (computedChecksum.toLowerCase() !== (metadata.sha256_checksum ?? '').toLowerCase()) {
    return {
      isValid: false,
      errorMessage: 'Checksum integritas SHA-256 tidak cocok! File backup terindikasi rusak atau mengalami modifikasi/korupsi.',
      metadata: null,
      summary: null,
    };
  }

  // 4. Validasi Kelengkapan 12 Tabel
  const requiredTables: (keyof BackupTableData)[] = [
    'categories',
    'products',
    'option_groups',
    'options',
    'product_option_groups',
    'daily_counters',
    'transactions',
    'transaction_items',
    'transaction_item_options',
    'expenses',
    'print_attempts',
    'settings',
  ];

  for (const tbl of requiredTables) {
    if (!Array.isArray(tables[tbl])) {
      return {
        isValid: false,
        errorMessage: `Tabel "${tbl}" tidak ditemukan atau bukan berupa array data.`,
        metadata: null,
        summary: null,
      };
    }
  }

  // 5. Validasi Konsistensi Record Counts
  const counts = calculateRecordCounts(tables as BackupTableData);
  for (const tbl of requiredTables) {
    if (metadata.record_counts?.[tbl] !== counts[tbl]) {
      return {
        isValid: false,
        errorMessage: `Jumlah baris pada tabel "${tbl}" (${counts[tbl]}) tidak cocok dengan metadata (${metadata.record_counts?.[tbl]}).`,
        metadata: null,
        summary: null,
      };
    }
  }

  // 6. Buat Ringkasan Statistik untuk Konfirmasi User
  const fullTables = tables as BackupTableData;
  const paidTxs = fullTables.transactions.filter((tx) => tx.status === 'PAID');
  const voidTxs = fullTables.transactions.filter((tx) => tx.status === 'VOID');
  const totalPaidOmzet = paidTxs.reduce((sum, tx) => sum + (tx.grand_total_rupiah ?? 0), 0);

  const activeExpenses = fullTables.expenses.filter((e) => e.status === 'ACTIVE');
  const totalActiveExpenses = activeExpenses.reduce((sum, e) => sum + (e.amount_rupiah ?? 0), 0);

  const totalRecords = Object.values(counts).reduce((sum, c) => sum + c, 0);

  return {
    isValid: true,
    errorMessage: null,
    metadata: metadata as BackupMetadata,
    summary: {
      paidTransactionsCount: paidTxs.length,
      voidTransactionsCount: voidTxs.length,
      totalTransactionsCount: fullTables.transactions.length,
      totalPaidOmzetRupiah: totalPaidOmzet,
      activeExpensesCount: activeExpenses.length,
      totalActiveExpensesRupiah: totalActiveExpenses,
      categoriesCount: fullTables.categories.length,
      productsCount: fullTables.products.length,
      totalRecords,
      exportedAtWib: metadata.exported_at_wib ?? formatTimestampToWib(metadata.exported_at_ms),
    },
  };
}
