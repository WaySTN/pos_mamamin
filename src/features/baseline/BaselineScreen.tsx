import { useEffect, useState } from 'react';
import { APP_ROUTES } from '../../app/routes';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatDateTimeWib, getBusinessDateWib } from '../../domain/dates';
import { formatRupiah } from '../../domain/money';
import type {
  AppRouteId,
  ReadinessStatus,
  RuntimeEnvironmentInfo,
} from '../../domain/types';

interface BaselineScreenProps {
  readonly activeRoute: AppRouteId;
  readonly runtime: RuntimeEnvironmentInfo;
  readonly onSelectRoute: (routeId: AppRouteId) => void;
}

interface SubsystemStatusItem {
  readonly name: string;
  readonly status: ReadinessStatus;
  readonly statusLabel: string;
  readonly detail: string;
}

const SUBSYSTEM_STATUS_ITEMS: readonly SubsystemStatusItem[] = [
  {
    name: 'UI React + TypeScript + Tailwind + Capacitor',
    status: 'ready',
    statusLabel: 'Aktif (Fase P0)',
    detail:
      'Bundle lokal dimuat tanpa ketergantungan CDN eksternal dan siap dibungkus menjadi APK Android debug.',
  },
  {
    name: 'Database Lokal SQLite Native',
    status: 'planned',
    statusLabel: 'Target Fase P1',
    detail:
      'Belum diinisialisasi pada P0. Akan menggunakan @capacitor-community/sqlite untuk penyimpanan transaksi ACID.',
  },
  {
    name: 'Printer Thermal Bluetooth Classic 58 mm',
    status: 'unverified',
    statusLabel: 'Printer Fisik Belum Diuji',
    detail:
      'Integrasi ESC/POS dan uji kompatibilitas perangkat keras dijadwalkan pada Fase P1.',
  },
];

export function BaselineScreen({
  activeRoute,
  runtime,
  onSelectRoute,
}: BaselineScreenProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

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

  const currentRouteMeta =
    APP_ROUTES.find((route) => route.id === activeRoute) ?? APP_ROUTES[0];

  if (activeRoute !== 'cashier') {
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
            Aplikasi saat ini berada pada <strong>Fase P0 (Baseline Fondasi)</strong>.
            Modul {currentRouteMeta.label.toLowerCase()} belum diaktifkan agar tidak
            menyajikan antarmuka semu tanpa penyimpanan SQLite terverifikasi.
          </div>
          <button
            type="button"
            onClick={() => onSelectRoute('cashier')}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white active:bg-orange-800"
          >
            Kembali ke Beranda Kasir (Baseline P0)
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-orange-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold tracking-wide text-orange-800 uppercase">
              Kedai MamaMin
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900">
              Fondasi Aplikasi Kasir Siap (P0)
            </h2>
          </div>
          <StatusBadge status="ready" label="Baseline P0" />
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Shell aplikasi offline-first berjalan normal. Belum ada transaksi, katalog
          produksi, atau koneksi printer yang diklaim aktif pada tahap ini.
        </p>
      </section>

      <section
        aria-labelledby="runtime-heading"
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
      >
        <h3
          id="runtime-heading"
          className="text-sm font-bold tracking-wide text-slate-800 uppercase"
        >
          Diagnostik Runtime Perangkat
        </h3>
        <dl className="mt-3 divide-y divide-slate-100 text-sm">
          <div className="flex items-center justify-between gap-2 py-2">
            <dt className="text-slate-600">Platform Capacitor</dt>
            <dd className="font-mono font-semibold text-slate-900">
              {runtime.platform} ({runtime.isNativePlatform ? 'Native APK' : 'Web Dev'})
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2 py-2">
            <dt className="text-slate-600">Application ID</dt>
            <dd className="font-mono text-xs font-semibold text-slate-900">
              {runtime.appId}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2 py-2">
            <dt className="text-slate-600">Status Jaringan Perangkat</dt>
            <dd className="font-semibold text-slate-900">
              {isBrowserOnline
                ? 'Terhubung (Tetap Siap Offline)'
                : 'Mode Offline Aktif (Lokal)'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2 py-2">
            <dt className="text-slate-600">Tanggal Bisnis ({runtime.timezone})</dt>
            <dd className="font-mono font-semibold text-slate-900">
              {getBusinessDateWib(nowMs)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2 py-2">
            <dt className="text-slate-600">Waktu Lokal Perangkat</dt>
            <dd className="text-xs font-semibold text-slate-900">
              {formatDateTimeWib(nowMs)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2 py-2">
            <dt className="text-slate-600">Uji Format Integer Rupiah</dt>
            <dd className="font-mono font-semibold text-slate-900">
              {formatRupiah(16_000)}
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="subsystem-heading"
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
      >
        <h3
          id="subsystem-heading"
          className="text-sm font-bold tracking-wide text-slate-800 uppercase"
        >
          Status Kesiapan Subsistem
        </h3>
        <ul className="mt-3 space-y-3">
          {SUBSYSTEM_STATUS_ITEMS.map((item) => (
            <li
              key={item.name}
              className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">
                  {item.name}
                </span>
                <StatusBadge status={item.status} label={item.statusLabel} />
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                {item.detail}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

