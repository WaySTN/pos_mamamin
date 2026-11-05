import { useEffect, useState } from 'react';
import { APP_ROUTES } from '../../app/routes';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatDateTimeWib, getBusinessDateWib } from '../../domain/dates';
import type {
  AppRouteId,
  ReadinessStatus,
  RuntimeEnvironmentInfo,
} from '../../domain/types';
import { CashierScreen } from '../cashier/CashierScreen';
import { P1DiagnosticPanel } from '../diagnostics/P1DiagnosticPanel';
import type { P1DiagnosticsViewModel } from '../diagnostics/useP1Diagnostics';
import { HistoryScreen } from '../history/HistoryScreen';
import { MenuManagementScreen } from '../products/MenuManagementScreen';

interface BaselineScreenProps {
  readonly activeRoute: AppRouteId;
  readonly runtime: RuntimeEnvironmentInfo;
  readonly diagnostics: P1DiagnosticsViewModel;
  readonly onSelectRoute: (routeId: AppRouteId) => void;
}

interface SubsystemStatusItem {
  readonly name: string;
  readonly status: ReadinessStatus;
  readonly statusLabel: string;
  readonly detail: string;
}

type MoreScreenView = 'menu_management' | 'diagnostics_p1';

export function BaselineScreen({
  activeRoute,
  runtime,
  diagnostics,
  onSelectRoute,
}: BaselineScreenProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [moreView, setMoreView] = useState<MoreScreenView>('menu_management');

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);

    const handleOnline = () => setIsBrowserOnline(true);
    const handleOffline = () => setIsBrowserOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.clearInterval(timerId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const dbHealth = diagnostics.dbHealth;

  const sqliteStatus: SubsystemStatusItem = diagnostics.isInitializing
    ? {
        name: 'Database Lokal SQLite Native',
        status: 'planned',
        statusLabel: 'Menginisialisasi...',
        detail:
          'Membuka koneksi @capacitor-community/sqlite dan memverifikasi skema v1 serta PRAGMA foreign_keys.',
      }
    : dbHealth?.isReady
      ? {
          name: 'Database Lokal SQLite Native',
          status: 'ready',
          statusLabel: `Aktif (Skema v${String(dbHealth.schemaVersion)})`,
          detail: `Tersimpan di storage internal APK (${dbHealth.databaseName}, ${String(dbHealth.tables.length)} tabel, ${String(dbHealth.indexes.length)} indeks, Foreign Keys ON).`,
        }
      : dbHealth?.errorCode === 'DB_NOT_SUPPORTED_ON_WEB'
        ? {
            name: 'Database Lokal SQLite Native',
            status: 'unverified',
            statusLabel: 'Mode Browser Dev (Non-Native)',
            detail:
              'Browser tidak memakai localStorage sebagai pengganti SQLite. Jalankan APK Android untuk SQLite native.',
          }
        : {
            name: 'Database Lokal SQLite Native',
            status: 'error',
            statusLabel: 'Gagal Inisialisasi',
            detail:
              dbHealth?.errorMessage ??
              'Terjadi kendala saat membuka database SQLite lokal.',
          };

  const subsystemItems: readonly SubsystemStatusItem[] = [
    {
      name: 'UI React + TypeScript + Tailwind + Capacitor',
      status: 'ready',
      statusLabel: 'Aktif (P0–P2)',
      detail:
        'Bundle lokal dimuat dari dalam APK tanpa ketergantungan server atau jaringan internet.',
    },
    sqliteStatus,
    {
      name: 'Master Menu & Keranjang Kasir',
      status: 'ready',
      statusLabel: 'Aktif (Fase P2)',
      detail:
        'Katalog produk dinamis, opsi/topping seblak, dan kalkulasi keranjang integer Rupiah telah aktif.',
    },
    {
      name: 'Koneksi Bluetooth Classic SPP & Cetak Fisik 58 mm',
      status: 'unverified',
      statusLabel: 'Menunggu Perangkat Fisik',
      detail:
        'Printer fisik belum tersedia. Pengujian cetak kertas aktual ditangguhkan hingga perangkat keras tiba.',
    },
  ];

  const currentRouteMeta =
    APP_ROUTES.find((route) => route.id === activeRoute) ?? APP_ROUTES[0];

  // Route 1: Kasir POS (P2/P3)
  if (activeRoute === 'cashier') {
    return <CashierScreen onNavigate={onSelectRoute} />;
  }

  // Route 2: Riwayat Transaksi (P3)
  if (activeRoute === 'transactions') {
    return <HistoryScreen />;
  }

  // Route 2: Lainnya (Kelola Menu P2 & Diagnostik P1)
  if (activeRoute === 'more') {
    return (
      <div className="space-y-3 pb-20">
        {/* Toggle View di Tab Lainnya */}
        <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold shadow-xs">
          <button
            type="button"
            onClick={() => setMoreView('menu_management')}
            className={`min-h-10 rounded-lg transition-colors ${
              moreView === 'menu_management'
                ? 'bg-orange-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🍜 Kelola Menu (P2)
          </button>
          <button
            type="button"
            onClick={() => setMoreView('diagnostics_p1')}
            className={`min-h-10 rounded-lg transition-colors ${
              moreView === 'diagnostics_p1'
                ? 'bg-orange-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ⚙️ Diagnostik &amp; Struk (P1)
          </button>
        </div>

        {moreView === 'menu_management' ? (
          <MenuManagementScreen />
        ) : (
          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Diagnostik SQLite &amp; Printer (P1)
                </h3>
                <StatusBadge status="ready" label="Fondasi P1" />
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                Fasilitas uji SQLite native, ketahanan persistensi data lintas
                force-stop, dan preview struk 58 mm.
              </p>
            </section>

            <section
              aria-labelledby="runtime-heading"
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
            >
              <h4
                id="runtime-heading"
                className="text-xs font-bold tracking-wide text-slate-800 uppercase"
              >
                Diagnostik Runtime Perangkat
              </h4>
              <dl className="mt-2.5 divide-y divide-slate-100 text-xs">
                <div className="flex items-center justify-between gap-2 py-1.5">
                  <dt className="text-slate-600">Platform Capacitor</dt>
                  <dd className="font-mono font-semibold text-slate-900">
                    {runtime.platform} ({runtime.isNativePlatform ? 'Native APK' : 'Web Dev'})
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2 py-1.5">
                  <dt className="text-slate-600">Status Jaringan</dt>
                  <dd className="font-semibold text-slate-900">
                    {isBrowserOnline ? 'Online (Siap Offline)' : 'Offline Aktif'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2 py-1.5">
                  <dt className="text-slate-600">Waktu WIB</dt>
                  <dd className="font-mono text-slate-900">
                    {formatDateTimeWib(nowMs)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2 py-1.5">
                  <dt className="text-slate-600">Tanggal Bisnis</dt>
                  <dd className="font-mono font-semibold text-slate-900">
                    {getBusinessDateWib(nowMs)}
                  </dd>
                </div>
              </dl>
            </section>

            <section
              aria-labelledby="subsystem-heading"
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
            >
              <h4
                id="subsystem-heading"
                className="text-xs font-bold tracking-wide text-slate-800 uppercase"
              >
                Status Kesiapan Subsistem
              </h4>
              <ul className="mt-2.5 space-y-2.5">
                {subsystemItems.map((item) => (
                  <li
                    key={item.name}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span className="font-semibold text-slate-900">{item.name}</span>
                      <StatusBadge status={item.status} label={item.statusLabel} />
                    </div>
                    <p className="mt-1 leading-relaxed text-slate-600">{item.detail}</p>
                  </li>
                ))}
              </ul>
            </section>

            <P1DiagnosticPanel diagnostics={diagnostics} />
          </div>
        )}
      </div>
    );
  }

  // Route 3 & 4: Riwayat (P3) & Laporan (P4)
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">
            Modul {currentRouteMeta.label}
          </h2>
          <StatusBadge
            status="planned"
            label={`Dijadwalkan ${currentRouteMeta.targetPhase}`}
          />
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {currentRouteMeta.summary}
        </p>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
          Aplikasi saat ini berada pada{' '}
          <strong>Fase P2 (Master Menu, Kategori, &amp; Keranjang Kasir)</strong>.
          Modul {currentRouteMeta.label.toLowerCase()} produksi akan dibangun pada{' '}
          {currentRouteMeta.targetPhase} di atas repository SQLite yang telah
          terverifikasi.
        </div>
        <button
          type="button"
          onClick={() => onSelectRoute('cashier')}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white active:bg-orange-800"
        >
          Buka Kasir POS
        </button>
      </section>
    </div>
  );
}
