import { useState } from 'react';
import { formatRupiah } from '../../domain/money';
import type { ExpenseRecord } from '../../domain/types';
import { ExpenseService } from '../../services/expenseService';

interface VoidExpenseModalProps {
  readonly expense: ExpenseRecord;
  readonly expenseService: ExpenseService;
  readonly onClose: () => void;
  readonly onExpenseVoided: (updated: ExpenseRecord) => void;
}

const PRESET_VOID_REASONS = [
  'Salah input nominal',
  'Nota dibatalkan / tidak jadi dibeli',
  'Salah pilih kategori',
  'Salah tanggal / duplikat pencatatan',
] as const;

export function VoidExpenseModal({
  expense,
  expenseService,
  onClose,
  onExpenseVoided,
}: VoidExpenseModalProps) {
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmed = reason.trim();
  const isValid = trimmed.length >= 3;

  const handleSelectPreset = (preset: string) => {
    setReason(preset);
  };

  const handleConfirmVoid = async () => {
    if (!isValid) {
      setErrorMessage('Alasan pembatalan (VOID) wajib diisi minimal 3 karakter.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const updated = await expenseService.voidExpense(expense.id, trimmed);
      onExpenseVoided(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membatalkan pengeluaran.';
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="void-expense-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-700">
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
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
            </span>
            <div>
              <h2
                id="void-expense-title"
                className="text-base font-bold text-slate-900"
              >
                Batalkan Pengeluaran Kas
              </h2>
              <p className="text-xs text-slate-500">
                Status akan diubah menjadi VOID
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {errorMessage}
            </div>
          )}

          {/* Ringkasan Pengeluaran */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900">
                {expense.category}
              </span>
              <span className="font-bold text-rose-700">
                {formatRupiah(expense.amountRupiah)}
              </span>
            </div>
            <p className="text-slate-600 leading-relaxed italic">
              "{expense.notes}"
            </p>
            <p className="text-[11px] text-slate-500">
              Tanggal Bisnis: {expense.businessDate}
            </p>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 leading-relaxed">
            <strong>Perhatian:</strong> Pembatalan pengeluaran bersifat permanen.
            Nominal {formatRupiah(expense.amountRupiah)} akan otomatis dikeluarkan
            dari total rekap pengeluaran operasional.
          </div>

          {/* Preset Alasan */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Pilih Alasan Cepat:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_VOID_REASONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    reason === preset
                      ? 'border-red-600 bg-red-50 text-red-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Alasan Input */}
          <div>
            <label
              htmlFor="void-reason-input"
              className="block text-xs font-semibold text-slate-700"
            >
              Alasan Pembatalan Lengkap *
            </label>
            <textarea
              id="void-reason-input"
              rows={2}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Jelaskan alasan pembatalan pengeluaran ini..."
              className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-xs text-slate-900 focus:border-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/20"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100"
            >
              Kembali
            </button>
            <button
              type="button"
              onClick={handleConfirmVoid}
              disabled={!isValid || isSubmitting}
              className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white shadow-md transition active:bg-red-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Memproses...' : 'Ya, Batalkan (Void)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
