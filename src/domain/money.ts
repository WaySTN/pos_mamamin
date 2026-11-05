const rupiahNumberFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function isNonNegativeIntegerRupiah(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function assertNonNegativeIntegerRupiah(
  value: number,
  fieldName = 'amountRupiah',
): void {
  if (!isNonNegativeIntegerRupiah(value)) {
    throw new RangeError(
      `${fieldName} harus berupa integer Rupiah nonnegatif, diterima: ${String(value)}`,
    );
  }
}

export function assertPositiveInteger(
  value: number,
  fieldName = 'quantity',
): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(
      `${fieldName} harus berupa integer positif (> 0), diterima: ${String(value)}`,
    );
  }
}

export function formatRupiah(amountRupiah: number): string {
  assertNonNegativeIntegerRupiah(amountRupiah);
  return `Rp${rupiahNumberFormatter.format(amountRupiah)}`;
}

/**
 * Format angka Rupiah murni ASCII dengan pemisah ribuan titik (mis. `16.000`)
 * tanpa karakter spasi non-ASCII agar aman pada codepage ESC/POS 58 mm.
 */
export function formatPlainRupiahDigits(amountRupiah: number): string {
  assertNonNegativeIntegerRupiah(amountRupiah);
  return String(amountRupiah).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
