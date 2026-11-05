import { useState } from 'react';
import { formatPlainRupiahDigits, formatRupiah } from '../../domain/money';
import type { UseCartReturn } from './useCart';

interface CartDrawerProps {
  readonly cartManager: UseCartReturn;
}

export function CartDrawer({ cartManager }: CartDrawerProps) {
  const {
    cart,
    isCartOpen,
    discrepancies,
    closeCart,
    updateQuantity,
    removeItem,
    clearCart,
  } = cartManager;
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  if (!isCartOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
    >
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        {/* Header Drawer */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <h3
              id="cart-drawer-title"
              className="text-base font-bold text-slate-900"
            >
              Draf Pesanan Kasir
            </h3>
            <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-900">
              {cart.totalQuantity} Item
            </span>
          </div>
          <div className="flex items-center gap-2">
            {cart.items.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                Kosongkan
              </button>
            ) : null}
            <button
              type="button"
              onClick={closeCart}
              aria-label="Tutup keranjang"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Dialog Konfirmasi Kosongkan */}
        {showClearConfirm ? (
          <div className="border-b border-red-200 bg-red-50 p-3 text-xs text-red-950">
            <p className="font-bold">Kosongkan seluruh isi keranjang?</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  clearCart();
                  setShowClearConfirm(false);
                }}
                className="rounded-lg bg-red-700 px-3 py-1.5 font-bold text-white active:bg-red-800"
              >
                Ya, Kosongkan
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700"
              >
                Batal
              </button>
            </div>
          </div>
        ) : null}

        {/* Discrepancy Warnings */}
        {discrepancies.length > 0 ? (
          <div className="border-b border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
            <p className="font-bold">
              Perhatian: Harga master telah berubah di katalog:
            </p>
            <ul className="mt-1 list-inside list-disc">
              {discrepancies.map((d) => (
                <li key={d.lineId}>
                  {d.productName}: harga draf {formatRupiah(d.cartBasePrice)} (katalog sekarang {formatRupiah(d.catalogBasePrice)})
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* List Items */}
        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto px-4 py-2">
          {cart.items.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <p className="text-3xl">🛒</p>
              <p className="mt-2 font-medium">Keranjang masih kosong.</p>
              <p className="text-slate-400">Pilih menu dari katalog untuk memulai pesanan.</p>
            </div>
          ) : (
            cart.items.map((item) => (
              <div key={item.lineId} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900">
                      {item.productName}
                    </p>
                    <p className="text-xs font-semibold text-slate-600">
                      @ {formatRupiah(item.unitTotalRupiah)}
                    </p>

                    {item.options.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                        {item.options.map((opt) => (
                          <li key={opt.optionId}>
                            + {opt.quantityPerPortion}x {opt.optionName}
                            {opt.unitPriceRupiah > 0
                              ? ` (@${formatPlainRupiahDigits(opt.unitPriceRupiah)})`
                              : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {item.notes ? (
                      <p className="mt-1 text-[11px] italic text-slate-500">
                        Catatan: {item.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-right">
                    <p className="font-mono text-sm font-bold text-slate-900">
                      {formatRupiah(item.lineTotalRupiah)}
                    </p>

                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Kurangi kuantitas ${item.productName}`}
                        onClick={() =>
                          item.quantity === 1
                            ? removeItem(item.lineId)
                            : updateQuantity(item.lineId, item.quantity - 1)
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-800 active:bg-slate-100"
                      >
                        {item.quantity === 1 ? '🗑' : '-'}
                      </button>
                      <span className="w-6 text-center font-mono text-xs font-bold text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Tambah kuantitas ${item.productName}`}
                        onClick={() =>
                          updateQuantity(item.lineId, item.quantity + 1)
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-800 active:bg-slate-100"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Summary */}
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          <div className="space-y-1.5 text-xs text-slate-700">
            <div className="flex justify-between">
              <span>Subtotal ({cart.totalQuantity} porsi)</span>
              <span className="font-mono font-semibold text-slate-900">
                {formatRupiah(cart.subtotalRupiah)}
              </span>
            </div>
            <div className="flex justify-between text-sm font-bold text-slate-900">
              <span>Total Pesanan</span>
              <span className="font-mono text-base text-orange-800">
                {formatRupiah(cart.grandTotalRupiah)}
              </span>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] leading-relaxed text-slate-600">
            ℹ️ <strong>Status Fase P2:</strong> Keranjang ini adalah draf pesanan kasir. Fitur finalisasi pembayaran (Tunai/QRIS) dan pencatatan transaksi penjualan resmi dijadwalkan pada <strong>Fase P3</strong>.
          </div>

          <button
            type="button"
            onClick={closeCart}
            className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl bg-orange-700 px-4 py-2 text-sm font-bold text-white shadow-sm active:bg-orange-800"
          >
            Lanjut Pilih Menu
          </button>
        </div>
      </div>
    </div>
  );
}
