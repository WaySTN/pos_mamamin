import { useState } from 'react';
import {
  getQuickCashSuggestions,
  validateCashPayment,
  validateQrisPayment,
} from '../../domain/checkout';
import { formatPlainRupiahDigits, formatRupiah } from '../../domain/money';
import type { PaymentMethod, SavedTransaction } from '../../domain/types';
import { defaultTransactionService } from '../../services/transactionService';
import type { UseCartReturn } from './useCart';

interface CheckoutModalProps {
  readonly isOpen: boolean;
  readonly cartManager: UseCartReturn;
  readonly onClose: () => void;
  readonly onSuccess: (savedTransaction: SavedTransaction) => void;
}

export function CheckoutModal({
  isOpen,
  cartManager,
  onClose,
  onSuccess,
}: CheckoutModalProps) {
  const { cart } = cartManager;
  const grandTotal = cart.grandTotalRupiah;

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [cashTendered, setCashTendered] = useState<number>(() => grandTotal);
  const [customCashInput, setCustomCashInput] = useState<string>(() =>
    grandTotal > 0 ? String(grandTotal) : '',
  );
  const [isQrisConfirmed, setIsQrisConfirmed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const quickCashSuggestions = getQuickCashSuggestions(grandTotal);

  const cashValidation = validateCashPayment(grandTotal, cashTendered);
  const qrisValidation = validateQrisPayment(isQrisConfirmed);

  const isFormValid =
    paymentMethod === 'CASH'
      ? cashValidation.isValid
      : qrisValidation.isValid;

  const handleCustomCashChange = (valStr: string) => {
    // Only accept numeric digits
    const digitsOnly = valStr.replace(/\D/g, '');
    const num = digitsOnly ? parseInt(digitsOnly, 10) : 0;
    setCashTendered(num);
    setCustomCashInput(digitsOnly ? formatPlainRupiahDigits(num) : '');
    setErrorMessage(null);
  };

  const handleSelectQuickCash = (amount: number) => {
    setCashTendered(amount);
    setCustomCashInput(formatPlainRupiahDigits(amount));
    setErrorMessage(null);
  };

  const handleProcessCheckout = async () => {
    if (isSubmitting || !isFormValid) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const saved = await defaultTransactionService.checkoutFromCart({
        items: cart.items,
        paymentMethod,
        paidAmountRupiah: paymentMethod === 'CASH' ? cashTendered : grandTotal,
        qrisConfirmedManually: paymentMethod === 'QRIS' ? isQrisConfirmed : undefined,
      });

      onSuccess(saved);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Terjadi kegagalan saat menyimpan transaksi ke SQLite.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
    >
      <div className="flex max-h-[94dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 id="checkout-modal-title" className="text-base font-bold text-slate-900">
              Konfirmasi &amp; Pembayaran
            </h3>
            <p className="text-xs text-slate-500">
              {cart.totalQuantity} porsi • Total {formatRupiah(grandTotal)}
            </p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {errorMessage ? (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-900">
              <strong>Gagal Checkout:</strong> {errorMessage}
            </div>
          ) : null}

          {/* Rincian Singkat Pesanan */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Ringkasan Item
            </h4>
            <ul className="mt-2 divide-y divide-slate-200 text-xs">
              {cart.items.map((item) => (
                <li key={item.lineId} className="py-1.5 flex justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-900">
                      {item.quantity}x {item.productName}
                    </span>
                    {item.options.length > 0 ? (
                      <p className="text-[11px] text-slate-500">
                        {item.options
                          .map((o) => `+${String(o.quantityPerPortion)} ${o.optionName}`)
                          .join(', ')}
                      </p>
                    ) : null}
                    {item.notes ? (
                      <p className="text-[11px] italic text-slate-500">
                        &quot;{item.notes}&quot;
                      </p>
                    ) : null}
                  </div>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatRupiah(item.lineTotalRupiah)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2.5 border-t border-slate-200 pt-2 flex justify-between text-sm font-bold text-slate-900">
              <span>Total Tagihan</span>
              <span className="font-mono text-base text-orange-800">
                {formatRupiah(grandTotal)}
              </span>
            </div>
          </div>

          {/* Pilihan Metode Bayar */}
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block mb-2">
              Metode Pembayaran
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('CASH');
                  setCashTendered(grandTotal);
                  setCustomCashInput(formatPlainRupiahDigits(grandTotal));
                }}
                className={`min-h-12 rounded-xl border-2 px-3 py-2 text-center text-sm font-bold transition-all ${
                  paymentMethod === 'CASH'
                    ? 'border-orange-600 bg-orange-50 text-orange-950 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                💵 TUNAI (CASH)
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('QRIS');
                  setIsQrisConfirmed(false);
                }}
                className={`min-h-12 rounded-xl border-2 px-3 py-2 text-center text-sm font-bold transition-all ${
                  paymentMethod === 'QRIS'
                    ? 'border-orange-600 bg-orange-50 text-orange-950 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                📱 QRIS MANUAL
              </button>
            </div>
          </div>

          {/* Mode CASH */}
          {paymentMethod === 'CASH' ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <div>
                <label
                  htmlFor="cash-tendered-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Uang Diterima dari Pelanggan (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-sm font-bold text-slate-400">
                    Rp
                  </span>
                  <input
                    id="cash-tendered-input"
                    type="text"
                    inputMode="numeric"
                    value={customCashInput}
                    onChange={(e) => handleCustomCashChange(e.target.value)}
                    placeholder="0"
                    className="min-h-11 w-full rounded-xl border border-slate-300 pl-10 pr-3 py-2 font-mono text-base font-bold text-slate-900 focus:border-orange-600 focus:outline-none focus:ring-1 focus:ring-orange-600"
                  />
                </div>
              </div>

              {/* Tombol Pecahan Cepat */}
              <div>
                <span className="text-[11px] font-semibold text-slate-500 mb-1.5 block">
                  Pecahan Cepat:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {quickCashSuggestions.map((amount) => {
                    const isExact = amount === grandTotal;
                    const isSelected = cashTendered === amount;
                    return (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => handleSelectQuickCash(amount)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                          isSelected
                            ? 'bg-orange-700 text-white'
                            : isExact
                              ? 'bg-amber-100 text-amber-950 hover:bg-amber-200 border border-amber-300'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200'
                        }`}
                      >
                        {isExact ? `Uang Pas (Rp${formatPlainRupiahDigits(amount)})` : `Rp${formatPlainRupiahDigits(amount)}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status Kembalian */}
              {cashValidation.isValid ? (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-center">
                  <span className="text-xs text-emerald-800 font-medium block">
                    Uang Kembalian
                  </span>
                  <span className="font-mono text-lg font-extrabold text-emerald-900">
                    {formatRupiah(cashValidation.changeRupiah)}
                  </span>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{cashValidation.errorMessage}</span>
                </div>
              )}
            </div>
          ) : null}

          {/* Mode QRIS MANUAL */}
          {paymentMethod === 'QRIS' ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-950">
                <p className="font-bold">Instruksi Kasir — QRIS Manual:</p>
                <p className="mt-1">
                  1. Arahkan pelanggan memindai stiker / kode QRIS kedai.<br />
                  2. Minta pelanggan menunjukkan bukti pembayaran berhasil.<br />
                  3. <strong>Wajib periksa notifikasi</strong> di perangkat/alat kasir kedai sebelum menyelesaikan transaksi.
                </p>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isQrisConfirmed}
                  onChange={(e) => setIsQrisConfirmed(e.target.checked)}
                  className="mt-0.5 h-5 w-5 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-xs font-semibold text-slate-800 leading-snug">
                  Saya telah memeriksa notifikasi &amp; memastikan dana QRIS sebesar{' '}
                  <strong className="text-orange-900">{formatRupiah(grandTotal)}</strong>{' '}
                  telah berhasil masuk ke rekening kedai.
                </span>
              </label>
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-200 bg-slate-50 p-3 space-y-2">
          <button
            type="button"
            disabled={!isFormValid || isSubmitting}
            onClick={handleProcessCheckout}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-bold text-white shadow-md active:bg-orange-800 disabled:bg-slate-300 disabled:shadow-none transition-all"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Menyimpan Transaksi ke SQLite...
              </span>
            ) : (
              `Konfirmasi Pembayaran (${formatRupiah(grandTotal)})`
            )}
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="min-h-10 w-full rounded-xl border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Kembali ke Keranjang
          </button>
        </div>
      </div>
    </div>
  );
}

