import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatDateTimeWib } from '../../domain/dates';
import { formatRupiah } from '../../domain/money';
import type { MockFailureMode } from '../../services/printer/mockPrinterAdapter';
import type { P1DiagnosticsViewModel } from './useP1Diagnostics';

interface P1DiagnosticPanelProps {
  readonly diagnostics: P1DiagnosticsViewModel;
}

const FAILURE_MODE_OPTIONS: readonly {
  readonly value: MockFailureMode;
  readonly label: string;
}[] = [
  { value: 'NONE', label: 'Normal (Tanpa Gangguan)' },
  { value: 'BLUETOOTH_DISABLED', label: 'Simulasi Bluetooth Mati' },
  { value: 'PERMISSION_DENIED', label: 'Simulasi Izin Ditolak' },
  { value: 'CONNECTION_TIMEOUT', label: 'Simulasi Timeout SPP' },
  { value: 'SOCKET_WRITE_FAILED', label: 'Simulasi Putus Saat Kirim' },
];

export function P1DiagnosticPanel({ diagnostics }: P1DiagnosticPanelProps) {
  const {
    isInitializing,
    isBusy,
    dbHealth,
    suiteReport,
    persistenceState,
    receiptPreview,
    isReprintPreview,
    printerMeta,
    printerConnection,
    mockFailureMode,
    lastPrintResult,
    printAttempts,
    actionFeedback,
  } = diagnostics;

  const isDbReady = dbHealth?.isReady === true;
  const persistedTx = persistenceState?.persistedTransaction ?? null;

  return (
    <div className="space-y-4">
      {actionFeedback ? (
        <div
          role="status"
          className="rounded-xl border border-orange-300 bg-orange-50 p-3 text-xs leading-relaxed font-medium text-orange-950"
        >
          {actionFeedback}
        </div>
      ) : null}

      {/* Panel 1: SQLite Native Diagnostic & Persistence */}
      <section
        aria-labelledby="p1-sqlite-heading"
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold tracking-wide text-orange-800 uppercase">
              Diagnostik Development P1
            </p>
            <h3
              id="p1-sqlite-heading"
              className="text-base font-bold text-slate-900"
            >
              SQLite Native & Persistensi Data
            </h3>
          </div>
          {isInitializing ? (
            <StatusBadge status="planned" label="Memuat DB..." />
          ) : isDbReady ? (
            <StatusBadge
              status="ready"
              label={`SQLite v${String(dbHealth.schemaVersion)} Aktif`}
            />
          ) : (
            <StatusBadge
              status={
                dbHealth?.errorCode === 'DB_NOT_SUPPORTED_ON_WEB'
                  ? 'unverified'
                  : 'error'
              }
              label={
                dbHealth?.errorCode === 'DB_NOT_SUPPORTED_ON_WEB'
                  ? 'Khusus APK Android'
                  : 'DB Gagal Dibuka'
              }
            />
          )}
        </div>

        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          Seluruh pengujian di panel ini memakai namespace terisolasi{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">
            diag_p1_*
          </code>{' '}
          / <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">DIAG-P1</code>{' '}
          dan tidak mencampuri omzet atau katalog produksi.
        </p>

        {dbHealth ? (
          <dl className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs">
            <div className="flex items-center justify-between gap-2 py-1.5">
              <dt className="text-slate-600">Driver Penyimpanan</dt>
              <dd className="font-mono font-semibold text-slate-900">
                {dbHealth.driverName}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 py-1.5">
              <dt className="text-slate-600">Database & Skema</dt>
              <dd className="font-mono font-semibold text-slate-900">
                {dbHealth.databaseName} (v{String(dbHealth.schemaVersion)} •{' '}
                {String(dbHealth.tables.length)} tabel •{' '}
                {String(dbHealth.indexes.length)} indeks)
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 py-1.5">
              <dt className="text-slate-600">PRAGMA foreign_keys</dt>
              <dd className="font-mono font-semibold text-slate-900">
                {dbHealth.foreignKeysEnabled ? 'ON (1)' : 'OFF (0)'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 py-1.5">
              <dt className="text-slate-600">Hitungan Cold-Boot App</dt>
              <dd className="font-mono font-semibold text-slate-900">
                {persistenceState ? `#${String(persistenceState.bootCount)}` : '-'}
              </dd>
            </div>
          </dl>
        ) : null}

        {dbHealth?.errorMessage ? (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
            {dbHealth.errorMessage}
          </div>
        ) : null}

        {/* Status Sampel Persistensi Lintas Force-Stop */}
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-800">
              Status Sampel Persistensi (Uji Restart & Force-Stop)
            </span>
            {persistedTx ? (
              <StatusBadge
                status="ready"
                label={
                  persistenceState?.survivedRestart
                    ? 'Bertahan Lintas Restart!'
                    : 'Tersimpan di SQLite'
                }
              />
            ) : (
              <StatusBadge status="planned" label="Belum Disimpan" />
            )}
          </div>

          {persistedTx ? (
            <div className="mt-2 space-y-1 text-xs text-slate-700">
              <p>
                Nomor Uji:{' '}
                <strong className="font-mono text-slate-900">
                  {persistedTx.receiptNumber}
                </strong>{' '}
                • Total:{' '}
                <strong className="font-mono text-slate-900">
                  {formatRupiah(persistedTx.grandTotalRupiah)}
                </strong>
              </p>
              <p>
                Waktu Simpan: <strong>{formatDateTimeWib(persistedTx.createdAtMs)}</strong>
              </p>
              <p>
                Dibuat pada sesi boot{' '}
                <strong className="font-mono">
                  #{String(persistenceState?.probeCreatedBoot ?? 1)}
                </strong>
                , sesi boot sekarang{' '}
                <strong className="font-mono">
                  #{String(persistenceState?.bootCount ?? 1)}
                </strong>
                .{' '}
                {persistenceState?.survivedRestart
                  ? 'Terbukti data tetap utuh setelah aplikasi ditutup / force-stop dan diinisialisasi ulang.'
                  : 'Tutup atau force-stop aplikasi lalu buka ulang untuk memverifikasi ketahanan data.'}
              </p>
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-slate-600">
              Belum ada sampel persistensi aktif. Tekan tombol simpan sampel di
              bawah untuk menulis 1 transaksi uji atomik ke SQLite native.
            </p>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2">
          <button
            type="button"
            aria-label="Jalankan Uji Diagnostik SQLite"
            disabled={!isDbReady || isBusy}
            onClick={() => void diagnostics.runDiagnosticSuite()}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 active:bg-orange-800"
          >
            {isBusy
              ? 'Memproses Uji SQLite...'
              : 'Jalankan Uji Diagnostik SQLite (CRUD, FK, Rollback)'}
          </button>

          <button
            type="button"
            aria-label="Simpan Sampel Persistensi P1"
            disabled={!isDbReady || isBusy || persistedTx !== null}
            onClick={() => void diagnostics.savePersistenceSample()}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-emerald-700 bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500 active:bg-emerald-800"
          >
            {persistedTx
              ? `Sampel Persistensi Aktif (${persistedTx.receiptNumber})`
              : 'Simpan Sampel Persistensi & Struk Uji P1'}
          </button>

          <button
            type="button"
            aria-label="Bersihkan Data Uji P1"
            disabled={!isDbReady || isBusy}
            onClick={() => void diagnostics.clearDiagnosticData()}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 active:bg-slate-100"
          >
            Bersihkan Data Uji Diagnostik P1
          </button>
        </div>

        {suiteReport ? (
          <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold tracking-wide text-slate-800 uppercase">
                Hasil Rangkaian Cek SQLite ({formatDateTimeWib(suiteReport.executedAtMs)})
              </h4>
              <StatusBadge
                status={suiteReport.allPassed ? 'ready' : 'error'}
                label={suiteReport.allPassed ? '8/8 LULUS' : 'ADA GAGAL'}
              />
            </div>
            <ul className="space-y-2">
              {suiteReport.checks.map((check) => (
                <li
                  key={check.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="font-semibold text-slate-900">
                      {check.title}
                    </span>
                    <StatusBadge
                      status={check.passed ? 'ready' : 'error'}
                      label={check.passed ? 'PASS' : 'FAIL'}
                    />
                  </div>
                  <p className="mt-1 leading-relaxed text-slate-600">
                    {check.detail}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* Panel 2: 58 mm Receipt Preview & PrinterAdapter Mock Foundation */}
      <section
        aria-labelledby="p1-printer-heading"
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
              Fondasi Printer Thermal 58 mm
            </p>
            <h3
              id="p1-printer-heading"
              className="text-base font-bold text-slate-900"
            >
              Preview Struk SQLite & Mock Adapter
            </h3>
          </div>
          <StatusBadge
            status="unverified"
            label="Printer Fisik Belum Diuji"
          />
        </div>

        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
          <strong>Status Jujur Perangkat Keras:</strong> Printer fisik Bluetooth
          Classic SPP 58 mm belum tersedia. Adapter aktif saat ini adalah{' '}
          <code className="font-mono font-semibold">{printerMeta.adapterName}</code>
          . Simulasi di bawah <strong>bukan bukti kertas fisik tercetak</strong>.
        </div>

        {/* Preview Struk dari Transaksi SQLite */}
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-800">
              Preview Struk 58 mm (32 Kolom Karakter)
            </span>
            {receiptPreview ? (
              <span className="font-mono text-xs text-slate-600">
                ESC/POS: {String(receiptPreview.escPosBytes.byteLength)} byte
              </span>
            ) : null}
          </div>

          {receiptPreview && persistedTx ? (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void diagnostics.toggleReprintPreview(false)}
                  className={`min-h-10 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    !isReprintPreview
                      ? 'border-orange-700 bg-orange-50 text-orange-900'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  Mode Struk Asli
                </button>
                <button
                  type="button"
                  onClick={() => void diagnostics.toggleReprintPreview(true)}
                  className={`min-h-10 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    isReprintPreview
                      ? 'border-orange-700 bg-orange-50 text-orange-900'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  Mode Reprint (SALINAN)
                </button>
              </div>

              <pre
                aria-label="Preview Struk Thermal 58mm"
                className="mt-2 overflow-x-auto rounded-lg border border-slate-300 bg-stone-50 p-3 font-mono text-[11px] leading-snug text-slate-900"
              >
                {receiptPreview.plainText}
              </pre>
            </>
          ) : (
            <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
              Simpan sampel transaksi P1 ke SQLite pada panel di atas untuk
              menampilkan preview struk 58 mm dari database nyata.
            </div>
          )}
        </div>

        {/* Kontrol Simulasi MockPrinterAdapter */}
        <div className="mt-4 space-y-2.5 border-t border-slate-200 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-700">
              Status Koneksi Mock Adapter:
            </span>
            <span className="font-mono font-bold text-slate-900">
              {printerConnection.status}
              {printerConnection.connectedDevice
                ? ` (${printerConnection.connectedDevice.address})`
                : ''}
            </span>
          </div>

          <div>
            <label
              htmlFor="mock-failure-select"
              className="block text-xs font-semibold text-slate-700"
            >
              Uji Skenario Gangguan Adapter:
            </label>
            <select
              id="mock-failure-select"
              value={mockFailureMode}
              onChange={(e) =>
                diagnostics.changeMockFailureMode(
                  e.target.value as MockFailureMode,
                )
              }
              className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
            >
              {FAILURE_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-label="Hubungkan Printer Mock"
              disabled={isBusy}
              onClick={() => void diagnostics.connectMockPrinter()}
              className="min-h-11 rounded-lg border border-slate-800 bg-slate-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 active:bg-slate-900"
            >
              Hubungkan Mock
            </button>
            <button
              type="button"
              aria-label="Putuskan Printer Mock"
              disabled={isBusy || printerConnection.status !== 'CONNECTED'}
              onClick={() => void diagnostics.disconnectMockPrinter()}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-50 active:bg-slate-100"
            >
              Putuskan Mock
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              aria-label="Simulasi Cetak Struk Tersimpan"
              disabled={isBusy || persistedTx === null}
              onClick={() =>
                void diagnostics.simulatePrintSavedReceipt(isReprintPreview)
              }
              className="min-h-11 w-full rounded-lg bg-orange-700 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 active:bg-orange-800"
            >
              {isReprintPreview
                ? 'Simulasi Reprint SALINAN dari SQLite (Mock)'
                : 'Simulasi Kirim Struk dari SQLite (Mock)'}
            </button>

            <button
              type="button"
              aria-label="Simulasi Cetak Uji 58mm"
              disabled={isBusy || !isDbReady}
              onClick={() => void diagnostics.simulatePrintTestPage()}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-800 disabled:opacity-50 active:bg-slate-100"
            >
              Simulasi Cetak Uji 58 mm (Tanpa Membuat Transaksi)
            </button>
          </div>

          {lastPrintResult ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800">
              <p className="font-semibold">
                Hasil Terakhir Adapter:{' '}
                <code className="font-mono">{lastPrintResult.outcome}</code>{' '}
                {lastPrintResult.isSimulated ? '(SIMULASI DEV)' : ''}
              </p>
              <p className="mt-1 text-slate-600">{lastPrintResult.userMessage}</p>
            </div>
          ) : null}

          {printAttempts.length > 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
              <p className="font-semibold text-slate-800">
                Log Tabel <code className="font-mono">print_attempts</code> (
                {String(printAttempts.length)} catatan, transaksi tidak digandakan):
              </p>
              <ul className="mt-1 space-y-1 text-slate-600">
                {printAttempts.slice(0, 3).map((attempt) => (
                  <li key={attempt.id} className="font-mono text-[11px]">
                    {formatDateTimeWib(attempt.attemptedAtMs)} • {attempt.result}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

