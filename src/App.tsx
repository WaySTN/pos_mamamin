import { useState } from 'react';
import { BottomNavigation } from './app/router';
import type { AppRouteId, RuntimeEnvironmentInfo } from './domain/types';
import { BaselineScreen } from './features/baseline/BaselineScreen';
import { useP1Diagnostics } from './features/diagnostics/useP1Diagnostics';

interface AppProps {
  readonly runtime: RuntimeEnvironmentInfo;
}

export function App({ runtime }: AppProps) {
  const [activeRoute, setActiveRoute] = useState<AppRouteId>('cashier');
  const diagnostics = useP1Diagnostics();

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-orange-700 text-sm font-extrabold text-white"
            >
              MM
            </span>
            <div>
              <h1 className="text-base leading-tight font-bold text-slate-900">
                {runtime.appName}
              </h1>
              <p className="text-xs text-slate-500">
                Kasir Offline-First • {runtime.appVersion}
              </p>
            </div>
          </div>
          <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 font-mono text-xs font-medium text-slate-700">
            WIB
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4">
        <BaselineScreen
          activeRoute={activeRoute}
          runtime={runtime}
          diagnostics={diagnostics}
          onSelectRoute={setActiveRoute}
        />
      </main>

      <BottomNavigation
        activeRoute={activeRoute}
        onSelectRoute={setActiveRoute}
      />
    </div>
  );
}
