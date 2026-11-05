import { useState } from 'react';
import type { Category } from '../../domain/types';

interface CategoryFormModalProps {
  readonly category: Category | null; // null jika create baru
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSave: (data: {
    readonly name: string;
    readonly sortOrder: number;
    readonly isActive: boolean;
  }) => Promise<void>;
  readonly onDelete?: (id: string) => Promise<void>;
}

export function CategoryFormModal({
  category,
  isOpen,
  onClose,
  onSave,
  onDelete,
}: CategoryFormModalProps) {
  const [name, setName] = useState<string>(category?.name ?? '');
  const [sortOrder, setSortOrder] = useState<number>(category?.sortOrder ?? 0);
  const [isActive, setIsActive] = useState<boolean>(category?.isActive ?? true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Nama kategori wajib diisi.');
      return;
    }
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSave({
        name: name.trim(),
        sortOrder,
        isActive,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan kategori.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!category || !onDelete) return;
    if (!window.confirm(`Hapus atau nonaktifkan kategori "${category.name}"?`)) return;
    setIsSubmitting(true);
    try {
      await onDelete(category.id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses kategori.');
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
      <div className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-base font-bold text-slate-900">
            {category ? 'Edit Kategori' : 'Tambah Kategori Baru'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          {errorMsg ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {errorMsg}
            </div>
          ) : null}

          <div>
            <label htmlFor="cat-name" className="block text-xs font-semibold text-slate-700">
              Nama Kategori:
            </label>
            <input
              id="cat-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Mie Ayam, Seblak, Minuman..."
              className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="cat-sort" className="block text-xs font-semibold text-slate-700">
              Urutan Tampil (Sort Order):
            </label>
            <input
              id="cat-sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="text-xs font-semibold text-slate-800">Status Aktif</span>
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

          <div className="mt-4 flex gap-2 pt-2">
            {category && onDelete ? (
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
              {isSubmitting ? 'Menyimpan...' : 'Simpan Kategori'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

