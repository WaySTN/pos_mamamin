import type { ReadinessStatus } from '../../domain/types';

interface StatusBadgeProps {
  readonly status: ReadinessStatus;
  readonly label: string;
}

const STATUS_STYLES: Record<
  ReadinessStatus,
  { readonly className: string; readonly prefix: string }
> = {
  ready: {
    className: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    prefix: '[OK]',
  },
  planned: {
    className: 'border-slate-300 bg-slate-100 text-slate-700',
    prefix: '[FASE LANJUT]',
  },
  unverified: {
    className: 'border-amber-300 bg-amber-50 text-amber-900',
    prefix: '[BELUM TERVERIFIKASI]',
  },
  error: {
    className: 'border-red-300 bg-red-50 text-red-900',
    prefix: '[GAGAL]',
  },
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = STATUS_STYLES[status];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${config.className}`}
    >
      <span>{config.prefix}</span>
      <span>{label}</span>
    </span>
  );
}
