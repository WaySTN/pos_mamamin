export type AppRouteId = 'cashier' | 'transactions' | 'reports' | 'more';

export type ReadinessStatus = 'ready' | 'planned' | 'unverified' | 'error';

export interface RuntimeEnvironmentInfo {
  readonly appName: string;
  readonly appId: string;
  readonly appVersion: string;
  readonly platform: string;
  readonly isNativePlatform: boolean;
  readonly timezone: 'Asia/Jakarta';
}

export type PricingMode = 'FIXED' | 'BASE_PLUS_OPTIONS';

export type TransactionStatus = 'PAID' | 'VOID';

export type PaymentMethod = 'CASH' | 'QRIS';

export type PrintAttemptResultStatus = 'SENT_TO_DEVICE' | 'FAILED' | 'UNKNOWN';

/* --- Master Menu & Modifier Domain Models --- */

export interface Category {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly productCount?: number;
}

export interface ProductOption {
  readonly id: string;
  readonly groupId: string;
  readonly name: string;
  readonly unitPriceRupiah: number;
  readonly isActive: boolean;
  readonly sortOrder: number;
}

export interface OptionGroup {
  readonly id: string;
  readonly name: string;
  readonly minSelected: number;
  readonly maxSelected: number | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly options: readonly ProductOption[];
}

export interface Product {
  readonly id: string;
  readonly categoryId: string;
  readonly name: string;
  readonly sku: string | null;
  readonly pricingMode: PricingMode;
  readonly basePriceRupiah: number;
  readonly isActive: boolean;
  readonly isAvailable: boolean;
  readonly sortOrder: number;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export interface ProductWithDetails extends Product {
  readonly categoryName: string;
  readonly optionGroups: readonly OptionGroup[];
}

/* --- Cart Domain Models --- */

export interface SelectedOptionInput {
  readonly optionId: string;
  readonly optionName: string;
  readonly unitPriceRupiah: number;
  readonly quantityPerPortion: number;
}

export interface CartLineItem {
  readonly lineId: string;
  readonly productId: string;
  readonly productName: string;
  readonly baseUnitPriceRupiah: number;
  readonly quantity: number;
  readonly options: readonly SelectedOptionInput[];
  readonly unitTotalRupiah: number;
  readonly lineTotalRupiah: number;
  readonly notes: string | null;
}

export interface CartDraft {
  readonly items: readonly CartLineItem[];
  readonly totalQuantity: number;
  readonly subtotalRupiah: number;
  readonly grandTotalRupiah: number;
}

/* --- Transaction & Snapshot Domain Models --- */

export interface SavedTransactionItemOption {
  readonly id: string;
  readonly transactionItemId: string;
  readonly optionId: string | null;
  readonly optionNameSnapshot: string;
  readonly unitPriceRupiah: number;
  readonly quantityPerPortion: number;
}

export interface SavedTransactionItem {
  readonly id: string;
  readonly transactionId: string;
  readonly productId: string | null;
  readonly productNameSnapshot: string;
  readonly baseUnitPriceRupiah: number;
  readonly quantity: number;
  readonly unitTotalRupiah: number;
  readonly lineTotalRupiah: number;
  readonly notes: string | null;
  readonly options: readonly SavedTransactionItemOption[];
}

export interface SavedTransaction {
  readonly id: string;
  readonly receiptNumber: string;
  readonly dailySequence: number;
  readonly occurredAtMs: number;
  readonly businessDate: string;
  readonly status: TransactionStatus;
  readonly paymentMethod: PaymentMethod;
  readonly subtotalRupiah: number;
  readonly grandTotalRupiah: number;
  readonly paidAmountRupiah: number;
  readonly changeAmountRupiah: number;
  readonly voidReason: string | null;
  readonly voidedAtMs: number | null;
  readonly createdAtMs: number;
  readonly items: readonly SavedTransactionItem[];
}

export interface PrintAttemptRecord {
  readonly id: string;
  readonly transactionId: string;
  readonly attemptedAtMs: number;
  readonly result: PrintAttemptResultStatus;
  readonly errorMessage: string | null;
}

export interface StoreIdentitySettings {
  readonly storeName: string;
  readonly storeAddress: string | null;
  readonly footerNote: string;
}

/* --- Expense Domain Models (P4) --- */

export type ExpenseStatus = 'ACTIVE' | 'VOID';

export interface ExpenseRecord {
  readonly id: string;
  readonly occurredAtMs: number;
  readonly businessDate: string;
  readonly category: string;
  readonly amountRupiah: number;
  readonly notes: string;
  readonly status: ExpenseStatus;
  readonly voidReason: string | null;
  readonly voidedAtMs: number | null;
  readonly createdAtMs: number;
}

export interface CategoryExpenseSummary {
  readonly category: string;
  readonly count: number;
  readonly totalAmountRupiah: number;
}

/* --- Sales & Financial Report Models (P4) --- */

export type ReportPeriodType =
  | 'TODAY'
  | 'YESTERDAY'
  | 'LAST_7_DAYS'
  | 'THIS_MONTH'
  | 'CUSTOM';

export interface ReportDateRange {
  readonly startDate: string;
  readonly endDate: string;
  readonly label: string;
}

export interface SalesReportSummary {
  readonly periodLabel: string;
  readonly startDate: string;
  readonly endDate: string;

  // Penjualan (PAID only)
  readonly totalGrossOmzetRupiah: number;
  readonly paidTransactionCount: number;
  readonly voidTransactionCount: number;

  // Metode Pembayaran
  readonly cashRevenueRupiah: number;
  readonly cashTransactionCount: number;
  readonly qrisRevenueRupiah: number;
  readonly qrisTransactionCount: number;

  // Pengeluaran Kas Kecil (ACTIVE only)
  readonly activeExpenseTotalRupiah: number;
  readonly activeExpenseCount: number;
  readonly voidExpenseCount: number;

  // Selisih Sederhana Kas Operasional (Omzet - Pengeluaran)
  readonly netOperatingCashRupiah: number;

  // Estimasi Kas Tunai Laci (Uang Tunai Masuk - Pengeluaran Tunai)
  readonly estimatedCashDrawerRupiah: number;
}

export interface TopProductSummary {
  readonly productName: string;
  readonly totalQuantity: number;
  readonly totalSalesRupiah: number;
}

export interface TopOptionSummary {
  readonly optionName: string;
  readonly totalQuantity: number;
  readonly totalSalesRupiah: number;
}

export interface DailyReportRow {
  readonly businessDate: string;
  readonly paidTransactionsCount: number;
  readonly omzetRupiah: number;
  readonly cashRupiah: number;
  readonly qrisRupiah: number;
  readonly expenseRupiah: number;
  readonly netCashRupiah: number;
}

