import { useCallback, useEffect, useMemo, useState } from 'react';
import { seedStarterCategoriesIfEmpty } from '../../database/repositories/catalogTemplate';
import { CategoryRepository } from '../../database/repositories/categoryRepository';
import { OptionGroupRepository } from '../../database/repositories/optionGroupRepository';
import { ProductRepository } from '../../database/repositories/productRepository';
import { databaseService } from '../../database/sqlite';
import { formatRupiah } from '../../domain/money';
import type {
  Category,
  OptionGroup,
  ProductWithDetails,
} from '../../domain/types';
import { CategoryFormModal } from './CategoryFormModal';
import { OptionGroupFormModal } from './OptionGroupFormModal';
import { ProductFormModal } from './ProductFormModal';

type MenuTab = 'products' | 'categories' | 'options';

export function MenuManagementScreen() {
  const categoryRepo = useMemo(() => new CategoryRepository(databaseService), []);
  const productRepo = useMemo(() => new ProductRepository(databaseService), []);
  const optionGroupRepo = useMemo(() => new OptionGroupRepository(databaseService), []);

  const [activeTab, setActiveTab] = useState<MenuTab>('products');
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [products, setProducts] = useState<readonly ProductWithDetails[]>([]);
  const [optionGroups, setOptionGroups] = useState<readonly OptionGroup[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Filter & Search
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [editingCategory, setEditingCategory] = useState<Category | null | 'NEW'>(null);
  const [editingProduct, setEditingProduct] = useState<ProductWithDetails | null | 'NEW'>(null);
  const [editingGroup, setEditingGroup] = useState<OptionGroup | null | 'NEW'>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cats, prods, grps] = await Promise.all([
        categoryRepo.list(true),
        productRepo.list({ includeInactive: true, includeUnavailable: true }),
        optionGroupRepo.list(true),
      ]);
      setCategories(cats);
      setProducts(prods);
      setOptionGroups(grps);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Gagal memuat data menu.');
    } finally {
      setIsLoading(false);
    }
  }, [categoryRepo, productRepo, optionGroupRepo]);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const [cats, prods, grps] = await Promise.all([
          categoryRepo.list(true),
          productRepo.list({ includeInactive: true, includeUnavailable: true }),
          optionGroupRepo.list(true),
        ]);
        if (!cancelled) {
          setCategories(cats);
          setProducts(prods);
          setOptionGroups(grps);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setFeedback(err instanceof Error ? err.message : 'Gagal memuat data menu.');
          setIsLoading(false);
        }
      }
    };

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [categoryRepo, productRepo, optionGroupRepo]);

  const handleSeedTemplate = async () => {
    setIsLoading(true);
    try {
      const res = await seedStarterCategoriesIfEmpty(databaseService);
      await loadData();
      setFeedback(
        res.categoriesCreated > 0
          ? `Template menu awal berhasil dimuat (${String(res.categoriesCreated)} kategori, ${String(res.productsCreated)} produk). Silakan sesuaikan nama & harganya.`
          : 'Katalog sudah memiliki kategori, tidak ada template yang ditimpa.',
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Gagal memuat template menu.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleProductAvailability = async (product: ProductWithDetails) => {
    try {
      await productRepo.toggleAvailability(product.id, !product.isAvailable);
      await loadData();
      setFeedback(
        `Status ${product.name} diubah menjadi: ${!product.isAvailable ? 'Tersedia' : 'Habis'}.`,
      );
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Gagal mengubah status ketersediaan.');
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedCatFilter !== 'ALL' && p.categoryId !== selectedCatFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchSku = p.sku ? p.sku.toLowerCase().includes(q) : false;
        if (!matchName && !matchSku) return false;
      }
      return true;
    });
  }, [products, selectedCatFilter, searchQuery]);

  return (
    <div className="space-y-3 pb-20">
      {/* Header Halaman */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Kelola Menu &amp; Topping (Owner)
          </h2>
          <p className="text-xs text-slate-500">
            Penyimpanan SQLite offline native • {categories.length} Kategori • {products.length} Produk
          </p>
        </div>

        {categories.length === 0 ? (
          <button
            type="button"
            onClick={handleSeedTemplate}
            className="rounded-lg bg-orange-700 px-3 py-1.5 text-xs font-bold text-white active:bg-orange-800"
          >
            Muat Draf Menu MamaMin
          </button>
        ) : null}
      </div>

      {/* Banner Feedback */}
      {feedback ? (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-orange-300 bg-orange-50 p-2.5 text-xs font-medium text-orange-950"
        >
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="ml-2 font-bold text-orange-800"
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Navigasi Sub-Tab */}
      <div className="grid grid-cols-3 rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={`min-h-9 rounded-lg transition-colors ${
            activeTab === 'products'
              ? 'bg-orange-700 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Produk ({products.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('categories')}
          className={`min-h-9 rounded-lg transition-colors ${
            activeTab === 'categories'
              ? 'bg-orange-700 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Kategori ({categories.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('options')}
          className={`min-h-9 rounded-lg transition-colors ${
            activeTab === 'options'
              ? 'bg-orange-700 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Grup Opsi ({optionGroups.length})
        </button>
      </div>

      {/* --- TAB 1: PRODUK --- */}
      {activeTab === 'products' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama / SKU..."
                className="min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
              />
            </div>

            <button
              type="button"
              disabled={categories.length === 0}
              onClick={() => setEditingProduct('NEW')}
              className="flex min-h-10 items-center justify-center rounded-xl bg-orange-700 px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-50 active:bg-orange-800"
            >
              + Produk
            </button>
          </div>

          {/* Filter Kategori */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedCatFilter('ALL')}
              className={`min-h-8 shrink-0 rounded-full px-3 text-[11px] font-semibold ${
                selectedCatFilter === 'ALL'
                  ? 'bg-slate-800 text-white'
                  : 'border border-slate-300 bg-white text-slate-700'
              }`}
            >
              Semua
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCatFilter(c.id)}
                className={`min-h-8 shrink-0 rounded-full px-3 text-[11px] font-semibold ${
                  selectedCatFilter === c.id
                    ? 'bg-slate-800 text-white'
                    : 'border border-slate-300 bg-white text-slate-700'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* List Produk */}
          {isLoading ? (
            <div className="py-8 text-center text-xs text-slate-500">Memuat data produk...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
              Tidak ada produk. Tekan &quot;+ Produk&quot; untuk menambahkan menu baru.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  className={`rounded-xl border bg-white p-3 shadow-2xs transition-all ${
                    !p.isActive ? 'border-slate-300 opacity-60' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">
                          {p.categoryName}
                        </span>
                        {!p.isActive ? (
                          <span className="rounded bg-slate-200 px-1 py-0.5 text-[9px] font-bold text-slate-700">
                            Nonaktif
                          </span>
                        ) : null}
                        {p.sku ? (
                          <span className="font-mono text-[10px] text-slate-400">
                            [{p.sku}]
                          </span>
                        ) : null}
                      </div>

                      <h4 className="mt-0.5 text-xs font-bold text-slate-900">{p.name}</h4>
                      <p className="mt-1 font-mono text-xs font-extrabold text-orange-800">
                        {formatRupiah(p.basePriceRupiah)}
                      </p>

                      {p.optionGroups.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {p.optionGroups.map((g) => (
                            <span
                              key={g.id}
                              className="rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-900"
                            >
                              {g.name} ({g.options.length})
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleProductAvailability(p)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          p.isAvailable
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-red-50 text-red-800'
                        }`}
                      >
                        {p.isAvailable ? '● Tersedia' : '○ Habis'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingProduct(p)}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* --- TAB 2: KATEGORI --- */}
      {activeTab === 'categories' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">
              Daftar Kategori Menu
            </span>
            <button
              type="button"
              onClick={() => setEditingCategory('NEW')}
              className="rounded-xl bg-orange-700 px-3.5 py-1.5 text-xs font-bold text-white active:bg-orange-800"
            >
              + Kategori
            </button>
          </div>

          <div className="space-y-2">
            {categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-2xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-900">{c.name}</h4>
                    {!c.isActive ? (
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                        Nonaktif
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Urutan: {c.sortOrder} • {c.productCount ?? 0} produk terhubung
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setEditingCategory(c)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Edit
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* --- TAB 3: GRUP OPSI & TOPPING --- */}
      {activeTab === 'options' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-700">
                Kelompok Opsi &amp; Topping Seblak
              </span>
              <p className="text-[11px] text-slate-500">
                Dapat dihubungkan ke aneka produk menu
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingGroup('NEW')}
              className="rounded-xl bg-orange-700 px-3.5 py-1.5 text-xs font-bold text-white active:bg-orange-800"
            >
              + Grup Opsi
            </button>
          </div>

          <div className="space-y-2.5">
            {optionGroups.map((g) => (
              <div
                key={g.id}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-900">{g.name}</h4>
                      {!g.isActive ? (
                        <span className="rounded bg-slate-200 px-1 py-0.5 text-[10px] font-bold text-slate-700">
                          Nonaktif
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Min: {g.minSelected} • Maks: {g.maxSelected ?? 'Tanpa Batas'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEditingGroup(g)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                  {g.options.map((opt) => (
                    <span
                      key={opt.id}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-800"
                    >
                      {opt.name} ({formatRupiah(opt.unitPriceRupiah)})
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Modals */}
      {editingCategory ? (
        <CategoryFormModal
          category={editingCategory === 'NEW' ? null : editingCategory}
          isOpen={true}
          onClose={() => setEditingCategory(null)}
          onSave={async (data) => {
            if (editingCategory === 'NEW') {
              await categoryRepo.create(data);
              setFeedback(`Kategori "${data.name}" berhasil dibuat.`);
            } else {
              await categoryRepo.update(editingCategory.id, data);
              setFeedback(`Kategori "${data.name}" berhasil diperbarui.`);
            }
            await loadData();
          }}
          onDelete={
            editingCategory !== 'NEW'
              ? async (id) => {
                  const res = await categoryRepo.deleteOrDeactivate(id);
                  setFeedback(res.message);
                  await loadData();
                }
              : undefined
          }
        />
      ) : null}

      {editingProduct ? (
        <ProductFormModal
          product={editingProduct === 'NEW' ? null : editingProduct}
          categories={categories}
          allOptionGroups={optionGroups}
          isOpen={true}
          onClose={() => setEditingProduct(null)}
          onSave={async (data) => {
            if (editingProduct === 'NEW') {
              await productRepo.create(data);
              setFeedback(`Produk "${data.name}" berhasil dibuat.`);
            } else {
              await productRepo.update(editingProduct.id, data);
              setFeedback(`Produk "${data.name}" berhasil diperbarui.`);
            }
            await loadData();
          }}
          onDelete={
            editingProduct !== 'NEW'
              ? async (id) => {
                  const res = await productRepo.deleteOrDeactivate(id);
                  setFeedback(res.message);
                  await loadData();
                }
              : undefined
          }
        />
      ) : null}

      {editingGroup ? (
        <OptionGroupFormModal
          group={editingGroup === 'NEW' ? null : editingGroup}
          isOpen={true}
          onClose={() => setEditingGroup(null)}
          onSave={async (data) => {
            if (editingGroup === 'NEW') {
              await optionGroupRepo.create(data);
              setFeedback(`Grup opsi "${data.name}" berhasil dibuat.`);
            } else {
              await optionGroupRepo.update(editingGroup.id, {
                name: data.name,
                minSelected: data.minSelected,
                maxSelected: data.maxSelected,
                sortOrder: data.sortOrder,
                isActive: data.isActive,
              });
              // Update/tambah opsi di grup
              for (const opt of data.options) {
                if (opt.id) {
                  await optionGroupRepo.updateOption(opt.id, {
                    name: opt.name,
                    unitPriceRupiah: opt.unitPriceRupiah,
                    sortOrder: opt.sortOrder,
                  });
                } else {
                  await optionGroupRepo.addOption(editingGroup.id, opt);
                }
              }
              setFeedback(`Grup opsi "${data.name}" berhasil diperbarui.`);
            }
            await loadData();
          }}
          onDelete={
            editingGroup !== 'NEW'
              ? async (id) => {
                  const res = await optionGroupRepo.deleteOrDeactivateGroup(id);
                  setFeedback(
                    res.action === 'DEACTIVATED'
                      ? 'Grup opsi dinonaktifkan (karena digunakan di riwayat transaksi).'
                      : 'Grup opsi berhasil dihapus.',
                  );
                  await loadData();
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
