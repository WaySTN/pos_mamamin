export const WIB_TIMEZONE = 'Asia/Jakarta' as const;

const wibDatePartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: WIB_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const wibDisplayDateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: WIB_TIMEZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Menghitung tanggal bisnis YYYY-MM-DD dalam zona waktu Asia/Jakarta (WIB)
 * dari epoch milidetik UTC tanpa mengandalkan toISOString().
 */
export function getBusinessDateWib(epochMs: number): string {
  if (!Number.isFinite(epochMs)) {
    throw new RangeError(`epochMs tidak valid: ${String(epochMs)}`);
  }

  const parts = wibDatePartsFormatter.formatToParts(new Date(epochMs));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Gagal mengekstrak komponen tanggal WIB');
  }

  return `${year}-${month}-${day}`;
}

export function formatDateTimeWib(epochMs: number): string {
  if (!Number.isFinite(epochMs)) {
    throw new RangeError(`epochMs tidak valid: ${String(epochMs)}`);
  }

  return `${wibDisplayDateTimeFormatter.format(new Date(epochMs))} WIB`;
}
