import { assertValidBusinessDate } from './dates';
import { assertPositiveInteger } from './money';
import type { ExpenseRecord, ExpenseStatus } from './types';

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Bahan Baku & Pasar',
  'Gas & Minyak Goreng',
  'Kemasan & Kantong Plastik',
  'Es Batu & Air Minum',
  'Kebersihan & Operasional',
  'Lain-lain',
] as const;

export interface CreateExpenseInput {
  readonly id?: string;
  readonly category: string;
  readonly amountRupiah: number;
  readonly notes: string;
  readonly businessDate: string;
  readonly occurredAtMs?: number;
  readonly createdAtMs?: number;
}

export interface ValidatedExpensePayload {
  readonly id: string;
  readonly category: string;
  readonly amountRupiah: number;
  readonly notes: string;
  readonly businessDate: string;
  readonly occurredAtMs: number;
  readonly createdAtMs: number;
  readonly status: ExpenseStatus;
  readonly voidReason: null;
  readonly voidedAtMs: null;
}

export function validateExpenseInput(
  input: CreateExpenseInput,
): ValidatedExpensePayload {
  const trimmedCategory = input.category.trim();
  if (trimmedCategory.length < 2) {
    throw new RangeError('Kategori pengeluaran wajib diisi (minimal 2 karakter).');
  }

  assertPositiveInteger(input.amountRupiah, 'amountRupiah');

  const trimmedNotes = input.notes.trim();
  if (trimmedNotes.length < 2) {
    throw new RangeError('Keterangan pengeluaran wajib diisi (minimal 2 karakter).');
  }

  assertValidBusinessDate(input.businessDate);

  const now = Date.now();
  const occurredAtMs = input.occurredAtMs ?? now;
  if (!Number.isSafeInteger(occurredAtMs) || occurredAtMs <= 0) {
    throw new RangeError('occurredAtMs harus berupa integer epoch milidetik valid.');
  }

  const createdAtMs = input.createdAtMs ?? now;
  if (!Number.isSafeInteger(createdAtMs) || createdAtMs <= 0) {
    throw new RangeError('createdAtMs harus berupa integer epoch milidetik valid.');
  }

  const id = input.id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `exp_${occurredAtMs}_${Math.random().toString(36).slice(2, 9)}`);

  return {
    id,
    category: trimmedCategory,
    amountRupiah: input.amountRupiah,
    notes: trimmedNotes,
    businessDate: input.businessDate,
    occurredAtMs,
    createdAtMs,
    status: 'ACTIVE',
    voidReason: null,
    voidedAtMs: null,
  };
}

export function validateVoidExpenseReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    throw new RangeError('Alasan pembatalan (VOID) pengeluaran wajib diisi minimal 3 karakter.');
  }
  return trimmed;
}

export function calculateTotalActiveExpenses(
  expenses: readonly ExpenseRecord[],
): number {
  return expenses
    .filter((e) => e.status === 'ACTIVE')
    .reduce((sum, e) => sum + e.amountRupiah, 0);
}
