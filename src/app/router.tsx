import type { ReactNode } from 'react';
import type { AppRouteId } from '../domain/types';
import { APP_ROUTES } from './routes';

function RouteIcon({ routeId }: { readonly routeId: AppRouteId }): ReactNode {
  switch (routeId) {
    case 'cashier':
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 8h10M7 12h4m4 0h2M7 16h4m4 0h2" />
        </svg>
      );
    case 'transactions':
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      );
    case 'reports':
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 20h16" />
          <path d="M7 16v-5M12 16V7M17 16v-8" />
        </svg>
      );
    case 'more':
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
        </svg>
      );
  }
}

interface BottomNavigationProps {
  readonly activeRoute: AppRouteId;
  readonly onSelectRoute: (routeId: AppRouteId) => void;
}

export function BottomNavigation({
  activeRoute,
  onSelectRoute,
}: BottomNavigationProps) {
  return (
    <nav
      aria-label="Navigasi utama"
      className="sticky bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {APP_ROUTES.map((route) => {
          const isActive = route.id === activeRoute;
          return (
            <button
              key={route.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectRoute(route.id)}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 px-2 py-2 text-xs font-medium transition-colors ${
                isActive
                  ? 'border-t-2 border-orange-700 bg-orange-50/70 font-semibold text-orange-800'
                  : 'border-t-2 border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <RouteIcon routeId={route.id} />
              <span>{route.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
