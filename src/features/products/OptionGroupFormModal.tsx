import { useState } from 'react';
import { formatPlainRupiahDigits, parseRupiahInput } from '../../domain/money';
import type { OptionGroup } from '../../domain/types';

interface OptionItemDraft {
  readonly id?: string;
  readonly name: string;
  readonly unitPriceRupiah: number;
  readonly sortOrder: number;
}

interface OptionGroupFormModalProps {
  readonly group: OptionGroup | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSave: (data: {
    readonly name: string;
    readonly minSelected: number;
    readonly maxSelected: number | null;
    readonly sortOrder: number;
    readonly isActive: boolean;
    readonly options: readonly OptionItemDraft[];
  }) => Promise<void>;
  readonly onDelete?: (id: string) => Promise<void>;
}

export function OptionGroupFormModal({
  group,
  isOpen,
  onClose,
  onSave,
  onDelete,
}: OptionGroupFormModalProps) {
  const [name, setName] = useState<string>(group?.name ?? '');
  const [minSelected, setMinSelected] = useState<number>(group?.minSelected ?? 0);
  const [hasMaxLimit, setHasMaxLimit] = useState<boolean>(group?.maxSelected !== null);
  const [maxSelected, setMaxSelected] = useState<number>(group?.maxSelected ?? 1);
  const [sortOrder, setSortOrder] = useState<number>(group?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState<boolean>(group?.isActive ?? true);

  const [optionsDraft, setOptionsDraft] = useState<OptionItemDraft[]>(() =>
    group
      ? group.options.map((o) => ({
          id: o.id,
          name: o.name,
          unitPriceRupiah: o.unitPriceRupiah,
          sortOrder: o.sortOrder,
        }))
      : [
          { name: '', unitPriceRupiah: 0, sortOrder: 1 },
        ],
  );

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddOptionItem = () => {
    setOptionsDraft((prev) => [
      ...prev,
      {
        name: '',
        unitPriceRupiah: 0,
        sortOrder: prev.length + 1,
      },
    ]);
  };

  const handleUpdateOptionItem = (
    index: number,
    field: keyof OptionItemDraft,
    val: string | number,
  ) => {
    setOptionsDraft((prev) => {
      const next = [...prev];
      const item = { ...next[index]! };
      if (field === 'name') {
        item.name = String(val);
      } else if (field === 'unitPriceRupiah') {
        item.unitPriceRupiah = Number(val) || 0;
      }
      next[index] = item;
      return next;
    });
  };

  const handleRemoveOptionItem = (index: number) => {
    setOptionsDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Nama grup opsi wajib diisi.');
      return;
    }

    const calculatedMax = hasMaxLimit ? Math.max(0, maxSelected) : null;
    if (calculatedMax !== null && calculatedMax < minSelected) {
      setErrorMsg('Maksimal pilihan tidak boleh lebih kecil dari minimal pilihan.');
      return;
    }

    const validOptions = optionsDraft.filter((o) => o.name.trim().length > 0);
    if (validOptions.length === 0) {
      setErrorMsg('Tambahkan minimal 1 pilihan opsi.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSave({
        name: name.trim(),
        minSelected,
        maxSelected: calculatedMax,
        sortOrder,
        isActive,
        options: validOptions,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan grup opsi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!group || !onDelete) return;
    if (!window.confirm(`Hapus atau nonaktifkan grup opsi "${group.name}"?`)) return;
    setIsSubmitting(true);
    try {
      await onDelete(group.id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses grup opsi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
    >
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-base font-bold text-slate-900">
            {group ? 'Edit Grup Opsi / Topping' : 'Tambah Grup Opsi Baru'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto py-3">
          {errorMsg ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
              {errorMsg}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="group-name" className="block text-xs font-semibold text-slate-700">
                Nama Kelompok Opsi:
              </label>
              <input
                id="group-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Level Pedas, Topping Seblak..."
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <div>
              <label htmlFor="group-sort" className="block text-xs font-semibold text-slate-700">
                Urutan Tampil:
              </label>
              <input
                id="group-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="group-min" className="block text-xs font-semibold text-slate-700">
                Minimal Pilihan:
              </label>
              <input
                id="group-min"
                type="number"
                min={0}
                value={minSelected}
                onChange={(e) => setMinSelected(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
              <span className="text-[10px] text-slate-500">0 = Bebas / opsional</span>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="group-max" className="block text-xs font-semibold text-slate-700">
                  Maksimal Pilihan:
                </label>
                <label className="flex items-center gap-1 text-[10px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={hasMaxLimit}
                    onChange={(e) => setHasMaxLimit(e.target.checked)}
                  />
                  Batasi
                </label>
              </div>
              <input
                id="group-max"
                type="number"
                disabled={!hasMaxLimit}
                min={minSelected}
                value={hasMaxLimit ? maxSelected : ''}
                onChange={(e) => setMaxSelected(Math.max(minSelected, Number(e.target.value) || 1))}
                placeholder="Tanpa batas"
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>
          </div>

          {/* List Pilihan Opsi */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                Daftar Pilihan / Topping
              </span>
              <button
                type="button"
                onClick={handleAddOptionItem}
                className="rounded-lg bg-orange-700 px-2 py-1 text-[11px] font-bold text-white hover:bg-orange-800"
              >
                + Tambah Pilihan
              </button>
            </div>

            <div className="mt-2 space-y-2">
              {optionsDraft.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-lg bg-white p-2 shadow-2xs">
                  <div className="flex-1">
                    <input
                      type="text"
                      required
                      value={opt.name}
                      onChange={(e) => handleUpdateOptionItem(idx, 'name', e.target.value)}
                      placeholder="Nama pilihan (mis. Bakso)"
                      className="min-h-8 w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-900"
                    />
                  </div>
                  <div className="w-28">
                    <div className="flex items-center rounded border border-slate-300 bg-slate-50 px-1.5 py-1">
                      <span className="text-[10px] text-slate-500">Rp</span>
                      <input
                        type="text"
                        value={opt.unitPriceRupiah > 0 ? formatPlainRupiahDigits(opt.unitPriceRupiah) : '0'}
                        onChange={(e) => handleUpdateOptionItem(idx, 'unitPriceRupiah', parseRupiahInput(e.target.value))}
                        className="w-full bg-transparent text-right font-mono text-xs text-slate-900 outline-hidden"
                      />
                    </div>
                  </div>
                  {optionsDraft.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveOptionItem(idx)}
                      className="text-sm text-slate-400 hover:text-red-700"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="text-xs font-semibold text-slate-800">Status Aktif Grup</span>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-orange-700 peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            {group && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="min-h-11 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700"
              >
                Hapus
              </button>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-orange-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan Kelompok Opsi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
