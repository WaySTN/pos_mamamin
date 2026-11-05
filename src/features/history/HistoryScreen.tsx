import { useCallback, useEffect, useState } from 'react';
import { formatDateTimeWib } from '../../domain/dates';
import { formatRupiah } from '../../domain/money';
import type { SavedTransaction, TransactionStatus } from '../../domain/types';
import { defaultTransactionService } from '../../services/transactionService';
import { TransactionDetailModal } from './TransactionDetailModal';

type DateFilterOption = 'TODAY' | 'LAST_7_DAYS' | 'ALL';

export function HistoryScreen() {
  const [transactions, setTransactions] = useState<readonly SavedTransaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('TODAY');
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | 'ALL'>('ALL');
  const [searchReceipt, setSearchReceipt] = useState<string>('');
  const [selectedTx, setSelectedTx] = useState<SavedTransaction | null>(null);

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await defaultTransactionService.listTransactions({
        dateFilter,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        searchReceipt: searchReceipt.trim() || undefined,
      });
      setTransactions(list);
    } catch {
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }, [dateFilter, statusFilter, searchReceipt]);

  useEffect(() => {
    let isCancelled = false;
    defaultTransactionService
      .listTransactions({
        dateFilter,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        searchReceipt: searchReceipt.trim() || undefined,
      })
      .then((list) => {
        if (!isCancelled) {
          setTransactions(list);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setTransactions([]);
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [dateFilter, statusFilter, searchReceipt]);

  // Omzet dihitung HANYA dari transaksi PAID (mengecualikan VOID sesuai Blueprint §5)
  const paidTransactions = transactions.filter((tx) => tx.status === 'PAID');
  const totalOmzetRupiah = paidTransactions.reduce(
    (sum, tx) => sum + tx.grandTotalRupiah,
    0,
  );
  const voidCount = transactions.filter((tx) => tx.status === 'VOID').length;

  return (
    <div className="space-y-4 pb-20">
      {/* Header Screen */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Riwayat Transaksi Penjualan
            </h2>
            <p className="text-xs text-slate-500">
              Data transaksi tersimpan permanen di SQLite lokal HP
            </p>
          </div>
          <button
            type="button"
            onClick={fetchTransactions}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            🔄 Refresh
          </button>
        </div>

        {/* Ringkasan Omzet Bersih */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-3">
            <span className="text-[11px] font-semibold text-orange-900 block">
              Omzet Bersih (PAID)
            </span>
            <span className="font-mono text-base font-extrabold text-orange-950">
              {formatRupiah(totalOmzetRupiah)}
            </span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-[11px] font-semibold text-slate-600 block">
              Transaksi Berhasil
            </span>
            <span className="font-mono text-base font-bold text-slate-900">
              {paidTransactions.length}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-[11px] font-semibold text-slate-600 block">
              Dibatalkan (VOID)
            </span>
            <span className="font-mono text-base font-bold text-red-700">
              {voidCount}
            </span>
          </div>
        </div>

        {/* Filter Tab Waktu */}
        <div className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1 text-xs">
          <button
            type="button"
            onClick={() => setDateFilter('TODAY')}
            className={`flex-1 rounded-lg py-1.5 font-bold transition-all ${
              dateFilter === 'TODAY'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Hari Ini
          </button>
          <button
            type="button"
            onClick={() => setDateFilter('LAST_7_DAYS')}
            className={`flex-1 rounded-lg py-1.5 font-bold transition-all ${
              dateFilter === 'LAST_7_DAYS'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            7 Hari Terakhir
          </button>
          <button
            type="button"
            onClick={() => setDateFilter('ALL')}
            className={`flex-1 rounded-lg py-1.5 font-bold transition-all ${
              dateFilter === 'ALL'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua
          </button>
        </div>

        {/* Search & Status Filter */}
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={searchReceipt}
            onChange={(e) => setSearchReceipt(e.target.value)}
            placeholder="Cari nomor struk (misal: MM- atau 0001)..."
            className="flex-1 min-w-[200px] rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-900 focus:border-orange-600 focus:outline-none"
          />

          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`rounded-lg px-2.5 py-1.5 font-semibold ${
                statusFilter === 'ALL'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('PAID')}
              className={`rounded-lg px-2.5 py-1.5 font-semibold ${
                statusFilter === 'PAID'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-50 text-emerald-800'
              }`}
            >
              PAID
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('VOID')}
              className={`rounded-lg px-2.5 py-1.5 font-semibold ${
                statusFilter === 'VOID'
                  ? 'bg-red-700 text-white'
                  : 'bg-red-50 text-red-800'
              }`}
            >
              VOID
            </button>
          </div>
        </div>
      </section>

      {/* List Transaksi */}
      <section className="space-y-2">
        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
            Memuat transaksi dari SQLite native...
          </div>
        ) : transactions.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
            Belum ada transaksi pada filter yang dipilih.
          </div>
        ) : (
          transactions.map((tx) => {
            const isVoid = tx.status === 'VOID';
            const totalQty = tx.items.reduce((sum, item) => sum + item.quantity, 0);
            const itemsSummary = tx.items
              .slice(0, 2)
              .map((i) => `${String(i.quantity)}x ${i.productNameSnapshot}`)
              .join(', ');
            const extraItemsCount = tx.items.length > 2 ? tx.items.length - 2 : 0;

            return (
              <button
                key={tx.id}
                type="button"
                onClick={() => setSelectedTx(tx)}
                className={`w-full text-left rounded-xl border p-3.5 transition-all shadow-xs active:scale-[0.99] ${
                  isVoid
                    ? 'border-red-200 bg-red-50/40 hover:bg-red-50'
                    : 'border-slate-200 bg-white hover:border-orange-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-900 text-xs">
                      {tx.receiptNumber}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        isVoid
                          ? 'bg-red-100 text-red-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {tx.status}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      {tx.paymentMethod === 'CASH' ? 'TUNAI' : 'QRIS'}
                    </span>
                  </div>
                  <span
                    className={`font-mono text-sm font-bold ${
                      isVoid ? 'text-slate-400 line-through' : 'text-slate-900'
                    }`}
                  >
                    {formatRupiah(tx.grandTotalRupiah)}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span className="truncate max-w-[240px]">
                    {itemsSummary}
                    {extraItemsCount > 0 ? ` (+${String(extraItemsCount)} lainnya)` : ''}{' '}
                    • {totalQty} porsi
                  </span>
                  <span className="font-mono text-[11px] shrink-0">
                    {formatDateTimeWib(tx.occurredAtMs)}
                  </span>
                </div>

                {isVoid && tx.voidReason ? (
                  <p className="mt-1 text-[11px] text-red-700 font-medium">
                    Alasan Void: &quot;{tx.voidReason}&quot;
                  </p>
                ) : null}
              </button>
            );
          })
        )}
      </section>

      {/* Modal Detail Transaksi */}
      <TransactionDetailModal
        isOpen={Boolean(selectedTx)}
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        onTransactionUpdated={(updated) => {
          setSelectedTx(updated);
          fetchTransactions();
        }}
      />
    </div>
  );
}
