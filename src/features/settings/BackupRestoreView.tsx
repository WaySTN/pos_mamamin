import { useEffect, useMemo, useState } from 'react';
import { databaseService } from '../../database/sqlite';
import {
  formatTimestampToWib,
  generateBackupFileName,
  type BackupInspectionPreview,
  type MamaminBackupPayload,
} from '../../domain/backup';
import { formatRupiah } from '../../domain/money';
import {
  canShareBackupFile,
  downloadBackupFile,
  listLocalBackups,
  readLocalBackupContent,
  shareBackupFile,
  type LocalBackupFileInfo,
} from '../../services/backup/backupFileHelper';
import { BackupService } from '../../services/backup/backupService';

export function BackupRestoreView() {
  const backupService = useMemo(() => new BackupService(databaseService), []);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Status backup terakhir
  const [lastBackupInfo, setLastBackupInfo] = useState<{
    lastBackupAtMs: number | null;
    filename: string | null;
  }>({ lastBackupAtMs: null, filename: null });

  // Daftar backup lokal di perangkat
  const [localBackups, setLocalBackups] = useState<LocalBackupFileInfo[]>([]);

  // State untuk restore
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [inspection, setInspection] = useState<BackupInspectionPreview | null>(null);
  const [showConfirmRestoreModal, setShowConfirmRestoreModal] = useState<boolean>(false);
  const [confirmInput, setConfirmInput] = useState<string>('');

  const canShare = useMemo(() => canShareBackupFile(), []);

  const refreshBackups = async () => {
    const info = await backupService.getLastBackupInfo();
    const list = await listLocalBackups();
    setLastBackupInfo(info);
    setLocalBackups(list);
  };

  useEffect(() => {
    let cancelled = false;
    const fetchInfo = async () => {
      const info = await backupService.getLastBackupInfo();
      const list = await listLocalBackups();
      if (!cancelled) {
        setLastBackupInfo(info);
        setLocalBackups(list);
      }
    };
    void fetchInfo();
    return () => {
      cancelled = true;
    };
  }, [backupService]);

  // Handler: Buat & Download Backup
  const handleDownloadBackup = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const nowMs = Date.now();
      const payload = await backupService.exportFullBackup(nowMs);
      const filename = generateBackupFileName(nowMs);
      await downloadBackupFile(payload, filename);

      await refreshBackups();
      setFeedback({
        type: 'success',
        message: `Cadangan data "${filename}" berhasil diunduh. Simpan file ini di tempat yang aman (Google Drive/WhatsApp/Flashdisk).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal mengekspor cadangan database.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Bagikan ke Luar HP (Sharesheet)
  const handleShareBackup = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const nowMs = Date.now();
      const payload = await backupService.exportFullBackup(nowMs);
      const filename = generateBackupFileName(nowMs);
      const res = await shareBackupFile(payload, filename);

      await refreshBackups();
      setFeedback({
        type: 'success',
        message: res.message,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal membagikan cadangan database.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Pilih file backup dari cache/lokal langsung
  const handleSelectLocalBackup = async (fileName: string) => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const content = await readLocalBackupContent(fileName);
      setSelectedFileName(fileName);
      setSelectedFileContent(content);
      const preview = await backupService.inspectBackup(content);
      setInspection(preview);
      if (!preview.isValid) {
        setFeedback({
          type: 'error',
          message: preview.errorMessage ?? 'File backup tidak valid.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal membaca file cadangan lokal.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Pilih file backup untuk diinspeksi
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setFeedback(null);
    setInspection(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setSelectedFileContent(content);
      const preview = await backupService.inspectBackup(content);
      setInspection(preview);
      if (!preview.isValid) {
        setFeedback({
          type: 'error',
          message: preview.errorMessage ?? 'File backup tidak valid.',
        });
      }
    };
    reader.readAsText(file);
  };

  // Handler: Eksekusi Restore Tervalidasi
  const handleExecuteRestore = async () => {
    if (!selectedFileContent || !inspection || !inspection.isValid) return;

    setIsLoading(true);
    setShowConfirmRestoreModal(false);
    setFeedback(null);

    try {
      const payload = JSON.parse(selectedFileContent) as MamaminBackupPayload;
      const result = await backupService.restoreValidatedBackup(payload);

      setFeedback({
        type: 'success',
        message: `${result.message} Silakan muat ulang halaman atau beralih ke tab Kasir/Laporan untuk melihat data yang dipulihkan.`,
      });
      setSelectedFileContent(null);
      setSelectedFileName(null);
      setInspection(null);
      setConfirmInput('');
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal memulihkan database.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header Info Keamanan Data */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-orange-100 p-2 text-xl">🛡️</div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Cadangan &amp; Pemulihan Data (Backup &amp; Restore)
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Aplikasi ini beroperasi <strong>100% offline</strong> di HP ini. Jika HP hilang atau aplikasi terhapus, data tidak dapat dikembalikan tanpa file backup. Lakukan backup harian dan simpan ke luar HP (Google Drive, WhatsApp, atau Flashdisk).
            </p>
          </div>
        </div>

        {lastBackupInfo.lastBackupAtMs ? (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
            <span>
              ✅ Backup terakhir: {formatTimestampToWib(lastBackupInfo.lastBackupAtMs)}
            </span>
            <span className="text-[11px] font-normal text-emerald-700">
              {lastBackupInfo.filename}
            </span>
          </div>
        ) : (
          <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            ⚠️ Belum pernah melakukan backup database di perangkat ini.
          </div>
        )}
      </div>

      {/* Banner Feedback */}
      {feedback ? (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl border p-3 text-xs font-medium ${
            feedback.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
              : feedback.type === 'error'
                ? 'border-rose-300 bg-rose-50 text-rose-950'
                : 'border-blue-300 bg-blue-50 text-blue-950'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="ml-2 font-bold opacity-75 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* --- SEKSI 1: CADANGKAN DATA (BACKUP) --- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900">
          1. Cadangkan Database (Full Backup)
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Ekspor mencakup seluruh transaksi, riwayat detail, opsi seblak, katalog menu resmi, pengeluaran kas kecil, dan nomor urut struk dalam format JSON aman dengan verifikasi checksum SHA-256.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {canShare ? (
            <button
              type="button"
              disabled={isLoading}
              onClick={handleShareBackup}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-orange-800 active:bg-orange-900 disabled:opacity-50"
            >
              <span>📤</span>
              <span>Bagikan Backup (Drive / WhatsApp)</span>
            </button>
          ) : null}

          <button
            type="button"
            disabled={isLoading}
            onClick={handleDownloadBackup}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold transition-colors ${
              canShare
                ? 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                : 'bg-orange-700 text-white hover:bg-orange-800'
            } disabled:opacity-50`}
          >
            <span>💾</span>
            <span>Simpan ke Folder Download HP (.json)</span>
          </button>
        </div>
      </div>

      {/* --- SEKSI 2: PULIHKAN DATA (RESTORE) --- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900">
          2. Pulihkan Database dari File Cadangan (Restore)
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Gunakan fitur ini saat pindah HP atau memulihkan data setelah instal ulang. File cadangan akan diinspeksi keutuhannya sebelum diizinkan untuk dipulihkan.
        </p>

        {/* Daftar file backup lokal terdeteksi di HP */}
        {localBackups.length > 0 ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">
                📁 File Cadangan di HP ({localBackups.length}):
              </span>
              <button
                type="button"
                onClick={refreshBackups}
                className="text-[11px] font-semibold text-orange-700 hover:underline"
              >
                🔄 Segarkan
              </button>
            </div>
            <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {localBackups.map((f) => {
                const isSelected = selectedFileName === f.fileName;
                return (
                  <div
                    key={f.fileName}
                    className={`flex items-center justify-between rounded-xl border p-2.5 text-xs transition-colors ${
                      isSelected
                        ? 'border-orange-500 bg-orange-50/60'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="truncate font-mono font-medium text-slate-900">
                        {f.fileName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatTimestampToWib(f.modifiedAtMs)} • {(f.sizeBytes / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleSelectLocalBackup(f.fileName)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 font-bold shadow-xs transition-colors ${
                        isSelected
                          ? 'bg-orange-800 text-white'
                          : 'bg-orange-700 text-white hover:bg-orange-800 active:bg-orange-900'
                      }`}
                    >
                      {isSelected ? 'Terpilih ✓' : 'Periksa'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Input File Manual */}
        <div className="mt-3">
          <label className="relative flex min-h-14 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3 text-center transition-colors hover:border-orange-500 hover:bg-orange-50/30">
            <span className="text-xs font-bold text-slate-700">
              {selectedFileName ? `📄 ${selectedFileName}` : '📂 Atau Pilih File Manual (.json)'}
            </span>
            <span className="mt-0.5 text-[11px] text-slate-500">
              Format: mamamin-backup-*.json
            </span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFileSelected}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>

        {/* Preview Hasil Inspeksi */}
        {inspection ? (
          <div className="mt-3 space-y-3">
            {inspection.isValid && inspection.summary ? (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50/50 p-3.5 text-xs">
                <div className="flex items-center gap-2 text-emerald-900">
                  <span className="text-base">✅</span>
                  <span className="font-bold">File Cadangan Sah &amp; Utuh (Checksum SHA-256 Valid)</span>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-2 text-slate-700">
                  <div>
                    <span className="text-slate-500">Waktu Cadangan:</span>
                    <p className="font-semibold text-slate-900">{inspection.summary.exportedAtWib}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Total Transaksi:</span>
                    <p className="font-semibold text-slate-900">
                      {inspection.summary.paidTransactionsCount} Berhasil ({inspection.summary.voidTransactionsCount} Batal)
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Omzet Penjualan:</span>
                    <p className="font-semibold text-emerald-800">
                      {formatRupiah(inspection.summary.totalPaidOmzetRupiah)}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Pengeluaran Kas:</span>
                    <p className="font-semibold text-rose-800">
                      {formatRupiah(inspection.summary.totalActiveExpensesRupiah)}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Katalog Menu:</span>
                    <p className="font-semibold text-slate-900">
                      {inspection.summary.categoriesCount} Kategori • {inspection.summary.productsCount} Menu
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Total Baris Data:</span>
                    <p className="font-semibold text-slate-900">{inspection.summary.totalRecords} record</p>
                  </div>
                </div>

                <div className="mt-3 rounded-lg bg-rose-50 p-2.5 text-rose-950">
                  <p className="font-bold">⚠️ Perhatian Sebelum Memulihkan:</p>
                  <p className="mt-0.5 text-[11px] text-rose-900">
                    Memulihkan data akan menggantikan seluruh isi database aktif saat ini dengan data di file cadangan ini.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => setShowConfirmRestoreModal(true)}
                  className="mt-3 flex min-h-10 w-full items-center justify-center rounded-xl bg-rose-700 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-rose-800 active:bg-rose-900 disabled:opacity-50"
                >
                  Pulihkan Database Ini Sekarang
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950">
                <p className="font-bold">❌ File Cadangan Ditolak:</p>
                <p className="mt-1">{inspection.errorMessage}</p>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Modal Dialog Konfirmasi Risiko Restore */}
      {showConfirmRestoreModal && inspection?.summary ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h4 className="text-base font-bold text-slate-900">
              Konfirmasi Pemulihan Data
            </h4>
            <p className="mt-2 text-xs text-slate-600">
              Anda akan memulihkan <strong>{inspection.summary.totalTransactionsCount} transaksi</strong> dan <strong>{inspection.summary.productsCount} produk</strong> dari file cadangan tanggal {inspection.summary.exportedAtWib}.
            </p>
            <p className="mt-2 text-xs font-semibold text-rose-700">
              Data transaksi yang dibuat setelah tanggal tersebut di HP ini akan ditimpa!
            </p>

            <div className="mt-3">
              <label className="block text-[11px] font-medium text-slate-700">
                Ketik <strong>PULIHKAN</strong> untuk melanjutkan:
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="PULIHKAN"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-1.5 text-center text-xs font-bold tracking-widest text-slate-900"
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmRestoreModal(false);
                  setConfirmInput('');
                }}
                className="flex-1 rounded-xl border border-slate-300 py-2 text-xs font-semibold text-slate-700 active:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={confirmInput.trim().toUpperCase() !== 'PULIHKAN' || isLoading}
                onClick={handleExecuteRestore}
                className="flex-1 rounded-xl bg-rose-700 py-2 text-xs font-bold text-white shadow-xs active:bg-rose-800 disabled:opacity-40"
              >
                {isLoading ? 'Memproses...' : 'Ya, Pulihkan'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

