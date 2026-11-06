import { useCallback, useEffect, useMemo, useState } from 'react';
import { seedStarterCategoriesIfEmpty } from '../../database/repositories/catalogTemplate';
import { CategoryRepository } from '../../database/repositories/categoryRepository';
import { ProductRepository } from '../../database/repositories/productRepository';
import { databaseService } from '../../database/sqlite';
import { formatRupiah } from '../../domain/money';
import type {
  AppRouteId,
  Category,
  ProductWithDetails,
  SavedTransaction,
} from '../../domain/types';
import { CartDrawer } from './CartDrawer';
import { CheckoutModal } from './CheckoutModal';
import { ProductCustomizerModal } from './ProductCustomizerModal';
import { TransactionSuccessModal } from './TransactionSuccessModal';
import { useCart } from './useCart';

interface CashierScreenProps {
  readonly onNavigate: (routeId: AppRouteId) => void;
}

export function CashierScreen({ onNavigate }: CashierScreenProps) {
  const categoryRepo = useMemo(() => new CategoryRepository(databaseService), []);
  const productRepo = useMemo(() => new ProductRepository(databaseService), []);
  const cartManager = useCart();

  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [products, setProducts] = useState<readonly ProductWithDetails[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Modal customizer state
  const [customizingProduct, setCustomizingProduct] =
    useState<ProductWithDetails | null>(null);

  // Modal checkout & success state (P3)
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState<boolean>(false);
  const [completedTransaction, setCompletedTransaction] =
    useState<SavedTransaction | null>(null);

  const loadCatalog = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cats, prods] = await Promise.all([
        categoryRepo.list(false),
        productRepo.list({ includeInactive: false, includeUnavailable: true }),
      ]);
      setCategories(cats);
      setProducts(prods);

      const catalogMap = new Map<string, ProductWithDetails>();
      for (const p of prods) {
        catalogMap.set(p.id, p);
      }
      cartManager.checkCatalogPrices(catalogMap);
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error ? error.message : 'Gagal memuat katalog kasir.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [categoryRepo, productRepo, cartManager]);

  useEffect(() => {
    let cancelled = false;
    const fetchCatalog = async () => {
      try {
        const [cats, prods] = await Promise.all([
          categoryRepo.list(false),
          productRepo.list({ includeInactive: false, includeUnavailable: true }),
        ]);
        if (!cancelled) {
          setCategories(cats);
          setProducts(prods);
          setIsLoading(false);

          const catalogMap = new Map<string, ProductWithDetails>();
          for (const p of prods) {
            catalogMap.set(p.id, p);
          }
          cartManager.checkCatalogPrices(catalogMap);
        }
      } catch (error) {
        if (!cancelled) {
          setFeedbackMessage(
            error instanceof Error ? error.message : 'Gagal memuat katalog kasir.',
          );
          setIsLoading(false);
        }
      }
    };

    void fetchCatalog();
    return () => {
      cancelled = true;
    };
  }, [categoryRepo, productRepo, cartManager]);

  const handleSeedStarterData = async () => {
    setIsLoading(true);
    setFeedbackMessage(null);
    try {
      const res = await seedStarterCategoriesIfEmpty(databaseService);
      await loadCatalog();
      setFeedbackMessage(
        res.categoriesCreated > 0
          ? `Template menu awal berhasil dimuat (${String(res.categoriesCreated)} kategori, ${String(res.productsCreated)} produk contoh). Harga dan opsi dapat diedit di Kelola Menu.`
          : 'Katalog sudah memiliki kategori. Tidak ada template yang ditimpa.',
      );
    } catch (error) {
      setFeedbackMessage(
        error instanceof Error ? error.message : 'Gagal memuat template menu.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleProductCardClick = (product: ProductWithDetails) => {
    if (!product.isAvailable) {
      setFeedbackMessage(`Menu "${product.name}" sedang habis.`);
      return;
    }

    if (product.optionGroups.length > 0) {
      setCustomizingProduct(product);
    } else {
      cartManager.addItem(product, [], 1, null);
      setFeedbackMessage(`+ 1x ${product.name} masuk keranjang.`);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedCategoryId !== 'ALL' && p.categoryId !== selectedCategoryId) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const nameMatch = p.name.toLowerCase().includes(q);
        const skuMatch = p.sku ? p.sku.toLowerCase().includes(q) : false;
        if (!nameMatch && !skuMatch) {
          return false;
        }
      }
      return true;
    });
  }, [products, selectedCategoryId, searchQuery]);

  return (
    <div className="space-y-3 pb-24">
      {/* Toast / Banner Feedback */}
      {feedbackMessage ? (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 p-2.5 text-xs font-medium text-orange-950"
        >
          <span>{feedbackMessage}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="ml-2 font-bold text-orange-800"
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Baris Kategori Pill (Horizontal Scroll) */}
      <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
        <button
          type="button"
          onClick={() => setSelectedCategoryId('ALL')}
          className={`min-h-9 shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            selectedCategoryId === 'ALL'
              ? 'bg-orange-700 text-white shadow-xs'
              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Semua ({products.length})
        </button>

        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setSelectedCategoryId(cat.id)}
            className={`min-h-9 shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              selectedCategoryId === cat.id
                ? 'bg-orange-700 text-white shadow-xs'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {cat.name} {cat.productCount ? `(${cat.productCount})` : ''}
          </button>
        ))}
      </div>

      {/* Input Pencarian Offline */}
      <div className="relative">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari menu atau kode SKU..."
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-600 focus:outline-hidden"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        ) : null}
      </div>

      {/* Grid Menu Produk */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-500">
          Memuat katalog menu dari SQLite...
        </div>
      ) : categories.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <p className="text-3xl">🍜</p>
          <h3 className="mt-2 text-sm font-bold text-slate-900">
            Katalog Menu Masih Kosong
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            Katalog dapat dibuat secara mandiri atau memuat draf kategori awal
            MamaMin (Mie Ayam, Seblak, Jajanan, Minuman).
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={handleSeedStarterData}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-700 px-4 py-2 text-xs font-bold text-white active:bg-orange-800"
            >
              Muat Template Menu Contoh
            </button>
            <button
              type="button"
              onClick={() => onNavigate('more')}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 active:bg-slate-100"
            >
              Buka Kelola Menu
            </button>
          </div>
        </section>
      ) : filteredProducts.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-500">
          Tidak ada menu yang sesuai dengan kategori atau pencarian.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {filteredProducts.map((product) => {
            const hasOptions = product.optionGroups.length > 0;
            const isAvailable = product.isAvailable;

            return (
              <div
                key={product.id}
                role="button"
                tabIndex={0}
                aria-disabled={!isAvailable}
                onClick={() => handleProductCardClick(product)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleProductCardClick(product);
                  }
                }}
                className={`flex min-h-28 flex-col justify-between rounded-xl border p-3 text-left transition-all ${
                  !isAvailable
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-60'
                    : 'cursor-pointer border-slate-200 bg-white shadow-xs hover:border-orange-300 active:scale-[0.98]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[10px] font-semibold text-slate-600 uppercase">
                      {product.categoryName}
                    </span>
                    {!isAvailable ? (
                      <span className="rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-800">
                        Habis
                      </span>
                    ) : null}
                  </div>
                  <h4 className="mt-1 line-clamp-2 text-xs font-bold text-slate-900">
                    {product.name}
                  </h4>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-xs font-extrabold text-orange-800">
                    {hasOptions && product.pricingMode === 'BASE_PLUS_OPTIONS'
                      ? `Mulai ${formatRupiah(product.basePriceRupiah)}`
                      : formatRupiah(product.basePriceRupiah)}
                  </span>
                  {hasOptions ? (
                    <span className="rounded-md border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-900">
                      Opsi
                    </span>
                  ) : (
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                      +
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky Bottom Cart Bar */}
      {cartManager.cart.totalQuantity > 0 ? (
        <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-30 px-4">
          <div className="mx-auto flex max-w-lg items-center justify-between rounded-2xl border border-orange-800/20 bg-orange-800 px-4 py-3 text-white shadow-xl">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-sm font-bold">
                🛒
              </span>
              <div>
                <p className="text-xs font-medium text-orange-100">
                  {cartManager.cart.totalQuantity} porsi dipilih
                </p>
                <p className="font-mono text-sm font-black">
                  {formatRupiah(cartManager.cart.grandTotalRupiah)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cartManager.openCart}
                className="flex min-h-10 items-center justify-center rounded-xl bg-orange-800/80 px-3 py-1.5 text-xs font-semibold text-white shadow-xs active:bg-orange-900"
              >
                Lihat Draf
              </button>
              <button
                type="button"
                onClick={() => {
                  cartManager.closeCart();
                  setIsCheckoutModalOpen(true);
                }}
                className="flex min-h-10 items-center justify-center rounded-xl bg-white px-3.5 py-1.5 text-xs font-bold text-orange-950 shadow-sm active:bg-orange-50"
              >
                Bayar →
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal Customizer Topping */}
      {customizingProduct ? (
        <ProductCustomizerModal
          product={customizingProduct}
          isOpen={true}
          onClose={() => setCustomizingProduct(null)}
          onAddToCart={(prod, opts, qty, note) => {
            cartManager.addItem(prod, opts, qty, note);
            setFeedbackMessage(`+ ${qty}x ${prod.name} masuk keranjang.`);
          }}
        />
      ) : null}

      {/* Cart Drawer */}
      <CartDrawer
        cartManager={cartManager}
        onCheckout={() => {
          cartManager.closeCart();
          setIsCheckoutModalOpen(true);
        }}
      />

      {/* Modal Checkout (P3) */}
      <CheckoutModal
        isOpen={isCheckoutModalOpen}
        cartManager={cartManager}
        onClose={() => setIsCheckoutModalOpen(false)}
        onSuccess={(savedTx) => {
          cartManager.clearCart();
          setIsCheckoutModalOpen(false);
          setCompletedTransaction(savedTx);
        }}
      />

      {/* Modal Transaksi Sukses (P3) */}
      <TransactionSuccessModal
        transaction={completedTransaction}
        onNewTransaction={() => setCompletedTransaction(null)}
      />
    </div>
  );
}
