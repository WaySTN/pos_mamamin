import { describe, expect, it } from 'vitest';
import {
  addOrIncrementCartItem,
  calculateCartTotals,
  calculateLineTotalRupiah,
  calculateUnitTotalRupiah,
  createCartLineKey,
  detectPriceDiscrepancies,
  removeCartItem,
  updateCartItemQuantity,
  validateOptionGroupSelection,
} from '../../src/domain/cart';
import type {
  CartLineItem,
  OptionGroup,
  ProductWithDetails,
  SelectedOptionInput,
} from '../../src/domain/types';

describe('domain/cart: Pure Calculation & Cart Invariants', () => {
  const dummyProduct: ProductWithDetails = {
    id: 'prod_mie_01',
    categoryId: 'cat_mie',
    categoryName: 'Mie Ayam & Yamin',
    name: 'Mie Ayam Original',
    sku: 'MIE-01',
    pricingMode: 'BASE_PLUS_OPTIONS',
    basePriceRupiah: 10_000,
    isActive: true,
    isAvailable: true,
    sortOrder: 1,
    createdAtMs: 1000,
    updatedAtMs: 1000,
    optionGroups: [],
  };

  const dummySeblak: ProductWithDetails = {
    id: 'prod_seblak_01',
    categoryId: 'cat_seblak',
    categoryName: 'Seblak',
    name: 'Seblak Prasmanan',
    sku: 'SEB-01',
    pricingMode: 'BASE_PLUS_OPTIONS',
    basePriceRupiah: 5_000,
    isActive: true,
    isAvailable: true,
    sortOrder: 2,
    createdAtMs: 1000,
    updatedAtMs: 1000,
    optionGroups: [],
  };

  it('calculates unit total correctly with base price and options per portion (T03)', () => {
    // 1 Mie Ayam (10.000) + Bakso (4.000) + Pangsit (3.000) = 17.000
    const options: SelectedOptionInput[] = [
      {
        optionId: 'opt_bakso',
        optionName: 'Bakso Sapi',
        unitPriceRupiah: 4_000,
        quantityPerPortion: 1,
      },
      {
        optionId: 'opt_pangsit',
        optionName: 'Pangsit',
        unitPriceRupiah: 3_000,
        quantityPerPortion: 1,
      },
    ];

    const unitTotal = calculateUnitTotalRupiah(10_000, options);
    expect(unitTotal).toBe(17_000);

    const lineTotal = calculateLineTotalRupiah(unitTotal, 2);
    expect(lineTotal).toBe(34_000);
  });

  it('correctly calculates Seblak Prasmanan with Level Pedas (Rp0) and Sosis Sapi (+Rp2.000)', () => {
    const options: SelectedOptionInput[] = [
      {
        optionId: 'opt_level_2',
        optionName: 'Level 2 (Pedas)',
        unitPriceRupiah: 0,
        quantityPerPortion: 1,
      },
      {
        optionId: 'opt_sosis',
        optionName: 'Sosis Sapi',
        unitPriceRupiah: 2_000,
        quantityPerPortion: 1,
      },
    ];

    // Base: 5.000 + Level 2: 0 + Sosis Sapi: 2.000 = 7.000
    const unitTotal = calculateUnitTotalRupiah(dummySeblak.basePriceRupiah, options);
    expect(unitTotal).toBe(7_000);

    const items = addOrIncrementCartItem([], {
      product: dummySeblak,
      options,
      quantity: 1,
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.unitTotalRupiah).toBe(7_000);
    expect(items[0]?.lineTotalRupiah).toBe(7_000);
    expect(items[0]?.options).toHaveLength(2);
    expect(items[0]?.options[0]?.optionName).toBe('Level 2 (Pedas)');
    expect(items[0]?.options[1]?.optionName).toBe('Sosis Sapi');

    const totals = calculateCartTotals(items);
    expect(totals.totalQuantity).toBe(1);
    expect(totals.grandTotalRupiah).toBe(7_000);
  });

  it('merges identical items into one line by incrementing quantity', () => {
    const options: SelectedOptionInput[] = [
      {
        optionId: 'opt_level_1',
        optionName: 'Level 1',
        unitPriceRupiah: 0,
        quantityPerPortion: 1,
      },
    ];

    let items: readonly CartLineItem[] = [];
    items = addOrIncrementCartItem(items, {
      product: dummyProduct,
      options,
      quantity: 1,
      notes: 'Kuah banyak',
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(1);

    // Tambah item yang sama persis (opsi dan catatan sama)
    items = addOrIncrementCartItem(items, {
      product: dummyProduct,
      options,
      quantity: 2,
      notes: 'Kuah banyak',
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(3);
    expect(items[0]?.lineTotalRupiah).toBe(30_000);
  });

  it('separates products with DIFFERENT option configurations into distinct cart lines (T08)', () => {
    // Seblak Porsi 1: Kerupuk (1.500) + Bakso (2.000) = 8.500
    const optionsPortion1: SelectedOptionInput[] = [
      {
        optionId: 'opt_kerupuk',
        optionName: 'Kerupuk',
        unitPriceRupiah: 1_500,
        quantityPerPortion: 1,
      },
      {
        optionId: 'opt_bakso',
        optionName: 'Bakso',
        unitPriceRupiah: 2_000,
        quantityPerPortion: 1,
      },
    ];

    // Seblak Porsi 2: Ceker (4.000) + Telur (3.000) = 12.000
    const optionsPortion2: SelectedOptionInput[] = [
      {
        optionId: 'opt_ceker',
        optionName: 'Ceker',
        unitPriceRupiah: 4_000,
        quantityPerPortion: 1,
      },
      {
        optionId: 'opt_telur',
        optionName: 'Telur',
        unitPriceRupiah: 3_000,
        quantityPerPortion: 1,
      },
    ];

    let items: readonly CartLineItem[] = [];
    items = addOrIncrementCartItem(items, {
      product: dummySeblak,
      options: optionsPortion1,
      quantity: 1,
    });
    items = addOrIncrementCartItem(items, {
      product: dummySeblak,
      options: optionsPortion2,
      quantity: 1,
    });

    // Wajib menjadi 2 baris terpisah!
    expect(items).toHaveLength(2);
    expect(items[0]?.unitTotalRupiah).toBe(8_500);
    expect(items[1]?.unitTotalRupiah).toBe(12_000);

    const totals = calculateCartTotals(items);
    expect(totals.totalQuantity).toBe(2);
    expect(totals.grandTotalRupiah).toBe(20_500);
  });

  it('creates distinct cart line keys for different option configurations (Question 6 audit)', () => {
    const keyA = createCartLineKey(
      'prod_seblak_01',
      [{ optionId: 'opt_level_1', optionName: 'Level 1', unitPriceRupiah: 0, quantityPerPortion: 1 }],
      '',
    );
    const keyB = createCartLineKey(
      'prod_seblak_01',
      [{ optionId: 'opt_level_2', optionName: 'Level 2', unitPriceRupiah: 0, quantityPerPortion: 1 }],
      '',
    );
    const keySameA = createCartLineKey(
      'prod_seblak_01',
      [{ optionId: 'opt_level_1', optionName: 'Level 1', unitPriceRupiah: 0, quantityPerPortion: 1 }],
      '',
    );

    expect(keyA).not.toBe(keyB);
    expect(keyA).toBe(keySameA);
  });

  it('separates identical items with different notes', () => {
    let items: readonly CartLineItem[] = [];
    items = addOrIncrementCartItem(items, {
      product: dummyProduct,
      quantity: 1,
      notes: 'Jangan pedas',
    });
    items = addOrIncrementCartItem(items, {
      product: dummyProduct,
      quantity: 1,
      notes: 'Ekstra pedas',
    });

    expect(items).toHaveLength(2);
  });

  it('rejects adding inactive or unavailable products', () => {
    const inactiveProd: ProductWithDetails = {
      ...dummyProduct,
      isActive: false,
    };
    const unavailableProd: ProductWithDetails = {
      ...dummyProduct,
      isAvailable: false,
    };

    expect(() =>
      addOrIncrementCartItem([], { product: inactiveProd }),
    ).toThrow();
    expect(() =>
      addOrIncrementCartItem([], { product: unavailableProd }),
    ).toThrow();
  });

  it('updates quantity and deletes item when quantity drops to zero', () => {
    let items: readonly CartLineItem[] = addOrIncrementCartItem([], {
      product: dummyProduct,
      quantity: 2,
    });

    const lineId = items[0]!.lineId;
    items = updateCartItemQuantity(items, lineId, 5);
    expect(items[0]?.quantity).toBe(5);
    expect(items[0]?.lineTotalRupiah).toBe(50_000);

    // Update ke 0 -> otomatis terhapus
    items = updateCartItemQuantity(items, lineId, 0);
    expect(items).toHaveLength(0);

    // Hapus via removeCartItem
    items = addOrIncrementCartItem([], { product: dummyProduct, quantity: 1 });
    items = removeCartItem(items, items[0]!.lineId);
    expect(items).toHaveLength(0);
  });

  it('validates option group min and max selection constraints', () => {
    const singleChoiceGroup: OptionGroup = {
      id: 'grp_single',
      name: 'Pilihan Kuah',
      minSelected: 1,
      maxSelected: 1,
      sortOrder: 1,
      isActive: true,
      options: [],
    };

    // Belum pilih -> gagal (min 1)
    const val0 = validateOptionGroupSelection(singleChoiceGroup, 0);
    expect(val0.isValid).toBe(false);
    expect(val0.message).toContain('minimal 1');

    // Pilih 1 -> valid
    const val1 = validateOptionGroupSelection(singleChoiceGroup, 1);
    expect(val1.isValid).toBe(true);

    // Pilih 2 -> gagal (maks 1)
    const val2 = validateOptionGroupSelection(singleChoiceGroup, 2);
    expect(val2.isValid).toBe(false);
    expect(val2.message).toContain('Maksimal');
  });

  it('detects catalog price discrepancies for active cart draft', () => {
    const items: readonly CartLineItem[] = addOrIncrementCartItem([], {
      product: dummyProduct, // base price 10.000
      quantity: 1,
    });

    // Simulasi harga katalog master diedit menjadi 12.000
    const catalogMap = new Map<string, ProductWithDetails>();
    catalogMap.set(dummyProduct.id, {
      ...dummyProduct,
      basePriceRupiah: 12_000,
    });

    const warnings = detectPriceDiscrepancies(items, catalogMap);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.cartBasePrice).toBe(10_000);
    expect(warnings[0]?.catalogBasePrice).toBe(12_000);
  });

  it('correctly calculates official MamaMin Seblak Prasmanan: Rp3.000 base + Rp10.000 toppings = Rp13.000', () => {
    // Skenario konfirmasi owner:
    // "seblak itu biaya nya auto langsung 3k, beda samaa toping2 lain,
    // misal nih orang menganbil toping total 10k itu nanti bayarnya 13k (soalnya 3k ini biaya masak kuah dll)"
    const officialSeblak: ProductWithDetails = {
      id: 'prod_seblak_official',
      categoryId: 'cat_seblak',
      categoryName: 'Seblak',
      name: 'Seblak Prasmanan',
      sku: 'SEB-01',
      pricingMode: 'BASE_PLUS_OPTIONS',
      basePriceRupiah: 3_000, // Biaya kuah/masak dasar
      isActive: true,
      isAvailable: true,
      sortOrder: 1,
      createdAtMs: 1000,
      updatedAtMs: 1000,
      optionGroups: [],
    };

    // Topping: Kerupuk (1k) + Sawi (1k) + Jamur Enoki (1k) + Telur (3k) + Ceker (2k) + Chikuwa (2k) = 10k
    const selectedToppings: SelectedOptionInput[] = [
      { optionId: 'opt_kerupuk', optionName: 'Kerupuk Seblak', unitPriceRupiah: 1_000, quantityPerPortion: 1 },
      { optionId: 'opt_sawi', optionName: 'Sawi Hijau', unitPriceRupiah: 1_000, quantityPerPortion: 1 },
      { optionId: 'opt_enoki', optionName: 'Jamur Enoki', unitPriceRupiah: 1_000, quantityPerPortion: 1 },
      { optionId: 'opt_telur', optionName: 'Telur', unitPriceRupiah: 3_000, quantityPerPortion: 1 },
      { optionId: 'opt_ceker', optionName: 'Ceker', unitPriceRupiah: 2_000, quantityPerPortion: 1 },
      { optionId: 'opt_chikuwa', optionName: 'Chikuwa', unitPriceRupiah: 2_000, quantityPerPortion: 1 },
    ];

    const toppingsSum = selectedToppings.reduce(
      (sum, opt) => sum + opt.unitPriceRupiah * opt.quantityPerPortion,
      0,
    );
    expect(toppingsSum).toBe(10_000);

    const unitTotal = calculateUnitTotalRupiah(officialSeblak.basePriceRupiah, selectedToppings);
    expect(unitTotal).toBe(13_000); // 3.000 + 10.000 = 13.000

    const cart = addOrIncrementCartItem([], {
      product: officialSeblak,
      options: selectedToppings,
      quantity: 2, // 2 porsi seblak dengan kombinasi topping yang sama
    });

    const totals = calculateCartTotals(cart);
    expect(totals.totalQuantity).toBe(2);
    expect(totals.grandTotalRupiah).toBe(26_000); // 13.000 * 2 = 26.000
  });

  it('correctly calculates official Mie Ayam Biasa vs Mie Yamin pricing', () => {
    // Mie Ayam Biasa (10k) + Telur (3k) + Ceker (3k) = 16k
    const unitMieAyam = calculateUnitTotalRupiah(10_000, [
      { optionId: 'opt_telur', optionName: 'Telur', unitPriceRupiah: 3_000, quantityPerPortion: 1 },
      { optionId: 'opt_ceker', optionName: 'Ceker', unitPriceRupiah: 3_000, quantityPerPortion: 1 },
    ]);
    expect(unitMieAyam).toBe(16_000);

    // Mie Yamin (10k) + Level Pedas Sedang (0k) + Pentol (3k) = 13k
    const unitMieYamin = calculateUnitTotalRupiah(10_000, [
      { optionId: 'opt_pedas_sedang', optionName: 'Sedang', unitPriceRupiah: 0, quantityPerPortion: 1 },
      { optionId: 'opt_pentol', optionName: 'Pentol', unitPriceRupiah: 3_000, quantityPerPortion: 1 },
    ]);
    expect(unitMieYamin).toBe(13_000);
  });
});

