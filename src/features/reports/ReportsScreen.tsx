import { useEffect, useState } from 'react';
import { databaseService } from '../../database/sqlite';
import { formatDateTimeWib, getBusinessDateWib } from '../../domain/dates';
import { formatRupiah, formatSignedRupiah } from '../../domain/money';
import type {
  ExpenseRecord,
  ExpenseStatus,
  ReportPeriodType,
} from '../../domain/types';
import { ExpenseService } from '../../services/expenseService';
import { type FullReportData, ReportService } from '../../services/reportService';
import { AddExpenseModal } from './AddExpenseModal';
import { ExportReportModal } from './ExportReportModal';
import { VoidExpenseModal } from './VoidExpenseModal';

type ReportSubTab = 'summary' | 'top_products' | 'expenses';

export function ReportsScreen() {
  const [reportService] = useState(() => new ReportService(databaseService));
  const [expenseService] = useState(() => new ExpenseService(databaseService));

  // Periode Laporan
  const [periodType, setPeriodType] = useState<ReportPeriodType>('TODAY');
  const [customStartDate, setCustomStartDate] = useState<string>(() =>
    getBusinessDateWib(Date.now()),
  );
  const [customEndDate, setCustomEndDate] = useState<string>(() =>
    getBusinessDateWib(Date.now()),
  );

  // Sub-tab aktif
  const [activeSubTab, setActiveSubTab] = useState<ReportSubTab>('summary');

  // State data laporan & pengeluaran
  const [reportData, setReportData] = useState<FullReportData | null>(null);
  const [expensesList, setExpensesList] = useState<readonly ExpenseRecord[]>([]);
  const [expenseFilterStatus, setExpenseFilterStatus] = useState<
    ExpenseStatus | 'ALL'
  >('ALL');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // State modals
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [voidingExpense, setVoidingExpense] = useState<ExpenseRecord | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const customRange =
      periodType === 'CUSTOM'
        ? { startDate: customStartDate, endDate: customEndDate }
        : undefined;

    reportService
      .getReportData(periodType, customRange)
      .then(async (data) => {
        const expenses = await expenseService.listExpenses({
          startDate: data.dateRange.startDate,
          endDate: data.dateRange.endDate,
          status: expenseFilterStatus,
        });
        if (!isMounted) return;
        setReportData(data);
        setExpensesList(expenses);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        const msg =
          err instanceof Error ? err.message : 'Gagal memuat data laporan.';
        setErrorMessage(msg);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [
    reportService,
    expenseService,
    periodType,
    customStartDate,
    customEndDate,
    expenseFilterStatus,
    reloadTrigger,
  ]);

  const handleExpenseCreated = () => {
    setIsAddExpenseOpen(false);
    setIsLoading(true);
    setReloadTrigger((prev) => prev + 1);
  };

  const handleExpenseVoided = () => {
    setVoidingExpense(null);
    setIsLoading(true);
    setReloadTrigger((prev) => prev + 1);
  };

  const summary = reportData?.summary;
  const dateRange = reportData?.dateRange;

  return (
    <div className="flex flex-col space-y-4 pb-20">
      {/* Header Halaman */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            Laporan &amp; Kas Operasional
          </h1>
          <p className="text-xs text-slate-500">
            Rekap omzet, metode bayar, pengeluaran kas kecil, dan menu terlaris
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsExportModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 active:bg-slate-100"
        >
          <svg
            className="h-4 w-4 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
          Ekspor CSV
        </button>
      </div>

      {/* Filter Periode */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs space-y-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {(
            [
              ['TODAY', 'Hari Ini'],
              ['YESTERDAY', 'Kemarin'],
              ['LAST_7_DAYS', '7 Hari Terakhir'],
              ['THIS_MONTH', 'Bulan Ini'],
              ['CUSTOM', 'Rentang Kustom'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriodType(key)}
              className={`shrink-0 rounded-xl px-3.5 py-2 font-medium transition ${
                periodType === key
                  ? 'bg-orange-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {periodType === 'CUSTOM' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-2">
              <label htmlFor="custom-start-date" className="font-semibold text-slate-600">
                Dari:
              </label>
              <input
                id="custom-start-date"
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="custom-end-date" className="font-semibold text-slate-600">
                Sampai:
              </label>
              <input
                id="custom-end-date"
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
              />
            </div>
          </div>
        )}

        {dateRange && (
          <div className="text-[11px] text-slate-500">
            Menampilkan data untuk: <strong>{dateRange.label}</strong>
          </div>
        )}
      </div>

      {/* Sub Tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveSubTab('summary')}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition ${
            activeSubTab === 'summary'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>📊 Ringkasan Kas</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('top_products')}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition ${
            activeSubTab === 'top_products'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>🍜 Menu Terlaris</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('expenses')}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition ${
            activeSubTab === 'expenses'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>💸 Kas Kecil</span>
          {summary && summary.activeExpenseCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-100 px-1 text-[10px] font-bold text-rose-700">
              {summary.activeExpenseCount}
            </span>
          )}
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
          {errorMessage}
        </div>
      )}

      {isLoading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 shadow-xs">
          Memuat data laporan dan pengeluaran...
        </div>
      )}

      {/* TAB 1: RINGKASAN PENJUALAN & ARUS KAS */}
      {!isLoading && activeSubTab === 'summary' && summary && (
        <div className="space-y-4">
          {/* Grid Metrik Utama */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Omzet Bersih */}
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 shadow-xs">
              <span className="text-xs font-semibold text-emerald-800">
                Omzet Penjualan (PAID)
              </span>
              <div className="mt-1 text-lg font-black text-emerald-700">
                {formatRupiah(summary.totalGrossOmzetRupiah)}
              </div>
              <p className="mt-1 text-[11px] text-emerald-600">
                {summary.paidTransactionCount} transaksi berhasil
                {summary.voidTransactionCount > 0 &&
                  ` (${summary.voidTransactionCount} void)`}
              </p>
            </div>

            {/* Pengeluaran Kas Kecil */}
            <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4 shadow-xs">
              <span className="text-xs font-semibold text-rose-800">
                Pengeluaran Operasional
              </span>
              <div className="mt-1 text-lg font-black text-rose-700">
                {formatRupiah(summary.activeExpenseTotalRupiah)}
              </div>
              <p className="mt-1 text-[11px] text-rose-600">
                {summary.activeExpenseCount} catatan pengeluaran
              </p>
            </div>

            {/* Selisih Kas Operasional */}
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 shadow-xs">
              <span className="text-xs font-semibold text-indigo-800">
                Selisih Kas Operasional
              </span>
              <div
                className={`mt-1 text-lg font-black ${
                  summary.netOperatingCashRupiah < 0
                    ? 'text-rose-700'
                    : 'text-indigo-700'
                }`}
              >
                {formatSignedRupiah(summary.netOperatingCashRupiah)}
              </div>
              <p className="mt-1 text-[10px] leading-tight text-indigo-600">
                Omzet − Pengeluaran. (Bukan laba bersih akuntansi)
              </p>
            </div>

            {/* Estimasi Kas di Laci */}
            <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 shadow-xs">
              <span className="text-xs font-semibold text-amber-800">
                Estimasi Tunai di Laci
              </span>
              <div
                className={`mt-1 text-lg font-black ${
                  summary.estimatedCashDrawerRupiah < 0
                    ? 'text-rose-700'
                    : 'text-amber-700'
                }`}
              >
                {formatSignedRupiah(summary.estimatedCashDrawerRupiah)}
              </div>
              <p className="mt-1 text-[10px] leading-tight text-amber-600">
                Tunai Masuk − Pengeluaran Kas
              </p>
            </div>
          </div>

          {/* Rincian Metode Pembayaran */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                Rincian Metode Pembayaran
              </h2>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                Omzet Sesuai 100%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="text-xs font-semibold text-slate-700">
                  💵 Tunai (CASH)
                </span>
                <div className="mt-1 text-base font-bold text-slate-900">
                  {formatRupiah(summary.cashRevenueRupiah)}
                </div>
                <p className="text-[11px] text-slate-500">
                  {summary.cashTransactionCount} transaksi
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="text-xs font-semibold text-slate-700">
                  📱 QRIS Manual Kasir
                </span>
                <div className="mt-1 text-base font-bold text-slate-900">
                  {formatRupiah(summary.qrisRevenueRupiah)}
                </div>
                <p className="text-[11px] text-slate-500">
                  {summary.qrisTransactionCount} transaksi
                </p>
              </div>
            </div>

            {/* Disclaimer Akuntansi Wajib */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
              <strong>Catatan Usaha:</strong> Sesuai aturan akuntansi, selisih kas di
              atas merupakan estimasi pergerakan arus kas harian (omzet dikurangi kas
              kecil tercatat). Ini <strong>bukan</strong> laba bersih, karena belum
              memperhitungkan HPP periodik, sewa tempat, gaji tetap, atau penyusutan alat.
            </div>
          </div>

          {/* Rincian Harian (Jika rentang > 1 hari) */}
          {reportData.dailyRows.length > 1 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
              <h2 className="text-sm font-bold text-slate-900">
                Rincian Harian ({reportData.dailyRows.length} Hari)
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="pb-2 font-semibold">Tanggal</th>
                      <th className="pb-2 text-center font-semibold">Trx</th>
                      <th className="pb-2 text-right font-semibold">Omzet</th>
                      <th className="pb-2 text-right font-semibold">Pengeluaran</th>
                      <th className="pb-2 text-right font-semibold">Selisih Kas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.dailyRows.map((row) => (
                      <tr key={row.businessDate} className="hover:bg-slate-50">
                        <td className="py-2.5 font-medium text-slate-900">
                          {row.businessDate}
                        </td>
                        <td className="py-2.5 text-center text-slate-600">
                          {row.paidTransactionsCount}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-emerald-700">
                          {formatRupiah(row.omzetRupiah)}
                        </td>
                        <td className="py-2.5 text-right text-rose-600">
                          {formatRupiah(row.expenseRupiah)}
                        </td>
                        <td className="py-2.5 text-right font-bold text-slate-900">
                          {formatSignedRupiah(row.netCashRupiah)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MENU TERLARIS */}
      {!isLoading && activeSubTab === 'top_products' && reportData && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900">
              Ranking Menu Terlaris (PAID Only)
            </h2>

            {reportData.topProducts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Belum ada transaksi penjualan berstatus PAID pada periode ini.
              </div>
            ) : (
              <div className="space-y-2">
                {reportData.topProducts.map((prod, idx) => (
                  <div
                    key={prod.productName}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          idx === 0
                            ? 'bg-amber-100 text-amber-800'
                            : idx === 1
                              ? 'bg-slate-200 text-slate-800'
                              : idx === 2
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-900">
                          {prod.productName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Terjual: {prod.totalQuantity} porsi
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-bold text-slate-900">
                      {formatRupiah(prod.totalSalesRupiah)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Topping Terlaris */}
          {reportData.topOptions.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
              <h2 className="text-sm font-bold text-slate-900">
                Topping / Modifier Terlaris
              </h2>
              <div className="space-y-2">
                {reportData.topOptions.map((opt, idx) => (
                  <div
                    key={opt.optionName}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                        {idx + 1}
                      </span>
                      <div>
                        <span className="font-semibold text-slate-900">
                          {opt.optionName}
                        </span>
                        <div className="text-[11px] text-slate-500">
                          {opt.totalQuantity} porsi
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-semibold text-slate-700">
                      {formatRupiah(opt.totalSalesRupiah)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PENGELUARAN KAS KECIL */}
      {!isLoading && activeSubTab === 'expenses' && (
        <div className="space-y-4">
          {/* Header Aksi Catat Pengeluaran */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Daftar Pengeluaran Kas
              </h2>
              <p className="text-xs text-slate-500">
                Total:{' '}
                <strong>
                  {formatRupiah(
                    expensesList
                      .filter((e) => e.status === 'ACTIVE')
                      .reduce((sum, e) => sum + e.amountRupiah, 0),
                  )}
                </strong>
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsAddExpenseOpen(true)}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-rose-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition active:bg-rose-800"
            >
              + Catat Pengeluaran Baru
            </button>
          </div>

          {/* Filter Status Pengeluaran */}
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-600">Status:</span>
            {(
              [
                ['ALL', 'Semua'],
                ['ACTIVE', 'Aktif'],
                ['VOID', 'Dibatalkan (VOID)'],
              ] as const
            ).map(([st, label]) => (
              <button
                key={st}
                type="button"
                onClick={() => setExpenseFilterStatus(st)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  expenseFilterStatus === st
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* List Kartu Pengeluaran */}
          {expensesList.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 shadow-xs">
              Belum ada catatan pengeluaran kas kecil pada periode ini.
            </div>
          ) : (
            <div className="space-y-2.5">
              {expensesList.map((exp) => (
                <div
                  key={exp.id}
                  className={`rounded-2xl border p-4 shadow-xs transition ${
                    exp.status === 'VOID'
                      ? 'border-slate-200 bg-slate-50/70 opacity-70'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200/50">
                          {exp.category}
                        </span>
                        {exp.status === 'VOID' && (
                          <span className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">
                            DIBATALKAN
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs font-medium text-slate-900 leading-relaxed">
                        {exp.notes}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {formatDateTimeWib(exp.occurredAtMs)} • Tgl Bisnis:{' '}
                        {exp.businessDate}
                      </p>
                    </div>

                    <div className="text-right">
                      <div
                        className={`text-base font-bold ${
                          exp.status === 'VOID'
                            ? 'line-through text-slate-400'
                            : 'text-rose-700'
                        }`}
                      >
                        {formatRupiah(exp.amountRupiah)}
                      </div>

                      {exp.status === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => setVoidingExpense(exp)}
                          className="mt-2 text-xs font-medium text-red-600 hover:text-red-800 underline active:opacity-70"
                        >
                          Batalkan (Void)
                        </button>
                      )}
                    </div>
                  </div>

                  {exp.status === 'VOID' && exp.voidReason && (
                    <div className="mt-2.5 rounded-lg border border-red-100 bg-red-50 p-2 text-[11px] text-red-800">
                      <strong>Alasan Void:</strong> {exp.voidReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {isAddExpenseOpen && (
        <AddExpenseModal
          expenseService={expenseService}
          defaultBusinessDate={dateRange?.startDate}
          onClose={() => setIsAddExpenseOpen(false)}
          onExpenseCreated={handleExpenseCreated}
        />
      )}

      {voidingExpense && (
        <VoidExpenseModal
          expense={voidingExpense}
          expenseService={expenseService}
          onClose={() => setVoidingExpense(null)}
          onExpenseVoided={handleExpenseVoided}
        />
      )}

      {isExportModalOpen && dateRange && (
        <ExportReportModal
          reportService={reportService}
          periodType={periodType}
          dateRange={dateRange}
          onClose={() => setIsExportModalOpen(false)}
        />
      )}
    </div>
  );
}
