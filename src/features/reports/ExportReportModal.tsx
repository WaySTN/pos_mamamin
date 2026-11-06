import { useState } from 'react';
import type { ReportDateRange, ReportPeriodType } from '../../domain/types';
import { ReportService } from '../../services/reportService';

interface ExportReportModalProps {
  readonly reportService: ReportService;
  readonly periodType: ReportPeriodType;
  readonly dateRange: ReportDateRange;
  readonly onClose: () => void;
}

type ExportType = 'SUMMARY' | 'TRANSACTIONS' | 'EXPENSES';

export function ExportReportModal({
  reportService,
  periodType,
  dateRange,
  onClose,
}: ExportReportModalProps) {
  const [exportType, setExportType] = useState<ExportType>('SUMMARY');
  const [isExporting, setIsExporting] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cleanStart = dateRange.startDate.replace(/-/g, '');
  const cleanEnd = dateRange.endDate.replace(/-/g, '');
  const dateSuffix =
    cleanStart === cleanEnd ? cleanStart : `${cleanStart}_${cleanEnd}`;

  const fileName =
    exportType === 'SUMMARY'
      ? `mamamin_rekap_${dateSuffix}.csv`
      : exportType === 'TRANSACTIONS'
        ? `mamamin_penjualan_${dateSuffix}.csv`
        : `mamamin_pengeluaran_${dateSuffix}.csv`;

  const handleExport = async () => {
    setIsExporting(true);
    setErrorMessage(null);
    setDownloadSuccess(null);

    try {
      let csvContent = '';
      if (exportType === 'SUMMARY') {
        csvContent = await reportService.exportSummaryCsv(periodType, {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        });
      } else if (exportType === 'TRANSACTIONS') {
        csvContent = await reportService.exportTransactionsCsv(
          dateRange.startDate,
          dateRange.endDate,
        );
      } else {
        csvContent = await reportService.exportExpensesCsv(
          dateRange.startDate,
          dateRange.endDate,
        );
      }

      // Buat file Blob dan unduh secara lokal
      const blob = new Blob([csvContent], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloadSuccess(`File ${fileName} berhasil diunduh ke perangkat.`);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal menghasilkan ekspor CSV.';
      setErrorMessage(msg);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
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
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
            </span>
            <div>
              <h2
                id="export-modal-title"
                className="text-base font-bold text-slate-900"
              >
                Ekspor Laporan (CSV)
              </h2>
              <p className="text-xs text-slate-500">
                Format tabel spreadsheet kompatibel Excel
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
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
          {downloadSuccess && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800">
              <div className="flex items-center gap-2 font-semibold">
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
                    d="m4.5 12.75 6 6 9-13.5"
                  />
                </svg>
                Unduhan Selesai!
              </div>
              <p className="mt-1">{downloadSuccess}</p>
            </div>
          )}

          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {errorMessage}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Periode Terpilih:</span>{' '}
            {dateRange.label}
          </div>

          {/* Opsi Tipe Ekspor */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Pilih Jenis Laporan yang Diekspor:
            </label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setExportType('SUMMARY')}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  exportType === 'SUMMARY'
                    ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold text-xs text-slate-900">
                  📄 Rekapitulasi Laporan &amp; Harian
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Ringkasan omzet, metode bayar, pengeluaran, laba arus kas, dan menu terlaris.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setExportType('TRANSACTIONS')}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  exportType === 'TRANSACTIONS'
                    ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold text-xs text-slate-900">
                  🧾 Rincian Transaksi Penjualan
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Daftar seluruh transaksi per struk (PAID &amp; VOID), metode bayar, dan nominal.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setExportType('EXPENSES')}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  exportType === 'EXPENSES'
                    ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold text-xs text-slate-900">
                  💸 Rincian Pengeluaran Kas Kecil
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Daftar pengeluaran tunai, kategori, tanggal, status, dan keterangan nota.
                </p>
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-[11px] text-slate-500">
            <strong>Nama file:</strong> <code>{fileName}</code> (UTF-8 BOM aman Excel).
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-md transition active:bg-emerald-800 disabled:opacity-50"
            >
              {isExporting ? 'Memproses Ekspor...' : 'Unduh File CSV'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
