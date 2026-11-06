import { useState } from 'react';
import { getBusinessDateWib } from '../../domain/dates';
import { DEFAULT_EXPENSE_CATEGORIES } from '../../domain/expenses';
import { formatRupiah } from '../../domain/money';
import type { ExpenseRecord } from '../../domain/types';
import { ExpenseService } from '../../services/expenseService';

interface AddExpenseModalProps {
  readonly expenseService: ExpenseService;
  readonly defaultBusinessDate?: string;
  readonly onClose: () => void;
  readonly onExpenseCreated: (expense: ExpenseRecord) => void;
}

const QUICK_AMOUNT_SUGGESTIONS = [5_000, 10_000, 20_000, 50_000, 100_000];

export function AddExpenseModal({
  expenseService,
  defaultBusinessDate,
  onClose,
  onExpenseCreated,
}: AddExpenseModalProps) {
  const [businessDate, setBusinessDate] = useState<string>(
    () => defaultBusinessDate ?? getBusinessDateWib(Date.now()),
  );

  const [category, setCategory] = useState<string>(DEFAULT_EXPENSE_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsedAmount = Number.parseInt(amountStr.replace(/\D/g, ''), 10) || 0;
  const isCustomCategory = category === 'Lain-lain';
  const effectiveCategory = isCustomCategory && customCategory.trim()
    ? customCategory.trim()
    : category;

  const handleAmountChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      setAmountStr('');
      return;
    }
    const val = Number.parseInt(digits, 10);
    setAmountStr(val.toLocaleString('id-ID'));
  };

  const handleQuickAddAmount = (addAmount: number) => {
    const current = Number.parseInt(amountStr.replace(/\D/g, ''), 10) || 0;
    const newVal = current + addAmount;
    setAmountStr(newVal.toLocaleString('id-ID'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (parsedAmount <= 0) {
      setErrorMessage('Nominal pengeluaran harus lebih besar dari Rp0.');
      return;
    }

    if (notes.trim().length < 2) {
      setErrorMessage('Keterangan pengeluaran wajib diisi minimal 2 karakter.');
      return;
    }

    if (isCustomCategory && customCategory.trim().length < 2) {
      setErrorMessage('Nama kategori kustom wajib diisi minimal 2 karakter.');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await expenseService.createExpense({
        category: effectiveCategory,
        amountRupiah: parsedAmount,
        notes: notes.trim(),
        businessDate,
      });

      onExpenseCreated(created);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan pengeluaran.';
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-expense-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            </span>
            <div>
              <h2 id="add-expense-title" className="text-base font-bold text-slate-900">
                Catat Pengeluaran Kas Kecil
              </h2>
              <p className="text-xs text-slate-500">
                Catat pengeluaran tunai harian kedai
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Tutup"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMessage && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {errorMessage}
            </div>
          )}

          {/* Nominal Rupiah */}
          <div>
            <label
              htmlFor="amount-input"
              className="block text-xs font-semibold text-slate-700"
            >
              Nominal Pengeluaran (Rp) *
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-semibold text-slate-400">
                Rp
              </span>
              <input
                id="amount-input"
                type="text"
                inputMode="numeric"
                required
                value={amountStr}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-4 text-lg font-bold text-slate-900 placeholder-slate-300 focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </div>

            {/* Quick Suggestions */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_AMOUNT_SUGGESTIONS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleQuickAddAmount(amt)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  +{formatRupiah(amt).replace('Rp', '')}
                </button>
              ))}
              {parsedAmount > 0 && (
                <button
                  type="button"
                  onClick={() => setAmountStr('')}
                  className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-500 hover:bg-slate-200"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Kategori Pengeluaran */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Kategori Pengeluaran *
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DEFAULT_EXPENSE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`rounded-xl border p-2.5 text-left text-xs font-medium transition ${
                    category === cat
                      ? 'border-rose-600 bg-rose-50 text-rose-800 ring-2 ring-rose-500/20'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {isCustomCategory && (
              <div className="mt-2">
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Tuliskan nama kategori kustom..."
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs text-slate-900 focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>
            )}
          </div>

          {/* Keterangan */}
          <div>
            <label
              htmlFor="notes-input"
              className="block text-xs font-semibold text-slate-700"
            >
              Keterangan Pengeluaran *
            </label>
            <textarea
              id="notes-input"
              required
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Beli sawi hijau 2 ikat & bumbu seblak di pasar"
              className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-900 focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
          </div>

          {/* Tanggal Bisnis */}
          <div>
            <label
              htmlFor="business-date-input"
              className="block text-xs font-semibold text-slate-700"
            >
              Tanggal Pembelian (WIB) *
            </label>
            <input
              id="business-date-input"
              type="date"
              required
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs text-slate-900 focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Default adalah tanggal kasir hari ini.
            </p>
          </div>

          {/* Footer Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || parsedAmount <= 0}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-rose-700 px-4 py-3 text-sm font-semibold text-white shadow-md transition active:scale-[0.99] disabled:opacity-50"
            >
              {isSubmitting
                ? 'Menyimpan Pengeluaran...'
                : `Simpan Pengeluaran (${formatRupiah(parsedAmount)})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
