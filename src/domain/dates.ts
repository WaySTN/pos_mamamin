export const WIB_TIMEZONE = 'Asia/Jakarta' as const;

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const wibDatePartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: WIB_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const wibDateTimePartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: WIB_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
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

export function assertValidBusinessDate(businessDate: string): void {
  if (!BUSINESS_DATE_PATTERN.test(businessDate)) {
    throw new RangeError(
      `businessDate harus berformat YYYY-MM-DD, diterima: ${businessDate}`,
    );
  }
}

export function formatDateTimeWib(epochMs: number): string {
  if (!Number.isFinite(epochMs)) {
    throw new RangeError(`epochMs tidak valid: ${String(epochMs)}`);
  }

  return `${wibDisplayDateTimeFormatter.format(new Date(epochMs))} WIB`;
}

/**
 * Format waktu deterministik ASCII `DD/MM/YYYY HH:mm WIB` untuk struk thermal 58 mm.
 */
export function formatReceiptDateTimeWib(epochMs: number): string {
  if (!Number.isFinite(epochMs)) {
    throw new RangeError(`epochMs tidak valid: ${String(epochMs)}`);
  }

  const parts = wibDateTimePartsFormatter.formatToParts(new Date(epochMs));
  const day = parts.find((part) => part.type === 'day')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const year = parts.find((part) => part.type === 'year')?.value;
  const rawHour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;

  if (!day || !month || !year || !rawHour || !minute) {
    throw new Error('Gagal memformat waktu struk WIB');
  }

  const hour = rawHour === '24' ? '00' : rawHour;
  return `${day}/${month}/${year} ${hour}:${minute} WIB`;
}
