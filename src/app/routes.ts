import type { AppRouteId } from '../domain/types';

export interface AppRouteDefinition {
  readonly id: AppRouteId;
  readonly label: string;
  readonly targetPhase: string;
  readonly summary: string;
}

export const APP_ROUTES: readonly AppRouteDefinition[] = [
  {
    id: 'cashier',
    label: 'Kasir',
    targetPhase: 'P2–P3',
    summary:
      'Katalog produk per kategori, keranjang, opsi topping, serta pembayaran Tunai & QRIS konfirmasi manual.',
  },
  {
    id: 'transactions',
    label: 'Riwayat',
    targetPhase: 'P3',
    summary:
      'Daftar transaksi tersimpan di SQLite lokal, detail snapshot harga, cetak ulang struk (SALINAN), dan pembatalan beralasan (VOID).',
  },
  {
    id: 'reports',
    label: 'Laporan',
    targetPhase: 'P4',
    summary:
      'Rekap omzet transaksi PAID harian & bulanan WIB, rincian Tunai vs QRIS, pengeluaran operasional, dan menu terlaris.',
  },
  {
    id: 'more',
    label: 'Lainnya',
    targetPhase: 'P1–P5',
    summary:
      'Kelola menu & harga, pencatatan pengeluaran, pengaturan printer Bluetooth 58 mm, serta ekspor backup & restore.',
  },
];

