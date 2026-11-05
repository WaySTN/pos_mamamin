import { useState } from 'react';
import { formatRupiah } from '../../domain/money';
import type { SavedTransaction } from '../../domain/types';
import { defaultTransactionService } from '../../services/transactionService';
import { ReceiptPreviewModal } from '../history/ReceiptPreviewModal';

interface TransactionSuccessModalProps {
  readonly transaction: SavedTransaction | null;
  readonly onNewTransaction: () => void;
}

export function TransactionSuccessModal({
  transaction,
  onNewTransaction,
}: TransactionSuccessModalProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  if (!transaction) {
    return null;
  }

  const handlePrint = async () => {
    setIsPrinting(true);
    setPrintStatus(null);
    try {
      const outcome = await defaultTransactionService.printReceipt(transaction.id);
      setPrintStatus(
        `[SIMULASI DEV] Berhasil dikirim ke MockPrinterAdapter. Status transmisi: ${outcome.transmission.outcome}. Catatan: Printer Bluetooth Classic fisik masih menunggu perangkat uji.`,
      );
    } catch (err) {
      setPrintStatus(
        `Gagal cetak: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="success-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      >
        <div className="flex w-full max-w-sm flex-col rounded-2xl bg-white p-5 shadow-2xl text-center">
          {/* Success Checkmark */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-2xl font-bold">
            ✓
          </div>

          <h3 id="success-modal-title" className="mt-3 text-lg font-bold text-slate-900">
            Transaksi Berhasil Disimpan!
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Disimpan permanen di SQLite native lokal HP
          </p>

          {/* Receipt Info Card */}
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Nomor Struk</span>
              <span className="font-mono font-bold text-slate-900">
                {transaction.receiptNumber}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Total Belanja</span>
              <span className="font-mono font-bold text-orange-900 text-sm">
                {formatRupiah(transaction.grandTotalRupiah)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Metode Bayar</span>
              <span className="font-semibold text-slate-900">
                {transaction.paymentMethod === 'CASH' ? '💵 Tunai' : '📱 QRIS Manual'}
              </span>
            </div>
            {transaction.paymentMethod === 'CASH' ? (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Uang Diterima</span>
                  <span className="font-mono text-slate-900">
                    {formatRupiah(transaction.paidAmountRupiah)}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-200 pt-1.5 font-bold">
                  <span className="text-emerald-800">Kembalian</span>
                  <span className="font-mono text-emerald-800 text-sm">
                    {formatRupiah(transaction.changeAmountRupiah)}
                  </span>
                </div>
              </>
            ) : null}
          </div>

          {printStatus ? (
            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-[11px] leading-relaxed text-blue-900 text-left">
              {printStatus}
            </div>
          ) : null}

          {/* Actions */}
          <div className="mt-5 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isPrinting}
                onClick={handlePrint}
                className="flex min-h-11 items-center justify-center rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-900 active:bg-black disabled:opacity-50"
              >
                {isPrinting ? 'Mencetak...' : '🖨️ Cetak Struk'}
              </button>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(true)}
                className="flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                📄 Pratinjau 58mm
              </button>
            </div>

            <button
              type="button"
              onClick={onNewTransaction}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-bold text-white shadow-md active:bg-orange-800"
            >
              + Transaksi Baru
            </button>
          </div>
        </div>
      </div>

      <ReceiptPreviewModal
        isOpen={isPreviewOpen}
        transactionId={transaction.id}
        onClose={() => setIsPreviewOpen(false)}
      />
    </>
  );
}
