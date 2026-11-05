import {
  assertNonNegativeIntegerRupiah,
  assertPositiveInteger,
} from './money';
import type { CartLineItem } from './types';
import type {
  CreateSaleItemInput,
  CreateSaleOptionInput,
} from '../database/repositories/transactionRepository';

export interface CashPaymentValidation {
  readonly isValid: boolean;
  readonly changeRupiah: number;
  readonly errorMessage?: string;
}

export interface QrisPaymentValidation {
  readonly isValid: boolean;
  readonly errorMessage?: string;
}

/**
 * Validasi pembayaran tunai (CASH):
 * - Nominal uang diterima dan grand total harus berupa integer Rupiah nonnegatif (zero float).
 * - Uang diterima harus >= grand total.
 * - Menghitung kembalian: cashReceived - grandTotal.
 */
export function validateCashPayment(
  grandTotalRupiah: number,
  cashReceivedRupiah: number,
): CashPaymentValidation {
  try {
    assertNonNegativeIntegerRupiah(grandTotalRupiah, 'grandTotalRupiah');
    assertNonNegativeIntegerRupiah(cashReceivedRupiah, 'cashReceivedRupiah');
  } catch (err) {
    return {
      isValid: false,
      changeRupiah: 0,
      errorMessage: err instanceof Error ? err.message : 'Nominal rupiah tidak valid.',
    };
  }

  if (cashReceivedRupiah < grandTotalRupiah) {
    const deficit = grandTotalRupiah - cashReceivedRupiah;
    return {
      isValid: false,
      changeRupiah: 0,
      errorMessage: `Uang diterima kurang Rp${deficit.toLocaleString('id-ID')}.`,
    };
  }

  const changeRupiah = cashReceivedRupiah - grandTotalRupiah;
  return {
    isValid: true,
    changeRupiah,
  };
}

/**
 * Validasi pembayaran QRIS Manual:
 * - Kasir harus mengonfirmasi manual bahwa pembayaran telah masuk di perangkat/alat kasir.
 * - Tidak ada uang kembalian (selalu 0).
 */
export function validateQrisPayment(isConfirmedManually: boolean): QrisPaymentValidation {
  if (isConfirmedManually !== true) {
    return {
      isValid: false,
      errorMessage:
        'Kasir wajib mengonfirmasi bahwa dana QRIS telah masuk sebelum menyelesaikan transaksi.',
    };
  }
  return {
    isValid: true,
  };
}

/**
 * Menghitung opsi nominal uang pas & pecahan umum Rupiah untuk kemudahan kasir.
 */
export function getQuickCashSuggestions(grandTotalRupiah: number): readonly number[] {
  if (grandTotalRupiah <= 0 || !Number.isSafeInteger(grandTotalRupiah)) {
    return [0];
  }

  const suggestions = new Set<number>();
  suggestions.add(grandTotalRupiah); // Uang Pas

  // Round up to nearest 5.000 & 10.000
  const roundTo5k = Math.ceil(grandTotalRupiah / 5_000) * 5_000;
  if (roundTo5k > grandTotalRupiah) suggestions.add(roundTo5k);

  const roundTo10k = Math.ceil(grandTotalRupiah / 10_000) * 10_000;
  if (roundTo10k > grandTotalRupiah) suggestions.add(roundTo10k);

  const roundTo20k = Math.ceil(grandTotalRupiah / 20_000) * 20_000;
  if (roundTo20k > grandTotalRupiah) suggestions.add(roundTo20k);

  const roundTo50k = Math.ceil(grandTotalRupiah / 50_000) * 50_000;
  if (roundTo50k > grandTotalRupiah) suggestions.add(roundTo50k);

  const roundTo100k = Math.ceil(grandTotalRupiah / 100_000) * 100_000;
  if (roundTo100k > grandTotalRupiah) suggestions.add(roundTo100k);

  // Common denominations
  for (const denom of [10_000, 20_000, 50_000, 100_000]) {
    if (denom >= grandTotalRupiah) {
      suggestions.add(denom);
    }
  }

  return Array.from(suggestions).sort((a, b) => a - b).slice(0, 5);
}

/**
 * Mengonversi CartLineItem dari state kasir menjadi CreateSaleItemInput
 * dengan ID unik deterministik & snapshot harga beku sesuai Blueprint §5.
 */
export function prepareSaleItemsFromCart(
  cartItems: readonly CartLineItem[],
  transactionId: string,
): readonly CreateSaleItemInput[] {
  if (cartItems.length === 0) {
    throw new RangeError('Keranjang belanja kosong.');
  }

  return cartItems.map((item, itemIdx) => {
    assertPositiveInteger(item.quantity, 'item.quantity');
    assertNonNegativeIntegerRupiah(item.baseUnitPriceRupiah, 'item.baseUnitPriceRupiah');

    const itemId = `txi_${transactionId}_${String(itemIdx + 1)}`;

    const options: CreateSaleOptionInput[] = item.options.map((opt, optIdx) => {
      assertNonNegativeIntegerRupiah(opt.unitPriceRupiah, 'opt.unitPriceRupiah');
      assertPositiveInteger(opt.quantityPerPortion, 'opt.quantityPerPortion');

      return {
        id: `txo_${itemId}_${String(optIdx + 1)}`,
        optionId: opt.optionId,
        optionNameSnapshot: opt.optionName,
        unitPriceRupiah: opt.unitPriceRupiah,
        quantityPerPortion: opt.quantityPerPortion,
      };
    });

    return {
      id: itemId,
      productId: item.productId,
      productNameSnapshot: item.productName,
      baseUnitPriceRupiah: item.baseUnitPriceRupiah,
      quantity: item.quantity,
      notes: item.notes || null,
      options,
    };
  });
}

