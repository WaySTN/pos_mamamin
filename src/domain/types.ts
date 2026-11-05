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
