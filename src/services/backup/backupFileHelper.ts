import { Capacitor, registerPlugin } from '@capacitor/core';
import type { MamaminBackupPayload } from '../../domain/backup';

export interface LocalBackupFileInfo {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly modifiedAtMs: number;
}

interface BackupBridgePlugin {
  shareBackupFile(options: { fileName: string; content: string }): Promise<{
    success: boolean;
    fileName: string;
    uri: string;
  }>;
  saveToDownloads(options: { fileName: string; content: string }): Promise<{
    success: boolean;
    fileName: string;
    message: string;
  }>;
  listAvailableBackups(): Promise<{
    files: Array<{
      fileName: string;
      sizeBytes: number;
      modifiedAtMs: number;
    }>;
  }>;
  readBackupContent(options: { fileName: string }): Promise<{
    fileName: string;
    content: string;
  }>;
}

const BackupBridge = registerPlugin<BackupBridgePlugin>('BackupBridge');

/**
 * Memeriksa apakah perangkat mendukung pembagian file melalui Sharesheet native atau Web Share API.
 */
export function canShareBackupFile(): boolean {
  if (Capacitor.isNativePlatform()) {
    return true; // Native Android selalu mendukung Intent.ACTION_SEND
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    return true;
  }
  return false;
}

/**
 * Membagikan file backup melalui dialog native Android Sharesheet (Google Drive, WhatsApp, Email, dll).
 */
export async function shareBackupFile(
  payload: MamaminBackupPayload,
  filename: string,
): Promise<{ success: boolean; method: 'SHARE' | 'DOWNLOAD'; message: string }> {
  const jsonString = JSON.stringify(payload, null, 2);

  // 1. Jika di Android native APK: gunakan bridge native Intent.ACTION_SEND
  if (Capacitor.isNativePlatform()) {
    try {
      await BackupBridge.shareBackupFile({
        fileName: filename,
        content: jsonString,
      });
      return {
        success: true,
        method: 'SHARE',
        message: 'Dialog pembagian sistem (Sharesheet) berhasil dibuka.',
      };
    } catch {
      // Fallback ke penyimpanan download jika native share gagal
    }
  }

  // 2. Coba lewat Web Share API (jika browser desktop/mobile mendukung)
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const file = new File([blob], filename, { type: 'application/json' });
      if (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Cadangan Data MamaMin POS',
          text: `File cadangan data MamaMin POS: ${filename}`,
          files: [file],
        });
        return {
          success: true,
          method: 'SHARE',
          message: 'Dialog pembagian sistem (Sharesheet) berhasil dibuka.',
        };
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          success: true,
          method: 'SHARE',
          message: 'Pembagian dibatalkan oleh pengguna.',
        };
      }
    }
  }

  // 3. Fallback: Simpan file ke folder Download
  await downloadBackupFile(payload, filename);
  return {
    success: true,
    method: 'DOWNLOAD',
    message: `File cadangan "${filename}" berhasil disimpan ke folder Download.`,
  };
}

/**
 * Menyimpan file backup JSON secara langsung ke folder Download perangkat.
 */
export async function downloadBackupFile(
  payload: MamaminBackupPayload,
  filename: string,
): Promise<void> {
  const jsonString = JSON.stringify(payload, null, 2);

  // Di Android native: simpan ke public Download via MediaStore
  if (Capacitor.isNativePlatform()) {
    try {
      await BackupBridge.saveToDownloads({
        fileName: filename,
        content: jsonString,
      });
      return;
    } catch {
      // Fallback ke browser blob
    }
  }

  // Di Web browser: gunakan Blob download anchor
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Mengambil daftar file backup yang tersimpan di perangkat lokal Android.
 */
export async function listLocalBackups(): Promise<LocalBackupFileInfo[]> {
  if (!Capacitor.isNativePlatform()) {
    return [];
  }
  try {
    const res = await BackupBridge.listAvailableBackups();
    return res.files || [];
  } catch {
    return [];
  }
}

/**
 * Membaca isi string JSON dari file backup yang tersimpan di perangkat lokal Android.
 */
export async function readLocalBackupContent(fileName: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Pembacaan file lokal langsung hanya didukung di Android native');
  }
  const res = await BackupBridge.readBackupContent({ fileName });
  return res.content;
}
