import { useState } from 'react';
import { formatRupiah } from '../../domain/money';
import type { SavedTransaction } from '../../domain/types';
import { defaultTransactionService } from '../../services/transactionService';

interface VoidConfirmationModalProps {
  readonly isOpen: boolean;
  readonly transaction: SavedTransaction | null;
  readonly onClose: () => void;
  readonly onVoidSuccess: (updated: SavedTransaction) => void;
}

const PRESET_REASONS = [
  'Salah input menu / topping',
  'Pelanggan membatalkan pesanan',
  'Pembayaran keliru / bermasalah',
  'Salah pilih metode pembayaran',
] as const;

export function VoidConfirmationModal({
  isOpen,
  transaction,
  onClose,
  onVoidSuccess,
}: VoidConfirmationModalProps) {
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !transaction) {
    return null;
  }

  const trimmedReason = reason.trim();
  const isValid = trimmedReason.length >= 3;

  const handleConfirmVoid = async () => {
    if (!isValid || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const updated = await defaultTransactionService.voidTransaction(
        transaction.id,
        trimmedReason,
      );
      onVoidSuccess(updated);
      onClose();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal membatalkan transaksi di SQLite.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="void-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="flex w-full max-w-sm flex-col rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center gap-2 text-red-700">
          <span className="text-xl">⚠️</span>
          <h3 id="void-modal-title" className="text-base font-bold text-slate-900">
            Batalkan Transaksi (VOID)
          </h3>
        </div>

        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-950">
          <p className="font-bold">Peringatan Penting:</p>
          <p className="mt-1">
            Pembatalan bersifat permanen. Transaksi nomor{' '}
            <strong className="font-mono">{transaction.receiptNumber}</strong> (
            {formatRupiah(transaction.grandTotalRupiah)}) akan berstatus{' '}
            <strong>VOID</strong> dan otomatis dikeluarkan dari total omzet penjualan.
          </p>
        </div>

        {errorMessage ? (
          <div className="mt-2 rounded-lg border border-red-300 bg-red-100 p-2 text-xs text-red-900">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-3">
          <label
            htmlFor="void-reason-input"
            className="block text-xs font-semibold text-slate-700 mb-1"
          >
            Alasan Pembatalan (Wajib diisi):
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {PRESET_REASONS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReason(preset)}
                className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${
                  reason === preset
                    ? 'border-red-600 bg-red-50 text-red-900'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          <textarea
            id="void-reason-input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Tulis alasan pembatalan transaksi..."
            className="w-full rounded-xl border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
          />
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={!isValid || isSubmitting}
            onClick={handleConfirmVoid}
            className="flex-1 min-h-11 rounded-xl bg-red-700 px-3 py-2 text-xs font-bold text-white hover:bg-red-800 active:bg-red-900 disabled:bg-slate-300"
          >
            {isSubmitting ? 'Memproses...' : 'Ya, Batalkan Transaksi'}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Kembali
          </button>
        </div>
      </div>
    </div>
  );
}

