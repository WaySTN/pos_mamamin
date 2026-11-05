import {
  assertNonNegativeIntegerRupiah,
  assertPositiveInteger,
} from './money';
import type {
  CartDraft,
  CartLineItem,
  OptionGroup,
  ProductWithDetails,
  SelectedOptionInput,
} from './types';

/**
 * Menghitung total harga satuan per porsi:
 * base_price + sum(option_price * qty_per_portion)
 */
export function calculateUnitTotalRupiah(
  basePriceRupiah: number,
  options: readonly SelectedOptionInput[],
): number {
  assertNonNegativeIntegerRupiah(basePriceRupiah, 'basePriceRupiah');
  let total = basePriceRupiah;

  for (const opt of options) {
    assertNonNegativeIntegerRupiah(opt.unitPriceRupiah, 'option.unitPriceRupiah');
    assertPositiveInteger(opt.quantityPerPortion, 'option.quantityPerPortion');
    total += opt.unitPriceRupiah * opt.quantityPerPortion;
  }

  assertNonNegativeIntegerRupiah(total, 'unitTotalRupiah');
  return total;
}

/**
 * Menghitung total harga satu baris keranjang:
 * quantity * unitTotalRupiah
 */
export function calculateLineTotalRupiah(
  unitTotalRupiah: number,
  quantity: number,
): number {
  assertNonNegativeIntegerRupiah(unitTotalRupiah, 'unitTotalRupiah');
  assertPositiveInteger(quantity, 'quantity');
  const lineTotal = unitTotalRupiah * quantity;
  assertNonNegativeIntegerRupiah(lineTotal, 'lineTotalRupiah');
  return lineTotal;
}

/**
 * Menghitung total kuantitas dan grand total dari seluruh baris keranjang.
 */
export function calculateCartTotals(
  items: readonly CartLineItem[],
): Omit<CartDraft, 'items'> {
  let totalQuantity = 0;
  let subtotalRupiah = 0;

  for (const item of items) {
    totalQuantity += item.quantity;
    subtotalRupiah += item.lineTotalRupiah;
  }

  assertNonNegativeIntegerRupiah(subtotalRupiah, 'subtotalRupiah');

  return {
    totalQuantity,
    subtotalRupiah,
    grandTotalRupiah: subtotalRupiah, // MVP MamaMin tidak memungut pajak/layanan
  };
}

/**
 * Menghasilkan hash/key unik representasi item produk + kombinasi opsi + catatan.
 * Jika opsi dan catatan persis sama, item dapat digabung dengan menaikkan kuantitas.
 * Jika opsi atau catatan berbeda (misal 2 seblak beda topping), menjadi baris berbeda!
 */
export function createCartLineKey(
  productId: string,
  options: readonly SelectedOptionInput[],
  notes: string | null = null,
): string {
  const normalizedNotes = notes?.trim().toLowerCase() ?? '';
  const sortedOptions = [...options].sort((a, b) =>
    a.optionId.localeCompare(b.optionId),
  );
  const optionsSignature = sortedOptions
    .map((o) => `${o.optionId}:${String(o.quantityPerPortion)}`)
    .join('|');

  return `${productId}__[${optionsSignature}]__(${normalizedNotes})`;
}

export interface AddItemToCartInput {
  readonly product: ProductWithDetails;
  readonly options?: readonly SelectedOptionInput[];
  readonly quantity?: number;
  readonly notes?: string | null;
}

/**
 * Menambahkan item ke keranjang atau menaikkan kuantitas jika baris identik sudah ada.
 */
export function addOrIncrementCartItem(
  currentItems: readonly CartLineItem[],
  input: AddItemToCartInput,
): readonly CartLineItem[] {
  if (!input.product.isActive || !input.product.isAvailable) {
    throw new Error(
      `Produk "${input.product.name}" sedang nonaktif atau tidak tersedia sehingga tidak dapat dimasukkan ke keranjang.`,
    );
  }

  const quantityToAdd = input.quantity ?? 1;
  assertPositiveInteger(quantityToAdd, 'quantity');

  const options = input.options ?? [];
  const trimmedNotes = input.notes?.trim() ? input.notes.trim() : null;

  const unitTotalRupiah = calculateUnitTotalRupiah(
    input.product.basePriceRupiah,
    options,
  );

  const targetSignature = createCartLineKey(
    input.product.id,
    options,
    trimmedNotes,
  );

  const existingIndex = currentItems.findIndex(
    (item) =>
      createCartLineKey(item.productId, item.options, item.notes) ===
      targetSignature,
  );

  if (existingIndex >= 0) {
    const existing = currentItems[existingIndex]!;
    const newQty = existing.quantity + quantityToAdd;
    const newLineTotal = calculateLineTotalRupiah(existing.unitTotalRupiah, newQty);

    const updatedItem: CartLineItem = {
      ...existing,
      quantity: newQty,
      lineTotalRupiah: newLineTotal,
    };

    const next = [...currentItems];
    next[existingIndex] = updatedItem;
    return next;
  }

  const newLineTotal = calculateLineTotalRupiah(unitTotalRupiah, quantityToAdd);
  const newLineItem: CartLineItem = {
    lineId: `line_${String(Date.now())}_${Math.random().toString(36).slice(2, 7)}`,
    productId: input.product.id,
    productName: input.product.name,
    baseUnitPriceRupiah: input.product.basePriceRupiah,
    quantity: quantityToAdd,
    options,
    unitTotalRupiah,
    lineTotalRupiah: newLineTotal,
    notes: trimmedNotes,
  };

  return [...currentItems, newLineItem];
}

/**
 * Mengubah kuantitas satu baris keranjang. Jika kuantitas <= 0, baris dihapus.
 */
export function updateCartItemQuantity(
  currentItems: readonly CartLineItem[],
  lineId: string,
  newQuantity: number,
): readonly CartLineItem[] {
  if (newQuantity <= 0) {
    return currentItems.filter((item) => item.lineId !== lineId);
  }

  assertPositiveInteger(newQuantity, 'newQuantity');

  return currentItems.map((item) => {
    if (item.lineId !== lineId) {
      return item;
    }
    const lineTotalRupiah = calculateLineTotalRupiah(
      item.unitTotalRupiah,
      newQuantity,
    );
    return {
      ...item,
      quantity: newQuantity,
      lineTotalRupiah,
    };
  });
}

/**
 * Menghapus satu baris keranjang berdasarkan lineId.
 */
export function removeCartItem(
  currentItems: readonly CartLineItem[],
  lineId: string,
): readonly CartLineItem[] {
  return currentItems.filter((item) => item.lineId !== lineId);
}

export interface OptionValidationResult {
  readonly isValid: boolean;
  readonly message?: string;
}

/**
 * Memvalidasi batas pemilihan opsi dalam satu kelompok opsi (min_selected dan max_selected).
 */
export function validateOptionGroupSelection(
  group: OptionGroup,
  selectedCount: number,
): OptionValidationResult {
  if (selectedCount < group.minSelected) {
    return {
      isValid: false,
      message: `Pilih minimal ${String(group.minSelected)} pilihan untuk "${group.name}".`,
    };
  }

  if (group.maxSelected !== null && selectedCount > group.maxSelected) {
    return {
      isValid: false,
      message: `Maksimal pilihan untuk "${group.name}" adalah ${String(group.maxSelected)}.`,
    };
  }

  return { isValid: true };
}

export interface PriceDiscrepancyWarning {
  readonly lineId: string;
  readonly productName: string;
  readonly cartBasePrice: number;
  readonly catalogBasePrice: number;
}

/**
 * Memeriksa apakah ada perubahan harga katalog saat keranjang masih aktif,
 * agar kasir mendapat peringatan transparan tanpa harga berubah diam-diam.
 */
export function detectPriceDiscrepancies(
  cartItems: readonly CartLineItem[],
  catalogProducts: ReadonlyMap<string, ProductWithDetails>,
): readonly PriceDiscrepancyWarning[] {
  const warnings: PriceDiscrepancyWarning[] = [];

  for (const item of cartItems) {
    const catalog = catalogProducts.get(item.productId);
    if (catalog && catalog.basePriceRupiah !== item.baseUnitPriceRupiah) {
      warnings.push({
        lineId: item.lineId,
        productName: item.productName,
        cartBasePrice: item.baseUnitPriceRupiah,
        catalogBasePrice: catalog.basePriceRupiah,
      });
    }
  }

  return warnings;
}

