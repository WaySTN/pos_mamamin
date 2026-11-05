import { useState } from 'react';
import { formatPlainRupiahDigits, parseRupiahInput } from '../../domain/money';
import type {
  Category,
  OptionGroup,
  PricingMode,
  ProductWithDetails,
} from '../../domain/types';

interface ProductFormModalProps {
  readonly product: ProductWithDetails | null;
  readonly categories: readonly Category[];
  readonly allOptionGroups: readonly OptionGroup[];
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSave: (data: {
    readonly categoryId: string;
    readonly name: string;
    readonly sku: string | null;
    readonly pricingMode: PricingMode;
    readonly basePriceRupiah: number;
    readonly isActive: boolean;
    readonly isAvailable: boolean;
    readonly sortOrder: number;
    readonly optionGroupIds: readonly string[];
  }) => Promise<void>;
  readonly onDelete?: (id: string) => Promise<void>;
}

export function ProductFormModal({
  product,
  categories,
  allOptionGroups,
  isOpen,
  onClose,
  onSave,
  onDelete,
}: ProductFormModalProps) {
  const [name, setName] = useState<string>(product?.name ?? '');
  const [categoryId, setCategoryId] = useState<string>(
    product?.categoryId ?? (categories[0]?.id ?? ''),
  );
  const [sku, setSku] = useState<string>(product?.sku ?? '');
  const [pricingMode, setPricingMode] = useState<PricingMode>(
    product?.pricingMode ?? 'FIXED',
  );
  const [basePriceRupiah, setBasePriceRupiah] = useState<number>(
    product?.basePriceRupiah ?? 0,
  );
  const [isAvailable, setIsAvailable] = useState<boolean>(
    product?.isAvailable ?? true,
  );
  const [isActive, setIsActive] = useState<boolean>(product?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState<number>(product?.sortOrder ?? 0);

  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(() => {
    return new Set(product ? product.optionGroups.map((g) => g.id) : []);
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleToggleOptionGroup = (groupId: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Nama produk wajib diisi.');
      return;
    }
    if (!categoryId) {
      setErrorMsg('Kategori produk wajib dipilih.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSave({
        categoryId,
        name: name.trim(),
        sku: sku.trim() ? sku.trim() : null,
        pricingMode,
        basePriceRupiah,
        isActive,
        isAvailable,
        sortOrder,
        optionGroupIds: Array.from(selectedGroupIds),
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan produk.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!product || !onDelete) return;
    if (!window.confirm(`Hapus atau nonaktifkan produk "${product.name}"?`)) return;
    setIsSubmitting(true);
    try {
      await onDelete(product.id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses produk.');
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
            {product ? 'Edit Produk Menu' : 'Tambah Produk Menu Baru'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-3.5 overflow-y-auto py-3">
          {errorMsg ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
              {errorMsg}
            </div>
          ) : null}

          <div>
            <label htmlFor="prod-name" className="block text-xs font-semibold text-slate-700">
              Nama Produk:
            </label>
            <input
              id="prod-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Mie Ayam Original, Seblak Prasmanan..."
              className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="prod-cat" className="block text-xs font-semibold text-slate-700">
                Kategori:
              </label>
              <select
                id="prod-cat"
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="prod-sku" className="block text-xs font-semibold text-slate-700">
                Kode / SKU (Opsional):
              </label>
              <input
                id="prod-sku"
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Mis. MIE-01"
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label htmlFor="prod-mode" className="block text-xs font-semibold text-slate-700">
                Model Harga:
              </label>
              <select
                id="prod-mode"
                value={pricingMode}
                onChange={(e) => setPricingMode(e.target.value as PricingMode)}
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900"
              >
                <option value="FIXED">Tetap</option>
                <option value="BASE_PLUS_OPTIONS">Topping</option>
              </select>
            </div>

            <div>
              <label htmlFor="prod-price" className="block text-xs font-semibold text-slate-700">
                Harga Dasar:
              </label>
              <div className="mt-1 flex items-center rounded-lg border border-slate-300 bg-white px-2 py-2">
                <span className="text-xs font-bold text-slate-400">Rp</span>
                <input
                  id="prod-price"
                  type="text"
                  required
                  value={basePriceRupiah > 0 ? formatPlainRupiahDigits(basePriceRupiah) : '0'}
                  onChange={(e) => setBasePriceRupiah(parseRupiahInput(e.target.value))}
                  className="w-full pl-1 font-mono text-xs font-bold text-slate-900 outline-hidden"
                />
              </div>
            </div>

            <div>
              <label htmlFor="prod-sort" className="block text-xs font-semibold text-slate-700">
                Urutan:
              </label>
              <input
                id="prod-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-2 py-2 text-xs text-slate-900"
              />
            </div>
          </div>

          {/* Opsi / Topping Selector */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-xs font-bold text-slate-800">
              Kelompok Opsi / Topping yang Berlaku:
            </span>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Centang grup opsi yang bisa dipilih pembeli saat memesan produk ini.
            </p>

            {allOptionGroups.length === 0 ? (
              <p className="mt-2 text-xs italic text-slate-400">
                Belum ada kelompok opsi. Buat di tab &quot;Grup Opsi &amp; Topping&quot;.
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {allOptionGroups.map((grp) => (
                  <label
                    key={grp.id}
                    className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 hover:bg-slate-50"
                  >
                    <div>
                      <span className="text-xs font-bold text-slate-900">{grp.name}</span>
                      <span className="ml-2 text-[10px] text-slate-500">
                        ({grp.options.length} pilihan)
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.has(grp.id)}
                      onChange={() => handleToggleOptionGroup(grp.id)}
                      className="h-4 w-4 rounded accent-orange-700"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div>
                <p className="text-xs font-semibold text-slate-800">Tersedia di Kasir</p>
                <p className="text-[10px] text-slate-500">{isAvailable ? 'Stok Ada' : 'Habis'}</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={isAvailable}
                  onChange={(e) => setIsAvailable(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full"></div>
              </label>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div>
                <p className="text-xs font-semibold text-slate-800">Status Aktif</p>
                <p className="text-[10px] text-slate-500">{isActive ? 'Aktif' : 'Nonaktif'}</p>
              </div>
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
          </div>

          <div className="flex gap-2 pt-2">
            {product && onDelete ? (
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
              {isSubmitting ? 'Menyimpan...' : 'Simpan Produk'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
