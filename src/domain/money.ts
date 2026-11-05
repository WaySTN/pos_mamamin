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

export function formatRupiah(amountRupiah: number): string {
  assertNonNegativeIntegerRupiah(amountRupiah);
  return `Rp${rupiahNumberFormatter.format(amountRupiah)}`;
}

