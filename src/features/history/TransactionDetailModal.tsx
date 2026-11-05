import { useState } from 'react';
import { formatDateTimeWib } from '../../domain/dates';
import { formatRupiah } from '../../domain/money';
import type { SavedTransaction } from '../../domain/types';
import { defaultTransactionService } from '../../services/transactionService';
import { ReceiptPreviewModal } from './ReceiptPreviewModal';
import { VoidConfirmationModal } from './VoidConfirmationModal';

interface TransactionDetailModalProps {
  readonly isOpen: boolean;
  readonly transaction: SavedTransaction | null;
  readonly onClose: () => void;
  readonly onTransactionUpdated: (updated: SavedTransaction) => void;
}

export function TransactionDetailModal({
  isOpen,
  transaction,
  onClose,
  onTransactionUpdated,
}: TransactionDetailModalProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  if (!isOpen || !transaction) {
    return null;
  }

  const isVoid = transaction.status === 'VOID';

  const handleReprint = async () => {
    setIsPrinting(true);
    setFeedback(null);
    try {
      const outcome = await defaultTransactionService.printReceipt(transaction.id, {
        isReprint: true,
      });
      setFeedback(
        `[SIMULASI DEV] Struk SALINAN ${outcome.transaction.receiptNumber} terkirim ke MockPrinterAdapter. Hasil: ${outcome.transmission.outcome}. (Printer Bluetooth Classic fisik masih menunggu perangkat pengujian).`,
      );
    } catch (err) {
      setFeedback(`Gagal cetak salinan: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-modal-title"
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      >
        <div className="flex max-h-[94dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 id="detail-modal-title" className="text-base font-bold text-slate-900">
                Detail Transaksi
              </h3>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  isVoid
                    ? 'bg-red-100 text-red-900'
                    : 'bg-emerald-100 text-emerald-900'
                }`}
              >
                {transaction.status}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Banner VOID jika sudah dibatalkan */}
            {isVoid ? (
              <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-950 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-red-900">
                  <span>🚫</span>
                  <span>TRANSAKSI INI TELAH DIBATALKAN (VOID)</span>
                </div>
                <p>
                  <strong>Alasan:</strong> {transaction.voidReason}
                </p>
                {transaction.voidedAtMs ? (
                  <p className="text-[11px] text-red-700">
                    Waktu Pembatalan: {formatDateTimeWib(transaction.voidedAtMs)}
                  </p>
                ) : null}
              </div>
            ) : null}

            {feedback ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-xs leading-relaxed text-blue-900">
                {feedback}
              </div>
            ) : null}

            {/* Metadata Ringkas */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <span className="text-slate-500 block">Nomor Struk</span>
                <span className="font-mono font-bold text-slate-900">
                  {transaction.receiptNumber}
                </span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <span className="text-slate-500 block">Tanggal Bisnis</span>
                <span className="font-mono font-bold text-slate-900">
                  {transaction.businessDate}
                </span>
              </div>
              <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <span className="text-slate-500 block">Waktu Transaksi (WIB)</span>
                <span className="font-semibold text-slate-900">
                  {formatDateTimeWib(transaction.occurredAtMs)}
                </span>
              </div>
            </div>

            {/* Rincian Item (Snapshot Tersimpan) */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
                Daftar Item &amp; Topping (Snapshot)
              </h4>
              <ul className="divide-y divide-slate-100 text-xs">
                {transaction.items.map((item) => (
                  <li key={item.id} className="py-2">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900">
                          {item.quantity}x {item.productNameSnapshot}
                        </span>
                        <span className="text-slate-500 ml-1.5 font-mono text-[11px]">
                          (@{formatRupiah(item.baseUnitPriceRupiah)})
                        </span>
                        {item.options.length > 0 ? (
                          <ul className="mt-1 space-y-0.5 pl-2 text-[11px] text-slate-600">
                            {item.options.map((opt) => (
                              <li key={opt.id}>
                                + {opt.quantityPerPortion}x {opt.optionNameSnapshot}{' '}
                                <span className="font-mono text-slate-400">
                                  (@{formatRupiah(opt.unitPriceRupiah)})
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {item.notes ? (
                          <p className="mt-1 text-[11px] italic text-slate-500">
                            Catatan: &quot;{item.notes}&quot;
                          </p>
                        ) : null}
                      </div>
                      <span className="font-mono font-bold text-slate-900 shrink-0">
                        {formatRupiah(item.lineTotalRupiah)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Rincian Pembayaran */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono">{formatRupiah(transaction.subtotalRupiah)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-900">
                <span>Grand Total</span>
                <span className="font-mono text-base text-orange-900">
                  {formatRupiah(transaction.grandTotalRupiah)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 border-t border-slate-200 pt-1.5">
                <span>Metode Pembayaran</span>
                <span className="font-semibold text-slate-900">
                  {transaction.paymentMethod === 'CASH' ? '💵 Tunai' : '📱 QRIS Manual'}
                </span>
              </div>
              {transaction.paymentMethod === 'CASH' ? (
                <>
                  <div className="flex justify-between text-slate-600">
                    <span>Uang Diterima</span>
                    <span className="font-mono">{formatRupiah(transaction.paidAmountRupiah)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-800">
                    <span>Kembalian</span>
                    <span className="font-mono">{formatRupiah(transaction.changeAmountRupiah)}</span>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="border-t border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isPrinting}
                onClick={handleReprint}
                className="min-h-11 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-900 active:bg-black disabled:opacity-50"
              >
                {isPrinting ? 'Mencetak...' : '🖨️ Cetak Ulang (Salinan)'}
              </button>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(true)}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                📄 Pratinjau Struk
              </button>
            </div>

            {/* Tombol Batalkan Transaksi (VOID) hanya jika masih PAID */}
            {!isVoid ? (
              <button
                type="button"
                onClick={() => setIsVoidModalOpen(true)}
                className="min-h-11 w-full rounded-xl border border-red-300 bg-red-50 py-2 text-xs font-bold text-red-700 hover:bg-red-100 active:bg-red-200"
              >
                ❌ Batalkan Transaksi Ini (VOID)
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <ReceiptPreviewModal
        isOpen={isPreviewOpen}
        transactionId={transaction.id}
        isReprint={true}
        onClose={() => setIsPreviewOpen(false)}
      />

      <VoidConfirmationModal
        isOpen={isVoidModalOpen}
        transaction={transaction}
        onClose={() => setIsVoidModalOpen(false)}
        onVoidSuccess={(updated) => {
          onTransactionUpdated(updated);
        }}
      />
    </>
  );
}
