import { useEffect, useState } from 'react';
import type { FormattedReceiptDocument } from '../../services/printer/receiptFormatter';
import { defaultTransactionService } from '../../services/transactionService';

interface ReceiptPreviewModalProps {
  readonly isOpen: boolean;
  readonly transactionId: string;
  readonly isReprint?: boolean;
  readonly onClose: () => void;
}

export function ReceiptPreviewModal({
  isOpen,
  transactionId,
  isReprint = false,
  onClose,
}: ReceiptPreviewModalProps) {
  const [document, setDocument] = useState<FormattedReceiptDocument | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [printFeedback, setPrintFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !transactionId) {
      return;
    }

    let isCancelled = false;

    defaultTransactionService
      .getReceiptPreview(transactionId, { isReprint })
      .then((res) => {
        if (!isCancelled) {
          setDocument(res.formatted);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setPrintFeedback(
            err instanceof Error ? err.message : 'Gagal memuat pratinjau struk.',
          );
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, transactionId, isReprint]);

  if (!isOpen) {
    return null;
  }

  const handleSimulatePrint = async () => {
    try {
      const outcome = await defaultTransactionService.printReceipt(transactionId, {
        isReprint,
      });
      setPrintFeedback(
        `[SIMULASI DEV] Struk ${outcome.transaction.receiptNumber} (${outcome.formatted.columns} kol) terkirim ke MockPrinterAdapter. Hasil: ${outcome.transmission.outcome}. (Printer Bluetooth Classic fisik masih menunggu unit hardware).`,
      );
    } catch (err) {
      setPrintFeedback(
        `Gagal cetak: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-preview-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="flex max-h-[92dvh] w-full max-w-sm flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 id="receipt-preview-title" className="text-sm font-bold text-slate-900">
              Pratinjau Struk Thermal 58 mm
            </h3>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
              Mock Dev
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-slate-100">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-xs text-slate-500">
              Memuat format struk...
            </div>
          ) : document ? (
            <div className="rounded-lg border border-slate-300 bg-white p-4 shadow-xs">
              <pre className="font-mono text-xs leading-tight text-slate-800 whitespace-pre overflow-x-auto select-all">
                {document.plainText}
              </pre>
            </div>
          ) : (
            <p className="text-center text-xs text-red-600">Dokumen struk tidak tersedia.</p>
          )}

          {printFeedback ? (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-[11px] leading-relaxed text-blue-900">
              {printFeedback}
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-200 bg-slate-50 p-3 flex gap-2">
          <button
            type="button"
            onClick={handleSimulatePrint}
            className="flex-1 min-h-10 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-900 active:bg-black"
          >
            🖨️ Simulasi Cetak Struk
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
