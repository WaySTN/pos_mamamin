import { useState } from 'react';
import {
  calculateLineTotalRupiah,
  calculateUnitTotalRupiah,
  validateOptionGroupSelection,
} from '../../domain/cart';
import { formatRupiah } from '../../domain/money';
import type {
  OptionGroup,
  ProductOption,
  ProductWithDetails,
  SelectedOptionInput,
} from '../../domain/types';

interface ProductCustomizerModalProps {
  readonly product: ProductWithDetails;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onAddToCart: (
    product: ProductWithDetails,
    options: readonly SelectedOptionInput[],
    quantity: number,
    notes: string | null,
  ) => void;
}

export function ProductCustomizerModal({
  product,
  isOpen,
  onClose,
  onAddToCart,
}: ProductCustomizerModalProps) {
  const [selectedOptionsMap, setSelectedOptionsMap] = useState<
    ReadonlyMap<string, { readonly option: ProductOption; readonly qty: number }>
  >(new Map());
  const [portionQuantity, setPortionQuantity] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');

  if (!isOpen) {
    return null;
  }

  const optionGroups = product.optionGroups ?? [];

  const handleToggleSingleChoice = (group: OptionGroup, option: ProductOption) => {
    setSelectedOptionsMap((prev) => {
      const next = new Map(prev);
      // Hapus pilihan lain di grup ini
      for (const opt of group.options) {
        if (opt.id !== option.id) {
          next.delete(opt.id);
        }
      }

      if (next.has(option.id)) {
        // Jika grup memperbolehkan 0 pilihan (minSelected === 0), bisa di-unselect
        if (group.minSelected === 0) {
          next.delete(option.id);
        }
      } else {
        next.set(option.id, { option, qty: 1 });
      }
      return next;
    });
  };

  const handleIncrementOptionQty = (group: OptionGroup, option: ProductOption) => {
    setSelectedOptionsMap((prev) => {
      const next = new Map(prev);
      const current = next.get(option.id)?.qty ?? 0;

      // Hitung total pilihan yang sudah ada di grup ini
      let groupTotalQty = 0;
      for (const opt of group.options) {
        groupTotalQty += next.get(opt.id)?.qty ?? 0;
      }

      if (group.maxSelected !== null && groupTotalQty >= group.maxSelected) {
        return prev;
      }

      next.set(option.id, { option, qty: current + 1 });
      return next;
    });
  };

  const handleDecrementOptionQty = (optionId: string) => {
    setSelectedOptionsMap((prev) => {
      const next = new Map(prev);
      const current = next.get(optionId)?.qty ?? 0;
      if (current <= 1) {
        next.delete(optionId);
      } else {
        const item = next.get(optionId)!;
        next.set(optionId, { option: item.option, qty: current - 1 });
      }
      return next;
    });
  };

  // Kumpulkan list SelectedOptionInput
  const selectedOptionsList: SelectedOptionInput[] = [];
  for (const { option, qty } of selectedOptionsMap.values()) {
    selectedOptionsList.push({
      optionId: option.id,
      optionName: option.name,
      unitPriceRupiah: option.unitPriceRupiah,
      quantityPerPortion: qty,
    });
  }

  // Validasi min/max per grup
  let allGroupsValid = true;
  const validationErrors: string[] = [];

  for (const group of optionGroups) {
    let countInGroup = 0;
    for (const opt of group.options) {
      countInGroup += selectedOptionsMap.get(opt.id)?.qty ?? 0;
    }
    const val = validateOptionGroupSelection(group, countInGroup);
    if (!val.isValid && val.message) {
      allGroupsValid = false;
      validationErrors.push(val.message);
    }
  }

  const unitTotalRupiah = calculateUnitTotalRupiah(
    product.basePriceRupiah,
    selectedOptionsList,
  );
  const lineTotalRupiah = calculateLineTotalRupiah(
    unitTotalRupiah,
    portionQuantity,
  );

  const handleSubmit = () => {
    if (!allGroupsValid) return;
    onAddToCart(
      product,
      selectedOptionsList,
      portionQuantity,
      notes.trim() ? notes.trim() : null,
    );
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="customizer-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
    >
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        {/* Header Modal */}
        <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <span className="text-[11px] font-semibold tracking-wide text-orange-800 uppercase">
              {product.categoryName}
            </span>
            <h3
              id="customizer-title"
              className="text-base font-bold text-slate-900"
            >
              {product.name}
            </h3>
            <p className="text-xs font-semibold text-slate-700">
              Harga Dasar: {formatRupiah(product.basePriceRupiah)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal kustomisasi"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Body Modal: Scrollable list of option groups */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {optionGroups.map((group) => {
            const isSingleChoice = group.maxSelected === 1;

            return (
              <section
                key={group.id}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <h4 className="text-sm font-bold text-slate-900">
                    {group.name}
                  </h4>
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    {group.minSelected > 0 && group.maxSelected === 1
                      ? 'Wajib pilih 1'
                      : group.minSelected > 0
                        ? `Wajib min ${String(group.minSelected)}`
                        : group.maxSelected !== null
                          ? `Maksimal ${String(group.maxSelected)}`
                          : 'Pilihan bebas'}
                  </span>
                </div>

                <div className="mt-2.5 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                  {group.options.map((option) => {
                    const selectedQty =
                      selectedOptionsMap.get(option.id)?.qty ?? 0;
                    const isSelected = selectedQty > 0;

                    return (
                      <div
                        key={option.id}
                        className="flex items-center justify-between px-3 py-2.5"
                      >
                        <div className="flex-1 pr-2">
                          <p className="text-xs font-semibold text-slate-900">
                            {option.name}
                          </p>
                          <p className="text-[11px] font-medium text-orange-800">
                            {option.unitPriceRupiah > 0
                              ? `+${formatRupiah(option.unitPriceRupiah)}`
                              : 'Gratis / Termasuk'}
                          </p>
                        </div>

                        {isSingleChoice ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleSingleChoice(group, option)
                            }
                            className={`min-h-9 min-w-16 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                              isSelected
                                ? 'bg-orange-700 text-white'
                                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {isSelected ? 'Terpilih' : 'Pilih'}
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {selectedQty > 0 ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDecrementOptionQty(option.id)
                                  }
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-800 active:bg-slate-100"
                                >
                                  -
                                </button>
                                <span className="w-6 text-center font-mono text-xs font-bold text-slate-900">
                                  {selectedQty}
                                </span>
                              </>
                            ) : null}
                            <button
                              type="button"
                              onClick={() =>
                                handleIncrementOptionQty(group, option)
                              }
                              className={`flex h-8 items-center justify-center rounded-lg px-2.5 text-xs font-semibold ${
                                selectedQty > 0
                                  ? 'border border-slate-300 bg-slate-100 text-slate-800'
                                  : 'border border-orange-600 bg-orange-50 text-orange-900'
                              }`}
                            >
                              + Tambah
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {/* Catatan Porsi */}
          <div>
            <label
              htmlFor="customizer-notes"
              className="block text-xs font-semibold text-slate-700"
            >
              Catatan Porsi (Opsional):
            </label>
            <input
              id="customizer-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: jangan pakai sawi, kuah dipisah..."
              className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            />
          </div>

          {/* Validasi Error Message */}
          {validationErrors.length > 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950">
              <ul className="list-inside list-disc space-y-0.5">
                {validationErrors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* Footer Modal: Quantity selector and Add button */}
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700">Porsi:</span>
              <button
                type="button"
                disabled={portionQuantity <= 1}
                onClick={() => setPortionQuantity((q) => Math.max(1, q - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-base font-bold text-slate-800 disabled:opacity-40"
              >
                -
              </button>
              <span className="w-6 text-center font-mono text-sm font-bold text-slate-900">
                {portionQuantity}
              </span>
              <button
                type="button"
                onClick={() => setPortionQuantity((q) => q + 1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-base font-bold text-slate-800"
              >
                +
              </button>
            </div>

            <button
              type="button"
              disabled={!allGroupsValid}
              onClick={handleSubmit}
              className="flex min-h-12 flex-1 items-center justify-between rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 active:bg-orange-800"
            >
              <span>+ Keranjang</span>
              <span className="font-mono">{formatRupiah(lineTotalRupiah)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

