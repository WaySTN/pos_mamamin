import { useCallback, useMemo, useState } from 'react';
import {
  addOrIncrementCartItem,
  calculateCartTotals,
  detectPriceDiscrepancies,
  removeCartItem,
  updateCartItemQuantity,
  type PriceDiscrepancyWarning,
} from '../../domain/cart';
import type {
  CartDraft,
  CartLineItem,
  ProductWithDetails,
  SelectedOptionInput,
} from '../../domain/types';

export interface UseCartReturn {
  readonly items: readonly CartLineItem[];
  readonly cart: CartDraft;
  readonly isCartOpen: boolean;
  readonly discrepancies: readonly PriceDiscrepancyWarning[];
  readonly addItem: (
    product: ProductWithDetails,
    options?: readonly SelectedOptionInput[],
    quantity?: number,
    notes?: string | null,
  ) => void;
  readonly updateQuantity: (lineId: string, newQuantity: number) => void;
  readonly removeItem: (lineId: string) => void;
  readonly clearCart: () => void;
  readonly openCart: () => void;
  readonly closeCart: () => void;
  readonly toggleCart: () => void;
  readonly checkCatalogPrices: (
    catalog: ReadonlyMap<string, ProductWithDetails>,
  ) => void;
}

export function useCart(): UseCartReturn {
  const [items, setItems] = useState<readonly CartLineItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [discrepancies, setDiscrepancies] = useState<
    readonly PriceDiscrepancyWarning[]
  >([]);

  const totals = useMemo(() => calculateCartTotals(items), [items]);

  const cart: CartDraft = useMemo(
    () => ({
      items,
      totalQuantity: totals.totalQuantity,
      subtotalRupiah: totals.subtotalRupiah,
      grandTotalRupiah: totals.grandTotalRupiah,
    }),
    [items, totals],
  );

  const addItem = useCallback(
    (
      product: ProductWithDetails,
      options: readonly SelectedOptionInput[] = [],
      quantity = 1,
      notes: string | null = null,
    ) => {
      setItems((prev) =>
        addOrIncrementCartItem(prev, {
          product,
          options,
          quantity,
          notes,
        }),
      );
    },
    [],
  );

  const updateQuantity = useCallback((lineId: string, newQuantity: number) => {
    setItems((prev) => updateCartItemQuantity(prev, lineId, newQuantity));
  }, []);

  const removeItem = useCallback((lineId: string) => {
    setItems((prev) => removeCartItem(prev, lineId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setDiscrepancies([]);
    setIsCartOpen(false);
  }, []);

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);
  const toggleCart = useCallback(() => setIsCartOpen((prev) => !prev), []);

  const checkCatalogPrices = useCallback(
    (catalog: ReadonlyMap<string, ProductWithDetails>) => {
      const found = detectPriceDiscrepancies(items, catalog);
      setDiscrepancies(found);
    },
    [items],
  );

  return {
    items,
    cart,
    isCartOpen,
    discrepancies,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    openCart,
    closeCart,
    toggleCart,
    checkCatalogPrices,
  };
}

